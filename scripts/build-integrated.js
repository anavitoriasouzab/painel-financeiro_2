/**
 * build-integrated.js
 * -----------------------------------------------------------------------
 * Gera um único arquivo HTML autocontido (login + dashboard + todo o CSS/JS)
 * a partir dos arquivos-fonte reais do projeto, para o usuário usar em algo
 * específico fora do fluxo normal de desenvolvimento (Live Server com
 * arquivos separados). NÃO é o app "de verdade" — é um artefato derivado,
 * gerado sob demanda por este script. Rode de novo sempre que os arquivos-
 * fonte mudarem, em vez de editar o HTML gerado à mão.
 *
 * Uso: node scripts/build-integrated.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_PATH = path.join(ROOT, 'painel-financeiro-integrado.html');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function extractBody(html, endMarker) {
  const bodyOpenEnd = html.indexOf('>', html.indexOf('<body')) + 1;
  const endIdx = html.indexOf(endMarker, bodyOpenEnd);
  return html.slice(bodyOpenEnd, endIdx).trim();
}

// ---------------------------------------------------------------------
// 1) Conteúdo das duas telas (sem as tags <script> de módulo, que entram
//    uma única vez, em conjunto, mais abaixo)
// ---------------------------------------------------------------------
const loginHtml = read('login.html');
const indexHtml = read('index.html');

const SCRIPT_CDN_MARKER = '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

const loginBody = extractBody(loginHtml, SCRIPT_CDN_MARKER);
const dashboardBody = extractBody(indexHtml, SCRIPT_CDN_MARKER);

// ---------------------------------------------------------------------
// 2) CSS — style.css + auth.css, inline
// ---------------------------------------------------------------------
const styleCss = read('css/style.css');
const authCss = read('css/auth.css');

const routingCss = `
/* ---------------------------------------------------------------------
   Alternância login <-> dashboard (gerado por build-integrated.js) — no
   projeto de verdade isso é feito com dois arquivos HTML separados e
   window.location.href; aqui, como é um único arquivo, as duas telas
   ficam sempre no DOM e a classe "authed" na <html> decide qual aparece.
------------------------------------------------------------------------*/
#page-login { display: block; }
#page-dashboard { display: none; }
html.authed #page-login { display: none; }
html.authed #page-dashboard { display: block; }
/* Equivalente ao antigo body.auth-body (login não existe mais como <body>
   própria — agora é uma div dentro do mesmo body do dashboard). */
html:not(.authed) body { padding-bottom: 0; min-height: 100vh; }
`;

// ---------------------------------------------------------------------
// 3) JS — módulos na mesma ordem de dependência do index.html, com
//    pequenos ajustes em auth.js e app.js para trocar de tela sem navegar
//    para outro arquivo (window.location.href não faz sentido aqui).
// ---------------------------------------------------------------------
const jsModules = [
  'js/supabase-config.js',
  'js/simplecharts.js',
  'js/storage.js',
  'js/calculations.js',
  'js/dashboard.js',
  'js/accounts.js',
  'js/installments.js',
  'js/charts.js',
  'js/profile.js',
  'js/planning.js',
  'js/goals.js',
  'js/backup.js',
];

function mustReplace(content, from, to, label) {
  if (!content.includes(from)) {
    throw new Error(`Marcador não encontrado (${label}) — o arquivo-fonte mudou desde que este script foi escrito. Trecho esperado:\n${from}`);
  }
  return content.replace(from, to);
}

// --- js/auth.js -------------------------------------------------------
let authJs = read('js/auth.js');

authJs = mustReplace(authJs,
  `    this._bindEvents();

    // Se já existe sessão válida, pula direto pro app.
    const { data } = await supabaseClient.auth.getSession();
    if (data && data.session) {
      window.location.href = 'index.html';
    }
  },`,
  `    this._bindEvents();
    // No arquivo integrado, quem decide qual tela mostrar no carregamento
    // é o bootstrap único no fim do arquivo (checa a sessão uma vez só).
  },`,
  'auth.js: init() sem auto-redirect'
);

authJs = mustReplace(authJs,
  `  async _signIn(email, senha) {
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password: senha });
    if (error) {
      this._showMessage(this._translateError(error.message), 'error');
      return;
    }
    window.location.href = 'index.html';
  },`,
  `  async _signIn(email, senha) {
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password: senha });
    if (error) {
      this._showMessage(this._translateError(error.message), 'error');
      return;
    }
    await enterDashboard();
  },`,
  'auth.js: _signIn -> enterDashboard()'
);

authJs = mustReplace(authJs,
  `    if (data && data.session) {
      // Confirmação de e-mail desativada no projeto — já entra direto.
      window.location.href = 'index.html';
      return;
    }`,
  `    if (data && data.session) {
      // Confirmação de e-mail desativada no projeto — já entra direto.
      await enterDashboard();
      return;
    }`,
  'auth.js: _signUp -> enterDashboard()'
);

authJs = mustReplace(authJs,
  `      const redirectTo = window.location.origin + window.location.pathname.replace(/login\\.html$/, 'index.html');`,
  `      // Arquivo único: login e dashboard são a mesma página, então o
      // redirect do OAuth aponta pra ela mesma (sem trocar de arquivo).
      const redirectTo = window.location.origin + window.location.pathname;`,
  'auth.js: _handleGoogleAuth redirectTo'
);

authJs = mustReplace(authJs,
  `document.addEventListener('DOMContentLoaded', () => AuthPage.init());`,
  `// Bootstrap unificado no fim do arquivo cuida de chamar AuthPage.init().`,
  'auth.js: remover DOMContentLoaded próprio'
);

