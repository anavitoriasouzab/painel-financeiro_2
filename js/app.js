/**
 * app.js
 * -----------------------------------------------------------------------
 * Ponto de entrada: carrega os dados, desenha o dashboard e liga a
 * navegação entre as views. Fases 2+ vão registrar mais views aqui
 * (Contas, Análises, Planejamento) sem precisar tocar neste arquivo.
 */

let appData = null;

/** Confere se há uma sessão Supabase válida; sem ela, manda pra tela de login. */
async function requireAuth() {
  const { data } = await supabaseClient.auth.getSession();
  if (!data || !data.session) {
    window.location.href = 'login.html';
    return null;
  }
  return data.session;
}

async function initApp(session) {
  appData = await Storage.load(session.user.id);
  renderAll();
  // A navegação e os modais precisam ser configurados mesmo que algum
  // render acima falhe por qualquer motivo — do contrário nenhum botão do
  // menu responde a clique, e o usuário fica "preso" na tela que carregou
  // por último antes do erro.
  setupNavigation();
  setupThemeToggle();
  setupExpenseModal();
  setupInstallmentModal();
  setupCardModal();
  setupIncomeModal();
  setupProfileAvatar();
  setupGoalModal();
  setupNotificationsModal();
  setupAccountSection(session);
  setupToggleGroupAria();
  setupModalAccessibility();
  setupReportModal();
  setupUnsavedChangesGuard();
}

/**
 * Torna os modais do app (despesa, parcelamento, cartão, renda, meta,
 * confirmação, notificações e comprovante ampliado) utilizáveis por teclado
 * e leitor de tela, sem precisar duplicar essa lógica em cada tela que abre
 * um modal:
 * - Esc fecha o modal no topo, pelo mesmo botão de fechar/cancelar que um
 *   clique de mouse usaria (preserva a limpeza de estado que cada
 *   closeForm()/confirmDialog() já faz).
 * - Tab/Shift+Tab prendem o foco dentro do modal ativo (focus trap).
 * - Ao abrir, o foco vai para o primeiro elemento focável do modal; ao
 *   fechar, volta pro elemento que tinha o foco antes (geralmente o botão
 *   que abriu o modal).
 */
