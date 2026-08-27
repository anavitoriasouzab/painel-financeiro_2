/**
 * report.js
 * -----------------------------------------------------------------------
 * Relatório financeiro mensal, em uma página só — pensado pra imprimir ou
 * salvar como PDF (window.print(), ver .report-sheet em css/style.css e o
 * botão "Exportar / Imprimir PDF" no próprio overlay). Não inventa nenhum
 * dado novo: cada seção reaproveita as mesmas funções de Calc/SimpleCharts
 * já usadas em Dashboard/Análises/Planejamento, só reorganizadas num
 * documento único e com uma "folha" sempre clara (ver .report-sheet).
 */

const Report = {
  open(data) {
    const sheet = document.getElementById('report-sheet');
    const overlay = document.getElementById('report-overlay');
    if (!sheet || !overlay) return;

    // Reforça o modo claro por segurança (já vem assim no HTML) — o
    // relatório não deve variar com o tema escuro/claro escolhido no app.
    sheet.setAttribute('data-theme', 'light');
    sheet.innerHTML = this._build(data);
    this._renderCharts(data);
    overlay.classList.add('active');
  },

  close() {
    const overlay = document.getElementById('report-overlay');
    if (overlay) overlay.classList.remove('active');
  },

  _build(data) {
    const mes = data.meta.mesReferenciaAtual;
    return `
      ${this._buildBrand(data, mes)}
      ${this._buildResumo(data, mes)}
      ${this._buildFluxo()}
      ${this._buildCategorias()}
      ${this._buildTopExpenses(data, mes)}
      ${this._buildComprometimento(data, mes)}
      ${this._buildCompromissos(data)}
      ${this._buildMetas(data)}
      ${this._buildAlertas(data)}
      ${this._buildFooter(data)}
    `;
  },

  _buildBrand(data, mes) {
    const nome = data.perfil && data.perfil.nome ? data.perfil.nome : null;
    return `
      <div class="report-brand">
        <div>
          <div class="report-brand-title">Relatório financeiro · ${escapeHtml(formatMonthKey(mes))}</div>
          <div class="report-brand-sub">${nome ? escapeHtml(nome) + ' · ' : ''}Resumo do mês, gerado automaticamente</div>
        </div>
        <div class="report-brand-logo">
          <span class="material-symbols-outlined" aria-hidden="true">insights</span>
          Painel Financeiro
        </div>
      </div>
    `;
  },

  _buildResumo(data, mes) {
    const renda = Calc.calculateMonthlyIncome(data, mes);
    const gastos = Calc.calculateMonthlyExpenses(data, mes);
    const saldo = Calc.calculateRemainingBalance(data, mes);
    const pct = Calc.calculateCommittedPercentage(data, mes);
    return `
      <div class="report-section">
        <div class="report-section-title">01 · Resumo do mês</div>
        <div class="report-cards">
          <div class="report-card"><div class="report-card-label">Renda</div><div class="report-card-value">${formatBRL(renda)}</div></div>
          <div class="report-card"><div class="report-card-label">Gastos</div><div class="report-card-value">${formatBRL(gastos)}</div></div>
          <div class="report-card"><div class="report-card-label">Saldo</div><div class="report-card-value">${formatBRL(saldo)}</div></div>
          <div class="report-card"><div class="report-card-label">Renda comprometida</div><div class="report-card-value">${pct == null ? '—' : formatPercent(pct)}</div></div>
        </div>
      </div>
    `;
  },

  _buildFluxo() {
    return `
      <div class="report-section">
        <div class="report-section-title">02 · Fluxo financeiro (últimos meses)</div>
        <div class="report-chart-block"><div id="report-chart-fluxo" class="sc-container"></div></div>
      </div>
    `;
  },

  _buildCategorias() {
    return `
      <div class="report-section">
        <div class="report-section-title">03 · Onde o dinheiro foi</div>
        <div id="report-chart-categorias"></div>
      </div>
    `;
  },

  _buildTopExpenses(data, mes) {
    const top = Calc.calculateTopExpenses(data, mes, 6);
    if (!top.length) {
      return `
        <div class="report-section">
          <div class="report-section-title">04 · Maiores despesas do mês</div>
          <p class="report-empty">Nenhuma despesa lançada este mês ainda.</p>
        </div>
      `;
    }
    const rows = top.map((t) => `
      <tr><td>${escapeHtml(t.nome)}</td><td>${escapeHtml(t.categoria || 'Sem categoria')}</td><td>${escapeHtml(formatMonthKey(t.mes))}</td><td class="num">${formatBRL(t.valor)}</td></tr>
    `).join('');
    return `
      <div class="report-section">
        <div class="report-section-title">04 · Maiores despesas do mês</div>
        <table class="report-table">
          <thead><tr><th>Despesa</th><th>Categoria</th><th>Mês</th><th class="num">Valor</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  },

  _buildComprometimento(data, mes) {
    const renda = Calc.calculateMonthlyIncome(data, mes);
    const gastos = Calc.calculateMonthlyExpenses(data, mes);
    const pct = Calc.calculateCommittedPercentage(data, mes);
    const limite = Calc.calculateCommitmentLimit(data);
    const nivel = limite ? Calc.calculateCommitmentLevel(pct, limite.percentual) : null;
    const msg = typeof buildRaioXMessage === 'function' ? buildRaioXMessage(pct, renda, gastos, limite, nivel) : '';
    return `
      <div class="report-section">
        <div class="report-section-title">05 · Comprometimento da renda</div>
        <p class="report-empty" style="color:#201A33;">${escapeHtml(msg)}</p>
      </div>
    `;
  },

  /** Mesma lógica de agrupamento por mês de Installments._renderUpcoming — aqui só como texto, sem os ícones de ação (não faz sentido editar a partir de um relatório impresso). */
  _buildCompromissos(data) {
    const upcoming = Calc.calculateUpcomingEndings(data, 2);
    if (!upcoming.length) {
      return `
        <div class="report-section">
          <div class="report-section-title">06 · Compromissos e parcelamentos</div>
          <p class="report-empty">Nenhum parcelamento com término previsto nos próximos meses.</p>
        </div>
      `;
    }
    const margem = Calc.calculateMarginFreedNextMonth(data);
    const grupos = [];
    upcoming.forEach((x) => {
      const ultimo = grupos[grupos.length - 1];
      if (ultimo && ultimo.mesKey === x.endMonthKey) ultimo.itens.push(x);
      else grupos.push({ mesKey: x.endMonthKey, mesLabel: formatMonthKey(x.endMonthKey), itens: [x] });
    });
    const gruposHtml = grupos.map((g) => {
      const rows = g.itens.map((x) => `
        <tr><td>${escapeHtml(x.parcelamento.nome)}</td><td class="num">${formatBRL(x.parcelamento.valorParcela)}/mês</td></tr>
      `).join('');
      return `
        <table class="report-table" style="margin-bottom:10px;">
          <thead><tr><th>${escapeHtml(g.mesLabel)}</th><th class="num">${g.itens.length} conta${g.itens.length > 1 ? 's' : ''}</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      `;
    }).join('');
    return `
      <div class="report-section">
        <div class="report-section-title">06 · Compromissos e parcelamentos</div>
        ${margem > 0 ? `<p class="report-empty" style="color:#187E56;font-weight:600;">+ ${escapeHtml(formatBRL(margem))} de margem liberada a partir do próximo mês.</p>` : ''}
        ${gruposHtml}
      </div>
    `;
  },

  _buildMetas(data) {
    const metas = (data.metas || []).filter((m) => m.valorDesejado != null);
    if (!metas.length) return '';
    const rows = metas.map((m) => {
      const prog = Calc.calculateGoalProgress(m);
      return `<tr><td>${escapeHtml(m.nome)}</td><td class="num">${formatPercent(prog.percent)}</td><td class="num">${formatBRL(prog.restante)}</td></tr>`;
    }).join('');
    return `
      <div class="report-section">
        <div class="report-section-title">07 · Metas</div>
        <table class="report-table">
          <thead><tr><th>Meta</th><th class="num">Progresso</th><th class="num">Falta</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  },

  /**
   * Classifica cada alerta de Calc.generateAlerts em um dos 4 quadrantes de
   * insight (mesmo agrupamento da referência em PDF) — não dá pra usar só
   * o `tipo` do alerta (success/warning/...) porque, por exemplo, tanto uma
   * melhora real (gastos caindo) quanto uma margem liberada por parcela
   * terminando são "tipo: success", mas são categorias diferentes.
   */
  _categorizeInsight(alert) {
    if (alert.id === 'parcelamentos-terminando') return 'oportunidades';
    if (alert.id === 'variacao-gastos') return alert.icon === 'trending_down' ? 'melhorou' : 'piorou';
    if (alert.id === 'variacao-potencial') return alert.icon === 'savings' ? 'melhorou' : 'piorou';
    if (alert.id === 'sem-alertas') return null;
    return 'atencao'; // limite-comprometimento, renda-utilizada e qualquer alerta novo não mapeado
  },

  _buildAlertas(data) {
    const grupos = { melhorou: [], piorou: [], atencao: [], oportunidades: [] };
    Calc.generateAlerts(data).forEach((a) => {
      const cat = this._categorizeInsight(a);
      if (cat) grupos[cat].push(a);
    });

    const quadrante = (chave, titulo, icone, cor) => {
      const itens = grupos[chave];
      const corpo = itens.length
        ? `<ul>${itens.map((a) => `<li>${escapeHtml(a.texto)}</li>`).join('')}</ul>`
        : '<p class="report-insight-empty">Nenhum item neste mês.</p>';
      return `
        <div class="report-insight-box" style="border-left-color:${cor};">
          <div class="report-insight-title" style="color:${cor};"><span class="material-symbols-outlined" aria-hidden="true">${icone}</span> ${titulo}</div>
          ${corpo}
        </div>
      `;
    };

    return `
      <div class="report-section">
        <div class="report-section-title">08 · Insights do mês</div>
        <div class="report-insights-grid">
          ${quadrante('melhorou', 'Melhorou', 'trending_up', '#187E56')}
          ${quadrante('piorou', 'Piorou', 'trending_down', '#C0392B')}
          ${quadrante('atencao', 'Atenção', 'warning', '#966319')}
          ${quadrante('oportunidades', 'Oportunidades', 'lightbulb', '#4B2E9E')}
        </div>
      </div>
    `;
  },

  _buildFooter(data) {
    const agora = new Date();
    const dataStr = agora.toLocaleDateString('pt-BR');
    const horaStr = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `<div class="report-footer">Painel Financeiro · gerado em ${dataStr} às ${horaStr}</div>`;
  },

  /** SimpleCharts desenha em cima do DOM real, então só depois do innerHTML acima já ter os containers no lugar. */
  _renderCharts(data) {
    const mes = data.meta.mesReferenciaAtual;

    const hist = Calc.buildHistoricoComProjecao(data);
    SimpleCharts.line('report-chart-fluxo', {
      labels: hist.map((h) => formatMonthKey(h.mes)),
      monotone: true,
      labelLastOnly: true,
      labelFormatter: formatBRLShort,
      series: [
        { name: 'Renda', data: hist.map((h) => h.renda), color: '#4B2E9E', fillArea: true, fillOpacity: 0.18 },
        { name: 'Gastos', data: hist.map((h) => h.gastos), color: '#C0392B' },
      ],
    });

    const breakdown = Calc.calculateCategoryBreakdown(data, mes);
    const items = breakdown.map((b, i) => ({ nome: b.categoria, valor: b.valor, color: SimpleCharts.colorFor(i) }));
    SimpleCharts.rankedList('report-chart-categorias', items);
  },
};
