/**
 * installments.js
 * -----------------------------------------------------------------------
 * Sistema próprio de parcelamentos (Fase 3): cada compra é cadastrada
 * individualmente mas todas se consolidam na mesma fatura do cartão.
 * O app calcula sozinho quantas parcelas faltam, quando cada uma termina
 * e quanto de margem mensal é liberada conforme elas vão acabando.
 */

const Installments = {
  editingId: null,
  editingCardId: null,

  render(data) {
    this._renderSummary(data);
    this._renderCards(data);
    this._renderUpcoming(data);
    this._renderList(data);
  },

  _renderSummary(data) {
    const el = document.getElementById('installments-total');
    if (el) el.textContent = formatBRL(Calc.calculateInstallmentsMonthlyTotal(data));
    const countEl = document.getElementById('installments-count');
    if (countEl) countEl.textContent = `${data.parcelamentos.length} compra(s) ativa(s) neste cartão`;
  },

  /** Lista de cartões cadastrados (nome + fechamento + vencimento), com editar/excluir. */
  _renderCards(data) {
    const list = document.getElementById('cards-list');
    if (!list) return;
    if (!data.cartoes.length) {
      list.innerHTML = '<div class="coming-soon"><p>Nenhum cartão cadastrado ainda.</p></div>';
      return;
    }
    list.innerHTML = data.cartoes.map((c) => `
      <div class="account-card">
        <div class="account-main">
          <div class="account-name">${escapeHtml(c.nome)}</div>
          <div class="account-meta">${c.diaFechamento != null ? `Fechamento: dia ${c.diaFechamento}` : 'Fechamento não informado'} · ${c.diaVencimento != null ? `Vencimento: dia ${c.diaVencimento}` : 'Vencimento não informado'}</div>
        </div>
        <div class="account-actions">
          <button class="mini-btn" data-action="edit" data-id="${c.id}">Editar</button>
          <button class="mini-btn danger" data-action="delete" data-id="${c.id}">Excluir</button>
        </div>
      </div>
    `).join('');
    list.querySelectorAll('[data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', () => this.openCardForm(btn.dataset.id));
    });
    list.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', () => this.deleteCard(btn.dataset.id));
    });
  },

  /** Abre o formulário de cartão (criar id=null, ou editar). */
  openCardForm(id) {
    const item = id ? appData.cartoes.find((c) => c.id === id) : null;
    this.editingCardId = id;
    document.getElementById('card-form-title').textContent = item ? 'Editar cartão' : 'Novo cartão';
    document.getElementById('card-nome').value = item ? item.nome : '';
    document.getElementById('card-fechamento').value = item && item.diaFechamento != null ? item.diaFechamento : '';
    document.getElementById('card-vencimento').value = item && item.diaVencimento != null ? item.diaVencimento : '';
    document.getElementById('card-modal').classList.add('active');
  },

  closeCardForm() {
    document.getElementById('card-modal').classList.remove('active');
    this.editingCardId = null;
  },

  submitCardForm(evt) {
    evt.preventDefault();
    const nome = document.getElementById('card-nome').value.trim();
    const fechamentoRaw = document.getElementById('card-fechamento').value;
    const vencimentoRaw = document.getElementById('card-vencimento').value;

    if (!nome) { alert('Dê um nome para o cartão.'); return; }

    const fechamento = fechamentoRaw === '' ? null : parseInt(fechamentoRaw, 10);
    const vencimento = vencimentoRaw === '' ? null : parseInt(vencimentoRaw, 10);
    if ((fechamento != null && (Number.isNaN(fechamento) || fechamento < 1 || fechamento > 31))
      || (vencimento != null && (Number.isNaN(vencimento) || vencimento < 1 || vencimento > 31))) {
      alert('Informe dias entre 1 e 31 (ou deixe em branco).');
      return;
    }

    let item = this.editingCardId ? appData.cartoes.find((c) => c.id === this.editingCardId) : null;
    if (!item) {
      item = { id: generateId('cartao'), limite: null, limiteDisponivel: null, valorFaturaAtual: null };
      appData.cartoes.push(item);
    }
    item.nome = nome;
    item.diaFechamento = fechamento;
    item.diaVencimento = vencimento;

    Storage.save(appData);
    this.closeCardForm();
    this.render(appData);
    toast(this.editingCardId ? 'Cartão atualizado.' : 'Cartão adicionado.');
  },

  /** Exclui um cartão — parcelamentos vinculados a ele ficam sem cartão (igual ao "on delete set null" do banco). */
  async deleteCard(id) {
    if (!await confirmDialog('Excluir este cartão?', { title: 'Excluir cartão', confirmLabel: 'Excluir', danger: true })) return;
    const emUso = appData.parcelamentos.filter((p) => p.cartaoId === id);
    if (emUso.length && !await confirmDialog(`${emUso.length} parcelamento(s) estão vinculados a este cartão e ficarão sem cartão associado. Continuar?`, { title: 'Cartão em uso', confirmLabel: 'Continuar', danger: true })) return;
    emUso.forEach((p) => { p.cartaoId = null; });
    appData.cartoes = appData.cartoes.filter((c) => c.id !== id);
    Storage.save(appData);
    this.render(appData);
    toast('Cartão excluído.');
  },

  _renderUpcoming(data) {
    const wrap = document.getElementById('upcoming-endings');
    if (!wrap) return;
    const upcoming = Calc.calculateUpcomingEndings(data, 2);
    if (!upcoming.length) {
      wrap.innerHTML = '<p class="muted-text">Nenhum parcelamento com término previsto nos próximos meses.</p>';
      return;
    }
    const margem = Calc.calculateMarginFreedNextMonth(data);
    wrap.innerHTML = `
      ${margem > 0 ? `<div class="notice-card success" style="margin-bottom:10px;">💰 Margem liberada a partir do próximo mês: <strong>${formatBRL(margem)}</strong></div>` : ''}
      <div class="ending-list">
        ${upcoming.map((x) => `
          <div class="ending-row">
            <span class="name">${escapeHtml(x.parcelamento.nome)}</span>
            <span class="detail">${formatBRL(x.parcelamento.valorParcela)}/mês · termina em ${x.endMonthLabel}</span>
          </div>
        `).join('')}
      </div>
    `;
  },

  _renderList(data) {
    const list = document.getElementById('installments-list');
    if (!list) return;
    list.innerHTML = '';
    if (!data.parcelamentos.length) {
      list.innerHTML = '<div class="coming-soon"><p>Nenhum parcelamento cadastrado.</p></div>';
      return;
    }
    data.parcelamentos.forEach((p) => list.appendChild(this._buildCard(p, data)));
  },

  _buildCard(p, data) {
    const info = Calc.calculateInstallmentEndInfo(p, data.meta.mesReferenciaAtual);
    const progresso = p.totalParcelas && p.parcelaAtual
      ? `Parcela ${p.parcelaAtual}/${p.totalParcelas}`
      : (p.parcelasRestantes === 0 ? 'Última parcela' : `${p.parcelasRestantes} parcela(s) restante(s)`);

    const el = document.createElement('div');
    el.className = 'account-card';
    el.innerHTML = `
      <div class="account-main">
        <div class="account-name">${escapeHtml(p.nome)}</div>
        <div class="account-meta">${escapeHtml(p.categoria || 'Sem categoria')} · ${escapeHtml(progresso)} · termina em ${escapeHtml(info.endMonthLabel)}</div>
      </div>
      <div class="account-side">
        <div class="account-value">${formatBRL(p.valorParcela)}<span class="unit">/mês</span></div>
      </div>
      <div class="account-actions">
        <button class="mini-btn" data-action="edit">Editar</button>
        <button class="mini-btn danger" data-action="delete">Excluir</button>
      </div>
    `;
    el.querySelector('[data-action="edit"]').addEventListener('click', () => this.openForm(p.id));
    el.querySelector('[data-action="delete"]').addEventListener('click', () => this.deleteItem(p.id));
    return el;
  },

  async deleteItem(id) {
    if (!await confirmDialog('Excluir este parcelamento? Essa ação não pode ser desfeita.', { title: 'Excluir parcelamento', confirmLabel: 'Excluir', danger: true })) return;
    appData.parcelamentos = appData.parcelamentos.filter((p) => p.id !== id);
    Storage.save(appData);
    this.render(appData);
    Dashboard.render(appData);
    toast('Parcelamento excluído.');
  },

  openForm(id) {
    const item = id ? appData.parcelamentos.find((p) => p.id === id) : null;
    this.editingId = id;

    document.getElementById('installment-form-title').textContent = item ? 'Editar parcelamento' : 'Novo parcelamento';
    document.getElementById('installment-nome').value = item ? item.nome : '';
    document.getElementById('installment-valor').value = item ? item.valorParcela : '';
    document.getElementById('installment-total').value = item && item.totalParcelas != null ? item.totalParcelas : '';
    document.getElementById('installment-atual').value = item && item.parcelaAtual != null ? item.parcelaAtual : '';
    document.getElementById('installment-restantes').value = item && item.parcelasRestantes != null ? item.parcelasRestantes : '';
    document.getElementById('installment-observacao').value = item ? item.observacao || '' : '';

    this._populateCategoriaSelect(item ? item.categoria : null);
    document.getElementById('installment-modal').classList.add('active');
  },

  closeForm() {
    document.getElementById('installment-modal').classList.remove('active');
    this.editingId = null;
  },

  _populateCategoriaSelect(selected) {
    const select = document.getElementById('installment-categoria');
    select.innerHTML = '';
    appData.categorias.forEach((cat) => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      if (cat === selected) opt.selected = true;
      select.appendChild(opt);
    });
  },

  /** Se total e atual forem preenchidos, calcula restantes automaticamente. */
  recalcRestantes() {
    const total = parseInt(document.getElementById('installment-total').value, 10);
    const atual = parseInt(document.getElementById('installment-atual').value, 10);
    if (!Number.isNaN(total) && !Number.isNaN(atual) && total > 0 && atual > 0) {
      document.getElementById('installment-restantes').value = Math.max(total - atual, 0);
    }
  },

  async submitForm(evt) {
    evt.preventDefault();
    const nome = document.getElementById('installment-nome').value.trim();
    const valorParcela = parseFloat(document.getElementById('installment-valor').value);
    const totalRaw = document.getElementById('installment-total').value;
    const atualRaw = document.getElementById('installment-atual').value;
    const restantesRaw = document.getElementById('installment-restantes').value;
    const categoria = document.getElementById('installment-categoria').value;
    const observacao = document.getElementById('installment-observacao').value.trim() || null;

    if (!nome || Number.isNaN(valorParcela) || valorParcela <= 0) {
      alert('Preencha nome e um valor de parcela válido.');
      return;
    }
    if (restantesRaw === '') {
      alert('Informe quantas parcelas restam (pode ser 0, se esta for a última).');
      return;
    }

    let item = this.editingId ? appData.parcelamentos.find((p) => p.id === this.editingId) : null;

    // Parcelamentos impactam o mês corrente (e os seguintes) assim que cadastrados.
    const oldValor = item ? item.valorParcela : 0;
    if (!(await confirmCommitmentImpact(valorParcela - oldValor))) return;

    if (!item) {
      item = { id: generateId('parc'), cartaoId: (appData.cartoes[0] && appData.cartoes[0].id) || null };
      appData.parcelamentos.push(item);
    }

    item.nome = nome;
    item.valorParcela = valorParcela;
    item.totalParcelas = totalRaw === '' ? null : parseInt(totalRaw, 10);
    item.parcelaAtual = atualRaw === '' ? null : parseInt(atualRaw, 10);
    item.parcelasRestantes = parseInt(restantesRaw, 10);
    item.categoria = categoria;
    item.observacao = observacao;
    item.dataPrimeiraParcela = item.dataPrimeiraParcela || null;
    item.statusDescricao = item.parcelasRestantes === 0 ? 'última parcela' : null;

    Storage.save(appData);
    this.closeForm();
    this.render(appData);
    Dashboard.render(appData);
    toast(this.editingId ? 'Parcelamento atualizado.' : 'Parcelamento adicionado.');
  },
};
