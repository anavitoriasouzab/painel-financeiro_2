/**
 * planning.js
 * -----------------------------------------------------------------------
 * Fase 5: previsão do próximo mês, "o que muda?", cenários de investimento
 * e a virada automática do mês (avança parcelamentos, reseta status das
 * contas recorrentes e arquiva o mês atual no histórico).
 */

// INVESTOR_PROFILE_LABELS é definido em js/dashboard.js (carregado antes deste
// arquivo) — reaproveitado aqui pro seletor de perfil ficar com os mesmos textos.

const Planning = {
  render(data) {
    this._renderNextMonth(data);
    this._renderDifference(data);
    this._renderScenarios(data);
  },

  _renderNextMonth(data) {
    const proj = Calc.calculateNextMonthProjection(data);
    setText('next-month-label', formatMonthKey(proj.mes));
    setText('next-month-renda', formatBRL(proj.renda));
    setText('next-month-gastos', formatBRL(proj.gastosPrevistos));
    setText('next-month-saldo', formatBRL(proj.saldoEstimado));
    setText('next-month-percentual', proj.percentual != null ? formatPercent(proj.percentual) : 'não informado');
    setText('next-month-obs', proj.obsVariaveis);
  },

  _renderDifference(data) {
    const diff = Calc.calculateMonthlyDifference(data);
    const wrap = document.getElementById('month-diff-list');
    if (!wrap) return;
    if (!diff.itens.length) {
      wrap.innerHTML = '<p class="muted-text">Nenhuma mudança detectada para o próximo mês ainda.</p>';
    } else {
      wrap.innerHTML = diff.itens.map((i) => `
        <div class="compare-row"><span>${escapeHtml(i.descricao)}</span><strong style="color:var(--success)">+${formatBRL(i.impacto)}</strong></div>
      `).join('') + `
        <div class="compare-row" style="border-top:2px solid var(--border);margin-top:4px;padding-top:10px;">
          <span><strong>Margem adicional</strong></span><strong style="color:var(--purple-700)">+${formatBRL(diff.margemAdicional)}</strong>
        </div>
      `;
    }
  },

  _renderScenarios(data) {
    const s = Calc.calculateInvestmentScenarios(data, data.meta.mesReferenciaAtual);
    setText('scenario-conservador', formatBRL(s.conservador));
    setText('scenario-equilibrado', formatBRL(s.equilibrado));
    setText('scenario-agressivo', formatBRL(s.agressivo));

    const perfilAtual = data.configuracoes.perfilInvestidor || 'equilibrado';
    const toggle = document.getElementById('investor-profile-toggle');
    if (toggle) {
      toggle.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.perfil === perfilAtual));
    }
    ['conservador', 'equilibrado', 'agressivo'].forEach((p) => {
      const row = document.getElementById(`scenario-row-${p}`);
      if (row) row.classList.toggle('active-profile', p === perfilAtual);
    });
  },

  /** Define o perfil de investidor usado pra calcular o "Potencial de investimento" do Dashboard. */
  setInvestorProfile(perfil) {
    appData.configuracoes.perfilInvestidor = perfil;
    Storage.save(appData);
    Planning.render(appData);
    Dashboard.render(appData);
    toast(`Perfil de investidor: ${INVESTOR_PROFILE_LABELS[perfil]}.`);
  },

  async turnMonth() {
    const mesAtual = appData.meta.mesReferenciaAtual;
    const proximo = addMonths(mesAtual, 1);
    if (!await confirmDialog(
      `Confirma a virada de ${formatMonthKey(mesAtual)} para ${formatMonthKey(proximo)}? Essa ação não pode ser desfeita.`,
      { title: 'Virar o mês', confirmLabel: 'Virar o mês', danger: true }
    )) return;

    // 1) Arquiva o mês que está terminando (se ainda não tiver sido salvo manualmente)
    if (!appData.historicoMensal.some((h) => h.mes === mesAtual)) {
      appData.historicoMensal.push(buildSnapshot(appData, mesAtual));
      appData.historicoMensal.sort((a, b) => a.mes.localeCompare(b.mes));
    }

    // 2) Avança parcelamentos: decrementa parcelasRestantes/incrementa parcelaAtual,
    //    remove os que já cobraram sua última parcela neste mês. Isso já
    //    acontecia antes, só que em silêncio — sem nenhuma confirmação na
    //    tela, dava a impressão de que a conta continuava "pendente" pra
    //    sempre, e levava a cadastrar de novo por engano (ver toast no fim
    //    da função, que agora avisa quais foram concluídos aqui).
    const parcelamentosAntes = appData.parcelamentos;
    appData.parcelamentos = parcelamentosAntes
      .map((p) => {
        const restantes = p.parcelasRestantes == null ? null : p.parcelasRestantes - 1;
        const atual = p.parcelaAtual == null ? null : p.parcelaAtual + 1;
        return { ...p, parcelasRestantes: restantes, parcelaAtual: atual, statusDescricao: restantes === 0 ? 'última parcela' : null };
      })
      // `parcelasRestantes` pode chegar como NaN vindo de um backup corrompido/editado
      // à mão (o formulário já impede isso na origem) — nesse caso mantém o
      // parcelamento em vez de apagar silenciosamente um dado que não dá pra confirmar.
      .filter((p) => p.parcelasRestantes == null || Number.isNaN(p.parcelasRestantes) || p.parcelasRestantes >= 0);
    const parcelamentosConcluidos = parcelamentosAntes.filter(
      (p) => !appData.parcelamentos.some((np) => np.id === p.id)
    );

    // 3) Contas recorrentes voltam a ficar pendentes no novo mês.
    appData.despesasRecorrentes.forEach((d) => { d.status = 'Pendente'; });

    // 4) Avança o mês de referência. Despesas variáveis do mês anterior
    //    permanecem no histórico (cada uma já tem seu mesReferencia).
    appData.meta.mesReferenciaAtual = proximo;

    Storage.save(appData);
    Dashboard.render(appData);
    Accounts.render(appData);
    Planning.render(appData);

    const boasVindas = `Boas-vindas a ${formatMonthKey(proximo)}!`;
    if (parcelamentosConcluidos.length === 1) {
      toast(`${boasVindas} Parcelamento "${parcelamentosConcluidos[0].nome}" foi concluído e removido.`);
    } else if (parcelamentosConcluidos.length > 1) {
      toast(`${boasVindas} ${parcelamentosConcluidos.length} parcelamentos concluídos e removidos: ${parcelamentosConcluidos.map((p) => p.nome).join(', ')}.`);
    } else {
      toast(boasVindas);
    }
  },
};
