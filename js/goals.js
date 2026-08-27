/**
 * goals.js
 * -----------------------------------------------------------------------
 * Fase 6: metas financeiras (criar/editar/excluir, progresso, valor mensal
 * necessário comparado à capacidade de investimento), simulador "E se eu
 * investir?" e a ferramenta "Posso fazer este gasto?".
 */

const Goals = {
  editingId: null,

  render(data) {
    this._renderList(data);
  },

  _renderList(data) {
    const list = document.getElementById('goals-list');
    if (!list) return;
    const capacidadeEquilibrada = Calc.calculateInvestmentScenarios(data, data.meta.mesReferenciaAtual).equilibrado;

    if (!data.metas.length) {
      list.innerHTML = '<p class="muted-text">Nenhuma meta cadastrada ainda.</p>';
      return;
    }

    list.innerHTML = '';
    data.metas.forEach((m) => list.appendChild(this._buildGoalCard(m, capacidadeEquilibrada)));
  },

  _buildGoalCard(m, capacidadeEquilibrada) {
    const el = document.createElement('div');
    el.className = 'goal-card';

    if (m.valorDesejado != null) {
      const prog = Calc.calculateGoalProgress(m);
      const mensalNecessario = Calc.calculateMonthlyRequired(m);
      const compat = Calc.compareGoalToCapacity(mensalNecessario, capacidadeEquilibrada);
      el.innerHTML = `
        <div class="goal-card-header">
          <div class="goal-name">${escapeHtml(m.nome)}</div>
          <div class="goal-actions">
            <button class="mini-btn" data-action="edit">Editar</button>
            <button class="mini-btn danger" data-action="delete">Excluir</button>
          </div>
        </div>
        <div class="progress-track"><div class="progress-fill" style="width:${prog.percent}%"></div></div>
        <div class="goal-progress-meta">
          <span>${formatBRL(m.valorAtual || 0)} / ${formatBRL(m.valorDesejado)}</span>
          <span>${formatPercent(prog.percent)}</span>
        </div>
        <div class="goal-progress-meta"><span>Faltam ${formatBRL(prog.restante)}</span></div>
        ${mensalNecessario != null ? `
          <div class="notice-card ${compat === 'compativel' ? 'success' : 'warning'}" style="margin-top:10px;">
            ${compat === 'compativel' ? '<span class="material-symbols-outlined" aria-hidden="true">check_circle</span>' : '<span class="material-symbols-outlined" aria-hidden="true">warning</span>'}
            Para alcançar em ${m.prazoMeses} mês(es), guarde ~${formatBRL(mensalNecessario)}/mês.
            ${compat === 'compativel' ? 'Compatível com sua capacidade estimada.' : 'Acima da sua capacidade estimada — considere aumentar o prazo ou reduzir o valor mensal.'}
          </div>
        ` : `<p class="muted-text" style="margin-top:8px;">Informe um prazo para ver quanto guardar por mês.</p>`}
      `;
    } else {
      el.innerHTML = `
        <div class="goal-card-header">
          <div class="goal-name">${escapeHtml(m.nome)}</div>
          <div class="goal-actions">
            <button class="mini-btn" data-action="edit">Editar</button>
            <button class="mini-btn danger" data-action="delete">Excluir</button>
          </div>
        </div>
        <div class="goal-progress-meta"><span>Meta de hábito mensal: guardar ${formatBRL(m.valorMensalDesejado)}/mês</span></div>
        ${m.observacao ? `<div class="goal-obs">${escapeHtml(m.observacao)}</div>` : ''}
      `;
    }

    el.querySelector('[data-action="edit"]').addEventListener('click', () => this.openForm(m.id));
    el.querySelector('[data-action="delete"]').addEventListener('click', () => this.deleteGoal(m.id));
    return el;
  },

  async deleteGoal(id) {
    if (!await confirmDialog('Excluir esta meta? Essa ação não pode ser desfeita.', { title: 'Excluir meta', confirmLabel: 'Excluir', danger: true })) return;
    appData.metas = appData.metas.filter((m) => m.id !== id);
    Storage.save(appData);
    this.render(appData);
    Profile.render(appData);
    Dashboard.render(appData);
    toast('Meta excluída.');
  },

  openForm(id) {
    const item = id ? appData.metas.find((m) => m.id === id) : null;
    this.editingId = id;
    const isHabito = item && item.valorDesejado == null;

    document.getElementById('goal-form-title').textContent = item ? 'Editar meta' : 'Nova meta';
    document.getElementById('goal-type').value = isHabito ? 'habito' : 'valor';
    document.querySelectorAll('#goal-type-toggle button').forEach((b) => b.classList.toggle('active', b.dataset.type === (isHabito ? 'habito' : 'valor')));
    document.getElementById('goal-field-valor').style.display = isHabito ? 'none' : 'block';
    document.getElementById('goal-field-habito').style.display = isHabito ? 'block' : 'none';

    document.getElementById('goal-nome').value = item ? item.nome : '';
    document.getElementById('goal-valor-desejado').value = item && item.valorDesejado != null ? item.valorDesejado : '';
    document.getElementById('goal-valor-atual').value = item && item.valorAtual != null ? item.valorAtual : '';
    document.getElementById('goal-prazo').value = item && item.prazoMeses != null ? item.prazoMeses : '';
    document.getElementById('goal-valor-mensal').value = item && item.valorMensalDesejado != null ? item.valorMensalDesejado : '';
    document.getElementById('goal-prioridade').value = item ? item.prioridade || 'média' : 'média';
    document.getElementById('goal-observacao').value = item ? item.observacao || '' : '';
    document.getElementById('goal-destaque').checked = !!(item && item.destaque);

    this._bindPresetChips();
    document.getElementById('goal-modal').classList.add('active');
  },

  _bindPresetChips() {
    const wrap = document.getElementById('goal-preset-chips');
    if (!wrap || wrap.dataset.bound) return;
    wrap.dataset.bound = 'true';
    wrap.querySelectorAll('.chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        document.getElementById('goal-nome').value = chip.dataset.preset;
      });
    });
  },

  closeForm() {
    document.getElementById('goal-modal').classList.remove('active');
    this.editingId = null;
  },

  submitForm(evt) {
    evt.preventDefault();
    const tipo = document.getElementById('goal-type').value;
    const nome = document.getElementById('goal-nome').value.trim();
    const prioridade = document.getElementById('goal-prioridade').value;
    const observacao = document.getElementById('goal-observacao').value.trim() || null;
    const destaqueDesejado = document.getElementById('goal-destaque').checked;

    if (!nome) { alert('Dê um nome para a meta.'); return; }

    let item = this.editingId ? appData.metas.find((m) => m.id === this.editingId) : null;

    if (destaqueDesejado) {
      const outrasDestacadas = appData.metas.filter((m) => m.destaque && m !== item).length;
      if (outrasDestacadas >= 2) {
        alert('Você já tem 2 metas em destaque no menu lateral. Remova o destaque de uma delas antes de adicionar esta.');
        return;
      }
    }

    if (!item) {
      item = { id: generateId('meta') };
      appData.metas.push(item);
    }

    item.nome = nome;
    item.prioridade = prioridade;
    item.observacao = observacao;
    item.destaque = destaqueDesejado;

    if (tipo === 'habito') {
      const valorMensal = parseFloat(document.getElementById('goal-valor-mensal').value);
      if (Number.isNaN(valorMensal) || valorMensal <= 0) { alert('Informe um valor mensal válido.'); return; }
      item.valorMensalDesejado = valorMensal;
      item.valorDesejado = null;
      item.valorAtual = null;
      item.prazoMeses = null;
    } else {
      const valorDesejado = parseFloat(document.getElementById('goal-valor-desejado').value);
      const valorAtualRaw = document.getElementById('goal-valor-atual').value;
      const prazoRaw = document.getElementById('goal-prazo').value;
      if (Number.isNaN(valorDesejado) || valorDesejado <= 0) { alert('Informe um valor desejado válido.'); return; }
      item.valorDesejado = valorDesejado;
      item.valorAtual = valorAtualRaw === '' ? 0 : parseFloat(valorAtualRaw);
      item.prazoMeses = prazoRaw === '' ? null : parseInt(prazoRaw, 10);
      item.valorMensalDesejado = null;
    }

    Storage.save(appData);
    this.closeForm();
    this.render(appData);
    Profile.render(appData);
    Dashboard.render(appData);
    toast(this.editingId ? 'Meta atualizada.' : 'Meta criada.');
  },

  toggleType(tipo) {
    document.getElementById('goal-type').value = tipo;
    document.querySelectorAll('#goal-type-toggle button').forEach((b) => b.classList.toggle('active', b.dataset.type === tipo));
    document.getElementById('goal-field-valor').style.display = tipo === 'valor' ? 'block' : 'none';
    document.getElementById('goal-field-habito').style.display = tipo === 'habito' ? 'block' : 'none';
  },
};

