/**
 * dashboard.js
 * -----------------------------------------------------------------------
 * Só lê dados (via Storage) e cálculos (via Calc) e desenha o DOM.
 * Não tem nenhuma regra de negócio aqui — isso vive em calculations.js.
 */

const DASH_ICON_UP = '<svg viewBox="0 -960 960 960" width="11" height="11" fill="currentColor"><path d="M450-160v-526L202-438l-42-42 320-320 320 320-42 42-248-248v526h-60Z"/></svg>';
const DASH_ICON_DOWN = '<svg viewBox="0 -960 960 960" width="11" height="11" fill="currentColor"><path d="M450-800v526L202-522l-42 42 320 320 320-320-42-42-248 248v-526h-60Z"/></svg>';
const DASH_ICON_NEUTRAL = '<svg viewBox="0 -960 960 960" width="11" height="11" fill="currentColor"><path d="M200-450v-60h560v60H200Z"/></svg>';

/** Rótulos do perfil de investidor — mesmos textos usados no seletor de Planejamento (js/planning.js). */
const INVESTOR_PROFILE_LABELS = { conservador: 'Conservador', equilibrado: 'Equilibrado', agressivo: 'Agressivo' };

/** Ícone (Material Symbols) por categoria — cobre as categorias padrão já
    semeadas em Storage; categoria livre/desconhecida cai no ícone genérico. */
const CATEGORY_ICONS = {
  'Moradia': 'home',
  'Alimentação': 'restaurant',
  'Transporte': 'directions_car',
  'Saúde': 'medical_services',
  'Educação': 'school',
  'Tecnologia': 'devices',
  'Lazer': 'sports_esports',
  'Assinaturas': 'subscriptions',
  'Compras': 'shopping_bag',
  'Academia': 'fitness_center',
  'Viagens': 'flight',
  'Contas': 'receipt_long',
  'Outros': 'category',
};
function iconForCategory(categoria) {
  return CATEGORY_ICONS[categoria] || 'category';
}

/** Cor do ícone de categoria — mesma paleta (clara/escura) já usada pelos
    gráficos, indexada pela posição da categoria na lista cadastrada, pra
    ficar estável entre renderizações. */
function colorForCategory(data, categoria) {
  const idx = (data.categorias || []).indexOf(categoria);
  return SimpleCharts.colorFor(idx >= 0 ? idx : 0);
}

