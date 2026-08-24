/**
 * storage.js
 * -----------------------------------------------------------------------
 * Camada de armazenamento. Toda a aplicação fala com os dados através
 * deste módulo (Storage.load / Storage.save / etc) — o resto do app não
 * sabe (nem precisa saber) que o backend é o Supabase.
 *
 * Os dados ficam em tabelas Postgres (ver supabase/migrations/), isoladas
 * por usuário via Row Level Security (auth.uid() = user_id). O cliente
 * autenticado (js/supabase-config.js) já manda o JWT certo em toda
 * requisição, então cada usuário só enxerga e edita as próprias linhas.
 *
 * Estratégia de salvamento: "substituição completa" — cada Storage.save()
 * apaga e reinsere as linhas de cada tabela de array. Para o volume de
 * dados de um painel financeiro pessoal (dezenas de linhas, não milhares),
 * isso é simples, robusto e evita bugs de diff/upsert espalhados pelos
 * ~16 pontos do app que chamam Storage.save(appData).
 */

const STORAGE_KEY = 'financas_app_v1'; // usado só para importar dados antigos de localStorage (ver load()).
const SCHEMA_VERSION = 7;

function generateId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function camelToSnake(s) {
  return s.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase());
}
function snakeToCamel(s) {
  return s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}
function rowToCamel(row) {
  const out = {};
  Object.keys(row).forEach((k) => { out[snakeToCamel(k)] = row[k]; });
  return out;
}
function itemToSnakeRow(item, userId) {
  const row = { user_id: userId };
  Object.keys(item).forEach((k) => { row[camelToSnake(k)] = item[k]; });
  return row;
}

/** Tabelas de array simples: substituídas por completo a cada save(). */
const ARRAY_TABLES = [
  { table: 'cartoes', key: 'cartoes' }, // primeiro: parcelamentos.cartao_id depende de cartoes.id existir
  { table: 'rendas', key: 'rendas' },
  { table: 'categorias', key: 'categorias', stringItem: true, stringCol: 'nome' },
  { table: 'despesas_recorrentes', key: 'despesasRecorrentes' },
  { table: 'despesas_variaveis', key: 'despesasVariaveis' },
  { table: 'parcelamentos', key: 'parcelamentos' },
  { table: 'metas', key: 'metas' },
  { table: 'investimentos', key: 'investimentos' },
  { table: 'historico_mensal', key: 'historicoMensal' },
  { table: 'pendencias', key: 'pendencias', stringItem: true, stringCol: 'descricao' },
  // `id` é bigint identity nessa tabela (gerado pelo banco) — diferente das
  // outras, que usam `id text` gerado no client. Sem omitFields, o id que
  // volta de uma leitura anterior seria reenviado num insert e rejeitado
  // pelo Postgres, apagando a linha em todo save() depois do primeiro load().
  { table: 'inconsistencias_detectadas', key: 'inconsistenciasDetectadas', omitFields: ['id'] },
];

/**
 * Preenche campos novos (status, comprovante) em dados salvos por uma
 * versão anterior do app, sem apagar nada que o usuário já tenha editado.
 * Também usada para dar forma a um backup importado (ver js/backup.js).
 */
function migrate(data) {
  data.configuracoes = data.configuracoes || {};
  data.meta = data.meta || {};
  data.meta.mesReferenciaAtual = data.meta.mesReferenciaAtual || new Date().toISOString().slice(0, 7);
  data.rendas = data.rendas || [];
  data.cartoes = data.cartoes || [];
  data.despesasRecorrentes = data.despesasRecorrentes || [];
  data.despesasVariaveis = data.despesasVariaveis || [];
  data.parcelamentos = data.parcelamentos || [];
  data.categorias = data.categorias || [];
  data.metas = data.metas || [];
  data.metas.forEach((m) => {
    // Compatibilidade com dados antigos (pré-Supabase) que usavam `prazo` — o
    // campo real lido/gravado pelo app (js/goals.js) sempre foi `prazoMeses`.
    if (m.prazo !== undefined && m.prazoMeses === undefined) {
      m.prazoMeses = m.prazo;
      delete m.prazo;
    }
  });
  data.investimentos = data.investimentos || [];
  data.pendencias = data.pendencias || [];
  data.inconsistenciasDetectadas = data.inconsistenciasDetectadas || [];
  if (!data.schemaVersion || data.schemaVersion < 2) {
    (data.despesasRecorrentes || []).forEach((d) => {
      if (d.status === undefined) d.status = 'Pendente';
      if (d.comprovante === undefined) d.comprovante = null;
    });
    (data.despesasVariaveis || []).forEach((d) => {
      if (d.comprovante === undefined) d.comprovante = null;
    });
    data.schemaVersion = SCHEMA_VERSION;
  }
  if (!data.historicoMensal || !data.historicoMensal.length) {
    data.historicoMensal = [buildSnapshot(data, data.meta.mesReferenciaAtual)];
  }
  if (!data.perfil) {
    data.perfil = { nome: null, foto: null };
  }
  if (!data.configuracoes.limiteComprometimento) {
    data.configuracoes.limiteComprometimento = { percentual: 80, modo: 'confirmacao' };
  }
  if (!data.configuracoes.notificacoes) {
    data.configuracoes.notificacoes = { ativado: false, canais: [] };
  }
  if (!data.configuracoes.ocultarValores) {
    data.configuracoes.ocultarValores = { renda: false, saldo: false };
  }
  if (!data.configuracoes.perfilInvestidor) {
    data.configuracoes.perfilInvestidor = 'equilibrado';
  }
  if (!data.reservaEmergencia) {
    data.reservaEmergencia = { possui: null, valorAtual: null, metaValor: null, valorMensalDestinado: null };
  }
  return data;
}

