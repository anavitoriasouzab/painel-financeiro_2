/**
 * voice-expense.js
 * -----------------------------------------------------------------------
 * Adicionar despesa variável por voz, na aba Contas ("gastei 40 reais em
 * uber"): grava com a Web Speech API do navegador, tenta reconhecer valor
 * e categoria com um dicionário de palavras-chave (sem IA, sem custo, sem
 * backend novo — versão "grátis" discutida com a usuária) e abre o
 * formulário já preenchido pra ela conferir e salvar. Nunca salva sozinho.
 *
 * Só funciona no Chrome/Edge (webkitSpeechRecognition) — Firefox e Safari
 * não suportam ou suportam mal; ver isSupported().
 */

/** Palavras-chave → nome sugerido + categoria (bate contra appData.categorias
    na hora de preencher; se a categoria não existir na lista da usuária, só
    o nome é preenchido e ela escolhe a categoria manualmente). */
const VOICE_EXPENSE_KEYWORDS = [
  { terms: ['uber', '99', 'taxi', 'táxi'], nome: 'Uber', categoria: 'Transporte' },
  { terms: ['gasolina', 'combustível', 'combustivel', 'posto', 'álcool', 'etanol'], nome: 'Combustível', categoria: 'Transporte' },
  { terms: ['ônibus', 'onibus', 'metrô', 'metro', 'passagem', 'bilhete único', 'bilhete unico'], nome: 'Transporte público', categoria: 'Transporte' },
  { terms: ['mercado', 'supermercado', 'feira', 'hortifruti'], nome: 'Mercado', categoria: 'Alimentação' },
  { terms: ['ifood', 'restaurante', 'lanche', 'almoço', 'almoco', 'jantar', 'padaria'], nome: 'Alimentação', categoria: 'Alimentação' },
  { terms: ['farmácia', 'farmacia', 'remédio', 'remedio'], nome: 'Farmácia', categoria: 'Saúde' },
  { terms: ['cinema', 'streaming', 'netflix', 'show', 'balada'], nome: 'Lazer', categoria: 'Lazer' },
  { terms: ['luz', 'energia', 'água', 'agua', 'internet', 'telefone', 'celular'], nome: 'Contas', categoria: 'Contas' },
];

/** Palavras de encheção descartadas ao tentar adivinhar um nome quando
    nenhuma palavra-chave do dicionário acima bate com a fala. */
const VOICE_EXPENSE_STOPWORDS = [
  'oi', 'olá', 'ola', 'gastei', 'paguei', 'comprei', 'gasto', 'de', 'em', 'no', 'na',
  'nos', 'nas', 'com', 'reais', 'real', 'r\\$', 'hoje', 'ontem', 'agora', 'acabei', 'e',
];

