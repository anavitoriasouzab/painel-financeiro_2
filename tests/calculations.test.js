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
