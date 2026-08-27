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
      if (!data.despesasVariaveis.length) return this._renderEmpty(list, 'Nenhuma despesa variável cadastrada ainda.');
      data.despesasVariaveis.forEach((d) => list.appendChild(this._buildVariavelCard(d)));
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
      </div>
      <div class="account-side">
        <div class="account-value">${formatBRL(d.valor)}</div>
        ${statusBadge(d.status)}
      </div>
      <div class="account-actions">
        <button class="mini-btn" data-action="edit">Editar</button>
        <button class="mini-btn danger" data-action="delete">Excluir</button>
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
        <div class="account-meta">${escapeHtml(d.categoria || 'Sem categoria')} · ${formatMesReferencia(d.mesReferencia)}</div>
      </div>
      <div class="account-side">
        <div class="account-value">${formatBRL(d.valor)}</div>
        ${statusBadge(d.status)}
      </div>
      <div class="account-actions">
        <button class="mini-btn" data-action="edit">Editar</button>
        <button class="mini-btn danger" data-action="delete">Excluir</button>
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
      thumb.src = d.comprovante;
      thumb.addEventListener('click', () => this.viewReceipt(d.comprovante));
      el.querySelector('.account-main').appendChild(thumb);
    }
    el.querySelector('[data-action="edit"]').addEventListener('click', () => this.openForm('variavel', d.id));
    el.querySelector('[data-action="delete"]').addEventListener('click', () => this.deleteItem('variavel', d.id));
    return el;
  },

  viewReceipt(src) {
    const overlay = document.getElementById('receipt-overlay');
    const img = document.getElementById('receipt-overlay-img');
    img.src = src;
    overlay.classList.add('active');
  },

  async deleteItem(tipo, id) {
    if (!await confirmDialog('Excluir esta despesa? Essa ação não pode ser desfeita.', { title: 'Excluir despesa', confirmLabel: 'Excluir', danger: true })) return;
    if (tipo === 'recorrente') {
      appData.despesasRecorrentes = appData.despesasRecorrentes.filter((d) => d.id !== id);
    } else {
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
    document.getElementById('expense-comprovante-preview').src = item && item.comprovante ? item.comprovante : '';
    document.getElementById('expense-comprovante-preview').style.display = item && item.comprovante ? 'block' : 'none';
    document.getElementById('expense-comprovante-input').value = '';
    this._pendingComprovante = item ? item.comprovante || null : null;

    this._populateCategoriaSelect(item ? item.categoria : null);
    document.getElementById('field-vencimento').style.display = isRecorrente ? 'block' : 'none';

    document.getElementById('expense-modal').classList.add('active');
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
    if (file.size > 1.5 * 1024 * 1024) {
      alert('Imagem muito grande (limite de ~1,5MB). Escolha uma foto menor.');
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      this._pendingComprovante = e.target.result;
      const preview = document.getElementById('expense-comprovante-preview');
      preview.src = e.target.result;
      preview.style.display = 'block';
    };
    reader.readAsDataURL(file);
  },

  removeComprovante() {
    this._pendingComprovante = null;
    document.getElementById('expense-comprovante-preview').style.display = 'none';
    document.getElementById('expense-comprovante-input').value = '';
  },

  async submitForm(evt) {
    evt.preventDefault();
    const tipo = document.getElementById('expense-type').value;
    const nome = document.getElementById('expense-nome').value.trim();
    const valor = parseFloat(document.getElementById('expense-valor').value);
    const categoria = document.getElementById('expense-categoria').value;
    const status = document.getElementById('expense-status').value;
    const observacao = document.getElementById('expense-observacao').value.trim() || null;
    const vencimento = document.getElementById('expense-vencimento').value.trim() || null;
    const dataCompra = document.getElementById('expense-data').value || null;
    const formaPagamento = document.getElementById('expense-forma-pagamento').value || null;

    if (!nome || Number.isNaN(valor) || valor <= 0) {
      alert('Preencha o nome e um valor válido para a despesa.');
      return;
    }

    const isRecorrente = tipo === 'recorrente';
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
    item.comprovante = this._pendingComprovante || null;
    item.data = dataCompra;

    item.formaPagamento = formaPagamento;

    if (isRecorrente) {
      item.frequencia = item.frequencia || 'mensal';
      item.tipo = item.tipo || 'fixa';
      item.vencimento = vencimento;
      // Com data informada, calcula a partir de qual mês essa recorrente passa
      // a contar (considera o fechamento do cartão, igual à despesa variável);
      // sem data, preserva o que já estava salvo (null = sempre contou).
      item.inicioMesReferencia = dataCompra
        ? Calc.calculateExpenseMonth(appData, dataCompra, formaPagamento)
        : (item.inicioMesReferencia || null);
    } else {
      // Com data informada, o mês é recalculado (considera o fechamento do
      // cartão se a forma de pagamento for "cartão"); sem data, preserva o
      // mês já salvo (edição) ou usa o mês atual (despesa nova).
      item.mesReferencia = dataCompra
        ? Calc.calculateExpenseMonth(appData, dataCompra, formaPagamento)
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
function confirmDialog(message, opts = {}) {
  const { title = 'Atenção', showCancel = true, confirmLabel = 'Continuar', cancelLabel = 'Cancelar', danger = false } = opts;
  return new Promise((resolve) => {
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