/**
 * Dado inicial (seed), construído EXATAMENTE a partir dos dados financeiros
 * fornecidos pelo usuário em agosto/2026. Nenhum valor foi inventado.
 * Campos não informados ficam explicitamente como null.
 *
 * Este seed só é gravado no Supabase na primeira vez que uma conta faz
 * login e ainda não tem nenhum dado salvo (ver Storage.load()).
 */
function buildSeedData() {
  const cartaoId = generateId('cartao'); // referenciado pelos parcelamentos abaixo (mesmo cartão único)
  const seed = {
    schemaVersion: SCHEMA_VERSION,
    meta: {
      criadoEm: new Date().toISOString(),
      mesReferenciaAtual: '2026-08', // mês sendo controlado no momento do cadastro
    },

    perfil: {
      nome: null,
      foto: null,
    },

    // Regra de ciclo financeiro: salário recebido dia 30 financia o mês seguinte.
    configuracoes: {
      diaRecebimentoSalario: 30,
      cicloFinanceiro: 'salario_dia_30_financia_mes_seguinte',
      margemSeguranca: null, // não informado pelo usuário
      metaEconomiaMensal: 100.00,

      // Perfil de investidor (ajustável em Planejamento > Potencial de
      // investimento — cenários), usado para calcular quanto do saldo
      // disponível conta como "potencial de investimento" no Dashboard.
      perfilInvestidor: 'equilibrado', // 'conservador' | 'equilibrado' | 'agressivo'

      // Limite de renda comprometida (ajustável em Perfil > Configurações).
      // 80% é só um ponto de partida sugerido pelo app — não é um dado
      // financeiro seu, e você pode mudar a qualquer momento.
      limiteComprometimento: {
        percentual: 80,
        modo: 'confirmacao', // 'aviso' | 'confirmacao' | 'bloqueio'
      },

      // Estrutura preparada para notificações futuras (in-app/push). Não há
      // notificações reais implementadas ainda — isso só evita ter que
      // migrar o formato dos dados quando essa função existir.
      notificacoes: {
        ativado: false,
        canais: [],
      },

      // Preferência de privacidade: ocultar valores sensíveis na tela.
      ocultarValores: { renda: false, saldo: false },
    },

    rendas: [
      {
        id: generateId('renda'),
        nome: 'Salário profissional',
        valor: 2480.00,
        frequencia: 'mensal',
        diaRecebimento: 30,
        observacao: null,
        data: null,
        mesReferencia: null,
      },
    ],

    cartoes: [
      {
        id: cartaoId,
        nome: 'Cartão de crédito principal',
        limite: null,
        limiteDisponivel: null,
        diaFechamento: null,
        diaVencimento: null,
        valorFaturaAtual: null,
      },
    ],

    // Despesas fixas / recorrentes (valor previsível todo mês)
    despesasRecorrentes: [
      { id: generateId('rec'), nome: 'Água', valor: 65.00, frequencia: 'mensal', vencimento: 'dia 01', categoria: 'Contas', tipo: 'fixa', status: 'Pendente', comprovante: null, observacao: null, data: null, formaPagamento: null, inicioMesReferencia: null },
      { id: generateId('rec'), nome: 'Telefone', valor: 70.00, frequencia: 'mensal', vencimento: 'dia 01', categoria: 'Contas', tipo: 'fixa', status: 'Pendente', comprovante: null, observacao: null, data: null, formaPagamento: null, inicioMesReferencia: null },
      { id: generateId('rec'), nome: 'Academia', valor: 75.00, frequencia: 'mensal', vencimento: 'dia 01', categoria: 'Saúde', tipo: 'fixa', status: 'Pendente', comprovante: null, observacao: null, data: null, formaPagamento: null, inicioMesReferencia: null },
      { id: generateId('rec'), nome: 'Spotify', valor: 8.18, frequencia: 'mensal', vencimento: null, categoria: 'Assinaturas', tipo: 'assinatura', status: 'Pendente', comprovante: null, observacao: null, data: null, formaPagamento: null, inicioMesReferencia: null },
      { id: generateId('rec'), nome: 'Netflix', valor: 20.00, frequencia: 'mensal', vencimento: null, categoria: 'Assinaturas', tipo: 'assinatura', status: 'Pendente', comprovante: null, observacao: null, data: null, formaPagamento: null, inicioMesReferencia: null },
    ],

    // Parcelamentos no cartão único. Cada compra é registrada individualmente,
    // mas todas apontam para o mesmo cartaoId para permitir consolidação de fatura.
    parcelamentos: [
      {
        id: generateId('parc'), nome: 'Pr Saúde', cartaoId,
        valorParcela: 190.00, totalParcelas: null, parcelaAtual: null,
        parcelasRestantes: 2, dataPrimeiraParcela: null,
        categoria: 'Saúde', observacao: 'Total de parcelas e data da 1ª parcela não informados.',
      },
      {
        id: generateId('parc'), nome: 'Mounjaro', cartaoId,
        valorParcela: 111.00, totalParcelas: 2, parcelaAtual: 1,
        parcelasRestantes: 1, dataPrimeiraParcela: null,
        categoria: 'Saúde', observacao: 'Data da 1ª parcela não informada.',
      },
      {
        id: generateId('parc'), nome: 'Bigazine', cartaoId,
        valorParcela: 70.50, totalParcelas: 2, parcelaAtual: 1,
        parcelasRestantes: 1, dataPrimeiraParcela: null,
        categoria: 'Compras', observacao: 'Data da 1ª parcela não informada.',
      },
      {
        id: generateId('parc'), nome: 'Bemol', cartaoId,
        valorParcela: 281.20, totalParcelas: null, parcelaAtual: null,
        parcelasRestantes: 0, statusDescricao: 'última parcela', dataPrimeiraParcela: null,
        categoria: 'Compras', observacao: 'Total de parcelas e data da 1ª parcela não informados. Esta é a última parcela.',
      },
      {
        id: generateId('parc'), nome: 'Gran Cursos', cartaoId,
        valorParcela: 70.00, totalParcelas: null, parcelaAtual: null,
        parcelasRestantes: 0, statusDescricao: 'última parcela', dataPrimeiraParcela: null,
        categoria: 'Educação', observacao: 'Total de parcelas e data da 1ª parcela não informados. Esta é a última parcela.',
      },
    ],

    // Despesas variáveis / únicas, já registradas em agosto/2026.
    despesasVariaveis: [
      { id: generateId('var'), nome: 'Rancho / mercado', valor: 576.58, categoria: 'Mercado/Alimentação', data: null, mesReferencia: '2026-08', formaPagamento: null, status: 'Pago', comprovante: null, observacao: null },
      { id: generateId('var'), nome: 'Drogasil', valor: 166.20, categoria: 'Saúde/Higiene', data: null, mesReferencia: '2026-08', formaPagamento: null, status: 'Pago', comprovante: null, observacao: null },
      { id: generateId('var'), nome: 'Udemy (5 cursos)', valor: 133.00, categoria: 'Educação', data: null, mesReferencia: '2026-08', formaPagamento: null, status: 'Pago', comprovante: null, observacao: 'Pagamento único, não parcelado.' },
      { id: generateId('var'), nome: 'Uber', valor: 50.00, categoria: 'Transporte', data: null, mesReferencia: '2026-08', formaPagamento: null, status: 'Pago', comprovante: null, observacao: 'Valor aproximado, pode variar mensalmente.' },
      { id: generateId('var'), nome: 'Café', valor: 59.00, categoria: 'Alimentação especial / Dia dos Pais', data: null, mesReferencia: '2026-08', formaPagamento: null, status: 'Pago', comprovante: null, observacao: null },
      { id: generateId('var'), nome: 'Almoço', valor: 43.00, categoria: 'Alimentação especial / Dia dos Pais', data: null, mesReferencia: '2026-08', formaPagamento: null, status: 'Pago', comprovante: null, observacao: null },
      { id: generateId('var'), nome: 'Cinema', valor: 90.00, categoria: 'Lazer', data: null, mesReferencia: '2026-08', formaPagamento: null, status: 'Pago', comprovante: null, observacao: null },
    ],

    categorias: [
      'Moradia', 'Alimentação', 'Transporte', 'Saúde', 'Educação', 'Tecnologia',
      'Lazer', 'Assinaturas', 'Compras', 'Academia', 'Viagens', 'Contas',
      'Mercado/Alimentação', 'Saúde/Higiene', 'Alimentação especial / Dia dos Pais', 'Outros',
    ],

    metas: [
      {
        id: generateId('meta'),
        nome: 'Hábito de guardar dinheiro',
        valorDesejado: null, // é uma meta de fluxo mensal, não de valor total
        valorMensalDesejado: 100.00,
        valorAtual: null,
        prazoMeses: null,
        prioridade: 'alta',
        observacao: 'Meta de economia mensal mínima. Valor acumulado e prazo não informados.',
      },
    ],

    investimentos: [],

    reservaEmergencia: {
      possui: null,
      valorAtual: null,
      metaValor: null,
      valorMensalDestinado: null,
    },

    // Registro do que ainda falta o usuário informar, para a UI conseguir
    // avisar de forma transparente em vez de fingir que os dados existem.
    pendencias: [
      'Total de parcelas de "Pr Saúde", "Bemol" e "Gran Cursos"',
      'Datas da 1ª parcela de todos os parcelamentos do cartão',
      'Limite, fechamento, vencimento e valor atual da fatura do cartão',
      'Margem de segurança financeira',
      'Valor acumulado e prazo da meta de economia mensal',
      'Dados de reserva de emergência e de investimentos',
    ],

    // Divergência encontrada nos dados fornecidos: a tabela de categorias de
    // agosto soma R$ 352,70 em "Parcelas", mas os itens correspondentes
    // (Bemol R$ 281,20 + Bigazine R$ 70,50) somam R$ 351,70 — diferença de
    // R$ 1,00. Registrado aqui em vez de "corrigido" silenciosamente.
    inconsistenciasDetectadas: [
      {
        descricao: 'Categoria "Parcelas" em agosto/2026: tabela informa R$ 352,70, mas Bemol + Bigazine somam R$ 351,70 (diferença de R$ 1,00).',
        resolvida: false,
      },
    ],
  };

  // Snapshot do mês atual, calculado a partir dos próprios dados acima —
  // é o primeiro registro do histórico financeiro (seção 26 do prompt mestre).
  seed.historicoMensal = [buildSnapshot(seed, seed.meta.mesReferenciaAtual)];

  return seed;
}