function hexToRgba(hex, alpha) {
  const n = hex.replace('#', '');
  const num = parseInt(n.length === 3 ? n.split('').map((c) => c + c).join('') : n, 16);
  const r = (num >> 16) & 0xff, g = (num >> 8) & 0xff, b = num & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const Dashboard = {
  render(data) {
    const mes = data.meta.mesReferenciaAtual;

    const renda = Calc.calculateMonthlyIncome(data, mes);
    const gastos = Calc.calculateMonthlyExpenses(data, mes);
    const saldo = Calc.calculateRemainingBalance(data, mes);
    const percentComprometido = Calc.calculateCommittedPercentage(data, mes);
    const potencial = Calc.calculateInvestmentCapacityByProfile(data, mes);

    this._renderHeader(mes);
    this._renderStats(data, { renda, gastos, saldo, potencial });
    this._renderReservaCard(data);
    this._renderCategoryDistribution(data);
    this._renderHealthSection(data, { percentComprometido, renda, gastos, saldo });
    this._renderEvolutionChart(data);
    this._renderRecentExpenses(data);
    this._renderGoalsSummary(data);
    this._renderReminders(data);
  },

  /** Metas em destaque, direto no corpo do Dashboard — visível em qualquer tamanho de tela. */
  _renderGoalsSummary(data) {
    const goalsSection = document.getElementById('dash-goals-section');
    const goalsList = document.getElementById('dash-goals-list');
    if (!goalsSection || !goalsList) return;
    const destacadas = data.metas.filter((m) => m.destaque).slice(0, 2);
    if (destacadas.length) {
      goalsSection.style.display = 'block';
      // 1 meta em destaque não precisa da linha inteira — span menor evita
      // vazio grande à direita do chip único (ver span-12 padrão para 2).
      goalsSection.classList.toggle('span-6', destacadas.length === 1);
      goalsSection.classList.toggle('span-12', destacadas.length !== 1);
      goalsList.innerHTML = destacadas.map((m) => {
        const prog = Calc.calculateGoalProgress(m);
        const detalhe = prog ? `${formatPercent(prog.percent)}` : formatBRL(m.valorMensalDesejado) + '/mês';
        return `<div class="dash-mini-chip"><span class="material-symbols-outlined" aria-hidden="true">track_changes</span> <span style="flex:1;">${escapeHtml(m.nome)}</span><strong>${detalhe}</strong></div>`;
      }).join('');
    } else {
      goalsSection.style.display = 'none';
    }
  },

  /**
   * Lembretes na sidebar (com contador em destaque) e na central de
   * notificações (sino no header, ver #notif-list em index.html) — mesma
   * fonte de dados nos dois lugares, só que o sino fica visível em
   * qualquer tamanho de tela, já que a sidebar some no mobile.
   *
   * "Lida"/"removida" é estado só deste navegador (localStorage, mesmo
   * padrão já usado pra preferência de tema em index.html) — não é um dado
   * financeiro, não precisa passar por Storage/Supabase. Fica escopado ao
   * mês atual: como os lembretes são recalculados a partir dos dados reais
   * a cada render, não têm um "fim de vida" próprio, e vira o mês limpa
   * sozinho (ex.: uma conta marcada como lida não fica escondida para sempre).
   */
  _renderReminders(data) {
    const mes = data.meta.mesReferenciaAtual;
    const state = loadNotifState(mes);
    const all = Calc.calculateReminders(data);
    const visible = all.filter((r) => !state.dispensadas.includes(r.id));
    const naoLidas = visible.filter((r) => !state.lidas.includes(r.id));

    const remSection = document.getElementById('sidebar-reminders-section');
    const remList = document.getElementById('sidebar-reminders-list');
    const remCount = document.getElementById('sidebar-reminder-count');
    if (remSection && remList) {
      if (visible.length) {
        remSection.style.display = 'block';
        if (remCount) remCount.textContent = visible.length;
        remList.innerHTML = '';
        visible.slice(0, 2).forEach((r) => remList.appendChild(this._buildSidebarReminderChip(r)));
      } else {
        remSection.style.display = 'none';
      }
    }

    const badge = document.getElementById('notif-badge');
    if (badge) {
      badge.textContent = naoLidas.length;
      badge.style.display = naoLidas.length ? 'inline-block' : 'none';
    }

    const notifList = document.getElementById('notif-list');
    if (notifList) {
      notifList.innerHTML = '';
      if (!visible.length) {
        notifList.innerHTML = '<p class="muted-text">Nenhum lembrete ainda.</p>';
      } else {
        visible.forEach((r) => notifList.appendChild(this._buildNotifItem(r, state.lidas.includes(r.id))));
      }
    }
  },

  /** Chip compacto de lembrete na sidebar: texto em uma linha só (truncado
      via CSS), clicável pra alternar entre resumido e completo (quebrando
      linha), e um botão de excluir — versão abreviada do item completo
      mostrado na central de notificações. */
  _buildSidebarReminderChip(reminder) {
    const el = document.createElement('div');
    el.className = 'side-reminder-chip';
    el.innerHTML = `
      <span class="material-symbols-outlined" aria-hidden="true">${reminder.icon}</span>
      <button type="button" class="side-reminder-text" title="Mostrar texto completo">${escapeHtml(reminder.texto)}</button>
      <button class="side-reminder-dismiss" title="Excluir" aria-label="Excluir lembrete"><span class="material-symbols-outlined" aria-hidden="true">close</span></button>
    `;
    const textBtn = el.querySelector('.side-reminder-text');
    textBtn.addEventListener('click', () => {
      const expanded = el.classList.toggle('is-expanded');
      textBtn.title = expanded ? 'Recolher texto' : 'Mostrar texto completo';
    });
    el.querySelector('.side-reminder-dismiss').addEventListener('click', () => this.dismissNotification(reminder.id));
    return el;
  },

  _buildNotifItem(reminder, isRead) {
    const el = document.createElement('div');
    el.className = `notif-item${isRead ? ' is-read' : ''}`;
    el.innerHTML = `
      <span class="notif-item-icon"><span class="material-symbols-outlined" aria-hidden="true">${reminder.icon}</span></span>
      <span class="notif-item-text">${escapeHtml(reminder.texto)}</span>
      <div class="notif-item-actions">
        <button class="notif-action-btn" data-action="read" title="Marcar como lida" aria-label="Marcar como lida" ${isRead ? 'disabled' : ''}><span class="material-symbols-outlined" aria-hidden="true">done</span></button>
        <button class="notif-action-btn" data-action="dismiss" title="Ocultar" aria-label="Ocultar notificação"><span class="material-symbols-outlined" aria-hidden="true">close</span></button>
      </div>
    `;
    el.querySelector('[data-action="read"]').addEventListener('click', () => this.markNotificationRead(reminder.id));
    el.querySelector('[data-action="dismiss"]').addEventListener('click', () => this.dismissNotification(reminder.id));
    return el;
  },

  markNotificationRead(id) {
    const mes = appData.meta.mesReferenciaAtual;
    const state = loadNotifState(mes);
    if (!state.lidas.includes(id)) state.lidas.push(id);
    saveNotifState(state);
    this._renderReminders(appData);
  },

  dismissNotification(id) {
    const mes = appData.meta.mesReferenciaAtual;
    const state = loadNotifState(mes);
    if (!state.dispensadas.includes(id)) state.dispensadas.push(id);
    saveNotifState(state);
    this._renderReminders(appData);
  },

  _renderHeader(mes) {
    const el = document.getElementById('current-month-label');
    if (el) el.textContent = formatMonthKey(mes);
  },

  _renderStats(data, { renda, gastos, saldo, potencial }) {
    const oculto = data.configuracoes.ocultarValores || {};
    setText('stat-renda', oculto.renda ? '••••••' : formatBRL(renda));
    setText('stat-gastos', formatBRL(gastos));
    setText('stat-saldo', oculto.saldo ? '••••••' : formatBRL(saldo));
    setText('stat-potencial', formatBRL(potencial.valor));
    setText('stat-potencial-sub', potencial.obsMargem);
    this._renderInvestorProfileBadge(potencial.perfil);

    this._updateEyeIcon('toggle-renda-visibility', oculto.renda);
    this._updateEyeIcon('toggle-saldo-visibility', oculto.saldo);

    this._renderStatTrend(data, 'renda', 'renda', 'up');
    this._renderStatTrend(data, 'gastos', 'gastos', 'down');
    this._renderStatTrend(data, 'saldo', 'saldo', 'up');
    this._renderStatTrend(data, 'potencial', 'potencialInvestimento', 'up');

    this._renderStatSparkline(data, 'renda', 'spark-renda', '#4B2E9E', oculto.renda);
    this._renderStatSparkline(data, 'gastos', 'spark-gastos', '#C0392B', false);
    this._renderStatSparkline(data, 'saldo', 'spark-saldo', '#1F9E6B', oculto.saldo);
    this._renderStatSparkline(data, 'potencialInvestimento', 'spark-potencial', '#7C4DE0', false);
  },

  /**
   * Mini tendência (SimpleCharts.sparkline) dentro de cada stat-card, usando
   * só pontos reais (arquivados + o mês em andamento, nunca projeção
   * futura — buildHistoricoComProjecao(data, 0) não gera nenhuma). Com
   * menos de 2 pontos o slot fica oculto: um sparkline achatado fabricado
   * seria pior do que simplesmente não mostrar nada. Respeita "ocultar
   * valores" do mesmo jeito que o valor grande do card.
   */
  _renderStatSparkline(data, field, containerId, color, oculto) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (oculto) { container.style.display = 'none'; container.innerHTML = ''; return; }
    const hist = Calc.buildHistoricoComProjecao(data, 0);
    const valores = hist.map((h) => h[field]).filter((v) => v != null);
    if (valores.length < 2) { container.style.display = 'none'; container.innerHTML = ''; return; }
    container.style.display = '';
    SimpleCharts.sparkline(containerId, valores, color, { pulse: true, valueLabel: formatBRLShort(valores[valores.length - 1]) });
  },

  /** Card de Reserva de emergência no Dashboard — só aparece pra quem já
      preencheu isso em Perfil (mesmo padrão dos outros stat-card: rótulo,
      valor, sub-texto). */
  _renderReservaCard(data) {
    const card = document.getElementById('stat-reserva-card');
    if (!card) return;
    const reserva = data.reservaEmergencia;
    if (!reserva || !reserva.possui || reserva.valorAtual == null) {
      card.style.display = 'none';
      return;
    }
    card.style.display = 'block';
    const oculto = !!(data.configuracoes.ocultarValores || {}).reserva;
    setText('stat-reserva', oculto ? '••••••' : formatBRL(reserva.valorAtual));
    const subEl = document.getElementById('stat-reserva-sub');
    if (subEl) {
      if (reserva.metaValor) {
        const pct = Math.min((reserva.valorAtual || 0) / reserva.metaValor * 100, 100);
        // "Ocultar valores" só esconde o valor em reais guardado (o número
        // sensível de verdade) — a % de progresso e a meta em si seguem
        // visíveis, elas não expõem o saldo atual da pessoa.
        subEl.innerHTML = `${pct.toFixed(0)}% da meta<br>Meta: ${formatBRL(reserva.metaValor)}`;
      } else {
        const meses = Calc.calculateEmergencyFundMonthsCovered(data);
        if (meses != null) {
          const mesesTxt = meses.toFixed(1).replace('.', ',');
          subEl.textContent = `~${mesesTxt} ${mesesTxt === '1,0' ? 'mês' : 'meses'} de gastos cobertos`;
        } else {
          subEl.textContent = '';
        }
      }
    }
    this._updateEyeIcon('toggle-reserva-visibility', oculto);
  },

  /**
   * Badge de variação (vs. mês anterior) num stat card.
   * `goodDirection`: 'up' quando subir é bom (renda, saldo, potencial) ou
   * 'down' quando subir é ruim (gastos) — decide se o badge fica verde/vermelho.
   */
  _renderStatTrend(data, statKey, field, goodDirection) {
    const { deltaPercent } = Calc.calculateStatTrend(data, field);

    const el = document.getElementById(`delta-${statKey}`);
    if (!el) return;
    if (deltaPercent == null) {
      // Sem 2 meses arquivados ainda não dá pra calcular uma variação real —
      // avisa isso explicitamente em vez de deixar o badge sumir em silêncio.
      el.innerHTML = (data.historicoMensal || []).length < 2
        ? '<span class="stat-delta is-pending">Ainda sem histórico suficiente</span>'
        : '';
      return;
    }

    const isUp = deltaPercent > 0.05;
    const isDown = deltaPercent < -0.05;
    let cls = 'is-neutral';
    let icon = DASH_ICON_NEUTRAL;
    if (isUp) { cls = goodDirection === 'up' ? 'is-good' : 'is-bad'; icon = DASH_ICON_UP; }
    else if (isDown) { cls = goodDirection === 'up' ? 'is-bad' : 'is-good'; icon = DASH_ICON_DOWN; }
    const sign = deltaPercent > 0 ? '+' : '';
    el.innerHTML = `<span class="stat-delta ${cls}">${icon}${sign}${deltaPercent.toFixed(1)}%</span>`;
  },

  /** Selo com o perfil de investidor atual, ao lado do rótulo "Potencial de investimento" — o perfil em si é escolhido em Planejamento. */
  _renderInvestorProfileBadge(perfil) {
    const el = document.getElementById('stat-potencial-perfil-badge');
    if (!el) return;
    const label = INVESTOR_PROFILE_LABELS[perfil];
    el.innerHTML = label ? `<span class="risk-dot risk-dot-${perfil}" aria-hidden="true"></span>${label}` : '';
    el.style.display = label ? 'inline-flex' : 'none';
  },

  _updateEyeIcon(btnId, oculto) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const open = btn.querySelector('.icon-eye-open');
    const closed = btn.querySelector('.icon-eye-closed');
    if (open) open.style.display = oculto ? 'none' : 'block';
    if (closed) closed.style.display = oculto ? 'block' : 'none';
  },

  toggleVisibility(campo) {
    const cfg = appData.configuracoes.ocultarValores;
    cfg[campo] = !cfg[campo];
    Storage.save(appData);
    this.render(appData);
  },

  _renderRaioX(data, { percentComprometido, renda, gastos, saldo }) {
    const pct = percentComprometido == null ? 0 : Math.min(percentComprometido, 100);
    const limite = Calc.calculateCommitmentLimit(data);
    const nivel = limite ? Calc.calculateCommitmentLevel(percentComprometido, limite.percentual) : null;
    const state = (nivel === 'atingido' || nivel === 'ultrapassado') ? 'danger' : nivel === 'aproximando' ? 'warning' : 'normal';

    SimpleCharts.gauge('raiox-gauge', {
      pct,
      limitPct: limite ? Math.min(limite.percentual, 100) : null,
      state,
      centerValue: percentComprometido == null ? 'não informado' : formatPercent(percentComprometido),
    });
    setText('raiox-gasto-total', formatBRL(gastos));

    const msgEl = document.getElementById('raiox-message');
    if (msgEl) msgEl.textContent = buildRaioXMessage(percentComprometido, renda, gastos, limite, nivel);
  },

  /**
   * "Despesas recentes" — as últimas despesas variáveis lançadas no mês
   * (recorrentes e parcelamentos não têm uma data de movimentação real,
   * então ficam fora dessa lista — é sobre gastos pontuais do mês).
   * Reaproveita o mesmo card de despesa usado na aba Contas (.account-card).
   */
  _renderRecentExpenses(data) {
    const list = document.getElementById('dash-recent-expenses');
    if (!list) return;
    const mes = data.meta.mesReferenciaAtual;
    const doMes = data.despesasVariaveis.filter((d) => d.mesReferencia === mes);
    const recentes = doMes.slice(-2).reverse();

    const seeMoreBtn = document.getElementById('dash-recent-see-more');
    if (seeMoreBtn) seeMoreBtn.style.display = doMes.length > recentes.length ? 'inline-block' : 'none';

    if (!recentes.length) {
      list.innerHTML = '<div class="coming-soon"><p>Nenhuma despesa lançada este mês ainda.</p></div>';
      return;
    }

    list.innerHTML = recentes.map((d) => {
      const icon = iconForCategory(d.categoria);
      const color = colorForCategory(data, d.categoria);
      return `
      <div class="tx-row" role="button" tabindex="0" onclick="Dashboard.goToExpense('${escapeAttr(d.id)}')" onkeydown="if(event.key==='Enter')Dashboard.goToExpense('${escapeAttr(d.id)}')">
        <div class="tx-icon" style="background:${hexToRgba(color, 0.15)};color:${color}">
          <span class="material-symbols-outlined" aria-hidden="true">${icon}</span>
        </div>
        <div class="tx-body">
          <div class="tx-name">${escapeHtml(d.nome)}</div>
          <div class="tx-meta">${escapeHtml(d.categoria || 'Sem categoria')} · ${d.data ? formatDataCurta(d.data) : 'Data não informada'}</div>
        </div>
        <div class="tx-value">${formatBRL(d.valor)}</div>
      </div>
    `;
    }).join('');
  },

  /** Clicar numa despesa recente leva direto pra ela em Contas > Variáveis, já aberta pra edição — em vez de só cair na aba e precisar procurar de novo. */
  goToExpense(id) {
    navigateTo('contas');
    Accounts.switchToTab('variaveis');
    Accounts.openForm('variavel', id);
  },

  /**
   * Top-5 categorias que mais pesam nas despesas do mês — versão "resumo"
   * do mesmo cálculo (Calc.calculateCategoryBreakdown) que Análises mostra
   * por completo; com mais de 5 categorias, um link leva pra lá em vez de
   * duplicar a lista inteira aqui.
   */
  _renderCategoryDistribution(data) {
    const mes = data.meta.mesReferenciaAtual;
    const breakdown = Calc.calculateCategoryBreakdown(data, mes);
    const top = breakdown.slice(0, 5);
    const items = top.map((b) => ({ nome: b.categoria, valor: b.valor, color: colorForCategory(data, b.categoria), icon: iconForCategory(b.categoria) }));
    SimpleCharts.rankedList('chart-dash-categoria', items);

    const seeMoreBtn = document.getElementById('dash-categoria-see-more');
    if (seeMoreBtn) seeMoreBtn.style.display = breakdown.length > top.length ? 'inline-block' : 'none';
  },

  /** Raio-X financeiro (gauge, inalterado) + composição fixo×variável, lado a lado na seção "Saúde financeira". */
  _renderHealthSection(data, { percentComprometido, renda, gastos, saldo }) {
    this._renderRaioX(data, { percentComprometido, renda, gastos, saldo });

    const mes = data.meta.mesReferenciaAtual;
    // Fixo x variável: só duas fatias, então uma barra de composição (padrão de "alocação de orçamento")
    // comunica melhor que uma rosca, e mantém a altura do card equivalente à do card vizinho.
    const fixo = Calc.calculateFixedExpenses(data, mes);
    const variavelTotal = Calc.calculateVariableExpenses(data, mes) + Calc.calculateInstallmentsMonthlyTotal(data);
    SimpleCharts.stackedBar('chart-dash-fixovar', {
      total: fixo + variavelTotal,
      segments: [
        { label: 'Fixos/recorrentes', value: fixo, color: '#5F3DC4' },
        { label: 'Variáveis + parcelas', value: variavelTotal, color: '#B69EF2' },
      ],
    });
    this._renderFixovarAverageCompare(data, fixo + variavelTotal);
  },

  /**
   * Compara o total do mês com a média dos últimos 6 meses (historicoMensal)
   * — linha extra no card "Despesas do mês" (ver _renderHealthSection).
   * Além de dar contexto, ocupa o espaço que sobrava quando esse card passou
   * a dividir linha com "Evolução financeira" (bem mais alto).
   */
  _renderFixovarAverageCompare(data, totalMes) {
    const el = document.getElementById('dash-fixovar-avg');
    if (!el) return;
    const { average, monthsUsed } = Calc.calculateAverageMonthlyExpenses(data);
    if (average == null || !average) {
      el.innerHTML = '<span class="stat-delta is-pending">Ainda sem histórico suficiente para comparar com a média</span>';
      return;
    }
    const deltaPercent = ((totalMes - average) / average) * 100;
    const isUp = deltaPercent > 0.5;
    const isDown = deltaPercent < -0.5;
    let cls = 'is-neutral';
    let icon = DASH_ICON_NEUTRAL;
    // Gastos: subir é ruim, descer é bom (mesma convenção de _renderStatTrend).
    if (isUp) { cls = 'is-bad'; icon = DASH_ICON_UP; }
    else if (isDown) { cls = 'is-good'; icon = DASH_ICON_DOWN; }
    const sign = deltaPercent > 0 ? '+' : '';
    el.innerHTML = `<span class="stat-delta ${cls}">${icon}${sign}${deltaPercent.toFixed(1)}%</span> vs. média dos últimos ${monthsUsed} meses (${formatBRL(average)})`;
  },

  /**
   * Evolução financeira — Renda x Gastos por mês (cresce conforme os meses
   * viram, e já ganha um ponto "previsto" pro mês seguinte assim que houver
   * alguma despesa/renda real lançada pra lá — ver Calc.buildHistoricoComProjecao).
   */
  _renderEvolutionChart(data) {
    const hist = Calc.buildHistoricoComProjecao(data);
    const histLabels = hist.map((h) => formatMonthKeyShort(h.mes) + (h.previsto ? ' (prev.)' : h.emAndamento ? ' (atual)' : ''));
    SimpleCharts.line('chart-dash-analise', {
      labels: histLabels,
      monotone: true, // com poucos pontos, a curva suave padrão "estourava" acima/abaixo dos valores reais
      labelLastOnly: true, // valor do mês atual à mostra, sem precisar abrir Análises pra ver o número
      labelFormatter: formatBRLShort,
      series: [
        { name: 'Renda', data: hist.map((h) => h.renda), color: '#4B2E9E', fillArea: true, fillOpacity: 0.22 },
        { name: 'Gastos', data: hist.map((h) => h.gastos), color: '#C0392B' },
      ],
    });
  },

};