const Simulator = {
  run() {
    const valor = parseFloat(document.getElementById('sim-valor').value);
    const taxaPercent = parseFloat(document.getElementById('sim-taxa').value);
    const taxaMensal = Number.isNaN(taxaPercent) ? 0 : taxaPercent / 100;

    if (Number.isNaN(valor) || valor <= 0) { alert('Informe um valor mensal válido para simular.'); return; }

    const resultados = Calc.simulateInvestment(valor, [6, 12, 24, 60], taxaMensal);
    const wrap = document.getElementById('sim-results');
    wrap.innerHTML = resultados.map((r) => `
      <div class="compare-row">
        <span>${r.meses < 12 ? `${r.meses} meses` : `${r.meses / 12} ano(s)`}</span>
        <strong>${formatBRL(r.semRendimento)}${taxaMensal > 0 ? ` <span class="muted-text" style="font-weight:400;">(com taxa: ${formatBRL(r.comRendimento)})</span>` : ''}</strong>
      </div>
    `).join('');

    this._renderEvolutionChart(valor, taxaMensal);
  },

  _renderEvolutionChart(valorMensal, taxaMensal) {
    const periodoRaw = document.getElementById('sim-periodo').value;
    const periodo = periodoRaw === '' ? 12 : Math.max(parseInt(periodoRaw, 10) || 12, 1);
    const meses = Array.from({ length: periodo }, (_, i) => i + 1);
    const pontos = meses.map((m) => Calc.simulateInvestment(valorMensal, [m], taxaMensal)[0]);

    const series = taxaMensal > 0
      ? [
          { name: 'Sem rendimento', data: pontos.map((p) => p.semRendimento), color: '#B69EF2' },
          { name: 'Com rendimento', data: pontos.map((p) => p.comRendimento), color: '#5F3DC4' },
        ]
      : [{ name: 'Acumulado', data: pontos.map((p) => p.semRendimento), color: '#5F3DC4' }];

    SimpleCharts.line('chart-sim-evolucao', { labels: meses.map((m) => `M${m}`), series });
  },
};

