/**
 * accounts.js
 * -----------------------------------------------------------------------
 * Tela "Contas" (Fase 2): CRUD de despesas recorrentes e variáveis,
 * categorias personalizadas, status (Pago/Pendente/Vencido) e comprovante.
 * Parcelamentos continuam somente leitura aqui — ganham CRUD próprio na Fase 3.
 */

const Accounts = {
  currentTab: 'recorrentes',
  editingContext: null, // { tipo: 'recorrente'|'variavel', id: string|null }

  render(data) {
    this._renderTabs();
    this._renderList(data);
    this._renderSummaryChart(data);
  },

  _renderSummaryChart(data) {
    const mes = data.meta.mesReferenciaAtual;
    const fixo = Calc.calculateFixedExpenses(data, mes);
    const parcelas = Calc.calculateInstallmentsMonthlyTotal(data);
    const variavel = Calc.calculateVariableExpenses(data, mes);
    SimpleCharts.bar('chart-contas-resumo', {
      labels: ['Recorrentes', 'Parcelamentos', 'Variáveis'],
      values: [fixo, parcelas, variavel],
      colors: ['#5F3DC4', '#7C4DE0', '#B69EF2'],
      horizontal: true,
    });
  },

  /** Muda de aba programaticamente (ex.: "Ver mais" das despesas recentes do Dashboard) — clica na própria aba pra reaproveitar toda a lógica já ligada em _renderTabs. */
  switchToTab(tab) {
    const wrap = document.getElementById('accounts-tabs');
    const btn = wrap && wrap.querySelector(`button[data-tab="${tab}"]`);
    if (btn) btn.click();
  },

  _renderTabs() {
    const wrap = document.getElementById('accounts-tabs');
    if (!wrap || wrap.dataset.bound) return;
    wrap.dataset.bound = 'true';
    wrap.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.currentTab = btn.dataset.tab;
        wrap.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
        this._renderList(appData);
        this._toggleAddButtonLabel();
      });
    });
  },

  _toggleAddButtonLabel() {
    const btn = document.getElementById('new-item-btn');
    const listPanel = document.getElementById('accounts-list');
    const installmentsPanel = document.getElementById('installments-panel');
    if (!btn) return;
    if (this.currentTab === 'parcelamentos') {
      btn.textContent = '+ Novo parcelamento';
      listPanel.style.display = 'none';
      installmentsPanel.style.display = 'block';
      Installments.render(appData);
    } else {
      btn.textContent = '+ Nova despesa';
      listPanel.style.display = 'flex';
      installmentsPanel.style.display = 'none';
    }
  },

  _renderList(data) {
    const list = document.getElementById('accounts-list');
    if (!list) return;
    list.innerHTML = '';

    if (this.currentTab === 'recorrentes') {
      if (!data.despesasRecorrentes.length) return this._renderEmpty(list, 'Nenhuma despesa recorrente cadastrada ainda.');
      data.despesasRecorrentes.forEach((d) => list.appendChild(this._buildRecorrenteCard(d)));
    } else if (this.currentTab === 'variaveis') {
      // Só o mês atual — sem isso, despesas variáveis de meses já virados
      // (que não têm "parcela" pra justificar aparecer em mais de um mês)
      // continuavam listadas junto com as do mês corrente, dando a
      // impressão de repetição/duplicação a cada virada de mês. Histórico
      // de meses anteriores continua disponível em Análises.
      const mes = data.meta.mesReferenciaAtual;
      const doMes = data.despesasVariaveis.filter((d) => d.mesReferencia === mes);
      if (!doMes.length) return this._renderEmpty(list, 'Nenhuma despesa variável cadastrada neste mês ainda.');
      doMes.forEach((d) => list.appendChild(this._buildVariavelCard(d)));
    }
    // A aba "parcelamentos" é renderizada por Installments.render() — ver app.js.
  },

  _renderEmpty(list, msg) {
    const div = document.createElement('div');
    div.className = 'coming-soon';
    div.innerHTML = `<p>${msg}</p>`;
    list.appendChild(div);
  },

  _buildRecorrenteCard(d) {
    const el = document.createElement('div');
    el.className = 'account-card';
    el.innerHTML = `
      <div class="account-main">
        <div class="account-name">${escapeHtml(d.nome)}</div>
        <div class="account-meta">${escapeHtml(d.categoria || 'Sem categoria')} · vencimento ${escapeHtml(d.vencimento || 'não informado')}</div>
        ${statusBadge(d.status)}
      </div>
      <div class="account-side">
        <div class="account-value">${formatBRL(d.valor)}</div>
        <div class="account-side-row">
          <button class="mini-btn icon-btn" data-action="edit" title="Editar" aria-label="Editar despesa"><span class="material-symbols-outlined" aria-hidden="true">edit</span></button>
          <button class="mini-btn icon-btn danger" data-action="delete" title="Excluir" aria-label="Excluir despesa"><span class="material-symbols-outlined" aria-hidden="true">delete</span></button>
        </div>
      </div>
    `;
    el.querySelector('[data-action="edit"]').addEventListener('click', () => this.openForm('recorrente', d.id));
    el.querySelector('[data-action="delete"]').addEventListener('click', () => this.deleteItem('recorrente', d.id));
    return el;
  },

  _buildVariavelCard(d) {
    const el = document.createElement('div');
    el.className = 'account-card';
    el.innerHTML = `
      <div class="account-main">
        <div class="account-name">${escapeHtml(d.nome)}</div>
        <div class="account-meta">${escapeHtml(d.categoria || 'Sem categoria')} · ${formatMonthKey(d.mesReferencia)}</div>
        ${statusBadge(d.status)}
      </div>
      <div class="account-side">
        <div class="account-value">${formatBRL(d.valor)}</div>
        <div class="account-side-row">
          <button class="mini-btn icon-btn" data-action="edit" title="Editar" aria-label="Editar despesa"><span class="material-symbols-outlined" aria-hidden="true">edit</span></button>
          <button class="mini-btn icon-btn danger" data-action="delete" title="Excluir" aria-label="Excluir despesa"><span class="material-symbols-outlined" aria-hidden="true">delete</span></button>
        </div>
      </div>
    `;
    if (d.comprovante) {
      // Atribuído via propriedade IDL (thumb.src = ...), não interpolado no
      // template — nunca é reinterpretado como HTML, então um valor
      // malicioso (ex.: vindo de um backup importado sem validação) não
      // consegue escapar do atributo. Ver Storage/backup.js.
      const thumb = document.createElement('img');
      thumb.className = 'receipt-thumb';
      thumb.alt = 'Comprovante';
      // O comprovante mora num bucket PRIVADO: o que está salvo é o path, e
      // quem transforma em algo exibível é Storage.imageSrc (URL assinada).
      // Continua sendo atribuído via propriedade IDL, nunca interpolado no
      // template — o valor jamais é reinterpretado como HTML.
      Storage.imageSrc(d.comprovante).then((src) => { if (src) thumb.src = src; });
      thumb.addEventListener('click', () => this.viewReceipt(d.comprovante));
      el.querySelector('.account-main').appendChild(thumb);
    }
    el.querySelector('[data-action="edit"]').addEventListener('click', () => this.openForm('variavel', d.id));
    el.querySelector('[data-action="delete"]').addEventListener('click', () => this.deleteItem('variavel', d.id));
    return el;
  },

  async viewReceipt(valor) {
    const overlay = document.getElementById('receipt-overlay');
    const img = document.getElementById('receipt-overlay-img');
    img.removeAttribute('src');
    overlay.classList.add('active');
    const src = await Storage.imageSrc(valor);
    if (src) img.src = src;
  },

  async deleteItem(tipo, id) {
    if (!await confirmDialog('Excluir esta despesa? Essa ação não pode ser desfeita.', { title: 'Excluir despesa', confirmLabel: 'Excluir', danger: true })) return;
    if (tipo === 'recorrente') {
      appData.despesasRecorrentes = appData.despesasRecorrentes.filter((d) => d.id !== id);
    } else {
      // Apaga também o arquivo no bucket — sem isso, excluir a despesa
      // deixaria o comprovante lá sem nada apontando pra ele.
      const alvo = appData.despesasVariaveis.find((d) => d.id === id);
      if (alvo && alvo.comprovante) await Storage.removeImage(alvo.comprovante);
      appData.despesasVariaveis = appData.despesasVariaveis.filter((d) => d.id !== id);
    }
    Storage.save(appData);
    this._renderList(appData);
    Dashboard.render(appData);
    toast('Despesa excluída.');
  },

  markPago(tipo, id) {
    const arr = tipo === 'recorrente' ? appData.despesasRecorrentes : appData.despesasVariaveis;
    const item = arr.find((d) => d.id === id);
    if (item) item.status = 'Pago';
    Storage.save(appData);
    this._renderList(appData);
    Dashboard.render(appData);
  },

  /** Abre o formulário modal para criar (id=null) ou editar uma despesa. */
  openForm(tipo, id) {
    const isRecorrente = tipo === 'recorrente';
    const arr = isRecorrente ? appData.despesasRecorrentes : appData.despesasVariaveis;
    const item = id ? arr.find((d) => d.id === id) : null;
    this.editingContext = { tipo, id };

    document.getElementById('expense-form-title').textContent = item ? 'Editar despesa' : 'Nova despesa';
    document.getElementById('expense-type').value = tipo;
    document.getElementById('expense-nome').value = item ? item.nome : '';
    document.getElementById('expense-valor').value = item ? item.valor : '';
    document.getElementById('expense-status').value = item ? item.status || 'Pendente' : 'Pendente';
    document.getElementById('expense-observacao').value = item ? item.observacao || '' : '';
    document.getElementById('expense-vencimento').value = isRecorrente ? (item ? item.vencimento || '' : '') : '';
    document.getElementById('expense-data').value = item && item.data ? item.data : '';
    document.getElementById('expense-forma-pagamento').value = item ? item.formaPagamento || '' : '';
    document.getElementById('expense-comprovante-input').value = '';
    this._pendingComprovante = item ? item.comprovante || null : null;
    // Guarda o que já estava salvo: se a pessoa trocar ou remover o
    // comprovante, é esse objeto que precisa sair do bucket ao salvar.
    this._comprovanteOriginal = this._pendingComprovante;
    this._pendingComprovanteFile = null;
    this._syncComprovanteUI();

    // Uma despesa nova nunca abre "já parcelada" — é uma escolha por compra,
    // não uma preferência que fica guardada do lançamento anterior.
    document.getElementById('expense-parcelado').checked = false;
    document.getElementById('expense-parcelas').value = '';

    this._populateCategoriaSelect(item ? item.categoria : null);
    this._populateCartaoSelect(item ? item.cartaoId : null);
    document.getElementById('field-vencimento').style.display = isRecorrente ? 'block' : 'none';
    this._toggleParceladoFields();

    // Aviso de reconhecimento de voz (ver VoiceExpense) some por padrão —
    // só reaparece quando é a própria VoiceExpense quem preenche o formulário
    // logo depois desta chamada, senão ficaria "grudado" de uma vez anterior.
    const voiceHint = document.getElementById('expense-voice-hint');
    if (voiceHint) voiceHint.style.display = 'none';

    document.getElementById('expense-modal').classList.add('active');
  },

  /** Select de cartão, só relevante pra quem tem mais de um cadastrado — com
      um só (ou nenhum), o fechamento já é resolvido sem precisar escolher
      (ver fallback em Calc.calculateExpenseMonth). */
  _populateCartaoSelect(selectedId) {
    const select = document.getElementById('expense-cartao');
    if (!select) return;
    select.innerHTML = appData.cartoes.map((c) => `<option value="${escapeAttr(c.id)}">${escapeHtml(c.nome)}</option>`).join('');
    select.value = (selectedId && appData.cartoes.some((c) => c.id === selectedId)) ? selectedId : ((appData.cartoes[0] && appData.cartoes[0].id) || '');
    this._toggleCartaoField();
  },

  /** Campo de cartão só aparece com "Cartão de crédito" selecionado e mais de um cartão cadastrado. */
  handleFormaPagamentoChange() {
    this._toggleCartaoField();
    this._toggleParceladoFields();
  },

  _toggleCartaoField() {
    const field = document.getElementById('field-cartao');
    if (!field) return;
    const formaPagamento = document.getElementById('expense-forma-pagamento').value;
    field.style.display = (formaPagamento === 'cartao' && appData.cartoes.length > 1) ? 'block' : 'none';
  },

  /**
   * Mostra/esconde o bloco "Foi uma compra parcelada" e o número de vezes.
   * Vale pra qualquer despesa ÚNICA, nova OU já cadastrada:
   *  - numa despesa nova, grava direto como parcelamento;
   *  - numa despesa que já existe, CONVERTE o lançamento em parcelamento
   *    (ver _submitAsInstallment) — é o caso de lançar a compra inteira e só
   *    depois lembrar que ela foi parcelada. A conversão avisa antes, porque
   *    a tabela de parcelamentos não tem comprovante/status/data.
   *  - recorrente fica de fora: já se repete todo mês, não tem parcela.
   *
   * NÃO exige forma de pagamento "cartão". Exigir escondia a opção na maioria
   * das despesas já cadastradas (que nasceram sem forma de pagamento, que é
   * um campo opcional) — a pessoa abria pra marcar "foi parcelada" e não
   * achava nada, sem pista de que precisava mexer noutro campo antes. E
   * parcelamento aqui nem depende de cartão: `cartaoId` é opcional (crediário,
   * carnê e afins também são parcelas).
   */
  _toggleParceladoFields() {
    const fieldParcelado = document.getElementById('field-parcelado');
    const fieldParcelas = document.getElementById('field-parcelas');
    const checkbox = document.getElementById('expense-parcelado');
    if (!fieldParcelado || !fieldParcelas || !checkbox) return;

    const tipo = document.getElementById('expense-type').value;
    const podeParcelar = tipo === 'variavel';

    fieldParcelado.style.display = podeParcelar ? 'block' : 'none';
    if (!podeParcelar) checkbox.checked = false;
    const parcelado = podeParcelar && checkbox.checked;
    fieldParcelas.style.display = parcelado ? 'block' : 'none';

    // Com a compra parcelada, o valor pedido passa a ser o TOTAL da compra —
    // o rótulo precisa dizer isso, senão é natural digitar já o valor da
    // parcela e a compra acabar cadastrada pelo dobro/triplo.
    const label = document.getElementById('expense-valor-label');
    if (label) label.textContent = parcelado ? 'Valor total da compra (R$)' : 'Valor (R$)';

    this.updateParcelaHint();
  },

  handleParceladoChange() {
    this._toggleParceladoFields();
    if (document.getElementById('expense-parcelado').checked) {
      document.getElementById('expense-parcelas').focus();
    }
  },

  /** Previsão "2x de R$ 50,00" embaixo do campo de vezes — confirma na hora o que vai ser gravado. */
  updateParcelaHint() {
    const hint = document.getElementById('expense-parcela-hint');
    if (!hint) return;
    const checkbox = document.getElementById('expense-parcelado');
    if (!checkbox || !checkbox.checked) { hint.textContent = ''; return; }
    const total = parseFloat(document.getElementById('expense-valor').value);
    const vezes = parseInt(document.getElementById('expense-parcelas').value, 10);
    if (Number.isNaN(total) || total <= 0 || Number.isNaN(vezes) || vezes < 2) {
      hint.textContent = 'Informe o valor total da compra e em quantas vezes foi parcelada.';
      return;
    }
    const parcela = this._valorParcela(total, vezes);
    const sobra = Math.round((total - parcela * vezes) * 100) / 100;
    const editando = !!(this.editingContext && this.editingContext.id);
    // Ex.: 100 em 3x dá 33,33 × 3 = 99,99 — mostra a diferença de centavos em
    // vez de deixar a soma das parcelas não fechar com o total sem explicação.
    hint.textContent = `${vezes}x de ${formatBRL(parcela)}`
      + (sobra ? ` (arredondamento: ${formatBRL(Math.abs(sobra))} de diferença no total)` : '')
      + (editando ? ' · esta despesa vai ser movida para Parcelamentos' : '');
  },

  /** Valor de cada parcela, arredondado aos centavos. */
  _valorParcela(valorTotal, vezes) {
    return Math.round((valorTotal / vezes) * 100) / 100;
  },

  closeForm() {
    document.getElementById('expense-modal').classList.remove('active');
    this.editingContext = null;
  },

  _populateCategoriaSelect(selected) {
    const select = document.getElementById('expense-categoria');
    select.innerHTML = '';
    appData.categorias.forEach((cat) => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      if (cat === selected) opt.selected = true;
      select.appendChild(opt);
    });
    const optNew = document.createElement('option');
    optNew.value = '__nova__';
    optNew.textContent = '+ Nova categoria...';
    select.appendChild(optNew);
  },

  handleCategoriaChange() {
    const select = document.getElementById('expense-categoria');
    if (select.value === '__nova__') {
      const nome = prompt('Nome da nova categoria:');
      if (nome && nome.trim()) {
        appData.categorias.push(nome.trim());
        Storage.save(appData);
        this._populateCategoriaSelect(nome.trim());
      } else {
        const ctx = this.editingContext;
        const arr = ctx && ctx.id ? (ctx.tipo === 'recorrente' ? appData.despesasRecorrentes : appData.despesasVariaveis) : null;
        const item = arr ? arr.find((d) => d.id === ctx.id) : null;
        select.value = item ? item.categoria : appData.categorias[0];
      }
    }
  },

  handleComprovanteChange(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    // 5MB agora (era ~1,5MB): o limite antigo existia porque a imagem ia
    // inteira pra dentro da linha do banco em base64. Indo pro bucket, o
    // teto é o do próprio bucket (ver migration 0015).
    if (file.size > 5 * 1024 * 1024) {
      alert('Imagem muito grande (limite de 5MB). Escolha uma foto menor.');
      input.value = '';
      this._syncComprovanteUI();
      return;
    }
    // O upload só acontece ao SALVAR — escolher um arquivo e depois cancelar
    // o formulário não pode deixar lixo no bucket. Até lá a prévia usa uma
    // URL local do próprio arquivo, sem passar pela rede.
    this._pendingComprovanteFile = file;
    this._pendingComprovante = null;
    this._syncComprovanteUI(file.name, URL.createObjectURL(file));
  },

  removeComprovante() {
    this._pendingComprovante = null;
    this._pendingComprovanteFile = null;
    document.getElementById('expense-comprovante-input').value = '';
    this._syncComprovanteUI();
  },

  /**
   * Mantém o trio "nome do arquivo / prévia / botão de remover" coerente com
   * `_pendingComprovante`, que é a única fonte de verdade do comprovante do
   * formulário. O <input type="file"> escondido não serve pra isso: ao EDITAR
   * uma despesa que já tem comprovante salvo, ele está vazio (o navegador não
   * deixa preenchê-lo por script) mesmo existindo um comprovante.
   */
  _syncComprovanteUI(fileName, srcLocal) {
    const temImagem = !!(srcLocal || this._pendingComprovante || this._pendingComprovanteFile);
    const preview = document.getElementById('expense-comprovante-preview');
    if (preview) {
      preview.style.display = temImagem ? 'block' : 'none';
      if (!temImagem) preview.removeAttribute('src');
      else if (srcLocal) preview.src = srcLocal;
      // Comprovante já salvo: resolve o path numa URL assinada. O guard do
      // `.then` evita que uma resposta lenta de um item anterior sobrescreva
      // a prévia de um arquivo que a pessoa acabou de escolher.
      else if (this._pendingComprovante) {
        const alvo = this._pendingComprovante;
        Storage.imageSrc(alvo).then((s) => {
          if (s && this._pendingComprovante === alvo) preview.src = s;
        });
      }
    }
    const nameEl = document.getElementById('expense-comprovante-filename');
    if (nameEl) nameEl.textContent = fileName || (temImagem ? 'Comprovante anexado' : 'Nenhum arquivo escolhido');
    const removeBtn = document.getElementById('expense-comprovante-remove-btn');
    if (removeBtn) removeBtn.style.display = temImagem ? '' : 'none';
  },

  /**
   * Resolve o valor final do campo `comprovante` no momento de salvar:
   * sobe o arquivo escolhido (se houver) e apaga do bucket o objeto que
   * deixou de ser usado — trocar ou remover um comprovante não pode deixar
   * o arquivo antigo órfão lá, consumindo espaço pra sempre.
   *
   * Se o upload falhar, a despesa é salva SEM comprovante em vez de perder o
   * resto da edição — e o objeto antigo é preservado, não apagado.
   */
  async _resolveComprovante() {
    const original = this._comprovanteOriginal || null;
    let valor = this._pendingComprovante || null;

    if (this._pendingComprovanteFile) {
      try {
        valor = await Storage.uploadImage(this._pendingComprovanteFile, 'comprovante');
      } catch (e) {
        console.error('Falha ao subir o comprovante.', e);
        toast('⚠️ Não consegui salvar o comprovante. A despesa foi salva sem ele.');
        return original;
      }
    }
    if (original && original !== valor) await Storage.removeImage(original);
    return valor;
  },

  /**
   * Grava uma compra parcelada no cartão como um item de `parcelamentos`, a
   * partir do VALOR TOTAL digitado no formulário de despesa: R$ 100 em 2x
   * viram 2 parcelas de R$ 50, e só R$ 50 entram no gasto de cada mês.
   *
   * `parcelaAtual`/`parcelasRestantes` são sempre relativos ao mês de
   * referência ATUAL (é assim que Calc.calculateInstallmentActiveRange deriva
   * a janela de cobrança), então o mês em que a primeira parcela cai precisa
   * virar um deslocamento:
   *   - compra deste mês          → offset 0  → parcelaAtual 1 (1ª já é agora)
   *   - compra depois do fechamento → offset 1 → parcelaAtual 0 (1ª vem no mês
   *     que vem; primeiroMes = mesAtual + 1)
   *   - compra de meses atrás     → offset -N → parcelaAtual N+1 (algumas
   *     parcelas já foram pagas)
   */
  async _submitAsInstallment({ nome, valorTotal, categoria, observacao, dataCompra, formaPagamento, cartaoId, despesaOrigemId }) {
    const vezes = parseInt(document.getElementById('expense-parcelas').value, 10);
    if (Number.isNaN(vezes) || vezes < 2) {
      alert('Informe em quantas vezes a compra foi parcelada (2 ou mais).');
      return;
    }

    const origem = despesaOrigemId ? appData.despesasVariaveis.find((d) => d.id === despesaOrigemId) : null;

    // Converter apaga campos que só existem em despesas (a tabela
    // `parcelamentos` não tem comprovante/status/data) — avisa antes,
    // nomeando só o que essa despesa de fato tem a perder.
    if (origem) {
      const perde = [];
      if (origem.comprovante) perde.push('o comprovante anexado');
      if (origem.status && origem.status !== 'Pago') perde.push(`o status "${origem.status}"`);
      if (origem.data) perde.push('a data da compra');
      const detalhe = perde.length ? `

Na conversão, ${perde.join(', ')} não ${perde.length > 1 ? 'são guardados' : 'é guardado'} — parcelamento não tem esses campos.` : '';
      const ok = await confirmDialog(
        `"${nome}" sai da lista de despesas e passa a ser um parcelamento de ${vezes}x.${detalhe}`,
        { title: 'Converter em parcelamento', confirmLabel: 'Converter' }
      );
      if (!ok) return;
    }

    const mesAtual = appData.meta.mesReferenciaAtual;
    // Sem data informada, uma despesa que JÁ existe começa a parcelar no mês
    // em que ela foi lançada, não no mês corrente — senão uma compra de
    // agosto convertida em setembro teria a 1ª parcela jogada pra setembro e
    // duraria um mês a mais do que na fatura real.
    // A forma de pagamento REAL entra aqui (não 'cartao' fixo): só no cartão o
    // fechamento pode empurrar a 1ª parcela pro mês seguinte — num carnê ou
    // crediário ela cai no próprio mês da compra.
    const mesPrimeiraParcela = dataCompra
      ? Calc.calculateExpenseMonth(appData, dataCompra, formaPagamento, cartaoId)
      : ((origem && origem.mesReferencia) || mesAtual);
    const offset = monthsBetween(mesAtual, mesPrimeiraParcela);
    const parcelaAtual = 1 - offset;
    const parcelasRestantes = vezes - 1 + offset;

    if (parcelasRestantes < 0) {
      alert(`Pela data informada, essa compra de ${vezes}x já teria sido totalmente paga antes de ${formatMonthKey(mesAtual)}. Confira a data da compra.`);
      return;
    }

    const valorParcela = this._valorParcela(valorTotal, vezes);

    // Checagem ANTES de apagar a despesa ou empurrar qualquer coisa: o banco
    // tem uma constraint (parcelamentos_sem_duplicata, migration 0010) sobre
    // nome+categoria+valor da parcela+parcelas restantes. Deixar o insert
    // estourar lá na frente faria a gravação inteira falhar DEPOIS da despesa
    // já ter saído da tela — melhor recusar aqui, com a despesa intacta e uma
    // mensagem que diz o que fazer.
    const jaExiste = appData.parcelamentos.some((p) => p.nome === nome
      && (p.categoria || null) === (categoria || null)
      && p.valorParcela === valorParcela
      && p.parcelasRestantes === parcelasRestantes);
    if (jaExiste) {
      alert(`Já existe um parcelamento "${nome}" em ${categoria} com parcela de ${formatBRL(valorParcela)} e ${parcelasRestantes} restante(s) — seria um registro duplicado.

Se forem compras diferentes, mude o nome de uma delas.`);
      return;
    }
    // Impacto no mês corrente = o que entra menos o que sai. Numa conversão,
    // o valor cheio da despesa deixa de pesar no mês e entra só a parcela, o
    // que quase sempre dá delta negativo (nenhuma barreira) — mas a conta
    // precisa ser essa, não `valorParcela` puro, senão converter uma despesa
    // pra parcelamento podia disparar um aviso de limite que não existe.
    const jaCobraNesteMes = parcelaAtual >= 1;
    const saiDoMesAtual = origem && origem.mesReferencia === mesAtual ? origem.valor : 0;
    const entraNoMesAtual = jaCobraNesteMes ? valorParcela : 0;
    if (!(await confirmCommitmentImpact(entraNoMesAtual - saiDoMesAtual))) return;

    if (origem) {
      // Parcelamento não tem comprovante (é o que o aviso acima explica), então
      // o arquivo sai do bucket junto com a despesa que o referenciava.
      if (origem.comprovante) await Storage.removeImage(origem.comprovante);
      appData.despesasVariaveis = appData.despesasVariaveis.filter((d) => d.id !== despesaOrigemId);
    }

    appData.parcelamentos.push({
      id: generateId('parc'),
      nome,
      valorParcela,
      totalParcelas: vezes,
      parcelaAtual,
      parcelasRestantes,
      categoria,
      // Sem cartão informado o parcelamento fica sem cartão mesmo (a coluna é
      // nullable) — em vez de grudar no primeiro cartão cadastrado, que faria
      // um carnê aparecer como se fosse fatura daquele cartão.
      cartaoId: formaPagamento === 'cartao' ? (cartaoId || (appData.cartoes[0] && appData.cartoes[0].id) || null) : null,
      dataPrimeiraParcela: null,
      observacao,
      statusDescricao: parcelasRestantes === 0 ? 'última parcela' : null,
    });

    Storage.save(appData);
    this.closeForm();
    // Vai pra aba de Parcelamentos: a compra não aparece na lista de
    // variáveis, e sem isso a pessoa salva e não vê nada acontecer. O
    // navigateTo é necessário porque o formulário também abre de fora da tela
    // de Contas (atalho "+" da barra inferior, voz, dashboard).
    navigateTo('contas');
    this.switchToTab('parcelamentos');
    Dashboard.render(appData);
    toast(origem
      ? `"${nome}" convertida em ${vezes}x de ${formatBRL(valorParcela)}.`
      : `Compra parcelada em ${vezes}x de ${formatBRL(valorParcela)}.`);
  },

  async submitForm(evt) {
    evt.preventDefault();
    // Trava contra duplo clique/duplo toque — mesmo motivo do
    // Installments.submitForm: sem isso, uma segunda chamada antes da
    // primeira terminar (confirmCommitmentImpact pode resolver na hora,
    // sem diálogo, quando não há limite configurado) criava duas despesas
    // idênticas.
    if (this._submitting) return;
    this._submitting = true;
    try {
      await this._doSubmitForm();
    } finally {
      this._submitting = false;
    }
  },

  async _doSubmitForm() {
    const tipo = document.getElementById('expense-type').value;
    const nome = document.getElementById('expense-nome').value.trim();
    const valor = parseFloat(document.getElementById('expense-valor').value);
    const categoria = document.getElementById('expense-categoria').value;
    const status = document.getElementById('expense-status').value;
    const observacao = document.getElementById('expense-observacao').value.trim() || null;
    const vencimento = document.getElementById('expense-vencimento').value.trim() || null;
    const dataCompra = document.getElementById('expense-data').value || null;
    const formaPagamento = document.getElementById('expense-forma-pagamento').value || null;
    const cartaoSelect = document.getElementById('expense-cartao');
    const cartaoId = (formaPagamento === 'cartao' && cartaoSelect && cartaoSelect.value) || null;

    if (!nome || Number.isNaN(valor) || valor <= 0) {
      alert('Preencha o nome e um valor válido para a despesa.');
      return;
    }

    const isRecorrente = tipo === 'recorrente';
    // Compra parcelada no cartão não é uma despesa deste mês: virou um
    // parcelamento, que é o que o app já sabe distribuir mês a mês cobrando
    // só a parcela (ver _submitAsInstallment). Mesmas condições de
    // _toggleParceladoFields — o campo só está visível nelas.
    const parceladoEl = document.getElementById('expense-parcelado');
    const editandoId = (this.editingContext && this.editingContext.id) || null;
    if (!isRecorrente && parceladoEl && parceladoEl.checked) {
      await this._submitAsInstallment({
        nome, valorTotal: valor, categoria, observacao, dataCompra, formaPagamento, cartaoId, despesaOrigemId: editandoId,
      });
      return;
    }
    const arr = isRecorrente ? appData.despesasRecorrentes : appData.despesasVariaveis;
    const id = this.editingContext && this.editingContext.id;
    let item = id ? arr.find((d) => d.id === id) : null;

    // Verifica o impacto no comprometimento da renda ANTES de gravar qualquer coisa.
    const mesAlvo = item ? item.mesReferencia : appData.meta.mesReferenciaAtual;
    const afetaMesAtual = isRecorrente || mesAlvo === appData.meta.mesReferenciaAtual;
    const oldValor = item ? item.valor : 0;
    if (afetaMesAtual && !(await confirmCommitmentImpact(valor - oldValor))) return;

    if (!item) {
      item = { id: generateId(isRecorrente ? 'rec' : 'var') };
      arr.push(item);
    }

    item.nome = nome;
    item.valor = valor;
    item.categoria = categoria;
    item.status = status;
    item.observacao = observacao;
    item.comprovante = await this._resolveComprovante();
    item.data = dataCompra;

    item.formaPagamento = formaPagamento;
    item.cartaoId = cartaoId;

    if (isRecorrente) {
      item.frequencia = item.frequencia || 'mensal';
      item.tipo = item.tipo || 'fixa';
      item.vencimento = vencimento;
      // Com data informada, calcula a partir de qual mês essa recorrente passa
      // a contar (considera o fechamento do cartão, igual à despesa variável);
      // sem data, preserva o que já estava salvo (null = sempre contou).
      item.inicioMesReferencia = dataCompra
        ? Calc.calculateExpenseMonth(appData, dataCompra, formaPagamento, cartaoId)
        : (item.inicioMesReferencia || null);
    } else {
      // Com data informada, o mês é recalculado (considera o fechamento do
      // cartão se a forma de pagamento for "cartão"); sem data, preserva o
      // mês já salvo (edição) ou usa o mês atual (despesa nova).
      item.mesReferencia = dataCompra
        ? Calc.calculateExpenseMonth(appData, dataCompra, formaPagamento, cartaoId)
        : (item.mesReferencia || appData.meta.mesReferenciaAtual);
    }

    Storage.save(appData);
    this.closeForm();
    this._renderList(appData);
    Dashboard.render(appData);
    toast(id ? 'Despesa atualizada.' : 'Despesa adicionada.');
  },
};

