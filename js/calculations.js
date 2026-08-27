/**
 * calculations.js
 * -----------------------------------------------------------------------
 * Todas as contas do app moram aqui, como funções puras: recebem os dados
 * e devolvem um número (ou um objeto simples). Nada de valor mágico
 * escondido no meio do código — cada função tem um nome que diz
 * exatamente o que ela calcula, como pedido no prompt mestre.
 */

const Calc = {
  /**
   * Soma de todas as fontes de renda ativas no mês informado: rendas fixas
   * (frequencia 'mensal', sempre contam) + rendas extras lançadas
   * especificamente para esse mês (`mesReferencia`). Sem `mesReferencia`
   * informado, conta todas (compatível com chamadas antigas).
   */
  calculateMonthlyIncome(data, mesReferencia) {
    return sum(
      data.rendas
        .filter((r) => r.frequencia !== 'unica' || !mesReferencia || r.mesReferencia === mesReferencia)
        .map((r) => r.valor)
    );
  },

  /**
   * Uma despesa recorrente conta no mês informado se não tiver
   * `inicioMesReferencia` definido, ou se esse mês de início já chegou (ela
   * pode ter sido cadastrada com uma data de compra no cartão que só cai
   * numa fatura futura — ver `calculateExpenseMonth`). Sem `mesReferencia`
   * informado, conta sempre (compatível com chamadas antigas). Usar em
   * QUALQUER lugar que trata despesasRecorrentes como "contas deste mês" —
   * sem isso, uma conta que só passa a valer em novembro aparece contada
   * (ou lembrada) já em setembro.
   */
  isDespesaRecorrenteAtiva(d, mesReferencia) {
    return !d.inicioMesReferencia || !mesReferencia || d.inicioMesReferencia <= mesReferencia;
  },

  /** Soma das despesas recorrentes/fixas ativas no mês informado. */
  calculateFixedExpenses(data, mesReferencia) {
    return sum(
      data.despesasRecorrentes
        .filter((d) => this.isDespesaRecorrenteAtiva(d, mesReferencia))
        .map((d) => d.valor)
    );
  },

  /** Soma das despesas variáveis lançadas em um mês de referência específico. */
  calculateVariableExpenses(data, mesReferencia) {
    return sum(
      data.despesasVariaveis
        .filter((d) => d.mesReferencia === mesReferencia)
        .map((d) => d.valor)
    );
  },

  /** Soma do valor das parcelas ativas no cartão neste ciclo (a "fatura consolidada"). */
  calculateInstallmentsMonthlyTotal(data) {
    return sum(data.parcelamentos.map((p) => p.valorParcela));
  },

  /** Total de despesas do mês: fixas + variáveis do mês + parcelas ativas. */
  calculateMonthlyExpenses(data, mesReferencia) {
    return (
      this.calculateFixedExpenses(data, mesReferencia) +
      this.calculateVariableExpenses(data, mesReferencia) +
      this.calculateInstallmentsMonthlyTotal(data)
    );
  },

  /** Saldo disponível = renda do mês - gastos do mês. */
  calculateRemainingBalance(data, mesReferencia) {
    return this.calculateMonthlyIncome(data, mesReferencia) - this.calculateMonthlyExpenses(data, mesReferencia);
  },

  /** Percentual da renda já comprometido com gastos. */
  calculateCommittedPercentage(data, mesReferencia) {
    const renda = this.calculateMonthlyIncome(data, mesReferencia);
    if (renda <= 0) return null;
    const gastos = this.calculateMonthlyExpenses(data, mesReferencia);
    return (gastos / renda) * 100;
  },

  /** Quantos meses do padrão de gasto atual a reserva de emergência cobre — referência simples de quanto tempo ela sustentaria o usuário sem renda. */
  calculateEmergencyFundMonthsCovered(data) {
    const reserva = data.reservaEmergencia;
    if (!reserva || reserva.valorAtual == null) return null;
    const gastos = this.calculateMonthlyExpenses(data, data.meta.mesReferenciaAtual);
    if (!gastos) return null;
    return reserva.valorAtual / gastos;
  },

  /** Percentual do saldo (já líquido da margem de segurança, se configurada) considerado "investível" em cada perfil de investidor. */
  INVESTMENT_PROFILE_FACTORS: { conservador: 0.5, equilibrado: 0.75, agressivo: 1 },

  /** Aplica o percentual do perfil sobre uma base de saldo — um déficit (base negativa) aparece por inteiro, sem "encolher" pelo perfil. */
  applyInvestorProfile(base, perfil) {
    const fator = this.INVESTMENT_PROFILE_FACTORS[perfil] ?? this.INVESTMENT_PROFILE_FACTORS.equilibrado;
    return base > 0 ? base * fator : base;
  },

  /**
   * Potencial de investimento = saldo disponível menos a margem de segurança
   * configurada em Perfil (reserva que o usuário não quer contar como "sobra
   * investível"), multiplicado pelo percentual do perfil de investidor
   * escolhido em Planejamento > Potencial de investimento — cenários
   * ('conservador' 50% / 'equilibrado' 75% / 'agressivo' 100%, padrão 'equilibrado').
   */
  calculateInvestmentCapacityByProfile(data, mesReferencia) {
    const perfil = data.configuracoes.perfilInvestidor || 'equilibrado';
    const saldo = this.calculateRemainingBalance(data, mesReferencia);
    const margem = data.configuracoes.margemSeguranca;
    const base = margem == null ? saldo : Math.max(saldo - margem, 0);
    const obsMargem = margem == null
      ? 'Sem margem de segurança configurada — potencial calculado como % do saldo disponível, de acordo com seu perfil de investidor.'
      : `Considerando ${formatBRL(margem)} de margem de segurança reservada do saldo, de acordo com seu perfil de investidor.`;
    return { valor: this.applyInvestorProfile(base, perfil), perfil, obsMargem };
  },

  /**
   * Mês de referência de uma despesa variável a partir da data da compra.
   * Se a forma de pagamento for "cartão" e o dia da compra for igual ou
   * depois do dia de fechamento cadastrado no cartão, a despesa conta pra
   * fatura do mês seguinte (no dia do fechamento a compra já não entra mais
   * na fatura atual). Sem cartão/fechamento configurado, ou pra outras
   * formas de pagamento, conta no mês da compra.
   */
  calculateExpenseMonth(data, dataCompra, formaPagamento) {
    const [ano, mes, dia] = dataCompra.split('-').map(Number);
    const mesCompra = `${ano}-${String(mes).padStart(2, '0')}`;
    const cartao = data.cartoes && data.cartoes[0];
    if (formaPagamento === 'cartao' && cartao && cartao.diaFechamento != null && dia >= cartao.diaFechamento) {
      return addMonths(mesCompra, 1);
    }
    return mesCompra;
  },

  /**
   * Calcula em quantos meses a partir do mês de referência atual um
   * parcelamento termina, com base em parcelasRestantes (nº de cobranças
   * que ainda ocorrerão DEPOIS do mês atual). 0 = a cobrança deste mês é a última.
   */
  calculateInstallmentEndInfo(parcelamento, mesReferenciaAtual) {
    const restantes = parcelamento.parcelasRestantes;
    if (restantes == null) return { monthsUntilEnd: null, endMonthLabel: 'não informado' };
    const endMonthKey = addMonths(mesReferenciaAtual, restantes);
    return { monthsUntilEnd: restantes, endMonthLabel: formatMonthKey(endMonthKey), endMonthKey };
  },

  /**
   * Lista os parcelamentos que terminam no mês atual ou nos próximos meses
   * (por padrão, até 2 meses à frente), com a margem que cada um libera.
   */
  calculateUpcomingEndings(data, mesesAFrente = 2) {
    return data.parcelamentos
      .map((p) => ({ parcelamento: p, ...this.calculateInstallmentEndInfo(p, data.meta.mesReferenciaAtual) }))
      .filter((x) => x.monthsUntilEnd != null && x.monthsUntilEnd <= mesesAFrente)
      .sort((a, b) => a.monthsUntilEnd - b.monthsUntilEnd);
  },

  /** Soma da margem que será liberada assim que as parcelas que terminam ESTE mês saírem da fatura. */
  calculateMarginFreedNextMonth(data) {
    return sum(
      this.calculateUpcomingEndings(data, 0).map((x) => x.parcelamento.valorParcela)
    );
  },


  /**
   * Previsão do próximo mês: renda mantida, despesas fixas mantidas,
   * apenas os parcelamentos que ainda estarão ativos (parcelasRestantes >= 1),
   * e uma estimativa de gastos variáveis baseada no(s) mês(es) já registrados
   * (por enquanto, o único mês disponível — fica mais preciso conforme o
   * histórico crescer).
   */
  calculateNextMonthProjection(data) {
    const mesAtual = data.meta.mesReferenciaAtual;
    const mesSeguinte = addMonths(mesAtual, 1);
    const renda = this.calculateMonthlyIncome(data, mesSeguinte);
    const fixos = this.calculateFixedExpenses(data, mesSeguinte);
    const parcelasAtivas = data.parcelamentos.filter((p) => p.parcelasRestantes == null || p.parcelasRestantes >= 1);
    const parcelas = sum(parcelasAtivas.map((p) => p.valorParcela));
    // Estimativa baseada no mês atual + despesas já lançadas de fato pro mês
    // seguinte (ex.: compra no cartão feita no/depois do fechamento da
    // fatura, que Calc.calculateExpenseMonth já atribui ao próximo mês).
    const variaveisJaLancadas = this.calculateVariableExpenses(data, mesSeguinte);
    const variaveisEstimado = this.calculateVariableExpenses(data, mesAtual) + variaveisJaLancadas;
    const gastosPrevistos = fixos + parcelas + variaveisEstimado;
    const saldoEstimado = renda - gastosPrevistos;
    return {
      mes: mesSeguinte,
      renda,
      fixos,
      parcelas,
      variaveisEstimado,
      gastosPrevistos,
      saldoEstimado,
      percentual: renda > 0 ? (gastosPrevistos / renda) * 100 : null,
      obsVariaveis: variaveisJaLancadas > 0
        ? 'Estimativa baseada no mês atual, já somando despesas lançadas para o mês seguinte (ex.: compras no cartão após o fechamento da fatura).'
        : 'Estimativa baseada nos gastos variáveis do(s) mês(es) já registrados no histórico.',
    };
  },

  /**
   * Verifica se já existe algum dado real lançado especificamente pro mês
   * seguinte (compra no cartão pós-fechamento, recorrente que só começa lá,
   * ou renda extra) — usado pra decidir se os gráficos de vários meses
   * ganham um ponto extra "previsto", mesmo antes do mês virar de verdade.
   */
  hasDataForNextMonth(data) {
    const mesSeguinte = addMonths(data.meta.mesReferenciaAtual, 1);
    return data.despesasVariaveis.some((d) => d.mesReferencia === mesSeguinte)
      || data.despesasRecorrentes.some((d) => d.inicioMesReferencia === mesSeguinte)
      || data.rendas.some((r) => r.frequencia === 'unica' && r.mesReferencia === mesSeguinte);
  },

  /**
   * Histórico mensal + (quando já há dados reais lançados pro mês seguinte)
   * um ponto extra "previsto" no fim — assim os gráficos de vários meses
   * reagem na hora a uma compra/renda já cadastrada pro próximo mês, sem
   * esperar a virada de mês pra aparecer. Sem nada lançado pra lá ainda,
   * devolve o histórico como está (nenhuma mudança visual).
   */
  /**
   * Soma das parcelas que ainda estarão ativas daqui a `mesesAFrente` meses
   * (uma que termina antes disso já não entra) — versão "no futuro" de
   * `calculateInstallmentsMonthlyTotal`, usada só nas projeções de vários
   * meses (no mês corrente, mesesAFrente=0, e o resultado é idêntico).
   */
  calculateActiveInstallmentsTotal(data, mesesAFrente) {
    return sum(
      data.parcelamentos
        .filter((p) => {
          const info = this.calculateInstallmentEndInfo(p, data.meta.mesReferenciaAtual);
          return info.monthsUntilEnd == null || info.monthsUntilEnd >= mesesAFrente;
        })
        .map((p) => p.valorParcela)
    );
  },

  /**
   * Histórico mensal + pontos "previstos" para os próximos meses (não só o
   * primeiro) — as despesas fixas/recorrentes já cadastradas continuam
   * contando em todos eles (é assim que `calculateFixedExpenses` já
   * funciona), os parcelamentos somem da conta assim que terminam, e
   * despesas variáveis/rendas extras só entram nos meses em que já foram de
   * fato lançadas. Só aparece algum mês previsto se já houver pelo menos um
   * dado real lançado pro mês seguinte (ver `hasDataForNextMonth`) — sem
   * isso, devolve o histórico como está, sem projeção especulativa.
   *
   * Essa projeção alimenta os gráficos de vários meses (Renda x gastos,
   * Evolução etc.); a projeção de "Próximo mês" do Planejamento continua
   * olhando só 1 mês à frente — ver `calculateNextMonthProjection`.
   */
  buildHistoricoComProjecao(data, mesesAFrente = 3) {
    const historico = data.historicoMensal || [];
    const mesAtual = data.meta.mesReferenciaAtual;

    // O mês corrente só entra em historicoMensal quando a pessoa vira o mês
    // ou salva um snapshot manual — sem isso, os gráficos de vários meses
    // (Renda x gastos, Evolução mensal, Evolução do potencial) ficavam
    // vazios pra qualquer usuário antes do primeiro fechamento de mês,
    // mesmo já com renda/gastos lançados este mês. Acrescenta um ponto "ao
    // vivo" pro mês atual (marcado com emAndamento, não com previsto — é
    // dado real de agora, não projeção), a menos que ele já tenha sido
    // salvo manualmente no histórico.
    const mesAtualJaArquivado = historico.some((h) => h.mes === mesAtual);
    const historicoComAtual = mesAtualJaArquivado ? historico : [...historico, {
      mes: mesAtual,
      renda: this.calculateMonthlyIncome(data, mesAtual),
      gastos: this.calculateMonthlyExpenses(data, mesAtual),
      saldo: this.calculateRemainingBalance(data, mesAtual),
      percentualComprometido: this.calculateCommittedPercentage(data, mesAtual),
      potencialInvestimento: this.calculateInvestmentCapacityByProfile(data, mesAtual).valor,
      emAndamento: true,
    }];

    if (!this.hasDataForNextMonth(data)) return historicoComAtual;

    const projecoes = [];
    for (let i = 1; i <= mesesAFrente; i++) {
      const mes = addMonths(mesAtual, i);
      const renda = this.calculateMonthlyIncome(data, mes);
      const gastos = this.calculateFixedExpenses(data, mes)
        + this.calculateActiveInstallmentsTotal(data, i)
        + this.calculateVariableExpenses(data, mes);
      const saldo = renda - gastos;
      const margem = data.configuracoes.margemSeguranca;
      const perfil = data.configuracoes.perfilInvestidor || 'equilibrado';
      const baseInvest = margem == null ? saldo : Math.max(saldo - margem, 0);
      projecoes.push({
        mes,
        renda,
        gastos,
        saldo,
        percentualComprometido: renda > 0 ? (gastos / renda) * 100 : null,
        potencialInvestimento: this.applyInvestorProfile(baseInvest, perfil),
        previsto: true,
      });
    }
    return [...historicoComAtual, ...projecoes];
  },

  /**
   * Variação percentual de um indicador do histórico (ex.: 'renda', 'gastos',
   * 'saldo', 'potencialInvestimento') no último mês em relação ao anterior
   * (null se não houver pelo menos 2 meses registrados).
   */
  calculateStatTrend(data, field) {
    const historico = data.historicoMensal || [];
    let deltaPercent = null;
    if (historico.length >= 2) {
      const atual = historico[historico.length - 1][field];
      const anterior = historico[historico.length - 2][field];
      if (atual != null && anterior != null && anterior !== 0) {
        deltaPercent = ((atual - anterior) / Math.abs(anterior)) * 100;
      }
    }
    return { deltaPercent };
  },

  /**
   * Gasto acumulado dia a dia num mês — soma despesas variáveis com data
   * preenchida + despesas recorrentes no dia do seu vencimento (quando dá
   * pra extrair um número de "vencimento", ex.: "dia 05"). Parcelamentos
   * ficam de fora (não têm um dia certo de cobrança). `hasData` indica se
   * existe pelo menos um evento com data real nesse mês — sem isso, o
   * "acumulado" seria só zero o mês inteiro, então quem chama deve tratar
   * como "sem dados" em vez de desenhar uma linha reta em zero.
   */
  calculateDailySpendingCurve(data, mesReferencia) {
    const [ano, mes] = mesReferencia.split('-').map(Number);
    const daysInMonth = new Date(ano, mes, 0).getDate();
    const byDay = new Array(daysInMonth + 1).fill(0);
    let hasData = false;

    data.despesasVariaveis
      .filter((d) => d.mesReferencia === mesReferencia && d.data)
      .forEach((d) => {
        const day = parseInt(d.data.slice(8, 10), 10);
        if (day >= 1 && day <= daysInMonth) { byDay[day] += d.valor; hasData = true; }
      });

    data.despesasRecorrentes.forEach((d) => {
      if (!this.isDespesaRecorrenteAtiva(d, mesReferencia)) return;
      const match = (d.vencimento || '').match(/(\d{1,2})/);
      if (!match) return;
      const day = Math.min(Math.max(parseInt(match[1], 10), 1), daysInMonth);
      byDay[day] += d.valor;
      hasData = true;
    });

    const curve = [];
    let acc = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      acc += byDay[day];
      curve.push(acc);
    }
    return { curve, hasData };
  },

  /** "O que muda no próximo mês?" — hoje só detecta parcelas que terminam; novas despesas futuras entram aqui quando forem cadastradas com data de início. */
  calculateMonthlyDifference(data) {
    const encerrando = this.calculateUpcomingEndings(data, 0);
    const itens = encerrando.map((x) => ({ descricao: `Parcela encerrada: ${x.parcelamento.nome}`, impacto: x.parcelamento.valorParcela }));
    return { itens, margemAdicional: sum(itens.map((i) => i.impacto)) };
  },

  /**
   * Três cenários de investimento, como percentuais do saldo disponível real
   * (não um valor fixo). Como você ainda não configurou uma margem de
   * segurança, o percentual reservado como "buffer" é o que diferencia os
   * cenários — quanto mais conservador, mais saldo fica de fora do investimento.
   */
  calculateInvestmentScenarios(data, mesReferencia) {
    const saldo = Math.max(this.calculateRemainingBalance(data, mesReferencia), 0);
    return {
      baseSaldo: saldo,
      conservador: saldo * 0.5,
      equilibrado: saldo * 0.75,
      agressivo: saldo,
    };
  },

  /** Progresso de uma meta com valor-alvo definido (não se aplica a metas de hábito mensal). */
  calculateGoalProgress(meta) {
    if (meta.valorDesejado == null) return null;
    const atual = meta.valorAtual || 0;
    const restante = Math.max(meta.valorDesejado - atual, 0);
    const percent = meta.valorDesejado > 0 ? (atual / meta.valorDesejado) * 100 : 0;
    return { restante, percent: Math.min(percent, 100) };
  },

  /** Valor mensal necessário para bater a meta no prazo informado (em meses). */
  calculateMonthlyRequired(meta) {
    const progresso = this.calculateGoalProgress(meta);
    if (!progresso || !meta.prazoMeses || meta.prazoMeses <= 0) return null;
    return progresso.restante / meta.prazoMeses;
  },

  /** Compara o valor mensal necessário de uma meta com a capacidade de investimento "equilibrada". */
  compareGoalToCapacity(valorMensalNecessario, capacidadeEquilibrada) {
    if (valorMensalNecessario == null) return null;
    return valorMensalNecessario <= capacidadeEquilibrada ? 'compativel' : 'ajustar';
  },

  /**
   * Simulador "E se eu investir?": projeta o acumulado para uma lista de
   * horizontes (em meses), com e sem taxa de rendimento mensal.
   * Sem taxa informada, é só soma dos aportes (nenhuma rentabilidade assumida).
   */
  simulateInvestment(valorMensal, horizontesMeses, taxaMensal = 0) {
    return horizontesMeses.map((meses) => {
      const semRendimento = valorMensal * meses;
      let comRendimento = semRendimento;
      if (taxaMensal > 0) {
        comRendimento = 0;
        for (let i = 0; i < meses; i++) {
          comRendimento = (comRendimento + valorMensal) * (1 + taxaMensal);
        }
      }
      return { meses, semRendimento, comRendimento };
    });
  },

  /** "Posso fazer este gasto?" — análise matemática do orçamento, não uma recomendação financeira. */
  calculateSpendCheck(data, valor) {
    const mes = data.meta.mesReferenciaAtual;
    const saldo = this.calculateRemainingBalance(data, mes);
    const capacidadeEquilibrada = this.calculateInvestmentScenarios(data, mes).equilibrado;
    if (valor <= saldo - capacidadeEquilibrada) return { nivel: 'verde', saldoApos: saldo - valor };
    if (valor <= saldo) return { nivel: 'amarelo', saldoApos: saldo - valor };
    return { nivel: 'vermelho', saldoApos: saldo - valor };
  },

  /** Valor em R$ correspondente ao limite de renda comprometida configurado. */
  calculateCommitmentLimit(data) {
    const cfg = data.configuracoes.limiteComprometimento;
    if (!cfg || cfg.percentual == null) return null;
    const renda = this.calculateMonthlyIncome(data, data.meta.mesReferenciaAtual);
    return { percentual: cfg.percentual, valor: (renda * cfg.percentual) / 100, modo: cfg.modo };
  },

  /**
   * Classifica o % de comprometimento atual em relação ao limite configurado.
   * 'normal' | 'aproximando' | 'atingido' | 'ultrapassado' | null (sem limite configurado).
   */
  calculateCommitmentLevel(pct, limitePercentual) {
    if (pct == null || limitePercentual == null) return null;
    if (Math.round(pct) > Math.round(limitePercentual)) return 'ultrapassado';
    if (Math.round(pct) === Math.round(limitePercentual)) return 'atingido';
    if (pct >= limitePercentual - 10) return 'aproximando';
    return 'normal';
  },

  /**
   * Simula o impacto de ADICIONAR (ou editar) um gasto mensal de `deltaValor`
   * reais no comprometimento da renda, sem alterar os dados reais — usado
   * para avisar/confirmar/bloquear antes de salvar (seção 9 do backlog).
   */
  calculateImpactPreview(data, deltaValor) {
    const mes = data.meta.mesReferenciaAtual;
    const renda = this.calculateMonthlyIncome(data, mes);
    const pctAntes = this.calculateCommittedPercentage(data, mes);
    const pctDepois = renda > 0 ? (pctAntes || 0) + (deltaValor / renda) * 100 : null;
    const limite = this.calculateCommitmentLimit(data);
    const nivelDepois = limite ? this.calculateCommitmentLevel(pctDepois, limite.percentual) : null;
    return { pctAntes, pctDepois, limite, nivelDepois };
  },

  /** Lembretes automáticos para o menu lateral (seção 21 do backlog). */
  calculateReminders(data) {
    const reminders = [];

    // Inconsistências detectadas nos dados (ex.: totais que não batem) são o
    // tipo mais importante de aviso — entram primeiro na lista.
    (data.inconsistenciasDetectadas || [])
      .filter((i) => !i.resolvida)
      .forEach((i) => {
        reminders.push({ id: `inc-${i.id}`, icon: 'warning', texto: i.descricao });
      });

    this.calculateUpcomingEndings(data, 0).forEach((x) => {
      reminders.push({ id: `parcfim-${x.parcelamento.id}`, icon: 'lightbulb', texto: `Última parcela de "${x.parcelamento.nome}" é cobrada este mês.` });
    });

    data.despesasRecorrentes
      .filter((d) => d.status === 'Pendente' && d.vencimento && this.isDespesaRecorrenteAtiva(d, data.meta.mesReferenciaAtual))
      .forEach((d) => {
        reminders.push({ id: `rec-${d.id}`, icon: 'warning', texto: `${d.nome} pendente, vencimento ${d.vencimento}.` });
      });

    data.metas.forEach((m) => {
      const prog = this.calculateGoalProgress(m);
      if (prog && prog.percent >= 80 && prog.percent < 100) {
        reminders.push({ id: `meta-${m.id}`, icon: 'track_changes', texto: `Meta "${m.nome}" está ${formatPercent(prog.percent)} concluída.` });
      }
    });

    return reminders;
  },

  /**
   * Inversa do simulador: quanto guardar por mês para acumular `valorAlvo`
   * em `meses`, com a mesma taxa usada no simulador (garante que os dois
   * usam exatamente a mesma matemática, sem fórmula duplicada).
   */
  calculateRequiredMonthlyForGoal(valorAlvo, meses, taxaMensal = 0) {
    if (!meses || meses <= 0) return null;
    const fatorPorReal = this.simulateInvestment(1, [meses], taxaMensal)[0].comRendimento;
    if (!fatorPorReal || fatorPorReal <= 0) return null;
    return valorAlvo / fatorPorReal;
  },

  /**
   * Ranking das maiores despesas INDIVIDUAIS do mês (não por categoria) —
   * junta recorrentes + variáveis do mês + parcelamentos ativos, cada um
   * como um item próprio, ordenado do maior pro menor.
   */
  calculateTopExpenses(data, mesReferencia, limit = 8) {
    const itens = [];
    // `mes` vai junto em cada item pra dar pra conferir de onde veio esse
    // valor (ver "Mês" na tabela de Maiores despesas do relatório) — nas
    // variáveis é o mesReferencia real do lançamento (se algum dia houver
    // um bug de atribuição de mês, aparece aqui na hora); recorrentes e
    // parcelamentos não têm um "mês da compra" próprio (são cobranças que
    // se repetem), então mostram o mês do próprio relatório, que é quando
    // essa cobrança está de fato acontecendo.
    data.despesasRecorrentes
      .filter((d) => this.isDespesaRecorrenteAtiva(d, mesReferencia))
      .forEach((d) => itens.push({ nome: d.nome, valor: d.valor, categoria: d.categoria, mes: mesReferencia }));
    data.despesasVariaveis
      .filter((d) => d.mesReferencia === mesReferencia)
      .forEach((d) => itens.push({ nome: d.nome, valor: d.valor, categoria: d.categoria, mes: d.mesReferencia }));
    data.parcelamentos.forEach((p) => itens.push({ nome: p.nome, valor: p.valorParcela, categoria: p.categoria, mes: mesReferencia }));
    return itens.sort((a, b) => b.valor - a.valor).slice(0, limit);
  },

  calculateCategoryBreakdown(data, mesReferencia) {
    const totals = {};
    const add = (categoria, valor) => {
      const key = categoria || 'Não informado';
      totals[key] = (totals[key] || 0) + valor;
    };
    data.despesasRecorrentes
      .filter((d) => this.isDespesaRecorrenteAtiva(d, mesReferencia))
      .forEach((d) => add(d.categoria, d.valor));
    data.despesasVariaveis
      .filter((d) => d.mesReferencia === mesReferencia)
      .forEach((d) => add(d.categoria, d.valor));
    data.parcelamentos.forEach((p) => add(p.categoria, p.valorParcela));
    return Object.entries(totals)
      .map(([categoria, valor]) => ({ categoria, valor }))
      .sort((a, b) => b.valor - a.valor);
  },
  /**
   * Gera alertas com base nos dados reais e no histórico salvo — nunca
   * frases genéricas, sempre calculadas (seção 29 do prompt mestre).
   */
  generateAlerts(data) {
    const alerts = [];
    const mes = data.meta.mesReferenciaAtual;
    const pct = this.calculateCommittedPercentage(data, mes);
    const limite = this.calculateCommitmentLimit(data);

    if (pct != null && limite) {
      const nivel = this.calculateCommitmentLevel(pct, limite.percentual);
      if (nivel === 'ultrapassado') alerts.push({ id: 'limite-comprometimento', icon: 'warning', tipo: 'danger', texto: `Limite ultrapassado: ${formatPercent(pct)} da renda comprometida (limite: ${limite.percentual}%).` });
      else if (nivel === 'atingido') alerts.push({ id: 'limite-comprometimento', icon: 'warning', tipo: 'warning', texto: `Você atingiu seu limite de ${limite.percentual}% da renda comprometida.` });
      else if (nivel === 'aproximando') alerts.push({ id: 'limite-comprometimento', icon: 'warning', tipo: 'info', texto: `Você está se aproximando do seu limite de ${limite.percentual}% (hoje: ${formatPercent(pct)}).` });
    } else if (pct != null) {
      if (pct >= 90) alerts.push({ id: 'renda-utilizada', icon: 'warning', tipo: 'danger', texto: `Você já utilizou ${formatPercent(pct)} da sua renda este mês.` });
      else if (pct >= 80) alerts.push({ id: 'renda-utilizada', icon: 'warning', tipo: 'warning', texto: `Você já utilizou ${formatPercent(pct)} da sua renda este mês.` });
    }

    const upcoming = this.calculateUpcomingEndings(data, 0);
    if (upcoming.length) {
      const margem = this.calculateMarginFreedNextMonth(data);
      alerts.push({ id: 'parcelamentos-terminando', icon: 'check_circle', tipo: 'success', texto: `Você tem ${upcoming.length} parcelamento(s) terminando este mês, liberando ${formatBRL(margem)}/mês a partir do próximo.` });
    }

    const historico = data.historicoMensal || [];
    if (historico.length >= 2) {
      const atual = historico[historico.length - 1];
      const anterior = historico[historico.length - 2];
      if (anterior.gastos > 0) {
        const variacao = ((atual.gastos - anterior.gastos) / anterior.gastos) * 100;
        if (variacao <= -1) {
          // Ícone acompanha o sentido real do dado (gasto caiu = seta pra
          // baixo) — o emoji 📈 usado antes aqui apontava pro lado errado.
          alerts.push({ id: 'variacao-gastos', icon: 'trending_down', tipo: 'success', texto: `Seus gastos diminuíram ${formatPercent(Math.abs(variacao))} em relação ao mês anterior.` });
        } else if (variacao >= 1) {
          alerts.push({ id: 'variacao-gastos', icon: 'trending_up', tipo: 'warning', texto: `Seus gastos aumentaram ${formatPercent(variacao)} em relação ao mês anterior.` });
        }
      }
      if (atual.potencialInvestimento > anterior.potencialInvestimento) {
        alerts.push({ id: 'variacao-potencial', icon: 'savings', tipo: 'success', texto: 'Sua capacidade potencial de investimento aumentou em relação ao mês anterior.' });
      } else if (atual.potencialInvestimento < anterior.potencialInvestimento) {
        alerts.push({ id: 'variacao-potencial', icon: 'money_off', tipo: 'warning', texto: 'Sua capacidade potencial de investimento diminuiu em relação ao mês anterior.' });
      }
    }

    if (!alerts.length) {
      alerts.push({ id: 'sem-alertas', icon: 'info', tipo: 'info', texto: 'Ainda não há alertas — eles aparecem conforme mais meses forem registrados no histórico.' });
    }
    return alerts;
  },
};

