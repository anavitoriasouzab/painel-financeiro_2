/**
 * tests/calculations.test.js
 * -----------------------------------------------------------------------
 * Testes das funções puras de js/calculations.js (Calc). Sem framework —
 * o projeto não tem build step, então isso roda direto com:
 *   node tests/calculations.test.js
 * Carrega o arquivo real do app (não uma cópia) via vm, então qualquer
 * mudança em calculations.js é testada automaticamente aqui.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC_PATH = path.join(__dirname, '..', 'js', 'calculations.js');
const src = fs.readFileSync(SRC_PATH, 'utf8');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(src + '\nthis.Calc = Calc;', sandbox);
const Calc = sandbox.Calc;

let passed = 0;
let failed = 0;
const failures = [];

function approxEqual(a, b, eps = 0.001) {
  if (a == null || b == null) return a === b;
  return Math.abs(a - b) < eps;
}

function assertEqual(actual, expected, label) {
  const ok = typeof expected === 'number' ? approxEqual(actual, expected) : JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
  } else {
    failed++;
    failures.push(`${label}\n    esperado: ${JSON.stringify(expected)}\n    obtido:   ${JSON.stringify(actual)}`);
  }
}

function assertNoThrow(fn, label) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    failures.push(`${label}\n    lançou: ${e.message}`);
  }
}

// ---------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------
const mes = '2026-09';

function baseData(overrides = {}) {
  return Object.assign({
    rendas: [],
    cartoes: [],
    categorias: [],
    despesasRecorrentes: [],
    despesasVariaveis: [],
    parcelamentos: [],
    metas: [],
    investimentos: [],
    reservaEmergencia: { possui: false, valorAtual: null, metaValor: null, valorMensalDestinado: null },
    historicoMensal: [],
    pendencias: [],
    inconsistenciasDetectadas: [],
    configuracoes: {},
    meta: { mesReferenciaAtual: mes },
  }, overrides);
}

// ---------------------------------------------------------------------
// calculateMonthlyIncome
// ---------------------------------------------------------------------
assertEqual(
  Calc.calculateMonthlyIncome(baseData({ rendas: [{ valor: 3000, frequencia: 'mensal' }] }), mes),
  3000,
  'calculateMonthlyIncome: renda fixa conta todo mês'
);
assertEqual(
  Calc.calculateMonthlyIncome(baseData({ rendas: [
    { valor: 3000, frequencia: 'mensal' },
    { valor: 500, frequencia: 'unica', mesReferencia: mes },
    { valor: 999, frequencia: 'unica', mesReferencia: '2026-01' },
  ] }), mes),
  3500,
  'calculateMonthlyIncome: renda única só conta no mês certo'
);
assertEqual(Calc.calculateMonthlyIncome(baseData(), mes), 0, 'calculateMonthlyIncome: sem rendas = 0 (não lança)');

// ---------------------------------------------------------------------
// calculateFixedExpenses (inicioMesReferencia)
// ---------------------------------------------------------------------
assertEqual(
  Calc.calculateFixedExpenses(baseData({ despesasRecorrentes: [
    { valor: 100, inicioMesReferencia: null },
    { valor: 50, inicioMesReferencia: '2026-10' }, // só passa a valer mês que vem
  ] }), mes),
  100,
  'calculateFixedExpenses: despesa com início futuro não conta ainda'
);

// ---------------------------------------------------------------------
// calculateVariableExpenses / calculateInstallmentsMonthlyTotal / calculateMonthlyExpenses
// ---------------------------------------------------------------------
assertEqual(
  Calc.calculateVariableExpenses(baseData({ despesasVariaveis: [
    { valor: 80, mesReferencia: mes },
    { valor: 20, mesReferencia: '2026-08' },
  ] }), mes),
  80,
  'calculateVariableExpenses: filtra pelo mês certo'
);
assertEqual(
  Calc.calculateInstallmentsMonthlyTotal(baseData({ parcelamentos: [{ valorParcela: 150 }, { valorParcela: 50 }] })),
  200,
  'calculateInstallmentsMonthlyTotal: soma todas as parcelas ativas'
);
assertEqual(
  Calc.calculateMonthlyExpenses(baseData({
    despesasRecorrentes: [{ valor: 100, inicioMesReferencia: null }],
    despesasVariaveis: [{ valor: 80, mesReferencia: mes }],
    parcelamentos: [{ valorParcela: 20 }],
  }), mes),
  200,
  'calculateMonthlyExpenses: soma fixo + variável + parcelas'
);

// ---------------------------------------------------------------------
// calculateRemainingBalance / calculateCommittedPercentage
// ---------------------------------------------------------------------
assertEqual(
  Calc.calculateRemainingBalance(baseData({ rendas: [{ valor: 1000, frequencia: 'mensal' }], despesasRecorrentes: [{ valor: 400, inicioMesReferencia: null }] }), mes),
  600,
  'calculateRemainingBalance: renda - gastos'
);
assertEqual(Calc.calculateCommittedPercentage(baseData(), mes), null, 'calculateCommittedPercentage: sem renda (0) devolve null, não Infinity/NaN');
assertEqual(
  Calc.calculateCommittedPercentage(baseData({ rendas: [{ valor: 1000, frequencia: 'mensal' }], despesasRecorrentes: [{ valor: 250, inicioMesReferencia: null }] }), mes),
  25,
  'calculateCommittedPercentage: 250/1000 = 25%'
);

// ---------------------------------------------------------------------
// calculateEmergencyFundMonthsCovered
// ---------------------------------------------------------------------
assertEqual(
  Calc.calculateEmergencyFundMonthsCovered(baseData({
    reservaEmergencia: { possui: true, valorAtual: 3000, metaValor: 9000, valorMensalDestinado: 300 },
    despesasRecorrentes: [{ valor: 1500, inicioMesReferencia: null }],
  })),
  2,
  'calculateEmergencyFundMonthsCovered: 3000/1500 = 2 meses'
);
assertEqual(Calc.calculateEmergencyFundMonthsCovered(baseData()), null, 'calculateEmergencyFundMonthsCovered: sem reserva cadastrada devolve null');
assertEqual(
  Calc.calculateEmergencyFundMonthsCovered(baseData({ reservaEmergencia: { possui: true, valorAtual: 1000 } })),
  null,
  'calculateEmergencyFundMonthsCovered: gastos do mês = 0 devolve null (não Infinity)'
);

// ---------------------------------------------------------------------
// applyInvestorProfile / calculateInvestmentCapacityByProfile
// ---------------------------------------------------------------------
assertEqual(Calc.applyInvestorProfile(1000, 'conservador'), 500, 'applyInvestorProfile: conservador = 50% de um saldo positivo');
assertEqual(Calc.applyInvestorProfile(1000, 'agressivo'), 1000, 'applyInvestorProfile: agressivo = 100%');
assertEqual(Calc.applyInvestorProfile(-500, 'conservador'), -500, 'applyInvestorProfile: déficit não é "encolhido" pelo perfil');
assertEqual(Calc.applyInvestorProfile(1000, 'perfil-inexistente'), 750, 'applyInvestorProfile: perfil desconhecido cai no padrão equilibrado (75%)');

// ---------------------------------------------------------------------
// calculateExpenseMonth (fechamento de cartão)
// ---------------------------------------------------------------------
assertEqual(
  Calc.calculateExpenseMonth(baseData({ cartoes: [{ diaFechamento: 10 }] }), '2026-09-15', 'cartao'),
  '2026-10',
  'calculateExpenseMonth: compra depois do fechamento vai pra fatura do mês seguinte'
);
assertEqual(
  Calc.calculateExpenseMonth(baseData({ cartoes: [{ diaFechamento: 10 }] }), '2026-09-05', 'cartao'),
  '2026-09',
  'calculateExpenseMonth: compra antes do fechamento fica no mês da compra'
);
assertEqual(
  Calc.calculateExpenseMonth(baseData(), '2026-09-15', 'pix'),
  '2026-09',
  'calculateExpenseMonth: forma de pagamento fora do cartão ignora fechamento'
);

// Mais de um cartão cadastrado: precisa usar o fechamento do cartão
// realmente usado (cartaoId), não sempre o primeiro da lista.
const doisCartoes = baseData({ cartoes: [{ id: 'c1', diaFechamento: 5 }, { id: 'c2', diaFechamento: 20 }] });
assertEqual(
  Calc.calculateExpenseMonth(doisCartoes, '2026-09-10', 'cartao', 'c2'),
  '2026-09',
  'calculateExpenseMonth: com cartaoId, usa o fechamento do cartão certo (antes do fechamento do c2)'
);
assertEqual(
  Calc.calculateExpenseMonth(doisCartoes, '2026-09-10', 'cartao', 'c1'),
  '2026-10',
  'calculateExpenseMonth: mesmo dia de compra, cartão diferente (c1) já fechou a fatura'
);
assertEqual(
  Calc.calculateExpenseMonth(doisCartoes, '2026-09-10', 'cartao'),
  '2026-10',
  'calculateExpenseMonth: sem cartaoId informado, cai no primeiro cartão cadastrado (compatibilidade)'
);

// ---------------------------------------------------------------------
// calculateGoalProgress / calculateMonthlyRequired / compareGoalToCapacity
// ---------------------------------------------------------------------
assertEqual(Calc.calculateGoalProgress({ valorDesejado: 1000, valorAtual: 400 }), { restante: 600, percent: 40 }, 'calculateGoalProgress: 40% concluído');
assertEqual(Calc.calculateGoalProgress({ valorDesejado: 1000, valorAtual: 5000 }), { restante: 0, percent: 100 }, 'calculateGoalProgress: nunca passa de 100%');
assertEqual(Calc.calculateGoalProgress({ valorAtual: 400 }), null, 'calculateGoalProgress: sem valorDesejado devolve null');
assertEqual(Calc.calculateMonthlyRequired({ valorDesejado: 1200, valorAtual: 0, prazoMeses: 12 }), 100, 'calculateMonthlyRequired: 1200 em 12 meses = 100/mês');
assertEqual(Calc.calculateMonthlyRequired({ valorDesejado: 1200, valorAtual: 0, prazoMeses: 0 }), null, 'calculateMonthlyRequired: prazo 0 devolve null (não Infinity)');
assertEqual(Calc.compareGoalToCapacity(100, 150), 'compativel', 'compareGoalToCapacity: necessário <= capacidade');
assertEqual(Calc.compareGoalToCapacity(200, 150), 'ajustar', 'compareGoalToCapacity: necessário > capacidade');

// ---------------------------------------------------------------------
// simulateInvestment
// ---------------------------------------------------------------------
assertEqual(Calc.simulateInvestment(100, [12])[0].semRendimento, 1200, 'simulateInvestment: sem taxa é só soma dos aportes');
assertEqual(Calc.simulateInvestment(100, [12])[0].comRendimento, 1200, 'simulateInvestment: sem taxa, comRendimento = semRendimento');
{
  const comRend = Calc.simulateInvestment(100, [12], 0.01)[0].comRendimento;
  if (comRend > 1200) passed++; else { failed++; failures.push('simulateInvestment: com taxa > 0, resultado deveria ser maior que a soma simples\n    obtido: ' + comRend); }
}

// ---------------------------------------------------------------------
// calculateCommitmentLimit / calculateCommitmentLevel / calculateImpactPreview
// ---------------------------------------------------------------------
assertEqual(Calc.calculateCommitmentLimit(baseData()), null, 'calculateCommitmentLimit: sem configuração devolve null');
assertEqual(
  Calc.calculateCommitmentLimit(baseData({ rendas: [{ valor: 2000, frequencia: 'mensal' }], configuracoes: { limiteComprometimento: { percentual: 50, modo: 'aviso' } } })),
  { percentual: 50, valor: 1000, modo: 'aviso' },
  'calculateCommitmentLimit: 50% de 2000 = 1000'
);
assertEqual(Calc.calculateCommitmentLevel(null, 70), null, 'calculateCommitmentLevel: sem pct devolve null');
assertEqual(Calc.calculateCommitmentLevel(50, 70), 'normal', 'calculateCommitmentLevel: bem abaixo do limite = normal');
assertEqual(Calc.calculateCommitmentLevel(65, 70), 'aproximando', 'calculateCommitmentLevel: dentro de 10pp do limite = aproximando');
assertEqual(Calc.calculateCommitmentLevel(70, 70), 'atingido', 'calculateCommitmentLevel: exatamente no limite = atingido');
assertEqual(Calc.calculateCommitmentLevel(80, 70), 'ultrapassado', 'calculateCommitmentLevel: acima do limite = ultrapassado');

// ---------------------------------------------------------------------
// calculateTopExpenses / calculateCategoryBreakdown
// ---------------------------------------------------------------------
{
  const data = baseData({
    despesasRecorrentes: [{ nome: 'Aluguel', valor: 1000, categoria: 'Moradia' }],
    despesasVariaveis: [
      { nome: 'Mercado', valor: 300, categoria: 'Alimentação', mesReferencia: mes },
      { nome: 'Uber', valor: 50, categoria: 'Transporte', mesReferencia: mes },
    ],
    parcelamentos: [{ nome: 'Notebook', valorParcela: 500, categoria: 'Tecnologia' }],
  });
  const top = Calc.calculateTopExpenses(data, mes, 2);
  assertEqual(top.length, 2, 'calculateTopExpenses: respeita o limite pedido');
  assertEqual(top[0].nome, 'Aluguel', 'calculateTopExpenses: maior valor vem primeiro');

  const breakdown = Calc.calculateCategoryBreakdown(data, mes);
  assertEqual(breakdown[0].categoria, 'Moradia', 'calculateCategoryBreakdown: ordenado do maior pro menor');
  assertEqual(breakdown.reduce((a, b) => a + b.valor, 0), 1850, 'calculateCategoryBreakdown: soma total bate com os lançamentos');
}

// ---------------------------------------------------------------------
// buildHistoricoComProjecao — regressão do bug "gráficos de tendência
// vazios pra quem ainda não virou o mês nem salvou um snapshot manual"
// ---------------------------------------------------------------------
{
  // Usuário no primeiro mês, sem nada arquivado ainda, mas com renda/gastos
  // lançados agora — o mês atual precisa aparecer, "ao vivo".
  const data = baseData({ rendas: [{ valor: 1000, frequencia: 'mensal' }], despesasRecorrentes: [{ valor: 400, inicioMesReferencia: null }] });
  const hist = Calc.buildHistoricoComProjecao(data);
  assertEqual(hist.length, 1, 'buildHistoricoComProjecao: sem histórico salvo ainda mostra 1 ponto (o mês atual, ao vivo)');
  assertEqual(hist[0].mes, mes, 'buildHistoricoComProjecao: o ponto ao vivo é o mês de referência atual');
  assertEqual(hist[0].renda, 1000, 'buildHistoricoComProjecao: renda do ponto ao vivo bate com a renda lançada agora');
  assertEqual(hist[0].emAndamento, true, 'buildHistoricoComProjecao: o ponto do mês atual vem marcado como emAndamento (não é "previsto")');
}
{
  // Já tem 2 meses arquivados — o mês atual (ainda não arquivado) entra como 3º ponto.
  const data = baseData({
    historicoMensal: [{ mes: '2026-07', renda: 900, gastos: 500, saldo: 400 }, { mes: '2026-08', renda: 950, gastos: 520, saldo: 430 }],
    rendas: [{ valor: 1000, frequencia: 'mensal' }],
  });
  const hist = Calc.buildHistoricoComProjecao(data);
  assertEqual(hist.length, 3, 'buildHistoricoComProjecao: 2 meses arquivados + o mês atual ao vivo = 3 pontos');
  assertEqual(hist[2].mes, mes, 'buildHistoricoComProjecao: o mês atual sempre vem por último, depois dos arquivados');
}
{
  // O mês atual já foi salvo manualmente (Charts.saveCurrentSnapshot) — não duplica.
  const data = baseData({ historicoMensal: [{ mes, renda: 1000, gastos: 400, saldo: 600 }] });
  const hist = Calc.buildHistoricoComProjecao(data);
  assertEqual(hist.length, 1, 'buildHistoricoComProjecao: mês atual já arquivado não gera um segundo ponto duplicado');
}

// ---------------------------------------------------------------------
// Estado de usuário novo (tudo vazio) — nada aqui deve lançar exceção
// ---------------------------------------------------------------------
const empty = baseData();
[
  ['calculateMonthlyIncome', () => Calc.calculateMonthlyIncome(empty, mes)],
  ['calculateMonthlyExpenses', () => Calc.calculateMonthlyExpenses(empty, mes)],
  ['calculateRemainingBalance', () => Calc.calculateRemainingBalance(empty, mes)],
  ['calculateCommittedPercentage', () => Calc.calculateCommittedPercentage(empty, mes)],
  ['calculateInvestmentCapacityByProfile', () => Calc.calculateInvestmentCapacityByProfile(empty, mes)],
  ['calculateEmergencyFundMonthsCovered', () => Calc.calculateEmergencyFundMonthsCovered(empty)],
  ['calculateCommitmentLimit', () => Calc.calculateCommitmentLimit(empty)],
  ['calculateUpcomingEndings', () => Calc.calculateUpcomingEndings(empty)],
  ['calculateReminders', () => Calc.calculateReminders(empty)],
  ['generateAlerts', () => Calc.generateAlerts(empty)],
  ['buildHistoricoComProjecao', () => Calc.buildHistoricoComProjecao(empty)],
  ['calculateTopExpenses', () => Calc.calculateTopExpenses(empty, mes)],
  ['calculateCategoryBreakdown', () => Calc.calculateCategoryBreakdown(empty, mes)],
  ['calculateNextMonthProjection', () => Calc.calculateNextMonthProjection(empty)],
].forEach(([label, fn]) => assertNoThrow(fn, `usuário novo (tudo vazio): ${label} não lança exceção`));

// ---------------------------------------------------------------------
// Despesa recorrente com início futuro (inicioMesReferencia) não deve
// "vazar" pro mês corrente em nenhum lugar que trata despesasRecorrentes
// como "contas deste mês" — bug relatado: conta de novembro contando (e
// gerando lembrete) já em setembro.
// ---------------------------------------------------------------------
const recorrenteFutura = {
  id: 'rec-futura', nome: 'Assinatura nova', valor: 100, categoria: 'Assinaturas',
  status: 'Pendente', vencimento: '10', inicioMesReferencia: '2026-11',
};
const dataComRecorrenteFutura = baseData({ despesasRecorrentes: [recorrenteFutura] });

assertEqual(
  Calc.calculateFixedExpenses(dataComRecorrenteFutura, '2026-09'),
  0,
  'calculateFixedExpenses: recorrente com início em novembro não conta em setembro'
);
assertEqual(
  Calc.calculateFixedExpenses(dataComRecorrenteFutura, '2026-11'),
  100,
  'calculateFixedExpenses: recorrente com início em novembro passa a contar a partir de novembro'
);
assertEqual(
  Calc.calculateReminders(dataComRecorrenteFutura).some((r) => r.id === 'rec-rec-futura'),
  false,
  'calculateReminders: não gera lembrete de conta pendente antes do inicioMesReferencia'
);
assertEqual(
  Calc.calculateReminders(baseData({ despesasRecorrentes: [recorrenteFutura], meta: { mesReferenciaAtual: '2026-11' } })).some((r) => r.id === 'rec-rec-futura'),
  true,
  'calculateReminders: volta a gerar o lembrete a partir do mês de início'
);
assertEqual(
  Calc.calculateTopExpenses(dataComRecorrenteFutura, '2026-09').some((i) => i.nome === 'Assinatura nova'),
  false,
  'calculateTopExpenses: recorrente futura não aparece nas maiores despesas do mês atual'
);
assertEqual(
  Calc.calculateCategoryBreakdown(dataComRecorrenteFutura, '2026-09').some((c) => c.categoria === 'Assinaturas'),
  false,
  'calculateCategoryBreakdown: recorrente futura não soma na categoria do mês atual'
);
assertEqual(
  Calc.calculateDailySpendingCurve(dataComRecorrenteFutura, '2026-09').hasData,
  false,
  'calculateDailySpendingCurve: recorrente futura não aparece na curva de gastos do mês atual'
);

// ---------------------------------------------------------------------
// calculateReminders: severidade, prazo relativo e agrupamento por categoria
// (redesign do card de lembretes da sidebar)
// ---------------------------------------------------------------------

// _prazoRelativoVencimento aceita um "hoje" explícito (3º parâmetro, só pra
// teste determinístico — em produção usa a data real) pra não depender do
// dia em que os testes rodam.
assertEqual(
  Calc._prazoRelativoVencimento('dia 05', '2026-09', new Date(2026, 8, 5)),
  { texto: 'vence hoje', urgente: true },
  '_prazoRelativoVencimento: mesmo dia = "vence hoje", urgente'
);
assertEqual(
  Calc._prazoRelativoVencimento('dia 20', '2026-09', new Date(2026, 8, 5)),
  { texto: 'vence em 15 dias', urgente: false },
  '_prazoRelativoVencimento: data futura = "vence em N dias", não urgente'
);
assertEqual(
  Calc._prazoRelativoVencimento('dia 01', '2026-09', new Date(2026, 8, 5)),
  { texto: 'venceu há 4 dias', urgente: true },
  '_prazoRelativoVencimento: data passada = "venceu há N dias", urgente'
);
assertEqual(
  Calc._prazoRelativoVencimento('sem dia reconhecível', '2026-09'),
  null,
  '_prazoRelativoVencimento: texto sem número reconhecível devolve null'
);

// Duas contas "Contas" pendentes sem dia reconhecível no vencimento (prazo
// null garante severidade determinística = 'atencao', independente da data
// real em que o teste roda) devem virar UM lembrete agrupado com count:2.
const remindersAgrupados = Calc.calculateReminders(baseData({
  despesasRecorrentes: [
    { id: 'internet', nome: 'Internet', valor: 100, categoria: 'Contas', status: 'Pendente', vencimento: 'não definido' },
    { id: 'agua', nome: 'Água', valor: 80, categoria: 'Contas', status: 'Pendente', vencimento: 'não definido' },
  ],
}));
const grupoContas = remindersAgrupados.find((r) => r.id === 'rec-cat-Contas-2026-09');
assertEqual(!!grupoContas, true, 'calculateReminders: contas pendentes da mesma categoria viram um item agrupado');
assertEqual(grupoContas && grupoContas.count, 2, 'calculateReminders: item agrupado leva a contagem certa');
assertEqual(grupoContas && grupoContas.severidade, 'atencao', 'calculateReminders: sem prazo reconhecível, severidade cai pra "atencao"');
assertEqual(grupoContas && grupoContas.titulo, '2 contas de "Contas" pendentes', 'calculateReminders: título do grupo cita a categoria e a contagem');
assertEqual(grupoContas && grupoContas.contexto.includes('Internet') && grupoContas.contexto.includes('Água'), true, 'calculateReminders: contexto do grupo lista os nomes das contas');

// Uma única conta pendente (categoria sem duplicata) continua como item
// individual, sem virar grupo.
const remindersIndividual = Calc.calculateReminders(baseData({
  despesasRecorrentes: [
    { id: 'luz', nome: 'Conta de luz', valor: 120, categoria: 'Contas', status: 'Pendente', vencimento: 'não definido' },
  ],
}));
assertEqual(remindersIndividual.some((r) => r.id === 'rec-luz'), true, 'calculateReminders: conta pendente sem duplicata mantém id individual');
assertEqual(remindersIndividual.some((r) => r.count), false, 'calculateReminders: item individual não leva count');

// Metas quase concluídas (80%-99%) também agrupam quando há 2+.
const remindersMetas = Calc.calculateReminders(baseData({
  metas: [
    { id: 'm1', nome: 'Viagem', valorDesejado: 1000, valorAtual: 900 }, // 90%
    { id: 'm2', nome: 'Notebook', valorDesejado: 2000, valorAtual: 1700 }, // 85%
  ],
}));
const grupoMetas = remindersMetas.find((r) => r.id === 'meta-group-2026-09');
assertEqual(!!grupoMetas, true, 'calculateReminders: 2+ metas quase concluídas viram um item agrupado');
assertEqual(grupoMetas && grupoMetas.count, 2, 'calculateReminders: grupo de metas leva a contagem certa');
assertEqual(grupoMetas && grupoMetas.titulo, '2 metas quase concluídas', 'calculateReminders: título do grupo de metas');

// ---------------------------------------------------------------------
// Parcelamento só conta no mês em que é cobrado — regressão do bug
// "total da categoria não bate com a soma das linhas daquele mês"
// ---------------------------------------------------------------------
{
  // mês de referência atual = 2026-09 (ver `mes` acima).
  const data = baseData({
    parcelamentos: [
      // Termina neste mês (parcela 2/2) e começou em agosto.
      { nome: 'Bigazine', valorParcela: 70.5, categoria: 'Parcelas', parcelaAtual: 2, totalParcelas: 2, parcelasRestantes: 0 },
      // Começou em setembro (parcela 1/6), ainda corre até fevereiro.
      { nome: 'Notebook', valorParcela: 250, categoria: 'Parcelas', parcelaAtual: 1, totalParcelas: 6, parcelasRestantes: 5 },
    ],
  });

  assertEqual(Calc.calculateInstallmentsMonthlyTotal(data), 320.5, 'parcelas do mês atual: soma as duas (comportamento antigo preservado)');
  assertEqual(Calc.calculateInstallmentsMonthlyTotal(data, '2026-08'), 70.5, 'mês passado: só a que já existia (Notebook ainda não tinha começado)');
  assertEqual(Calc.calculateInstallmentsMonthlyTotal(data, '2026-10'), 250, 'mês seguinte: a encerrada sai da conta');
  assertEqual(Calc.calculateInstallmentsMonthlyTotal(data, '2027-03'), 0, 'depois da última parcela: nada sobra');

  const catAgosto = Calc.calculateCategoryBreakdown(data, '2026-08');
  assertEqual(catAgosto[0].valor, 70.5, 'categoria num mês passado bate com a soma das parcelas cobradas naquele mês');

  const topAgosto = Calc.calculateTopExpenses(data, '2026-08');
  assertEqual(topAgosto.length, 1, 'maiores despesas de um mês passado não listam parcelamento que ainda não existia');

  assertEqual(
    Calc.calculateMonthlyExpenses(data, '2026-10'),
    250,
    'despesas do mês seguinte não carregam a parcela já encerrada'
  );
}
{
  // Sem parcelaAtual/parcelasRestantes não dá pra saber o intervalo — o
  // parcelamento continua contando, em vez de o app inventar um prazo.
  const data = baseData({ parcelamentos: [{ nome: 'Sem prazo', valorParcela: 100, categoria: 'Outros' }] });
  assertEqual(Calc.calculateInstallmentsMonthlyTotal(data, '2026-01'), 100, 'sem prazo cadastrado: conta no passado (não inventa início)');
  assertEqual(Calc.calculateInstallmentsMonthlyTotal(data, '2027-12'), 100, 'sem prazo cadastrado: conta no futuro (não inventa fim)');
}

// ---------------------------------------------------------------------
// calculateFutureCommitments — compromissos já contratados além deste mês
// ---------------------------------------------------------------------
{
  const data = baseData({
    rendas: [{ valor: 2000, frequencia: 'mensal' }],
    parcelamentos: [
      { nome: 'Notebook', valorParcela: 250, parcelasRestantes: 4 },   // 1000
      { nome: 'Saúde', valorParcela: 190, parcelasRestantes: 1 },      // 190
      { nome: 'Acabando', valorParcela: 111, parcelasRestantes: 0 },   // nada além deste mês
    ],
  });
  const fut = Calc.calculateFutureCommitments(data);
  assertEqual(fut.total, 1190, 'calculateFutureCommitments: soma valorParcela × parcelasRestantes');
  assertEqual(fut.itens, 2, 'calculateFutureCommitments: parcelamento que acaba neste mês não entra');
  assertEqual(fut.mesesDeRenda, 0.595, 'calculateFutureCommitments: total dividido pela renda do mês');
  assertEqual(fut.ultimoMes, '2027-01', 'calculateFutureCommitments: último mês vem do maior prazo restante');
  assertEqual(fut.semPrazo, 0, 'calculateFutureCommitments: nada sem prazo aqui');
}
{
  const data = baseData({ parcelamentos: [{ nome: 'Sem prazo', valorParcela: 100 }] });
  const fut = Calc.calculateFutureCommitments(data);
  assertEqual(fut.total, 0, 'calculateFutureCommitments: parcelamento sem prazo não é chutado no total');
  assertEqual(fut.semPrazo, 1, 'calculateFutureCommitments: parcelamento sem prazo é sinalizado à parte');
  assertEqual(fut.mesesDeRenda, null, 'calculateFutureCommitments: sem renda cadastrada não inventa proporção');
  assertEqual(fut.ultimoMes, null, 'calculateFutureCommitments: sem prazo conhecido não inventa mês final');
}

// ---------------------------------------------------------------------
// installmentLabelForMonth / calculateMonthPurchases
// (extrato "Compras do mês" do relatório — seção 05)
// ---------------------------------------------------------------------
{
  // mês de referência atual = 2026-09 (ver `mes` acima).
  const data = baseData({
    despesasRecorrentes: [{ nome: 'Aluguel', valor: 1200, categoria: 'Moradia', status: 'Pago' }],
    despesasVariaveis: [
      { nome: 'Farmácia', valor: 80, categoria: 'Saúde', mesReferencia: '2026-09' },
      { nome: 'Uber', valor: 35, categoria: 'Transporte', mesReferencia: '2026-08' },
    ],
    parcelamentos: [
      { nome: 'Notebook', valorParcela: 250, categoria: 'Compras', parcelaAtual: 3, totalParcelas: 6, parcelasRestantes: 3 },
    ],
  });

  // Parcela 3/6 no mês atual → 2/6 no mês anterior, 4/6 no seguinte.
  const p = data.parcelamentos[0];
  assertEqual(Calc.installmentLabelForMonth(p, '2026-09', mes), '3/6', 'installmentLabelForMonth: parcela do mês de referência');
  assertEqual(Calc.installmentLabelForMonth(p, '2026-08', mes), '2/6', 'installmentLabelForMonth: mês anterior recua uma parcela');
  assertEqual(Calc.installmentLabelForMonth(p, '2026-10', mes), '4/6', 'installmentLabelForMonth: mês seguinte avança uma parcela');
  assertEqual(Calc.installmentLabelForMonth(p, '2027-01', mes), '7/6', 'installmentLabelForMonth: não trava no total (mês fora da janela)');
  assertEqual(
    Calc.installmentLabelForMonth({ valorParcela: 10, parcelasRestantes: 2 }, '2026-09', mes),
    null,
    'installmentLabelForMonth: sem parcelaAtual não chuta número de parcela'
  );
  assertEqual(
    Calc.installmentLabelForMonth({ valorParcela: 10, parcelaAtual: 2, parcelasRestantes: 2 }, '2026-09', mes),
    '2',
    'installmentLabelForMonth: sem totalParcelas mostra só o número da parcela'
  );

  const set = Calc.calculateMonthPurchases(data, '2026-09');
  assertEqual(set.itens.length, 3, 'calculateMonthPurchases: recorrente + variável do mês + parcela ativa');
  assertEqual(set.itens.map((i) => i.nome), ['Aluguel', 'Notebook', 'Farmácia'], 'calculateMonthPurchases: ordena do maior valor pro menor');
  assertEqual(set.itens.map((i) => i.tipo), ['Recorrente', 'Parcelada', 'Única'], 'calculateMonthPurchases: marca o tipo de cada cobrança');
  assertEqual(set.itens.map((i) => i.parcela), [null, '3/6', null], 'calculateMonthPurchases: só a compra parcelada traz rótulo de parcela');
  assertEqual(set.total, 1530, 'calculateMonthPurchases: total = 1200 + 250 + 80');

  // O ponto principal: o total do extrato SEMPRE tem que bater com os gastos
  // do mês do resumo — é o que essa seção do relatório serve pra justificar.
  assertEqual(
    set.total,
    Calc.calculateMonthlyExpenses(data, '2026-09'),
    'calculateMonthPurchases: total fecha com calculateMonthlyExpenses do mesmo mês'
  );
  assertEqual(
    Calc.calculateMonthPurchases(data, '2026-08').total,
    Calc.calculateMonthlyExpenses(data, '2026-08'),
    'calculateMonthPurchases: total fecha com os gastos também num mês passado'
  );
  assertEqual(
    Calc.calculateMonthPurchases(data, '2026-08').itens.map((i) => i.nome),
    ['Aluguel', 'Notebook', 'Uber'],
    'calculateMonthPurchases: num mês passado pega a variável daquele mês, não a do mês atual'
  );
  assertEqual(
    Calc.calculateMonthPurchases(data, '2027-06').itens.map((i) => i.nome),
    ['Aluguel'],
    'calculateMonthPurchases: depois da última parcela só sobra a recorrente'
  );
}

// ---------------------------------------------------------------------
// Compra parcelada cadastrada pelo formulário de despesa: total ÷ vezes,
// com a 1ª parcela caindo no mês certo (ver Accounts._submitAsInstallment).
// Aqui só a matemática do deslocamento, que é o que mora em Calc.
// ---------------------------------------------------------------------
{
  const data = baseData({ cartoes: [{ id: 'c1', nome: 'Nubank', diaFechamento: 20 }] });

  // Compra antes do fechamento → entra na fatura do próprio mês (offset 0).
  assertEqual(Calc.calculateExpenseMonth(data, '2026-09-05', 'cartao', 'c1'), '2026-09', 'compra antes do fechamento: 1ª parcela no mês atual');
  // Compra no dia do fechamento ou depois → fatura do mês seguinte (offset 1).
  assertEqual(Calc.calculateExpenseMonth(data, '2026-09-25', 'cartao', 'c1'), '2026-10', 'compra depois do fechamento: 1ª parcela no mês seguinte');

  // R$ 100 em 2x cuja 1ª parcela só cai em outubro: parcelaAtual 0 e
  // parcelasRestantes 2 devem produzir cobrança em out e nov, nada em set.
  const parcelado = baseData({
    parcelamentos: [{ nome: 'Compra 2x', valorParcela: 50, categoria: 'Compras', parcelaAtual: 0, totalParcelas: 2, parcelasRestantes: 2 }],
  });
  assertEqual(Calc.calculateInstallmentsMonthlyTotal(parcelado, '2026-09'), 0, 'parcelaAtual 0: nada é cobrado no mês atual');
  assertEqual(Calc.calculateInstallmentsMonthlyTotal(parcelado, '2026-10'), 50, 'parcelaAtual 0: 1ª parcela cai no mês seguinte');
  assertEqual(Calc.calculateInstallmentsMonthlyTotal(parcelado, '2026-11'), 50, 'parcelaAtual 0: 2ª (e última) parcela no mês depois');
  assertEqual(Calc.calculateInstallmentsMonthlyTotal(parcelado, '2026-12'), 0, 'parcelaAtual 0: acaba depois de exatamente 2 cobranças');
  assertEqual(
    Calc.installmentLabelForMonth(parcelado.parcelamentos[0], '2026-10', mes),
    '1/2',
    'parcelaAtual 0: a cobrança do mês seguinte é rotulada como parcela 1/2'
  );

  // Compra de 3 meses atrás em 6x: parcelaAtual 4, restantes 2 — soma das
  // cobranças restantes + já pagas tem que dar as 6 parcelas.
  const antiga = baseData({
    parcelamentos: [{ nome: 'Compra 6x', valorParcela: 100, categoria: 'Compras', parcelaAtual: 4, totalParcelas: 6, parcelasRestantes: 2 }],
  });
  assertEqual(Calc.calculateInstallmentsMonthlyTotal(antiga, '2026-06'), 100, 'compra de 3 meses atrás: 1ª parcela em junho');
  assertEqual(Calc.calculateInstallmentsMonthlyTotal(antiga, '2026-05'), 0, 'compra de 3 meses atrás: nada antes da 1ª parcela');
  assertEqual(Calc.calculateInstallmentsMonthlyTotal(antiga, '2026-11'), 100, 'compra de 3 meses atrás: última parcela em novembro');
  assertEqual(Calc.calculateInstallmentsMonthlyTotal(antiga, '2026-12'), 0, 'compra de 3 meses atrás: nada depois da 6ª parcela');
}

// ---------------------------------------------------------------------
// Converter uma despesa JÁ CADASTRADA em parcelamento
// (Accounts._submitAsInstallment com despesaOrigemId): o deslocamento é
// sempre relativo ao mês de referência atual, não à data da conversão.
// ---------------------------------------------------------------------
{
  // Despesa de R$ 300 lançada em AGOSTO, convertida em 3x estando em
  // setembro (mês de referência atual = 2026-09). Agosto foi a 1ª parcela,
  // logo setembro é a 2ª: parcelaAtual 2, parcelasRestantes 1.
  const convertida = { nome: 'Compra de agosto', valorParcela: 100, categoria: 'Compras', parcelaAtual: 2, totalParcelas: 3, parcelasRestantes: 1 };
  const data = baseData({ parcelamentos: [convertida] });

  assertEqual(Calc.calculateInstallmentsMonthlyTotal(data, '2026-07'), 0, 'conversão de mês passado: nada antes da 1ª parcela');
  assertEqual(Calc.calculateInstallmentsMonthlyTotal(data, '2026-08'), 100, 'conversão de mês passado: 1ª parcela fica no mês do lançamento original');
  assertEqual(Calc.calculateInstallmentsMonthlyTotal(data, '2026-09'), 100, 'conversão de mês passado: 2ª parcela no mês atual');
  assertEqual(Calc.calculateInstallmentsMonthlyTotal(data, '2026-10'), 100, 'conversão de mês passado: 3ª parcela no mês seguinte');
  assertEqual(Calc.calculateInstallmentsMonthlyTotal(data, '2026-11'), 0, 'conversão de mês passado: exatamente 3 cobranças, não 4');
  assertEqual(Calc.installmentLabelForMonth(convertida, '2026-09', mes), '2/3', 'conversão de mês passado: rótulo da parcela do mês atual');
  assertEqual(Calc.installmentLabelForMonth(convertida, '2026-08', mes), '1/3', 'conversão de mês passado: rótulo da 1ª parcela');

  // O valor cheio (R$ 300) não pode mais pesar em nenhum mês — é o ponto da
  // conversão: só a parcela entra na conta.
  assertEqual(Calc.calculateMonthlyExpenses(data, '2026-09'), 100, 'conversão: só a parcela pesa no mês, nunca o total da compra');
  assertEqual(
    Calc.calculateMonthPurchases(data, '2026-09').total,
    100,
    'conversão: extrato do mês também mostra só a parcela'
  );
}

// ---------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------
console.log(`\n${passed} passaram, ${failed} falharam.`);
if (failures.length) {
  console.log('\nFalhas:\n');
  failures.forEach((f) => console.log('✗ ' + f + '\n'));
  process.exitCode = 1;
} else {
  console.log('Tudo passou.');
}
