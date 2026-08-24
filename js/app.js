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
  const openProfile = () => {
    switchView('perfil');
    document.querySelectorAll('[data-nav-target]').forEach((b) => b.classList.toggle('active', b.getAttribute('data-nav-target') === 'perfil'));
  };
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
    switchView('contas');
    document.querySelectorAll('[data-nav-target]').forEach((b) => b.classList.toggle('active', b.getAttribute('data-nav-target') === 'contas'));
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
