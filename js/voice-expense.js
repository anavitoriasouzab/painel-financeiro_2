/**
 * voice-expense.js
 * -----------------------------------------------------------------------
 * Adicionar despesa variável por voz ("gastei 40 reais em uber"): grava com
 * a Web Speech API do navegador, tenta reconhecer valor e categoria com um
 * dicionário de palavras-chave (sem IA, sem custo, sem backend novo — versão
 * "grátis" discutida com a usuária) e abre o formulário já preenchido pra ela
 * conferir e salvar. Nunca salva sozinho.
 *
 * Pontos de entrada: qualquer botão com [data-voice-trigger] (a barra "Fale
 * um gasto" no topo do Dashboard no celular, o ícone no cabeçalho no
 * desktop e o botão ao lado de "+ Nova despesa" em Contas) — ver
 * setupVoiceExpense em app.js. Todos mostram o mesmo estado de "ouvindo".
 *
 * Funciona onde houver SpeechRecognition (Chrome, Edge, Safari recente); sem
 * suporte os botões nem aparecem (ver isSupported()). O reconhecimento roda
 * no servidor do navegador, então precisa de internet.
 */

/** Palavras-chave → nome sugerido + categoria (bate contra appData.categorias
    na hora de preencher; se a categoria não existir na lista da usuária, o
    formulário pede pra escolher em vez de deixar uma qualquer selecionada).
    `nome` só existe quando o termo falado não serve de nome por si só
    (ex.: "99" → "Corrida 99"); fora isso o nome é o próprio termo falado —
    "padaria" vira "Padaria", não o nome genérico da categoria. */
const VOICE_EXPENSE_KEYWORDS = [
  { terms: ['uber', 'táxi', 'taxi'], categoria: 'Transporte' },
  { terms: ['99'], nome: 'Corrida 99', categoria: 'Transporte' },
  { terms: ['gasolina', 'combustível', 'combustivel', 'posto', 'etanol'], nome: 'Combustível', categoria: 'Transporte' },
  { terms: ['ônibus', 'onibus', 'metrô', 'metro', 'passagem', 'bilhete único', 'bilhete unico'], categoria: 'Transporte' },
  { terms: ['supermercado', 'mercado', 'feira', 'hortifruti'], categoria: 'Alimentação' },
  { terms: ['ifood'], nome: 'iFood', categoria: 'Alimentação' },
  { terms: ['restaurante', 'lanche', 'almoço', 'almoco', 'jantar', 'padaria'], categoria: 'Alimentação' },
  { terms: ['farmácia', 'farmacia', 'remédio', 'remedio'], categoria: 'Saúde' },
  { terms: ['cinema', 'streaming', 'netflix', 'show', 'balada'], categoria: 'Lazer' },
  // "água" sozinha pegava "água de coco"; só conta de água é conta.
  { terms: ['conta de luz', 'conta de água', 'conta de agua', 'luz', 'energia', 'internet', 'telefone', 'celular'], categoria: 'Contas' },
];

/** Palavras de encheção descartadas ao tentar adivinhar um nome quando
    nenhuma palavra-chave do dicionário acima bate com a fala. */
