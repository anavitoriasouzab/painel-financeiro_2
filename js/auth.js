/**
 * auth.js
 * -----------------------------------------------------------------------
 * Lógica da tela de login/criação de conta (login.html), usando Supabase
 * Auth (e-mail + senha). Ver js/supabase-config.js para a config do cliente.
 */

const AuthPage = {
  mode: 'login', // 'login' | 'signup'

  els: {},

  async init() {
    this.els = {
      toggle: document.getElementById('auth-mode-toggle'),
      title: document.getElementById('auth-title'),
      lede: document.getElementById('auth-lede'),
      form: document.getElementById('auth-form'),
      fieldNome: document.getElementById('field-nome'),
      nome: document.getElementById('auth-nome'),
      email: document.getElementById('auth-email'),
      senha: document.getElementById('auth-senha'),
      submitBtn: document.getElementById('auth-submit-btn'),
      submitLabel: document.getElementById('auth-submit-label'),
      message: document.getElementById('auth-message'),
      switchLine: document.getElementById('auth-switch-line'),
      switchLink: document.getElementById('auth-switch-link'),
      forgotLink: document.getElementById('auth-forgot-link'),
      toggleSenhaBtn: document.getElementById('auth-toggle-senha'),
      googleBtn: document.getElementById('auth-google-btn'),
      googleLabel: document.getElementById('auth-google-label'),
    };

    this._bindEvents();

    // Se já existe sessão válida, pula direto pro app.
    const { data } = await supabaseClient.auth.getSession();
    if (data && data.session) {
      window.location.href = 'index.html';
    }
  },

  _bindEvents() {
    this.els.toggle.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => this.setMode(btn.dataset.mode));
    });
    this.els.switchLink.addEventListener('click', () => {
      this.setMode(this.mode === 'login' ? 'signup' : 'login');
    });
    this.els.toggleSenhaBtn.addEventListener('click', () => this._toggleSenhaVisibility());
    this.els.forgotLink.addEventListener('click', () => this._handleForgotPassword());
    this.els.form.addEventListener('submit', (e) => this._handleSubmit(e));
    this.els.googleBtn.addEventListener('click', () => this._handleGoogleAuth());
  },

  setMode(mode) {
    this.mode = mode;
    this.els.toggle.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    this._clearMessage();

    if (mode === 'signup') {
      this.els.title.textContent = 'Criar sua conta';
      this.els.lede.textContent = 'Leva menos de um minuto — só e-mail e senha.';
      this.els.fieldNome.style.display = 'flex';
      this.els.senha.setAttribute('autocomplete', 'new-password');
      this.els.senha.setAttribute('placeholder', 'Crie uma senha (mín. 6 caracteres)');
      this.els.submitLabel.textContent = 'Criar conta';
      this.els.switchLine.innerHTML = 'Já tem conta? <button type="button" class="auth-link" id="auth-switch-link">Entrar</button>';
    } else {
      this.els.title.textContent = 'Bem-vindo(a) de volta';
      this.els.lede.textContent = 'Entre com seu e-mail para acessar seu painel.';
      this.els.fieldNome.style.display = 'none';
      this.els.senha.setAttribute('autocomplete', 'current-password');
      this.els.senha.setAttribute('placeholder', '••••••••');
      this.els.submitLabel.textContent = 'Entrar';
      this.els.switchLine.innerHTML = 'Ainda não tem conta? <button type="button" class="auth-link" id="auth-switch-link">Criar conta</button>';
    }

    // O botão de troca é recriado via innerHTML acima — precisa rebindar.
    this.els.switchLink = document.getElementById('auth-switch-link');
    this.els.switchLink.addEventListener('click', () => this.setMode(this.mode === 'login' ? 'signup' : 'login'));
  },

  _toggleSenhaVisibility() {
    const input = this.els.senha;
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    this.els.toggleSenhaBtn.querySelector('.icon-eye-open').style.display = isPassword ? 'none' : '';
    this.els.toggleSenhaBtn.querySelector('.icon-eye-closed').style.display = isPassword ? '' : 'none';
  },

  _showMessage(text, type) {
    const el = this.els.message;
    el.textContent = text;
    el.className = `auth-message show ${type}`;
  },

  _clearMessage() {
    const el = this.els.message;
    el.textContent = '';
    el.className = 'auth-message';
  },

  _setLoading(isLoading) {
    this.els.submitBtn.classList.toggle('loading', isLoading);
    this.els.submitBtn.disabled = isLoading;
  },

  _translateError(message) {
    const map = {
      'Invalid login credentials': 'E-mail ou senha incorretos.',
      'User already registered': 'Esse e-mail já tem uma conta cadastrada — tente entrar.',
      'Email not confirmed': 'Confirme seu e-mail antes de entrar (verifique sua caixa de entrada).',
      'Password should be at least 6 characters': 'A senha precisa ter pelo menos 6 caracteres.',
      'Unable to validate email address: invalid format': 'Esse e-mail não parece válido.',
      'email rate limit exceeded': 'Limite de e-mails atingido — aguarde alguns minutos e tente de novo.',
      'For security purposes, you can only request this after 60 seconds.': 'Por segurança, espere um minuto antes de tentar de novo.',
      'Unsupported provider: provider is not enabled': 'Login com Google ainda não está disponível — é preciso ativar o provedor Google no painel do Supabase.',
    };
    return map[message] || 'Não foi possível concluir. Tente novamente em instantes.';
  },

  async _handleSubmit(e) {
    e.preventDefault();
    this._clearMessage();

    const email = this.els.email.value.trim();
    const senha = this.els.senha.value;

    if (!email || !senha) {
      this._showMessage('Preencha e-mail e senha.', 'error');
      return;
    }
    if (senha.length < 6) {
      this._showMessage('A senha precisa ter pelo menos 6 caracteres.', 'error');
      return;
    }

    this._setLoading(true);
    try {
      if (this.mode === 'signup') {
        await this._signUp(email, senha);
      } else {
        await this._signIn(email, senha);
      }
    } finally {
      this._setLoading(false);
    }
  },

  async _signIn(email, senha) {
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password: senha });
    if (error) {
      this._showMessage(this._translateError(error.message), 'error');
      return;
    }
    window.location.href = 'index.html';
  },

  async _signUp(email, senha) {
    const nome = this.els.nome.value.trim();
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password: senha,
      options: { data: nome ? { nome } : {} },
    });
    if (error) {
      this._showMessage(this._translateError(error.message), 'error');
      return;
    }
    if (data && data.session) {
      // Só cai aqui se "Confirm email" estiver desativado no painel do
      // Supabase (Authentication → Sign In / Providers → Email) — nesse
      // caso o signUp já devolve sessão e entra direto, sem esperar e-mail.
      window.location.href = 'index.html';
      return;
    }
    this._showMessage('Conta criada! Confira seu e-mail para confirmar o cadastro antes de entrar.', 'success');
    this.setMode('login');
    this.els.email.value = email;
  },

  /** Login/cadastro com Google via OAuth do Supabase — mesma ação serve para entrar e criar conta (a conta é criada automaticamente no primeiro acesso). */
  async _handleGoogleAuth() {
    this._clearMessage();
    this.els.googleBtn.disabled = true;
    const originalLabel = this.els.googleLabel.textContent;
    this.els.googleLabel.textContent = 'Redirecionando...';
    try {
      const redirectTo = window.location.origin + window.location.pathname.replace(/login\.html$/, 'index.html');
      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      });
      if (error) {
        this._showMessage(this._translateError(error.message), 'error');
        this.els.googleBtn.disabled = false;
        this.els.googleLabel.textContent = originalLabel;
      }
      // Em caso de sucesso o navegador é redirecionado pro Google — nada mais a fazer aqui.
    } catch (e) {
      this._showMessage('Não foi possível iniciar o login com Google. Tente novamente.', 'error');
      this.els.googleBtn.disabled = false;
      this.els.googleLabel.textContent = originalLabel;
    }
  },

  async _handleForgotPassword() {
    this._clearMessage();
    const email = this.els.email.value.trim();
    if (!email) {
      this._showMessage('Digite seu e-mail no campo acima e clique em "Esqueci minha senha" de novo.', 'error');
      this.els.email.focus();
      return;
    }
    this._setLoading(true);
    try {
      const redirectTo = window.location.origin + window.location.pathname.replace(/login\.html$/, 'login.html');
      const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) {
        this._showMessage(this._translateError(error.message), 'error');
        return;
      }
      this._showMessage('Enviamos um link de redefinição de senha para seu e-mail.', 'success');
    } finally {
      this._setLoading(false);
    }
  },
};

document.addEventListener('DOMContentLoaded', () => AuthPage.init());
