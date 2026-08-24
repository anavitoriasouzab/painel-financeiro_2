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
const INVESTOR_PROFILE_LABELS = { conservador: '🟢 Conservador', equilibrado: '🟡 Equilibrado', agressivo: '🔴 Agressivo' };

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
    this._renderRaioX(data, { percentComprometido, renda, gastos });
    this._renderCharts(data, { renda, gastos, saldo });
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
      goalsList.innerHTML = destacadas.map((m) => {
        const prog = Calc.calculateGoalProgress(m);
        const detalhe = prog ? `${formatPercent(prog.percent)}` : formatBRL(m.valorMensalDesejado) + '/mês';
        return `<div class="dash-mini-chip">🎯 <span style="flex:1;">${escapeHtml(m.nome)}</span><strong>${detalhe}</strong></div>`;
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
        remList.innerHTML = visible.slice(0, 3).map((r) => `<div class="side-reminder-chip">${r.icon} <span>${escapeHtml(r.texto)}</span></div>`).join('');
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
        notifList.innerHTML = '<p class="muted-text">Nenhum lembrete por enquanto.</p>';
      } else {
        visible.forEach((r) => notifList.appendChild(this._buildNotifItem(r, state.lidas.includes(r.id))));
      }
    }
  },

  _buildNotifItem(reminder, isRead) {
    const el = document.createElement('div');
    el.className = `notif-item${isRead ? ' is-read' : ''}`;
    el.innerHTML = `
      <span class="notif-item-icon">${reminder.icon}</span>
      <span class="notif-item-text">${escapeHtml(reminder.texto)}</span>
      <div class="notif-item-actions">
        <button class="notif-action-btn" data-action="read" title="Marcar como lida" aria-label="Marcar como lida" ${isRead ? 'disabled' : ''}>✓</button>
        <button class="notif-action-btn" data-action="dismiss" title="Remover" aria-label="Remover notificação">✕</button>
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
    if (el) el.textContent = formatMesReferencia(mes);
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
    if (deltaPercent == null) { el.innerHTML = ''; return; }

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
    el.textContent = label || '';
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

  _renderRaioX(data, { percentComprometido, renda, gastos }) {
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
    const recentes = data.despesasVariaveis.filter((d) => d.mesReferencia === mes).slice(-5).reverse();

    if (!recentes.length) {
      list.innerHTML = '<div class="coming-soon"><p>Nenhuma despesa lançada este mês ainda.</p></div>';
      return;
    }

    list.innerHTML = recentes.map((d) => `
      <div class="account-card">
        <div class="account-main">
          <div class="account-name">${escapeHtml(d.nome)}</div>
          <div class="account-meta">${d.data ? formatDataCurta(d.data) : 'Data não informada'} · ${escapeHtml(d.categoria || 'Sem categoria')}</div>
        </div>
        <div class="account-value">${formatBRL(d.valor)}</div>
      </div>
    `).join('');
  },

  /** Dois gráficos analíticos direto na home, desenhados em SVG nativo (sem dependência externa). */
  _renderCharts(data, { renda, gastos, saldo }) {
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

    // Análise mensal — Renda x Gastos por mês (cresce conforme os meses viram,
    // e já ganha um ponto "previsto" pro mês seguinte assim que houver alguma
    // despesa/renda real lançada pra lá — ver Calc.buildHistoricoComProjecao).
    const hist = Calc.buildHistoricoComProjecao(data);
    const histLabels = hist.map((h) => formatMonthKeyShort(h.mes) + (h.previsto ? ' (prev.)' : ''));
    SimpleCharts.line('chart-dash-analise', {
      labels: histLabels,
      series: [
        { name: 'Renda', data: hist.map((h) => h.renda), color: '#4B2E9E' },
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

function formatMesReferencia(mesRef) {
  const [ano, mes] = mesRef.split('-');
  const nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  return `${nomes[parseInt(mes, 10) - 1]} de ${ano}`;
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