const VOICE_EXPENSE_STOPWORDS = [
  'oi', 'olá', 'ola', 'gastei', 'paguei', 'comprei', 'gasto', 'de', 'do', 'da', 'em', 'no', 'na',
  'nos', 'nas', 'com', 'o', 'a', 'um', 'uma', 'por', 'reais', 'real', 'r\\$', 'hoje', 'ontem',
  'agora', 'acabei', 'e', 'mil', 'centavos',
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

  /** Cancela a escuta sem processar nada (Cancelar/Esc no popup, ou tocar
      de novo no mic pra desistir). */
  cancel() {
    if (this.recognition) {
      this.finalTranscript = null;
      this.recognition.abort();
    }
  },

  _setListening(on) {
    document.querySelectorAll('[data-voice-trigger]').forEach((b) => {
      b.classList.toggle('is-listening', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  },

  start() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      toast('Lançar por voz não funciona neste navegador. Use o Chrome, o Edge ou o Safari.');
      return;
    }

    this.finalTranscript = null;
    this._showListeningPopup();

    const recognition = new SR();
    recognition.lang = 'pt-BR';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => this._setListening(true);
    recognition.onend = () => {
      this._setListening(false);
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
      this._setListening(false);
      this.recognition = null;
      this._hideListeningPopup();
      // Mensagens no próprio app (toast / popup), nunca alert() nativo:
      // ele trava a tela e no app instalado sai fora do visual.
      if (evt.error === 'aborted') return; // a própria pessoa cancelou
      if (evt.error === 'no-speech') {
        // Antes era silencioso: o popup sumia e ninguém sabia por quê.
        toast('Não ouvi nada. Toque no microfone e fale de novo.');
        return;
      }
      if (evt.error === 'not-allowed' || evt.error === 'service-not-allowed') {
        confirmDialog(
          'O navegador não deixou o app usar o microfone. Libere a permissão de microfone para este site nas configurações do navegador e tente de novo.',
          { title: 'Microfone bloqueado', showCancel: false, confirmLabel: 'Entendi' },
        );
        return;
      }
      if (evt.error === 'network') {
        toast('O reconhecimento de voz precisa de internet. Confira a conexão.');
        return;
      }
      toast('Não consegui entender. Tente de novo ou preencha à mão.');
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

    const select = document.getElementById('expense-categoria');
    const match = parsed.categoria
      ? Array.from(select.options).find((o) => o.value.toLowerCase() === parsed.categoria.toLowerCase())
      : null;
    if (match) {
      select.value = match.value;
    } else {
      // Sem categoria reconhecida (ou ela não existe na lista da pessoa): o
      // formulário abria com a 1ª categoria da lista já marcada, sem aviso —
      // "academia" virava "Alimentação". Agora fica em branco e o salvar
      // (select required) só passa depois de escolher.
      const vazio = document.createElement('option');
      vazio.value = '';
      vazio.textContent = 'Escolha a categoria';
      vazio.disabled = true;
      select.insertBefore(vazio, select.firstChild);
      select.value = '';
    }
    // dataset.anterior: é pra onde o cancelar do pop-up de nova categoria
    // volta (ver Accounts.handleCategoriaChange).
    select.dataset.anterior = select.value;

    const avisos = [];
    if (parsed.valor == null) avisos.push('não entendi o valor');
    if (!match) avisos.push('escolha a categoria');
    const hint = document.getElementById('expense-voice-hint');
    if (hint) {
      hint.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">mic</span><span>Reconhecido por voz: “${escapeHtml(transcript)}”. ${avisos.length ? `<strong>Falta conferir: ${escapeHtml(avisos.join(' e '))}.</strong>` : 'Confira os campos antes de salvar.'}</span>`;
      hint.style.display = 'flex';
    }
  },

  /**
   * Valor falado, no formato que o reconhecimento em pt-BR devolve: "40",
   * "12,50", "1.250" (ponto de MILHAR — antes virava 1,25), "1.250,90",
   * "2 mil", "2 mil e 300", "1,5 mil", "mil reais". Devolve também o trecho
   * casado, pra tirá-lo do texto antes de procurar palavras-chave (senão o
   * "99" de "199,90" virava corrida de 99).
   */
  _parseValor(lower) {
    const NUM = '\\d{1,3}(?:\\.\\d{3})+(?:,\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?';
    const toNumber = (s) => {
      // "1.250" / "1.250,90": ponto de milhar. "12.50": ponto decimal (2 casas).
      if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) return parseFloat(s.replace(/\./g, '').replace(',', '.'));
      return parseFloat(s.replace(',', '.'));
    };
    const mil = lower.match(new RegExp(`(${NUM})?\\s*\\bmil\\b(?:\\s*(?:e\\s*)?(${NUM}))?`));
    if (mil && (mil[1] || /(^|\s)mil\b/.test(lower))) {
      const base = mil[1] ? toNumber(mil[1]) : 1;
      const resto = mil[2] ? toNumber(mil[2]) : 0;
      return { valor: Math.round((base * 1000 + resto) * 100) / 100, trecho: mil[0] };
    }
    const m = lower.match(new RegExp(`(?:r\\$\\s*)?(${NUM})`));
    if (!m) return { valor: null, trecho: null };
    return { valor: toNumber(m[1]), trecho: m[0] };
  },

  _parse(text) {
    const lower = text.toLowerCase();
    const { valor, trecho } = this._parseValor(lower);
    const semValor = trecho ? lower.replace(trecho, ' ') : lower;

    // Palavra inteira, não pedaço: "99" não casa dentro de "199", "luz" não
    // casa dentro de "reluz". \p{L} cobre letras acentuadas.
    const temTermo = (t) => new RegExp(`(^|[^\\p{L}\\d])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\d])`, 'u').test(semValor);
    for (const k of VOICE_EXPENSE_KEYWORDS) {
      const termo = k.terms.find(temTermo);
      if (termo) {
        const nome = k.nome || termo.charAt(0).toUpperCase() + termo.slice(1);
        return { valor, nome, categoria: k.categoria };
      }
    }
    return { valor, nome: this._guessNome(semValor), categoria: null };
  },

  /** Sem palavra-chave conhecida: usa a própria frase como nome, removendo
      o valor e as palavras de encheção mais comuns. Resultado imperfeito
      por natureza — é por isso que o formulário sempre abre pra conferência
      em vez de salvar direto. */
  _guessNome(semValor) {
    let t = semValor;
    VOICE_EXPENSE_STOPWORDS.forEach((w) => {
      t = t.replace(new RegExp(`(^|\\s)${w}(?=\\s|$)`, 'g'), ' ');
    });
    t = t.replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
  },
};