const VoiceExpense = {
  recognition: null,
  finalTranscript: null,

  isSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  },

  toggle() {
    if (this.recognition) {
      this.cancel();
      return;
    }
    this.start();
  },

  /** Cancela a escuta sem processar nada (botão "Cancelar" do popup, ou
      clicar de novo no mic pra desistir). */
  cancel() {
    if (this.recognition) {
      this.finalTranscript = null;
      this.recognition.abort();
    }
  },

  start() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert('Reconhecimento de voz não é suportado neste navegador. Funciona no Chrome e no Edge.');
      return;
    }

    this.finalTranscript = null;
    this._showListeningPopup();

    const btn = document.getElementById('voice-expense-btn');
    const recognition = new SR();
    recognition.lang = 'pt-BR';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => { if (btn) btn.classList.add('is-listening'); };
    recognition.onend = () => {
      if (btn) btn.classList.remove('is-listening');
      this.recognition = null;
      this._hideListeningPopup();
      // Com continuous=false, o navegador encerra sozinho depois do
      // primeiro resultado final — é aqui, não no onresult, que seguimos
      // pro formulário (assim cancel()/abort() nunca dispara isso).
      if (this.finalTranscript) {
        const transcript = this.finalTranscript;
        this.finalTranscript = null;
        this._handleTranscript(transcript);
      }
    };
    recognition.onerror = (evt) => {
      if (btn) btn.classList.remove('is-listening');
      this.recognition = null;
      this._hideListeningPopup();
      // 'no-speech' e 'aborted' são comuns (silêncio, ou cancelou no popup)
      // — não vale interromper com um alerta por isso.
      if (evt.error === 'no-speech' || evt.error === 'aborted') return;
      if (evt.error === 'not-allowed' || evt.error === 'service-not-allowed') {
        alert('Não consegui acessar o microfone. Verifique a permissão do navegador para este site.');
        return;
      }
      alert('Não consegui entender. Tenta de novo ou preenche manualmente.');
    };
    recognition.onresult = (evt) => {
      let interim = '';
      let final = '';
      for (let i = evt.resultIndex; i < evt.results.length; i++) {
        const chunk = evt.results[i][0].transcript;
        if (evt.results[i].isFinal) final += chunk;
        else interim += chunk;
      }
      if (final) this.finalTranscript = final;
      this._updateListeningTranscript(final || interim);
    };

    this.recognition = recognition;
    recognition.start();
  },

  _showListeningPopup() {
    const modal = document.getElementById('voice-listening-modal');
    const transcriptEl = document.getElementById('voice-listening-transcript');
    if (transcriptEl) {
      transcriptEl.textContent = 'Diga algo como "gastei 40 reais em uber"';
      transcriptEl.classList.remove('has-text');
    }
    if (modal) modal.classList.add('active');
  },

  _hideListeningPopup() {
    const modal = document.getElementById('voice-listening-modal');
    if (modal) modal.classList.remove('active');
  },

  _updateListeningTranscript(text) {
    const transcriptEl = document.getElementById('voice-listening-transcript');
    if (!transcriptEl || !text) return;
    transcriptEl.textContent = text;
    transcriptEl.classList.add('has-text');
  },

  /** Preenche o formulário de despesa (já existente, ver Accounts.openForm)
      com o que foi entendido — nunca salva sozinho, só deixa pronto pra
      conferência. */
  _handleTranscript(transcript) {
    const parsed = this._parse(transcript);

    Accounts.openForm('variavel', null);

    if (parsed.valor != null) document.getElementById('expense-valor').value = parsed.valor;
    if (parsed.nome) document.getElementById('expense-nome').value = parsed.nome;
    if (parsed.categoria) {
      const select = document.getElementById('expense-categoria');
      const match = Array.from(select.options).find((o) => o.value.toLowerCase() === parsed.categoria.toLowerCase());
      if (match) select.value = match.value;
    }

    const hint = document.getElementById('expense-voice-hint');
    if (hint) {
      hint.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">mic</span><span>Reconhecido por voz: “${escapeHtml(transcript)}”. Confira os campos antes de salvar.</span>`;
      hint.style.display = 'flex';
    }
  },

  _parse(text) {
    const lower = text.toLowerCase();

    // Valor: primeiro número da frase (aceita vírgula ou ponto decimal).
    const valorMatch = lower.match(/(\d+(?:[.,]\d{1,2})?)/);
    const valor = valorMatch ? parseFloat(valorMatch[1].replace(',', '.')) : null;

    const found = VOICE_EXPENSE_KEYWORDS.find((k) => k.terms.some((t) => lower.includes(t)));
    if (found) return { valor, nome: found.nome, categoria: found.categoria };

    return { valor, nome: this._guessNome(lower, valorMatch), categoria: null };
  },

  /** Sem palavra-chave conhecida: usa a própria frase como nome, removendo
      o trecho do valor e as palavras de encheção mais comuns. Resultado
      imperfeito por natureza — é por isso que o formulário sempre abre pra
      conferência em vez de salvar direto. */
  _guessNome(lower, valorMatch) {
    let t = valorMatch ? lower.replace(valorMatch[0], ' ') : lower;
    VOICE_EXPENSE_STOPWORDS.forEach((w) => {
      t = t.replace(new RegExp(`\\b${w}\\b`, 'g'), ' ');
    });
    t = t.replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
  },
};