function buildRaioXMessage(percentComprometido, renda, gastos, limite, nivel) {
  if (percentComprometido == null) {
    return 'Ainda não é possível calcular o comprometimento da renda — cadastre uma fonte de renda.';
  }
  if (limite && nivel) {
    if (nivel === 'ultrapassado') {
      return `⚠️ Atenção: limite ultrapassado. Suas compras já comprometem ${formatPercent(percentComprometido)} da sua renda (limite configurado: ${limite.percentual}%).`;
    }
    if (nivel === 'atingido') {
      return `⚠️ Limite atingido: ${formatPercent(percentComprometido)} da sua renda comprometida (limite: ${limite.percentual}%).`;
    }
    if (nivel === 'aproximando') {
      return `Você está se aproximando do seu limite de ${limite.percentual}% — hoje está em ${formatPercent(percentComprometido)}.`;
    }
    return `Tudo dentro do combinado: ${formatPercent(percentComprometido)} da renda comprometida, abaixo do seu limite de ${limite.percentual}%.`;
  }
  if (percentComprometido >= 90) {
    return `Sua renda está ${formatPercent(percentComprometido)} comprometida neste mês. A margem para gastos novos está muito reduzida.`;
  }
  if (percentComprometido >= 70) {
    return `Sua renda está ${formatPercent(percentComprometido)} comprometida neste mês. Vale acompanhar de perto os próximos gastos.`;
  }
  return `Sua renda está ${formatPercent(percentComprometido)} comprometida neste mês, deixando ${formatBRL(renda - gastos)} de margem.`;
}


function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/** Formata uma data "AAAA-MM-DD" como "DD/MM". */
function formatDataCurta(dataStr) {
  const [, mes, dia] = dataStr.split('-');
  return `${dia}/${mes}`;
}

const NOTIF_STATE_KEY = 'financas_notif_state';

/** Estado de leitura/dispensa de notificações, escopado ao mês (ver comentário em Dashboard._renderReminders). */
function loadNotifState(mesAtual) {
  try {
    const raw = localStorage.getItem(NOTIF_STATE_KEY);
    const state = raw ? JSON.parse(raw) : null;
    if (state && state.mes === mesAtual) return state;
  } catch (e) { /* estado corrompido — recomeça do zero */ }
  return { mes: mesAtual, lidas: [], dispensadas: [] };
}

function saveNotifState(state) {
  try { localStorage.setItem(NOTIF_STATE_KEY, JSON.stringify(state)); } catch (e) { /* localStorage indisponível — segue sem persistir */ }
}