/**
 * Popup próprio do app (substitui confirm()/alert() nativos do navegador) —
 * usado pelo aviso de limite de renda comprometida e por qualquer ação
 * destrutiva do app (excluir despesa/meta/parcelamento/renda/cartão, excluir
 * todos os dados, virar o mês etc). Resolve `true` se deve prosseguir com a
 * ação, `false` se foi cancelada. `danger: true` deixa o botão de confirmar
 * vermelho, pra sinalizar visualmente uma ação que não pode ser desfeita.
 */
/**
 * Fila de confirmDialog — todos usam o mesmo #confirm-modal do DOM. Sem
 * isso, um duplo clique/duplo toque num botão de salvar (formulário de
 * parcelamento, despesa, etc.) disparava confirmCommitmentImpact() duas
 * vezes antes da primeira resolver: as DUAS chamadas registravam seu
 * próprio par de listeners nos MESMOS botões compartilhados, e um único
 * clique em "Continuar" disparava os dois — deixando as duas submissões
 * concorrentes prosseguirem e criarem dois registros idênticos (esse era o
 * motivo de contas/parcelamentos aparecerem duplicados no relatório).
 * Encadear por uma promise garante no máximo uma confirmação por vez.
 */
let _confirmDialogQueue = Promise.resolve();

function confirmDialog(message, opts = {}) {
  const run = () => new Promise((resolve) => {
    const { title = 'Atenção', showCancel = true, confirmLabel = 'Continuar', cancelLabel = 'Cancelar', danger = false } = opts;
    const modal = document.getElementById('confirm-modal');
    document.getElementById('confirm-modal-title').textContent = title;
    document.getElementById('confirm-modal-message').textContent = message;
    const confirmBtn = document.getElementById('confirm-modal-confirm');
    const cancelBtn = document.getElementById('confirm-modal-cancel');
    confirmBtn.textContent = confirmLabel;
    confirmBtn.classList.toggle('danger', danger);
    cancelBtn.textContent = cancelLabel;
    cancelBtn.style.display = showCancel ? '' : 'none';

    function finish(result) {
      modal.classList.remove('active');
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(result);
    }
    function onConfirm() { finish(true); }
    function onCancel() { finish(false); }
    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
    modal.classList.add('active');
  });

  const result = _confirmDialogQueue.then(run);
  // Erros/rejeições de uma chamada não podem travar a fila pras próximas.
  _confirmDialogQueue = result.catch(() => {});
  return result;
}

