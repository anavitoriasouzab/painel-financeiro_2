/**
 * charts.js
 * -----------------------------------------------------------------------
 * Tudo que é gráfico e análise histórica mora aqui (Fase 4). Os gráficos
 * são desenhados em SVG nativo (SimpleCharts, ver simplecharts.js) — sem
 * dependência externa — e sempre reconstruídos a partir de Calc, nunca
 * guardamos um número pronto num gráfico, para não desincronizar do resto
 * do app.
 *
 * IMPORTANTE: como o app ainda tem apenas um mês de dados reais (agosto/2026),
 * os gráficos de evolução mostram um único ponto por enquanto. Eles se
 * preenchem sozinhos conforme novos meses forem sendo registrados no
 * histórico (manualmente aqui, ou automaticamente a partir da Fase 5).
 */

const Charts = {
  render(data) {
    this._renderAlerts(data);
    this._renderCategoryChart(data);
    this._renderTopExpenses(data);
    this._renderCashFlow(data);
    this._renderDailySpendingComparison(data);
    this._renderEvolutionChart(data);
    this._renderInvestmentEvolutionChart(data);
    this._renderHistoryTable(data);
    this._renderComparison(data);
  },

  /**
   * Alertas inteligentes (aba Análises) — mesmo padrão de "dispensar" dos
   * lembretes do sino (ver comentário em Dashboard._renderReminders):
   * estado só deste navegador, escopado ao mês atual, sem passar por Storage.
   */
  _renderAlerts(data) {
    const wrap = document.getElementById('alerts-list');
    if (!wrap) return;
    const mes = data.meta.mesReferenciaAtual;
    const dispensados = loadAlertsState(mes);
    const alerts = Calc.generateAlerts(data).filter((a) => !dispensados.includes(a.id));
    wrap.innerHTML = '';
    if (!alerts.length) {
      wrap.innerHTML = '<p class="muted-text">Nenhum alerta por enquanto.</p>';
    } else {
      alerts.forEach((a) => wrap.appendChild(this._buildAlertItem(a)));
    }
  },

  _buildAlertItem(alert) {
    const el = document.createElement('div');
    el.className = `notice-card ${alert.tipo}`;
    el.innerHTML = `
      <span class="notice-card-text">${alert.icon} ${alert.texto}</span>
      <button class="notif-action-btn" data-action="dismiss" title="Ocultar" aria-label="Ocultar alerta">✕</button>
    `;
    el.querySelector('[data-action="dismiss"]').addEventListener('click', () => this.dismissAlert(alert.id));
    return el;
  },

  dismissAlert(id) {
    const mes = appData.meta.mesReferenciaAtual;
    const dispensados = loadAlertsState(mes);
    if (!dispensados.includes(id)) dispensados.push(id);
    saveAlertsState(mes, dispensados);
    this._renderAlerts(appData);
  },

  // Lista ranqueada, uma cor por categoria — todas as categorias aparecem,
  // nada agrupado em "Outros" (decisão intencional já validada). Fica em
  // largura total porque o número de categorias é variável — não teria como
  // parear com outro gráfico de tamanho fixo sem desbalancear o layout.
  _renderCategoryChart(data) {
    const breakdown = Calc.calculateCategoryBreakdown(data, data.meta.mesReferenciaAtual);
    const items = breakdown.map((b, i) => ({ nome: b.categoria, valor: b.valor, color: SimpleCharts.colorFor(i) }));
    SimpleCharts.rankedList('chart-categoria', items);
  },

  /** Ranking das maiores despesas individuais do mês, em barras verticais — cor única, o destaque vem do tamanho/ordem. */
  _renderTopExpenses(data) {
    const top = Calc.calculateTopExpenses(data, data.meta.mesReferenciaAtual, 6);
    SimpleCharts.bar('chart-detalhamento', {
      labels: top.map((t) => t.nome),
      values: top.map((t) => t.valor),
      colors: SimpleCharts.colorFor(0),
    });
  },

  /** Fluxo financeiro: a renda do mês dividida em fixos, parcelas, variáveis e o que sobra. */
  _renderCashFlow(data) {
    const mes = data.meta.mesReferenciaAtual;
    const renda = Calc.calculateMonthlyIncome(data, mes);
    const fixo = Calc.calculateFixedExpenses(data, mes);
    const parcelas = Calc.calculateInstallmentsMonthlyTotal(data);
    const variavel = Calc.calculateVariableExpenses(data, mes);
    const saldo = Math.max(Calc.calculateRemainingBalance(data, mes), 0);

    SimpleCharts.stackedBar('chart-fluxo-financeiro', {
      total: renda,
      segments: [
        { label: 'Fixos/recorrentes', value: fixo, color: '#5F3DC4' },
        { label: 'Parcelamentos', value: parcelas, color: 'var(--warning)' },
        { label: 'Variáveis', value: variavel, color: '#D6336C' },
        { label: 'Sobra (saldo)', value: saldo, color: '#1F9E6B' },
      ],
    });
  },

  /** Rótulo do mês, marcando com "(prev.)" o ponto ainda não fechado (ver Calc.buildHistoricoComProjecao). */
  _histLabel(h) {
    return formatMonthKeyShort(h.mes) + (h.previsto ? ' (prev.)' : '');
  },

  /**
   * Evolução mensal — Renda, Gastos e Saldo. O Saldo ganha rótulo de valor
   * acima de cada ponto (por isso não precisamos mais de um gráfico de
   * barras à parte só pra mostrar o número exato) e dois selos automáticos:
   * o melhor mês (maior saldo) e o primeiro mês em que o limite de
   * comprometimento configurado foi ultrapassado, se algum dia foi.
   */
  _renderEvolutionChart(data) {
    const hist = Calc.buildHistoricoComProjecao(data);
    const historico = data.historicoMensal || [];

    const annotations = [];
    if (historico.length >= 2) {
      let melhorIdx = 0;
      historico.forEach((h, i) => { if (h.saldo > historico[melhorIdx].saldo) melhorIdx = i; });
      if (historico[melhorIdx].saldo > 0) {
        annotations.push({ index: melhorIdx, text: '🏆 Melhor mês', color: 'var(--success)' });
      }
      const limite = Calc.calculateCommitmentLimit(data);
      if (limite) {
        const idxUltrapassado = historico.findIndex((h) => h.percentualComprometido != null && h.percentualComprometido > limite.percentual);
        if (idxUltrapassado !== -1 && idxUltrapassado !== melhorIdx) {
          annotations.push({ index: idxUltrapassado, text: '⚠️ Limite ultrapassado', color: 'var(--danger)' });
        }
      }
    }

    SimpleCharts.line('chart-evolucao', {
      labels: hist.map((h) => this._histLabel(h)),
      pointLabels: true,
      labelSeriesIndex: 2, // Saldo é a 3ª série
      labelFormatter: (v) => formatBRLShort(v),
      annotations,
      series: [
        { name: 'Renda', data: hist.map((h) => h.renda), color: '#4B2E9E' },
        { name: 'Gastos', data: hist.map((h) => h.gastos), color: '#C0392B' },
        { name: 'Saldo', data: hist.map((h) => h.saldo), color: '#1E9E6B' },
      ],
    });
  },

  /**
   * Gasto acumulado dia a dia — mês anterior, mês atual e mês seguinte
   * (com base no que já está cadastrado: recorrentes de sempre + qualquer
   * despesa variável já lançada com data futura). Cor mais escura = mês
   * mais "resolvido" (passado), mais clara = mais incerto (futuro/previsto).
   * Só aparece se pelo menos um dos três meses tiver dado com data real.
   */
  _renderDailySpendingComparison(data) {
    const wrap = document.getElementById('analises-ritmo-gasto-section');
    if (!wrap) return;

    const mesAtual = data.meta.mesReferenciaAtual;
    const mesAnterior = addMonths(mesAtual, -1);
    const mesSeguinte = addMonths(mesAtual, 1);
    const anterior = Calc.calculateDailySpendingCurve(data, mesAnterior);
    const atual = Calc.calculateDailySpendingCurve(data, mesAtual);
    const seguinte = Calc.calculateDailySpendingCurve(data, mesSeguinte);

    if (!anterior.hasData && !atual.hasData && !seguinte.hasData) {
      wrap.style.display = 'none';
      return;
    }
    wrap.style.display = 'block';

    const n = Math.min(anterior.curve.length, atual.curve.length, seguinte.curve.length);
    const labels = Array.from({ length: n }, (_, i) => String(i + 1));

    SimpleCharts.line('chart-ritmo-gasto', {
      labels,
      monotone: true,
      hideDots: true,
      series: [
        { name: `${formatMonthKeyShort(mesAnterior)}`, data: anterior.curve.slice(0, n), color: SimpleCharts.colorFor(2) },
        { name: `${formatMonthKeyShort(mesAtual)} (atual)`, data: atual.curve.slice(0, n), color: SimpleCharts.colorFor(0) },
        { name: `${formatMonthKeyShort(mesSeguinte)} (previsto)`, data: seguinte.curve.slice(0, n), color: SimpleCharts.colorFor(4) },
      ],
    });
  },

  // Só faz sentido como gráfico à parte quando há margem de segurança configurada
  // — sem margem, potencialInvestimento é idêntico ao saldo já mostrado em
  // "Evolução mensal", então o card fica oculto para não duplicar informação.
  _renderInvestmentEvolutionChart(data) {
    const wrap = document.getElementById('investimento-evolucao-wrap');
    if (!wrap) return;
    if (data.configuracoes.margemSeguranca == null) {
      wrap.style.display = 'none';
      return;
    }
    wrap.style.display = '';
    const hist = Calc.buildHistoricoComProjecao(data);
    SimpleCharts.bar('chart-investimento-evolucao', {
      labels: hist.map((h) => this._histLabel(h)),
      values: hist.map((h) => h.potencialInvestimento),
      colors: '#7C4DE0',
    });
  },

  _renderHistoryTable(data) {
    const tbody = document.getElementById('history-table-body');
    if (!tbody) return;
    const limite = Calc.calculateCommitmentLimit(data);
    tbody.innerHTML = data.historicoMensal.slice().reverse().map((h) => {
      const pct = h.percentualComprometido;
      let badgeClass = 'success';
      if (pct != null) {
        const nivel = limite ? Calc.calculateCommitmentLevel(pct, limite.percentual) : null;
        if (nivel) badgeClass = (nivel === 'ultrapassado' || nivel === 'atingido') ? 'danger' : nivel === 'aproximando' ? 'warning' : 'success';
        else badgeClass = pct >= 90 ? 'danger' : pct >= 70 ? 'warning' : 'success';
      }
      return `
      <tr>
        <td>${formatMonthKeyShort(h.mes)}</td>
        <td>${formatBRL(h.renda)}</td>
        <td>${formatBRL(h.gastos)}</td>
        <td>${formatBRL(h.saldo)}</td>
        <td>${pct != null ? `<span class="badge ${badgeClass}">${formatPercent(pct)}</span>` : '—'}</td>
      </tr>
    `;
    }).join('');
  },

  _renderComparison(data) {
    const selA = document.getElementById('compare-month-a');
    const selB = document.getElementById('compare-month-b');
    if (!selA || !selB) return;
    const options = data.historicoMensal.map((h) => `<option value="${h.mes}">${formatMonthKeyShort(h.mes)}</option>`).join('');
    selA.innerHTML = options;
    selB.innerHTML = options;
    if (data.historicoMensal.length >= 2) {
      selA.value = data.historicoMensal[data.historicoMensal.length - 2].mes;
      selB.value = data.historicoMensal[data.historicoMensal.length - 1].mes;
    }
    this._updateComparisonResult(data);
  },

  _updateComparisonResult(data) {
    const selA = document.getElementById('compare-month-a');
    const selB = document.getElementById('compare-month-b');
    const result = document.getElementById('compare-result');
    if (!selA || !selB || !result) return;
    const a = data.historicoMensal.find((h) => h.mes === selA.value);
    const b = data.historicoMensal.find((h) => h.mes === selB.value);
    if (!a || !b) { result.innerHTML = ''; return; }
    const diffGastos = b.gastos - a.gastos;
    const diffPct = a.gastos > 0 ? (diffGastos / a.gastos) * 100 : null;
    result.innerHTML = `
      <div class="compare-row"><span>Gastos ${formatMonthKeyShort(a.mes)}</span><strong>${formatBRL(a.gastos)}</strong></div>
      <div class="compare-row"><span>Gastos ${formatMonthKeyShort(b.mes)}</span><strong>${formatBRL(b.gastos)}</strong></div>
      <div class="compare-row"><span>Diferença</span><strong style="color:${diffGastos <= 0 ? 'var(--success)' : 'var(--danger)'}">${diffGastos <= 0 ? '' : '+'}${formatBRL(diffGastos)}${diffPct != null ? ` (${diffPct <= 0 ? '' : '+'}${formatPercent(diffPct)})` : ''}</strong></div>
    `;
  },

  /** Salva um snapshot do mês atual no histórico (uso manual até a Fase 5 automatizar a virada de mês). */
  async saveCurrentSnapshot() {
    const mes = appData.meta.mesReferenciaAtual;
    const jaExiste = appData.historicoMensal.some((h) => h.mes === mes);
    if (jaExiste) {
      if (!await confirmDialog(`Já existe um registro para ${formatMonthKeyShort(mes)}. Substituir pelos valores atuais?`, { title: 'Substituir registro', confirmLabel: 'Substituir' })) return;
      appData.historicoMensal = appData.historicoMensal.filter((h) => h.mes !== mes);
    }
    appData.historicoMensal.push(buildSnapshot(appData, mes));
    appData.historicoMensal.sort((a, b) => a.mes.localeCompare(b.mes));
    Storage.save(appData);
    this.render(appData);
    Dashboard.render(appData);
    toast('Mês salvo no histórico.');
  },
};

function formatMonthKeyShort(mesRefKey) {
  const [ano, mes] = mesRefKey.split('-').map(Number);
  const nomesCurtos = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return `${nomesCurtos[mes - 1]}/${String(ano).slice(2)}`;
}

const ALERTS_STATE_KEY = 'financas_alerts_state';

/** IDs de alertas dispensados, escopado ao mês (mesmo padrão de NOTIF_STATE_KEY em dashboard.js). */
function loadAlertsState(mesAtual) {
  try {
    const raw = localStorage.getItem(ALERTS_STATE_KEY);
    const state = raw ? JSON.parse(raw) : null;
    if (state && state.mes === mesAtual) return state.dispensados;
  } catch (e) { /* estado corrompido — recomeça do zero */ }
  return [];
}

function saveAlertsState(mesAtual, dispensados) {
  try { localStorage.setItem(ALERTS_STATE_KEY, JSON.stringify({ mes: mesAtual, dispensados })); } catch (e) { /* localStorage indisponível — segue sem persistir */ }
}