// --- js/app.js ----------------------------------------------------------
let appJs = read('js/app.js');

appJs = mustReplace(appJs,
  `async function requireAuth() {
  const { data } = await supabaseClient.auth.getSession();
  if (!data || !data.session) {
    window.location.href = 'login.html';
    return null;
  }
  return data.session;
}`,
  `async function requireAuth() {
  const { data } = await supabaseClient.auth.getSession();
  if (!data || !data.session) {
    return null;
  }
  return data.session;
}`,
  'app.js: requireAuth() sem redirect'
);

appJs = mustReplace(appJs,
  `async function initApp(session) {`,
  `/** Chamado pelo login/cadastro (js/auth.js) pra trocar de tela sem navegar pra outro arquivo. */
async function enterDashboard() {
  const { data } = await supabaseClient.auth.getSession();
  if (!data || !data.session) return;
  document.documentElement.classList.add('authed');
  try {
    await initApp(data.session);
  } catch (e) {
    console.error('Falha ao iniciar o app.', e);
  }
}

async function initApp(session) {`,
  'app.js: inserir enterDashboard()'
);

appJs = mustReplace(appJs,
  `function bindLogoutButton(btn, askConfirmation) {
  if (!btn) return;
  btn.addEventListener('click', async () => {
    if (askConfirmation && !await confirmDialog('Tem certeza que quer sair da conta?', { title: 'Sair da conta', confirmLabel: 'Sair' })) return;
    btn.disabled = true;
    await supabaseClient.auth.signOut();
    window.location.href = 'login.html';
  });
}`,
  `function bindLogoutButton(btn, askConfirmation) {
  if (!btn) return;
  btn.addEventListener('click', async () => {
    if (askConfirmation && !await confirmDialog('Tem certeza que quer sair da conta?', { title: 'Sair da conta', confirmLabel: 'Sair' })) return;
    btn.disabled = true;
    await supabaseClient.auth.signOut();
    appData = null;
    document.documentElement.classList.remove('authed');
    if (typeof AuthPage !== 'undefined') AuthPage.setMode('login');
    btn.disabled = false;
  });
}`,
  'app.js: bindLogoutButton -> showPage(login)'
);

appJs = mustReplace(appJs,
  `document.addEventListener('DOMContentLoaded', async () => {
  const session = await requireAuth();
  if (session) {
    document.documentElement.classList.add('authed');
    try {
      await initApp(session);
    } catch (e) {
      console.error('Falha ao iniciar o app.', e);
    }
  }
});`,
  `// Bootstrap unificado no fim do arquivo substitui este listener.`,
  'app.js: remover DOMContentLoaded próprio'
);

const unifiedBootstrap = `
/**
 * Bootstrap único do arquivo integrado — substitui os dois
 * "DOMContentLoaded" que existiam em auth.js e app.js quando eram
 * páginas separadas. Roda a inicialização da tela de login (liga os
 * eventos do formulário) e, em seguida, decide se mostra login ou
 * dashboard checando a sessão do Supabase uma única vez.
 */
document.addEventListener('DOMContentLoaded', async () => {
  AuthPage.init();
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
`;

// ---------------------------------------------------------------------
// 4) Monta o arquivo final
// ---------------------------------------------------------------------
const scriptBlocks = [];
scriptBlocks.push(`<script>\n${read('js/supabase-config.js')}\n</script>`);
scriptBlocks.push(`<script>\n${read('js/simplecharts.js')}\n</script>`);
scriptBlocks.push(`<script>\n${read('js/storage.js')}\n</script>`);
scriptBlocks.push(`<script>\n${read('js/calculations.js')}\n</script>`);
scriptBlocks.push(`<script>\n${read('js/dashboard.js')}\n</script>`);
scriptBlocks.push(`<script>\n${read('js/accounts.js')}\n</script>`);
scriptBlocks.push(`<script>\n${read('js/installments.js')}\n</script>`);
scriptBlocks.push(`<script>\n${read('js/charts.js')}\n</script>`);
scriptBlocks.push(`<script>\n${read('js/profile.js')}\n</script>`);
scriptBlocks.push(`<script>\n${read('js/planning.js')}\n</script>`);
scriptBlocks.push(`<script>\n${read('js/goals.js')}\n</script>`);
scriptBlocks.push(`<script>\n${read('js/backup.js')}\n</script>`);
scriptBlocks.push(`<script>\n${authJs}\n</script>`);
scriptBlocks.push(`<script>\n${appJs}\n</script>`);
scriptBlocks.push(`<script>\n${unifiedBootstrap}\n</script>`);

const output = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<title>Meu Painel Financeiro</title>
<script>
  // Aplica o tema antes do primeiro paint, pra não piscar claro e depois escurecer.
  // Dark é o padrão do app — só fica claro se a pessoa escolheu isso explicitamente.
  if (localStorage.getItem('financas_theme') !== 'light') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
/* ============================== style.css ============================== */
${styleCss}

/* ============================== auth.css ================================ */
${authCss}
${routingCss}
</style>
</head>
<body>

<div id="page-login" class="auth-body">
${loginBody}
</div>

<div id="page-dashboard">
${dashboardBody}
</div>

<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
${scriptBlocks.join('\n')}
</body>
</html>
`;

fs.writeFileSync(OUT_PATH, output, 'utf8');
console.log(`Gerado: ${OUT_PATH} (${(output.length / 1024).toFixed(0)} KB)`);