/**
 * Verifica o impacto de um gasto (novo ou editado) no limite de renda
 * comprometida configurado, e aplica o modo de proteção escolhido pelo
 * usuário (aviso / confirmação / bloqueio) através de um popup próprio do
 * app. Retorna true se deve prosseguir com o salvamento, false se deve
 * abortar. Usada por Accounts e Installments.
 */
async function confirmCommitmentImpact(deltaValor) {
  if (!deltaValor || deltaValor <= 0) return true; // reduzir gasto nunca precisa de barreira
  const preview = Calc.calculateImpactPreview(appData, deltaValor);
  if (!preview.limite) return true; // usuário não configurou limite — recurso desligado
  if (preview.nivelDepois !== 'atingido' && preview.nivelDepois !== 'ultrapassado') return true;

  const pctAntes = preview.pctAntes != null ? formatPercent(preview.pctAntes) : 'não calculado';
  const pctDepois = formatPercent(preview.pctDepois);
  const modo = preview.limite.modo;

  if (modo === 'bloqueio') {
    return confirmDialog(
      `⚠️ Bloqueado pelo seu limite de ${preview.limite.percentual}% da renda.\n\nEsse gasto levaria seu comprometimento de ${pctAntes} para ${pctDepois}.\n\nVocê ativou o modo "bloqueio" — deseja desbloquear e salvar mesmo assim?`,
      { showCancel: true, confirmLabel: 'Desbloquear e salvar' }
    );
  }
  if (modo === 'aviso') {
    await confirmDialog(
      `⚠️ Atenção: suas compras já comprometem ${pctAntes} da sua renda.\nEste gasto fará seu comprometimento chegar a ${pctDepois} (limite configurado: ${preview.limite.percentual}%).`,
      { showCancel: false, confirmLabel: 'Entendi' }
    );
    return true;
  }
  return confirmDialog(
    `⚠️ Atenção\nSuas compras já comprometem ${pctAntes} da sua renda.\nEste gasto fará seu comprometimento chegar a ${pctDepois}.\n\nDeseja prosseguir mesmo assim?`,
    { showCancel: true, confirmLabel: 'Continuar mesmo assim' }
  );
}

function statusBadge(status) {
  const map = {
    Pago: 'success',
    Pendente: 'warning',
    Vencido: 'danger',
  };
  const cls = map[status] || 'warning';
  return `<span class="badge ${cls}">${escapeHtml(status || 'Pendente')}</span>`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

/** Como escapeHtml(), mas também escapa aspas — necessário para interpolar
    dentro de um atributo HTML entre aspas (title="...", aria-label="...");
    escapeHtml() sozinho não cobre esse caso porque textContent→innerHTML
    nunca precisa escapar aspas num nó de texto comum. */
function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2200);
}