function setupModalAccessibility() {
  let lastFocused = null;

  function getFocusable(modal) {
    return Array.from(modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )).filter((el) => !el.disabled && el.offsetParent !== null);
  }

  // Em telas com mais de um modal ativo ao mesmo tempo (ex.: confirmação de
  // limite de renda aberta por cima do formulário de despesa), o de cima
  // visualmente é sempre o último no DOM entre os que estão .active.
  function getTopActiveModal() {
    const modals = document.querySelectorAll('.modal-overlay.active');
    return modals.length ? modals[modals.length - 1] : null;
  }

  function getDismissButton(modal) {
    if (modal.id === 'confirm-modal') {
      const cancelBtn = document.getElementById('confirm-modal-cancel');
      if (cancelBtn && cancelBtn.offsetParent !== null) return cancelBtn;
      return document.getElementById('confirm-modal-confirm');
    }
    return modal.querySelector('[id$="-close-btn"]');
  }

  document.querySelectorAll('.modal-overlay').forEach((modal) => {
    modal.setAttribute('role', modal.getAttribute('role') || 'dialog');
    modal.setAttribute('aria-modal', 'true');
  });

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      if (m.attributeName !== 'class') return;
      const modal = m.target;
      if (modal.classList.contains('active')) {
        lastFocused = document.activeElement;
        const focusable = getFocusable(modal);
        if (focusable.length) focusable[0].focus();
      } else if (lastFocused && typeof lastFocused.focus === 'function') {
        lastFocused.focus();
        lastFocused = null;
      }
    });
  });
  document.querySelectorAll('.modal-overlay').forEach((modal) => observer.observe(modal, { attributes: true }));

  document.addEventListener('keydown', (e) => {
    const modal = getTopActiveModal();
    if (!modal) return;

    if (e.key === 'Escape') {
      const dismissBtn = getDismissButton(modal);
      if (dismissBtn) dismissBtn.click();
      else modal.classList.remove('active');
      return;
    }

    if (e.key === 'Tab') {
      const focusable = getFocusable(modal);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
}

/**
 * Os grupos de alternância (.segmented e .tabs — tipo de despesa, perfil de
 * investidor, abas de Contas etc.) já comunicam o estado selecionado
 * visualmente (classe .active), mas não para leitor de tela. Em vez de
 * duplicar essa lógica em cada handler espalhado pelos módulos, um único
 * listener delegado mantém aria-pressed sincronizado com .active sempre que
 * alguém clica em um botão desses grupos.
 */
function syncToggleGroupAria() {
  document.querySelectorAll('.segmented button, .tabs button').forEach((btn) => {
    btn.setAttribute('aria-pressed', btn.classList.contains('active') ? 'true' : 'false');
  });
}
function setupToggleGroupAria() {
  syncToggleGroupAria();
  document.addEventListener('click', (e) => {
    if (e.target.closest('.segmented button, .tabs button')) {
      setTimeout(syncToggleGroupAria, 0);
    }
  });
}

/** Central de notificações (sino no header) — mesmo conteúdo dos lembretes da sidebar, só que acessível em qualquer tamanho de tela. */
function setupNotificationsModal() {
  const bellBtn = document.getElementById('notif-bell-btn');
  if (bellBtn) bellBtn.addEventListener('click', () => {
    document.getElementById('notifications-modal').classList.add('active');
  });
  const closeBtn = document.getElementById('notif-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', () => {
    document.getElementById('notifications-modal').classList.remove('active');
  });
}

function setupAccountSection(session) {
  const emailEl = document.getElementById('account-email');
  if (emailEl) emailEl.textContent = (session && session.user && session.user.email) || '—';

  bindLogoutButton(document.getElementById('account-logout-btn'), false);
  bindLogoutButton(document.getElementById('side-logout-btn'), true);
}

function bindLogoutButton(btn, askConfirmation) {
  if (!btn) return;
  btn.addEventListener('click', async () => {
    if (askConfirmation && !await confirmDialog('Tem certeza que quer sair da conta?', { title: 'Sair da conta', confirmLabel: 'Sair' })) return;
    btn.disabled = true;
    await supabaseClient.auth.signOut();
    window.location.href = 'login.html';
  });
}

/**
 * Re-renderiza todas as telas — usado no carregamento inicial e após
 * importar um backup. Cada view é renderizada isoladamente: se uma
 * falhar (ex.: um gráfico), as outras ainda renderizam e a navegação
 * continua funcionando normalmente.
 */
function renderAll() {
  const views = [
    ['Dashboard', () => Dashboard.render(appData)],
    ['Accounts', () => Accounts.render(appData)],
    ['Profile', () => Profile.render(appData)],
    ['Planning', () => Planning.render(appData)],
    ['Goals', () => Goals.render(appData)],
  ];
  views.forEach(([name, renderFn]) => {
    try {
      renderFn();
    } catch (err) {
      console.error(`Falha ao renderizar "${name}":`, err);
    }
  });
}

function setupGoalModal() {
  document.getElementById('goal-close-btn').addEventListener('click', () => Goals.closeForm());
  document.getElementById('goal-cancel-btn').addEventListener('click', () => Goals.closeForm());
  document.getElementById('goal-form').addEventListener('submit', (e) => Goals.submitForm(e));
}

function setupProfileAvatar() {
  const openProfile = () => navigateTo('perfil');
  const headerBtn = document.getElementById('header-avatar-btn');
  if (headerBtn) headerBtn.addEventListener('click', openProfile);
  const sideBtn = document.getElementById('side-avatar-btn');
  if (sideBtn) sideBtn.addEventListener('click', openProfile);
}

function setupExpenseModal() {
  const addBtn = document.getElementById('new-item-btn');
  if (addBtn) addBtn.addEventListener('click', () => {
    if (Accounts.currentTab === 'parcelamentos') {
      Installments.openForm(null);
    } else {
      Accounts.openForm('variavel', null);
    }
  });

  const quickAddBtn = document.querySelector('.nav-item.add-btn');
  if (quickAddBtn) quickAddBtn.addEventListener('click', () => {
    navigateTo('contas');
    Accounts.openForm('variavel', null);
  });

  document.getElementById('expense-close-btn').addEventListener('click', () => Accounts.closeForm());
  document.getElementById('expense-cancel-btn').addEventListener('click', () => Accounts.closeForm());
  document.getElementById('expense-form').addEventListener('submit', (e) => Accounts.submitForm(e));

  const typeToggle = document.getElementById('expense-type-toggle');
  typeToggle.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      typeToggle.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
      document.getElementById('expense-type').value = btn.dataset.type;
      document.getElementById('field-vencimento').style.display = btn.dataset.type === 'recorrente' ? 'block' : 'none';
    });
  });

  document.getElementById('receipt-close-btn').addEventListener('click', () => {
    document.getElementById('receipt-overlay').classList.remove('active');
  });
}

