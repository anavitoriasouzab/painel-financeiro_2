/**
 * profile.js
 * -----------------------------------------------------------------------
 * Tela de Perfil: foto e nome do usuário (editáveis aqui), e um resumo
 * das metas já cadastradas. A edição completa de metas (criar, progresso,
 * valor mensal necessário) chega na Fase 6 — aqui é só leitura.
 */

const Profile = {
  render(data) {
    this._renderHeaderAvatar(data);
    this._renderForm(data);
    Income.render(data);
    this._renderGoalsSummary(data);
    this._renderCommitmentSettings(data);
    this._renderMargemSettings(data);
  },

  _renderCommitmentSettings(data) {
    const cfg = data.configuracoes.limiteComprometimento || {};
    const pctInput = document.getElementById('settings-limite-percentual');
    const modoSelect = document.getElementById('settings-limite-modo');
    if (pctInput) pctInput.value = cfg.percentual != null ? cfg.percentual : '';
    if (modoSelect) modoSelect.value = cfg.modo || 'confirmacao';
  },

  saveCommitmentSettings() {
    const pctRaw = document.getElementById('settings-limite-percentual').value;
    const modo = document.getElementById('settings-limite-modo').value;
    const percentual = pctRaw === '' ? null : parseFloat(pctRaw);
    if (percentual != null && (Number.isNaN(percentual) || percentual <= 0 || percentual > 100)) {
      alert('Informe um percentual entre 1 e 100 (ou deixe em branco para desativar o limite).');
      return;
    }
    appData.configuracoes.limiteComprometimento = { percentual, modo };
    Storage.save(appData);
    Dashboard.render(appData);
    toast(percentual == null ? 'Limite de comprometimento desativado.' : 'Limite de comprometimento salvo.');
  },

  /**
   * Margem de segurança: valor em R$ reservado do saldo antes de contar como
   * "potencial de investimento" — sem isso, Calc.calculateInvestmentCapacity
   * cai no fallback e mostra o saldo cheio (ver comentário lá).
   */
  _renderMargemSettings(data) {
    const input = document.getElementById('settings-margem-seguranca');
    if (input) input.value = data.configuracoes.margemSeguranca != null ? data.configuracoes.margemSeguranca : '';
  },

  saveMargemSettings() {
    const raw = document.getElementById('settings-margem-seguranca').value;
    const margem = raw === '' ? null : parseFloat(raw);
    if (margem != null && (Number.isNaN(margem) || margem < 0)) {
      alert('Informe um valor válido (ou deixe em branco para desativar a margem).');
      return;
    }
    appData.configuracoes.margemSeguranca = margem;
    Storage.save(appData);
    Dashboard.render(appData);
    Charts.render(appData);
    toast(margem == null ? 'Margem de segurança desativada.' : 'Margem de segurança salva.');
  },

  openReservaModal() {
    const reserva = appData.reservaEmergencia || {};
    document.getElementById('reserva-valor-atual').value = reserva.valorAtual != null ? reserva.valorAtual : '';
    document.getElementById('reserva-meta-valor').value = reserva.metaValor != null ? reserva.metaValor : '';
    document.getElementById('reserva-valor-mensal').value = reserva.valorMensalDestinado != null ? reserva.valorMensalDestinado : '';
    document.getElementById('reserva-remove-btn').style.display = reserva.metaValor != null ? '' : 'none';
    document.getElementById('reserva-modal').classList.add('active');
  },

  closeReservaModal() {
    document.getElementById('reserva-modal').classList.remove('active');
  },

  submitReservaModal(evt) {
    evt.preventDefault();
    const parseOrNull = (id) => {
      const raw = document.getElementById(id).value;
      return raw === '' ? null : parseFloat(raw);
    };
    const valorAtual = parseOrNull('reserva-valor-atual');
    const metaValor = parseOrNull('reserva-meta-valor');
    const valorMensalDestinado = parseOrNull('reserva-valor-mensal');
    for (const v of [valorAtual, metaValor, valorMensalDestinado]) {
      if (v != null && (Number.isNaN(v) || v < 0)) {
        alert('Informe valores válidos (ou deixe em branco).');
        return;
      }
    }
    if (metaValor == null) {
      alert('Informe o valor da meta.');
      return;
    }
    appData.reservaEmergencia = { possui: true, valorAtual, metaValor, valorMensalDestinado };
    Storage.save(appData);
    this.closeReservaModal();
    Dashboard.render(appData);
    Charts.render(appData);
    toast('Meta de reserva salva.');
  },

  /**
   * Popup rápido só pra atualizar "quanto já tenho guardado" (valorAtual) —
   * sem passar pelo formulário completo de meta/aporte mensal. Só faz
   * sentido com uma meta já configurada (o botão que abre isso nem aparece
   * antes disso, ver Charts._renderReservaGoal).
   */
  openReservaValorModal() {
    const reserva = appData.reservaEmergencia || {};
    document.getElementById('reserva-valor-novo').value = reserva.valorAtual != null ? reserva.valorAtual : '';
    document.getElementById('reserva-valor-modal').classList.add('active');
  },

  closeReservaValorModal() {
    document.getElementById('reserva-valor-modal').classList.remove('active');
  },

  submitReservaValorModal(evt) {
    evt.preventDefault();
    const raw = document.getElementById('reserva-valor-novo').value;
    const valorAtual = raw === '' ? null : parseFloat(raw);
    if (valorAtual == null || Number.isNaN(valorAtual) || valorAtual < 0) {
      alert('Informe um valor válido.');
      return;
    }
    const reserva = appData.reservaEmergencia || {};
    appData.reservaEmergencia = { ...reserva, possui: true, valorAtual };
    Storage.save(appData);
    this.closeReservaValorModal();
    Dashboard.render(appData);
    Charts.render(appData);
    toast('Valor guardado atualizado.');
  },

  async removeReserva() {
    if (!await confirmDialog('Remover a meta de reserva de emergência? O valor guardado e o aporte mensal configurados também serão apagados.', { title: 'Remover meta', confirmLabel: 'Remover', danger: true })) return;
    appData.reservaEmergencia = { possui: false, valorAtual: null, metaValor: null, valorMensalDestinado: null };
    Storage.save(appData);
    this.closeReservaModal();
    Dashboard.render(appData);
    Charts.render(appData);
    toast('Meta de reserva removida.');
  },

  _renderHeaderAvatar(data) {
    this._applyAvatar('header-avatar-img', 'header-avatar-placeholder', data);
    this._applyAvatar('side-avatar-img', 'side-avatar-placeholder', data);

    const label = document.getElementById('greeting-name');
    if (label) label.textContent = data.perfil.nome ? `Olá, ${firstName(data.perfil.nome)}! 👋` : 'Olá! 👋';

    const sideLabel = document.getElementById('side-greeting-name');
    if (sideLabel) sideLabel.textContent = data.perfil.nome ? `Olá, ${firstName(data.perfil.nome)}!` : 'Olá! 👋';
  },

  _applyAvatar(imgId, placeholderId, data) {
    const img = document.getElementById(imgId);
    const placeholder = document.getElementById(placeholderId);
    if (!img || !placeholder) return;
    if (data.perfil.foto) {
      img.src = data.perfil.foto;
      img.style.display = 'block';
      placeholder.style.display = 'none';
    } else {
      img.style.display = 'none';
      placeholder.style.display = 'flex';
      setAvatarPlaceholderContent(placeholder, data.perfil.nome);
    }
  },

  _renderForm(data) {
    const nomeInput = document.getElementById('profile-nome');
    if (nomeInput) nomeInput.value = data.perfil.nome || '';

    const preview = document.getElementById('profile-photo-preview');
    const placeholder = document.getElementById('profile-photo-placeholder');
    if (preview && placeholder) {
      if (data.perfil.foto) {
        preview.src = data.perfil.foto;
        preview.style.display = 'block';
        placeholder.style.display = 'none';
      } else {
        preview.style.display = 'none';
        placeholder.style.display = 'flex';
        setAvatarPlaceholderContent(placeholder, data.perfil.nome);
      }
    }

    const removeBtn = document.getElementById('profile-photo-remove-btn');
    if (removeBtn) removeBtn.style.display = data.perfil.foto ? 'inline-flex' : 'none';
  },

  /** Resumo minimalista (nome + um número só) — mesmo padrão de chip já
      usado nas metas em destaque do Dashboard (ver Dashboard._renderGoalsSummary
      e .dash-mini-chip); edição completa (valor guardado, prazo, observação)
      continua na tela de Metas, esta aqui é só um relance rápido. */
  _renderGoalsSummary(data) {
    const wrap = document.getElementById('profile-goals-summary');
    if (!wrap) return;
    if (!data.metas.length) {
      wrap.innerHTML = '<p class="muted-text">Nenhuma meta cadastrada ainda.</p>';
      return;
    }
    wrap.innerHTML = data.metas.map((m) => {
      const prog = Calc.calculateGoalProgress(m);
      const detalhe = prog ? formatPercent(prog.percent) : (m.valorMensalDesejado != null ? `${formatBRL(m.valorMensalDesejado)}/mês` : '');
      return `
        <div class="dash-mini-chip dash-mini-chip-link" role="button" tabindex="0" onclick="Profile.goToGoals()" onkeydown="if(event.key==='Enter')Profile.goToGoals()">
          <span class="material-symbols-outlined" aria-hidden="true">track_changes</span> <span style="flex:1;">${escapeHtml(m.nome)}</span><strong>${detalhe}</strong>
        </div>
      `;
    }).join('');
  },

  /** Clicar numa meta do resumo leva pra tela de Planejamento, onde a lista
      completa de metas vive de verdade (criar/editar/excluir) — este resumo
      aqui é só leitura. */
  goToGoals() {
    navigateTo('planejamento');
    const anchor = document.getElementById('planejamento-goals-anchor');
    if (anchor) anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  handlePhotoChange(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) {
      alert('Imagem muito grande (limite de ~1,5MB). Escolha uma foto menor.');
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      appData.perfil.foto = e.target.result;
      Storage.save(appData);
      this.render(appData);
      toast('Foto atualizada.');
    };
    reader.readAsDataURL(file);
  },

  removePhoto() {
    appData.perfil.foto = null;
    Storage.save(appData);
    this.render(appData);
  },

  saveName() {
    const nomeInput = document.getElementById('profile-nome');
    appData.perfil.nome = nomeInput.value.trim() || null;
    Storage.save(appData);
    this.render(appData);
    toast('Perfil atualizado.');
  },
};