const InverseSimulator = {
  run() {
    const valorAlvo = parseFloat(document.getElementById('inv-valor-alvo').value);
    const meses = parseInt(document.getElementById('inv-meses').value, 10);
    const taxaPercent = parseFloat(document.getElementById('inv-taxa').value);
    const taxaMensal = Number.isNaN(taxaPercent) ? 0 : taxaPercent / 100;

    if (Number.isNaN(valorAlvo) || valorAlvo <= 0 || Number.isNaN(meses) || meses <= 0) {
      alert('Informe um valor-alvo e um prazo em meses válidos.');
      return;
    }

    const mensal = Calc.calculateRequiredMonthlyForGoal(valorAlvo, meses, taxaMensal);
    document.getElementById('inv-result').innerHTML = mensal != null
      ? `<div class="notice-card info">Para juntar ${formatBRL(valorAlvo)} em ${meses} mês(es), guarde aproximadamente <strong>${formatBRL(mensal)}/mês</strong>.</div>`
      : '<p class="muted-text">Não foi possível calcular com esses valores.</p>';
  },
};

const SpendCheck = {
  run() {
    const valor = parseFloat(document.getElementById('spend-valor').value);
    if (Number.isNaN(valor) || valor <= 0) { alert('Informe um valor válido.'); return; }
    const result = Calc.calculateSpendCheck(appData, valor);
    const map = {
      verde: { cls: 'success', texto: `<span class="material-symbols-outlined" aria-hidden="true">check_circle</span> Sua margem comporta esse gasto. Saldo restante estimado: ${formatBRL(result.saldoApos)}.` },
      amarelo: { cls: 'warning', texto: `<span class="material-symbols-outlined" aria-hidden="true">warning</span> É possível, mas reduzirá sua capacidade de investimento. Saldo restante estimado: ${formatBRL(result.saldoApos)}.` },
      vermelho: { cls: 'danger', texto: `<span class="material-symbols-outlined" aria-hidden="true">error</span> Esse gasto ultrapassaria sua margem planejada. Saldo restante estimado: ${formatBRL(result.saldoApos)}.` },
    };
    const info = map[result.nivel];
    document.getElementById('spend-result').innerHTML = `<div class="notice-card ${info.cls}">${info.texto}</div>`;
  },
};