function setupReportModal() {
  const closeBtn = document.getElementById('report-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', () => Report.close());
}

function setupInstallmentModal() {
  document.getElementById('installment-close-btn').addEventListener('click', () => Installments.closeForm());
  document.getElementById('installment-cancel-btn').addEventListener('click', () => Installments.closeForm());
  document.getElementById('installment-form').addEventListener('submit', (e) => Installments.submitForm(e));
}

function setupCardModal() {
  document.getElementById('card-close-btn').addEventListener('click', () => Installments.closeCardForm());
  document.getElementById('card-cancel-btn').addEventListener('click', () => Installments.closeCardForm());
  document.getElementById('card-form').addEventListener('submit', (e) => Installments.submitCardForm(e));
}

function setupIncomeModal() {
  document.getElementById('income-close-btn').addEventListener('click', () => Income.closeForm());
  document.getElementById('income-cancel-btn').addEventListener('click', () => Income.closeForm());
  document.getElementById('income-form').addEventListener('submit', (e) => Income.submitForm(e));
}

function setupNavigation() {
  const navButtons = document.querySelectorAll('[data-nav-target]');
  navButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-nav-target');
      switchView(target);
      navButtons.forEach((b) => b.classList.toggle('active', b === btn || b.getAttribute('data-nav-target') === target));
    });
  });
}

function switchView(viewId) {
  document.querySelectorAll('section.view').forEach((section) => {
    section.classList.toggle('active', section.id === `view-${viewId}`);
  });
  try {
    if (viewId === 'dashboard') {
      Dashboard.render(appData);
    }
    if (viewId === 'contas') {
      Accounts._renderSummaryChart(appData);
    }
    if (viewId === 'analises') {
      Charts.render(appData);
    }
    if (viewId === 'planejamento') {
      Planning.render(appData);
      Goals.render(appData);
    }
  } catch (err) {
    console.error(`Falha ao renderizar a tela "${viewId}":`, err);
  }
}

/** Troca de tela pelo menu (switchView) e sincroniza o item ativo do menu — usado por qualquer link/botão fora do próprio menu que precise ir direto pra uma tela (ex.: avatar, "+ Nova despesa", "Ver mais"). */
function navigateTo(viewId) {
  switchView(viewId);
  document.querySelectorAll('[data-nav-target]').forEach((b) => b.classList.toggle('active', b.getAttribute('data-nav-target') === viewId));
}

function setupThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  const iconDark = btn.querySelector('.icon-theme-dark');
  const iconLight = btn.querySelector('.icon-theme-light');

  function updateIcon() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    iconDark.style.display = isDark ? 'none' : '';
    iconLight.style.display = isDark ? '' : 'none';
  }

  // O tema já foi aplicado por um script inline no <head> (evita piscar
  // claro antes de escurecer) — aqui só sincroniza o ícone com o estado atual.
  updateIcon();

  btn.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('financas_theme', 'light');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('financas_theme', 'dark');
    }
    updateIcon();

    // Gráficos SVG (sparklines, heatmap, hover do line chart) trocam de cor
    // conforme SimpleCharts.isDark() — sem isso, eles só atualizavam na
    // próxima navegação entre telas, não no próprio clique do tema.
    const activeView = document.querySelector('section.view.active');
    if (activeView && activeView.id === 'view-dashboard') Dashboard.render(appData);
    else if (activeView && activeView.id === 'view-analises') Charts.render(appData);
  });
}

/**
 * Storage.save() é chamado sem `await` em quase todo lugar do app (edição
 * fecha modal/atualiza a tela na hora, sem esperar a gravação no Supabase
 * terminar) — sem este aviso, fechar a aba logo depois de editar algo
 * cancelava a requisição de rede no meio e o dado nunca era salvo de
 * verdade, mesmo já aparecendo "salvo" na tela. Navegadores modernos
 * ignoram texto customizado aqui e mostram um prompt genérico próprio,
 * mas isso já é suficiente: enquanto o prompt está na tela, a aba continua
 * viva e a gravação em andamento tem tempo de terminar em segundo plano.
 */
function setupUnsavedChangesGuard() {
  window.addEventListener('beforeunload', (e) => {
    if (!Storage.isSaving()) return;
    e.preventDefault();
    e.returnValue = '';
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const session = await requireAuth();
  if (session) {
    document.documentElement.classList.add('authed');
    try {
      await initApp(session);
    } catch (e) {
      console.error('Falha ao iniciar o app.', e);
    }
  }
});