function initials(nome) {
  if (!nome) return null;
  return nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

/** Ícone de pessoa (Material Symbols) usado quando ainda não há nome
    cadastrado — substitui o antigo emoji 🙂 como placeholder, seguindo a
    mesma fonte de ícones (fonts.google.com/icons) usada no resto do app. */
const AVATAR_FALLBACK_ICON = '<span class="material-symbols-outlined" aria-hidden="true">person</span>';

function setAvatarPlaceholderContent(placeholder, nome) {
  const iniciais = initials(nome);
  if (iniciais) {
    placeholder.textContent = iniciais;
  } else {
    placeholder.innerHTML = AVATAR_FALLBACK_ICON;
  }
}

function firstName(nome) {
  return nome.trim().split(/\s+/)[0];
}

/**
 * Renda (Perfil): fontes de renda fixas (mensais, contam todo mês) ou
 * extras (contam só no mês em que foram lançadas — mesma lógica de
 * mesReferencia já usada em despesas variáveis).
 */
const Income = {
  editingId: null,

  render(data) {
    const list = document.getElementById('income-list');
    if (!list) return;
    if (!data.rendas.length) {
      list.innerHTML = '<div class="coming-soon"><p>Nenhuma renda cadastrada ainda.</p></div>';
      return;
    }
    list.innerHTML = data.rendas.map((r) => this._buildCard(r)).join('');
    list.querySelectorAll('[data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', () => this.openForm(btn.dataset.id));
    });
    list.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', () => this.deleteItem(btn.dataset.id));
    });
  },

  _buildCard(r) {
    const isExtra = r.frequencia === 'unica';
    const meta = isExtra
      ? `Extra · ${formatMonthKey(r.mesReferencia)}`
      : `Fixa · ${r.diaRecebimento != null ? `dia ${r.diaRecebimento}` : 'dia não informado'}`;
    return `
      <div class="account-card">
        <div class="account-main">
          <div class="account-name">${escapeHtml(r.nome)}</div>
          <div class="account-meta">${meta}</div>
        </div>
        <div class="account-side">
          <div class="account-value">${formatBRL(r.valor)}</div>
          <div class="account-side-row">
            <button class="mini-btn icon-btn" data-action="edit" data-id="${r.id}" title="Editar" aria-label="Editar renda"><span class="material-symbols-outlined" aria-hidden="true">edit</span></button>
            <button class="mini-btn icon-btn danger" data-action="delete" data-id="${r.id}" title="Excluir" aria-label="Excluir renda"><span class="material-symbols-outlined" aria-hidden="true">delete</span></button>
          </div>
        </div>
      </div>
    `;
  },

  openForm(id) {
    const item = id ? appData.rendas.find((r) => r.id === id) : null;
    this.editingId = id;
    const isExtra = item && item.frequencia === 'unica';

    document.getElementById('income-form-title').textContent = item ? 'Editar renda' : 'Nova renda';
    document.getElementById('income-type').value = isExtra ? 'extra' : 'fixa';
    document.querySelectorAll('#income-type-toggle button').forEach((b) => b.classList.toggle('active', b.dataset.type === (isExtra ? 'extra' : 'fixa')));
    document.getElementById('field-income-dia').style.display = isExtra ? 'none' : 'block';
    document.getElementById('field-income-data').style.display = isExtra ? 'block' : 'none';

    document.getElementById('income-nome').value = item ? item.nome : '';
    document.getElementById('income-valor').value = item ? item.valor : '';
    document.getElementById('income-dia').value = item && item.diaRecebimento != null ? item.diaRecebimento : '';
    document.getElementById('income-data').value = item && item.data ? item.data : '';
    document.getElementById('income-observacao').value = item ? item.observacao || '' : '';

    document.getElementById('income-modal').classList.add('active');
  },

  closeForm() {
    document.getElementById('income-modal').classList.remove('active');
    this.editingId = null;
  },

  toggleType(tipo) {
    document.getElementById('income-type').value = tipo;
    document.querySelectorAll('#income-type-toggle button').forEach((b) => b.classList.toggle('active', b.dataset.type === tipo));
    document.getElementById('field-income-dia').style.display = tipo === 'extra' ? 'none' : 'block';
    document.getElementById('field-income-data').style.display = tipo === 'extra' ? 'block' : 'none';
  },

  submitForm(evt) {
    evt.preventDefault();
    const tipo = document.getElementById('income-type').value;
    const nome = document.getElementById('income-nome').value.trim();
    const valor = parseFloat(document.getElementById('income-valor').value);
    const diaRaw = document.getElementById('income-dia').value;
    const dataRaw = document.getElementById('income-data').value || null;
    const observacao = document.getElementById('income-observacao').value.trim() || null;

    if (!nome || Number.isNaN(valor) || valor <= 0) {
      alert('Preencha o nome e um valor válido para a renda.');
      return;
    }

    let item = this.editingId ? appData.rendas.find((r) => r.id === this.editingId) : null;
    if (!item) {
      item = { id: generateId('renda') };
      appData.rendas.push(item);
    }

    item.nome = nome;
    item.valor = valor;
    item.observacao = observacao;

    if (tipo === 'extra') {
      item.frequencia = 'unica';
      item.data = dataRaw;
      item.mesReferencia = dataRaw ? dataRaw.slice(0, 7) : appData.meta.mesReferenciaAtual;
      item.diaRecebimento = null;
    } else {
      item.frequencia = 'mensal';
      item.diaRecebimento = diaRaw === '' ? null : parseInt(diaRaw, 10);
      item.data = null;
      item.mesReferencia = null;
    }

    Storage.save(appData);
    this.closeForm();
    this.render(appData);
    Dashboard.render(appData);
    toast(this.editingId ? 'Renda atualizada.' : 'Renda adicionada.');
  },

  async deleteItem(id) {
    if (!await confirmDialog('Excluir esta renda? Essa ação não pode ser desfeita.', { title: 'Excluir renda', confirmLabel: 'Excluir', danger: true })) return;
    appData.rendas = appData.rendas.filter((r) => r.id !== id);
    Storage.save(appData);
    this.render(appData);
    Dashboard.render(appData);
    toast('Renda excluída.');
  },
};
