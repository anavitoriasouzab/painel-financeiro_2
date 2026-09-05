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
  _evolutionPeriod: 'mensal',

  render(data) {
    this._renderSummary(data);
    this._renderNextMonthProjection(data);
    this._renderEvolutionToggle(data);
    this._renderEvolutionChart(data);
    this._renderCategoryChart(data);
    this._renderComparison(data);
    this._renderHeatmap(data);
    this._renderAlerts(data);
    this._renderTopExpenses(data);
    this._renderCashFlow(data);
    this._renderReservaGoal(data);
    this._renderInvestmentEvolutionChart(data);
    this._renderHistoryTable(data);
  },

  /** Resumo do mês — indicadores de topo da tela de Análises (mais denso que os do Dashboard). */
  _renderSummary(data) {
    if (!document.getElementById('analises-resumo-entradas')) return;
    const mes = data.meta.mesReferenciaAtual;
    setText('analises-resumo-entradas', formatBRL(Calc.calculateMonthlyIncome(data, mes)));
    setText('analises-resumo-despesas', formatBRL(Calc.calculateMonthlyExpenses(data, mes)));
    setText('analises-resumo-saldo', formatBRL(Calc.calculateRemainingBalance(data, mes)));

    const { average, monthsUsed } = Calc.calculateAverageMonthlyExpenses(data);
    setText('analises-resumo-media', average != null ? formatBRL(average) : 'não informado');
    setText('analises-resumo-media-sub', monthsUsed > 0
      ? `Média dos últimos ${monthsUsed} ${monthsUsed === 1 ? 'mês' : 'meses'}`
      : 'Ainda sem histórico suficiente');

    const variacaoEl = document.getElementById('analises-resumo-variacao');
    if (!variacaoEl) return;
    const { deltaPercent } = Calc.calculateStatTrend(data, 'gastos');
    if (deltaPercent == null) {
      variacaoEl.innerHTML = (data.historicoMensal || []).length < 2
        ? '<span class="stat-delta is-pending">Ainda sem histórico suficiente</span>'
        : '<span class="stat-delta is-neutral">Sem variação</span>';
      return;
    }
    // Gastos: subir é ruim, cair é bom — mesma lógica de Dashboard._renderStatTrend.
    const isUp = deltaPercent > 0.05;
    const isDown = deltaPercent < -0.05;
    const cls = isUp ? 'is-bad' : isDown ? 'is-good' : 'is-neutral';
    const sign = deltaPercent > 0 ? '+' : '';
    variacaoEl.innerHTML = `<span class="stat-delta ${cls}">${sign}${deltaPercent.toFixed(1)}%</span>`;
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
      wrap.innerHTML = '<p class="muted-text">Nenhum alerta ainda.</p>';
    } else {
      alerts.forEach((a) => wrap.appendChild(this._buildAlertItem(a)));
    }
  },

  /** Card "Próximo mês" em Análises — mesmo cálculo (Calc.calculateNextMonthProjection)
      já mostrado em Planejamento, só que ao lado dos alertas: ambos respondem
      "o que prestar atenção agora", ao contrário dos gráficos de histórico
      mais abaixo nessa mesma tela. */
  _renderNextMonthProjection(data) {
    if (!document.getElementById('analises-next-month-label')) return;
    const proj = Calc.calculateNextMonthProjection(data);
    setText('analises-next-month-label', formatMonthKey(proj.mes));
    setText('analises-next-month-renda', formatBRL(proj.renda));
    setText('analises-next-month-gastos', formatBRL(proj.gastosPrevistos));
    setText('analises-next-month-saldo', formatBRL(proj.saldoEstimado));
    setText('analises-next-month-percentual', proj.percentual != null ? formatPercent(proj.percentual) : 'não informado');
    const fill = document.getElementById('analises-next-month-progress-fill');
    if (fill) fill.style.width = `${Math.min(Math.max(proj.percentual || 0, 0), 100)}%`;
    const obsEl = document.getElementById('analises-next-month-obs');
    if (obsEl) obsEl.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">info</span>${escapeHtml(proj.obsVariaveis)}`;
  },

  _buildAlertItem(alert) {
    const el = document.createElement('div');
    el.className = `notice-card ${alert.tipo}`;
    el.innerHTML = `
      <span class="notice-card-text"><span class="material-symbols-outlined" aria-hidden="true">${alert.icon}</span> ${alert.texto}</span>
      <button class="notif-action-btn" data-action="dismiss" title="Ocultar" aria-label="Ocultar alerta"><span class="material-symbols-outlined" aria-hidden="true">close</span></button>
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
    const items = breakdown.map((b, i) => ({ nome: b.categoria, valor: b.valor, color: SimpleCharts.colorFor(i), icon: iconForCategory(b.categoria) }));
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

  /** Rótulo do mês: "(prev.)" pra projeção futura, "(atual)" pro mês em andamento — ver Calc.buildHistoricoComProjecao. */
  _histLabel(h) {
    const sufixo = h.previsto ? ' (prev.)' : h.emAndamento ? ' (atual)' : '';
    return formatMonthKeyShort(h.mes) + sufixo;
  },

  /**
   * Toggle "Mensal"/"Diário (mês atual)" acima do gráfico de evolução — só
   * habilita a opção diária se houver dado real com data lançada este mês
   * (Calc.calculateDailySpendingCurve.hasData); nunca oferece uma
   * granularidade que os dados não sustentam de verdade.
   */
  _renderEvolutionToggle(data) {
    const wrap = document.getElementById('evolucao-period-toggle');
    if (!wrap) return;
    const mes = data.meta.mesReferenciaAtual;
    const hasDaily = Calc.calculateDailySpendingCurve(data, mes).hasData;
    const diarioBtn = wrap.querySelector('[data-period="diario"]');
    if (diarioBtn) {
      diarioBtn.disabled = !hasDaily;
      diarioBtn.title = hasDaily ? '' : 'Ainda sem despesas com data lançada este mês';
      if (!hasDaily && this._evolutionPeriod === 'diario') this._evolutionPeriod = 'mensal';
    }
    wrap.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.period === this._evolutionPeriod));

    if (wrap.dataset.bound) return;
    wrap.dataset.bound = 'true';
    wrap.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        this._evolutionPeriod = btn.dataset.period;
        wrap.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
        this._renderEvolutionChart(appData);
      });
    });
  },

  /**
   * Evolução financeira. Modo "mensal" (padrão): Renda, Gastos e Saldo por
   * mês, com rótulo de valor no Saldo e dois selos automáticos (melhor mês
   * / limite ultrapassado). Modo "diário": gasto acumulado dia a dia do mês
   * atual (mesma fonte do calendário de gastos) — só fica disponível quando
   * há dado real (ver _renderEvolutionToggle).
   */
  _renderEvolutionChart(data) {
    if (this._evolutionPeriod === 'diario') {
      const mes = data.meta.mesReferenciaAtual;
      const { curve, hasData } = Calc.calculateDailySpendingCurve(data, mes);
      if (!hasData) { SimpleCharts.line('chart-evolucao', { labels: [], series: [] }); return; }
      SimpleCharts.line('chart-evolucao', {
        labels: curve.map((_, i) => String(i + 1)),
        monotone: true,
        hideDots: true,
        labelFormatter: formatBRLShort,
        series: [{ name: `Acumulado (${formatMonthKeyShort(mes)})`, data: curve, color: SimpleCharts.colorFor(0), fillArea: true, fillOpacity: 0.25 }],
      });
      return;
    }

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

  /** Calendário de gastos do mês atual (heatmap) — ver SimpleCharts.heatmap. */
  _renderHeatmap(data) {
    if (!document.getElementById('chart-heatmap-gastos')) return;
    const mes = data.meta.mesReferenciaAtual;
    const { days } = Calc.calculateSpendingHeatmapCells(data, mes);
    SimpleCharts.heatmap('chart-heatmap-gastos', days, { emptyMessage: 'Lance despesas variáveis com data para ver o calendário de gastos deste mês.' });
  },

  /**
   * Meta de reserva de emergência (aba Análises) — anel de progresso com o
   * mesmo dado configurado no popup de Perfil (Profile.openReservaModal),
   * que é a única porta de entrada desse valor agora (sem mais formulário
   * inline em Perfil). Sem meta definida ainda, mostra um atalho pro popup
   * em vez de um gráfico vazio. Card neutro (mesmo fundo dos vizinhos, ver
   * .reserva-card em style.css), só com um acento teal→roxo no anel.
   */
  _renderReservaGoal(data) {
    const container = document.getElementById('chart-reserva-emergencia');
    if (!container) return;
    const reserva = data.reservaEmergencia || {};

    if (!reserva.possui || reserva.metaValor == null) {
      container.innerHTML = `
        <div class="reserva-empty">
          <p>Você ainda não definiu uma meta de reserva de emergência.</p>
          <button type="button" class="reserva-quick-btn" onclick="Profile.openReservaModal()">
            <span class="reserva-quick-btn-icon"><span class="material-symbols-outlined" aria-hidden="true">shield</span></span>
            <span class="reserva-quick-btn-text"><strong>Definir meta</strong><small>Comece a acompanhar sua reserva</small></span>
            <span class="material-symbols-outlined reserva-quick-btn-chevron" aria-hidden="true">chevron_right</span>
          </button>
        </div>
      `;
      return;
    }

    const valorAtual = reserva.valorAtual || 0;
    const pct = Math.min((valorAtual / reserva.metaValor) * 100, 100);
    const restante = Math.max(reserva.metaValor - valorAtual, 0);
    const meses = Calc.calculateEmergencyFundMonthsCovered(data);

    container.innerHTML = `
      <div class="reserva-body">
        <div id="reserva-goal-ring"></div>
        <div class="reserva-stats">
          <div class="reserva-stat-row"><span>Guardado</span><strong>${formatBRL(valorAtual)}</strong></div>
          <div class="reserva-stat-row"><span>Meta</span><strong>${formatBRL(reserva.metaValor)}</strong></div>
          <div class="reserva-stat-row"><span>${restante > 0 ? 'Falta guardar' : 'Status'}</span><strong>${restante > 0 ? formatBRL(restante) : 'Meta atingida 🎉'}</strong></div>
          ${meses != null ? `<div class="reserva-stat-row"><span>Cobertura hoje</span><strong class="accent">~${meses.toFixed(1)} mês(es) de gastos</strong></div>` : ''}
        </div>
      </div>
      <div class="reserva-goal-actions">
        <button type="button" class="reserva-quick-btn" onclick="Profile.openReservaValorModal()">
          <span class="reserva-quick-btn-icon"><span class="material-symbols-outlined" aria-hidden="true">savings</span></span>
          <span class="reserva-quick-btn-text"><strong>Registrar valor</strong><small>Atualizar quanto já guardei</small></span>
          <span class="material-symbols-outlined reserva-quick-btn-chevron" aria-hidden="true">chevron_right</span>
        </button>
        <button type="button" class="icon-btn" onclick="Profile.openReservaModal()" title="Editar meta" aria-label="Editar meta"><span class="material-symbols-outlined" aria-hidden="true">edit</span></button>
      </div>
    `;
    SimpleCharts.progressRing('reserva-goal-ring', {
      pct,
      size: 136,
      radius: 58,
      strokeWidth: 9,
      gradient: ['var(--rv-teal)', 'var(--purple-500)'],
      centerSub: this._reservaStatusLabel(pct),
      ariaLabel: `Meta de reserva de emergência: ${pct.toFixed(0)}% concluída`,
    });
  },

  /** Palavra de status abaixo do percentual no anel — mesma ideia do rótulo
      qualitativo ("Excellent" etc.) de referências de anel de progresso, só
      que com os degraus que já fazem sentido pra uma meta de reserva. */
  _reservaStatusLabel(pct) {
    if (pct >= 100) return 'Meta atingida';
    if (pct >= 75) return 'Quase lá';
    if (pct >= 40) return 'No caminho certo';
    if (pct > 0) return 'Começando';
    return 'Vamos começar';
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

    // Mesma métrica (gastos) em dois pontos no tempo, não duas categorias
    // — um só matiz, mês mais antigo mais claro / mais recente mais escuro
    // (mesma leitura que qualquer comparação "antes/depois" do app).
    SimpleCharts.comparisonBars('compare-bars', {
      labels: [formatMonthKeyShort(a.mes), formatMonthKeyShort(b.mes)],
      values: [a.gastos, b.gastos],
      colors: ['var(--purple-500)', 'var(--purple-700)'],
      ariaLabel: `Gastos de ${formatMonthKeyShort(a.mes)}: ${formatBRL(a.gastos)}. Gastos de ${formatMonthKeyShort(b.mes)}: ${formatBRL(b.gastos)}.`,
    });

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