function sum(arr) {
  return arr.reduce((acc, v) => acc + (v || 0), 0);
}

const MES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

/** Soma N meses a uma chave "AAAA-MM", devolvendo outra chave "AAAA-MM". */
function addMonths(mesRefKey, n) {
  const [ano, mes] = mesRefKey.split('-').map(Number);
  const totalMeses = (mes - 1) + n;
  const novoAno = ano + Math.floor(totalMeses / 12);
  const novoMes = (((totalMeses % 12) + 12) % 12) + 1;
  return `${novoAno}-${String(novoMes).padStart(2, '0')}`;
}

/** Formata "AAAA-MM" como "Set/2026" — formato padrão do app pra qualquer texto que mostre um mês por extenso. */
function formatMonthKey(mesRefKey) {
  const [ano, mes] = mesRefKey.split('-').map(Number);
  return `${MES_ABREV[mes - 1]}/${ano}`;
}

function formatBRL(valor) {
  if (valor == null || Number.isNaN(valor)) return 'não informado';
  // toLocaleString usa espaço não separável (NBSP) entre "R$" e o número —
  // sem um ponto de quebra normal ali, telas estreitas forçam a quebra no
  // meio dos dígitos do valor. Troca por espaço comum para poder quebrar
  // só entre o símbolo e o número, nunca dentro dele.
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\u00A0/g, ' ');
}

function formatPercent(valor, casas = 1) {
  if (valor == null || Number.isNaN(valor)) return 'não informado';
  return `${valor.toFixed(casas).replace('.', ',')}%`;
}