/** Constrói um registro de histórico para um mês, usando as funções de cálculo reais. */
function buildSnapshot(data, mesReferencia) {
  return {
    mes: mesReferencia,
    renda: Calc.calculateMonthlyIncome(data, mesReferencia),
    gastos: Calc.calculateMonthlyExpenses(data, mesReferencia),
    saldo: Calc.calculateRemainingBalance(data, mesReferencia),
    percentualComprometido: Calc.calculateCommittedPercentage(data, mesReferencia),
    potencialInvestimento: Calc.calculateInvestmentCapacityByProfile(data, mesReferencia).valor,
    registradoEm: new Date().toISOString(),
  };
}

const Storage = {
  _userId: null,

  async _resolveUserId() {
    if (this._userId) return this._userId;
    const { data, error } = await supabaseClient.auth.getUser();
    if (error || !data || !data.user) throw new Error('Usuário não autenticado.');
    this._userId = data.user.id;
    return this._userId;
  },

  /** Carrega os dados do Supabase, criando o seed (ou importando um backup local antigo) no primeiro acesso da conta. */
  async load(userId) {
    this._userId = userId || this._userId;
    const uid = await this._resolveUserId();
    try {
      const hasData = await this._hasRemoteData(uid);
      if (!hasData) {
        const seed = this._buildFirstLoginSeed();
        await this._writeAll(seed, uid);
        // Evita que uma segunda conta feita no mesmo navegador reimporte o
        // mesmo backup local (e colida com os IDs já migrados para a primeira).
        localStorage.removeItem(STORAGE_KEY);
        return seed;
      }
      return await this._readAll(uid);
    } catch (e) {
      console.error('Falha ao carregar dados do Supabase.', e);
      if (typeof toast === 'function') {
        toast('⚠️ Não foi possível carregar seus dados. Verifique sua conexão e recarregue a página.');
      }
      throw e;
    }
  },

  /** Salva o objeto de dados inteiro (substituição completa das tabelas). */
  async save(data) {
    try {
      const uid = await this._resolveUserId();
      await this._writeAll(data, uid);
    } catch (e) {
      console.error('Falha ao salvar no Supabase.', e);
      if (typeof toast === 'function') {
        toast('⚠️ Não foi possível salvar suas alterações. Verifique sua conexão e tente novamente.');
      }
    }
  },

  /** Exporta os dados atuais como JSON (usado na tela de backup). Usa o objeto já em memória — sempre espelha o último save(). */
  exportJSON() {
    return JSON.stringify(appData, null, 2);
  },

  /** Apaga todos os dados da conta atual (usado em "Excluir todos os dados", com confirmação dupla). */
  async clearAll() {
    const uid = await this._resolveUserId();
    await Promise.all([
      ...ARRAY_TABLES.map((t) => supabaseClient.from(t.table).delete().eq('user_id', uid)),
      supabaseClient.from('perfil').delete().eq('user_id', uid),
      supabaseClient.from('reserva_emergencia').delete().eq('user_id', uid),
    ]);
  },

  /** Se existe um backup em localStorage de uma sessão anterior (pré-Supabase), importa em vez de recriar do zero. */
  _buildFirstLoginSeed() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return buildSeedData();
    try {
      return this._regenerateIds(migrate(JSON.parse(raw)));
    } catch (e) {
      console.error('Backup local corrompido, usando os dados iniciais padrão.', e);
      return buildSeedData();
    }
  },

  /**
   * IDs de um backup local antigo não podem ser confiados: o id é chave
   * primária global no Postgres (não escopada por usuário), então se duas
   * contas diferentes um dia importarem o mesmo backup local (ex.: mesmo
   * navegador), os IDs colidiriam. Gera IDs novos e realinha a referência
   * parcelamentos → cartão.
   */
  _regenerateIds(data) {
    const cartaoIdMap = {};
    (data.cartoes || []).forEach((c) => {
      const newId = generateId('cartao');
      cartaoIdMap[c.id] = newId;
      c.id = newId;
    });
    (data.parcelamentos || []).forEach((p) => {
      if (p.cartaoId && cartaoIdMap[p.cartaoId]) p.cartaoId = cartaoIdMap[p.cartaoId];
      p.id = generateId('parc');
    });
    (data.rendas || []).forEach((r) => { r.id = generateId('renda'); });
    (data.despesasRecorrentes || []).forEach((d) => { d.id = generateId('rec'); });
    (data.despesasVariaveis || []).forEach((d) => { d.id = generateId('var'); });
    (data.metas || []).forEach((m) => { m.id = generateId('meta'); });
    (data.investimentos || []).forEach((i) => { i.id = generateId('inv'); });
    return data;
  },

  async _hasRemoteData(uid) {
    const { data, error } = await supabaseClient.from('perfil').select('user_id').eq('user_id', uid).maybeSingle();
    if (error) throw error;
    return !!data;
  },

  async _readAll(uid) {
    const results = await Promise.all([
      supabaseClient.from('perfil').select('*').eq('user_id', uid).maybeSingle(),
      supabaseClient.from('reserva_emergencia').select('*').eq('user_id', uid).maybeSingle(),
      ...ARRAY_TABLES.map((t) => {
        let q = supabaseClient.from(t.table).select('*').eq('user_id', uid);
        if (t.table === 'historico_mensal') q = q.order('mes');
        if (t.table === 'pendencias' || t.table === 'inconsistencias_detectadas') q = q.order('id');
        return q;
      }),
    ]);

    const [perfilRes, reservaRes, ...arrayResults] = results;
    results.forEach((r) => { if (r.error) throw r.error; });

    const p = perfilRes.data || {};
    const r = reservaRes.data;

    const data = {
      schemaVersion: SCHEMA_VERSION,
      meta: {
        criadoEm: p.criado_em || new Date().toISOString(),
        mesReferenciaAtual: p.mes_referencia_atual || new Date().toISOString().slice(0, 7),
      },
      perfil: { nome: p.nome ?? null, foto: p.foto ?? null },
      configuracoes: {
        diaRecebimentoSalario: p.dia_recebimento_salario ?? null,
        cicloFinanceiro: p.ciclo_financeiro ?? null,
        margemSeguranca: p.margem_seguranca ?? null,
        metaEconomiaMensal: p.meta_economia_mensal ?? null,
        perfilInvestidor: p.perfil_investidor || 'equilibrado',
        limiteComprometimento: {
          percentual: p.limite_comprometimento_percentual ?? 80,
          modo: p.limite_comprometimento_modo || 'confirmacao',
        },
        notificacoes: {
          ativado: !!p.notificacoes_ativado,
          canais: p.notificacoes_canais || [],
        },
        ocultarValores: {
          renda: !!p.ocultar_valor_renda,
          saldo: !!p.ocultar_valor_saldo,
        },
      },
      reservaEmergencia: r
        ? { possui: r.possui, valorAtual: r.valor_atual, metaValor: r.meta_valor, valorMensalDestinado: r.valor_mensal_destinado }
        : { possui: null, valorAtual: null, metaValor: null, valorMensalDestinado: null },
    };

    ARRAY_TABLES.forEach((t, i) => {
      const rows = arrayResults[i].data || [];
      if (t.stringItem) {
        data[t.key] = rows.map((row) => row[t.stringCol]);
      } else {
        data[t.key] = rows.map(rowToCamel);
      }
    });

    return migrate(data);
  },

  /** Upsert dos singletons (perfil, reserva) + substituição completa das tabelas de array. */
  async _writeAll(data, uid) {
    const perfilRow = {
      user_id: uid,
      criado_em: data.meta.criadoEm || new Date().toISOString(),
      mes_referencia_atual: data.meta.mesReferenciaAtual,
      nome: data.perfil.nome,
      foto: data.perfil.foto,
      dia_recebimento_salario: data.configuracoes.diaRecebimentoSalario,
      ciclo_financeiro: data.configuracoes.cicloFinanceiro,
      margem_seguranca: data.configuracoes.margemSeguranca,
      meta_economia_mensal: data.configuracoes.metaEconomiaMensal,
      perfil_investidor: data.configuracoes.perfilInvestidor || 'equilibrado',
      limite_comprometimento_percentual: data.configuracoes.limiteComprometimento.percentual,
      limite_comprometimento_modo: data.configuracoes.limiteComprometimento.modo,
      notificacoes_ativado: data.configuracoes.notificacoes.ativado,
      notificacoes_canais: data.configuracoes.notificacoes.canais || [],
      ocultar_valor_renda: data.configuracoes.ocultarValores.renda,
      ocultar_valor_saldo: data.configuracoes.ocultarValores.saldo,
    };
    const reserva = data.reservaEmergencia || {};
    const reservaRow = {
      user_id: uid,
      possui: reserva.possui,
      valor_atual: reserva.valorAtual,
      meta_valor: reserva.metaValor,
      valor_mensal_destinado: reserva.valorMensalDestinado,
    };

    const perfilRes = await supabaseClient.from('perfil').upsert(perfilRow, { onConflict: 'user_id' });
    if (perfilRes.error) throw perfilRes.error;
    const reservaRes = await supabaseClient.from('reserva_emergencia').upsert(reservaRow, { onConflict: 'user_id' });
    if (reservaRes.error) throw reservaRes.error;

    const deleteResults = await Promise.all(ARRAY_TABLES.map((t) => supabaseClient.from(t.table).delete().eq('user_id', uid)));
    deleteResults.forEach((r) => { if (r.error) throw r.error; });

    // cartoes precisa existir antes de parcelamentos (foreign key cartao_id).
    for (const t of ARRAY_TABLES) {
      if (t.table === 'cartoes') await this._insertTable(t, data, uid);
    }
    await Promise.all(ARRAY_TABLES.filter((t) => t.table !== 'cartoes').map((t) => this._insertTable(t, data, uid)));
  },

  async _insertTable(conf, data, uid) {
    const items = data[conf.key] || [];
    if (!items.length) return;
    const rows = conf.stringItem
      ? items.map((val) => ({ user_id: uid, [conf.stringCol]: val }))
      : items.map((item) => {
          const row = itemToSnakeRow(item, uid);
          (conf.omitFields || []).forEach((f) => { delete row[camelToSnake(f)]; });
          return row;
        });
    const { error } = await supabaseClient.from(conf.table).insert(rows);
    if (error) throw error;
  },
};
