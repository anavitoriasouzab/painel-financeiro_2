/**
 * backup.js
 * -----------------------------------------------------------------------
 * Fase 7: exportar/importar dados em JSON, exportar um CSV simples das
 * despesas, e excluir todos os dados (com confirmação dupla).
 */

const Backup = {
  exportJSON() {
    const json = Storage.exportJSON();
    this._download(json, `financas-backup-${appData.meta.mesReferenciaAtual}.json`, 'application/json');
    toast('Backup JSON exportado.');
  },

  exportCSV() {
    const rows = [['tipo', 'nome', 'valor', 'categoria', 'mes_ou_status', 'observacao']];

    appData.despesasRecorrentes.forEach((d) => {
      rows.push(['recorrente', d.nome, d.valor, d.categoria || '', d.status || '', d.observacao || '']);
    });
    appData.despesasVariaveis.forEach((d) => {
      rows.push(['variavel', d.nome, d.valor, d.categoria || '', d.mesReferencia || '', d.observacao || '']);
    });
    appData.parcelamentos.forEach((p) => {
      rows.push(['parcelamento', p.nome, p.valorParcela, p.categoria || '', `restam ${p.parcelasRestantes}`, p.observacao || '']);
    });

    const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\n');
    this._download(csv, `financas-despesas-${appData.meta.mesReferenciaAtual}.csv`, 'text/csv');
    toast('CSV exportado.');
  },

  _download(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  triggerImport() {
    document.getElementById('backup-import-input').click();
  },

  handleImport(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const MAX_IMPORT_SIZE = 8 * 1024 * 1024; // 8MB — folga generosa acima de um backup real, mas barra um arquivo absurdo
    if (file.size > MAX_IMPORT_SIZE) {
      alert('Esse arquivo é grande demais para ser um backup deste app. Exporte um novo backup pela tela de Perfil e tente de novo.');
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
      let parsed;
      try {
        parsed = JSON.parse(e.target.result);
      } catch (err) {
        alert('Esse arquivo não é um JSON válido.');
        input.value = '';
        return;
      }
      if (!parsed.rendas || !parsed.despesasRecorrentes || !parsed.meta) {
        alert('Esse arquivo não parece ser um backup deste app. Exporte um novo backup pela tela de Perfil e tente de novo.');
        input.value = '';
        return;
      }
      this._sanitizeImportedImages(parsed);
      if (!await confirmDialog('Importar este backup vai SUBSTITUIR todos os dados atuais do app. Deseja continuar?', { title: 'Importar backup', confirmLabel: 'Importar e substituir', danger: true })) {
        input.value = '';
        return;
      }
      appData = migrate(parsed);
      Storage.save(appData);
      input.value = '';
      toast('Backup importado com sucesso.');
      renderAll();
    };
    reader.readAsText(file);
  },

  /** Um backup é dado externo (pode ter sido editado à mão ou vir de outra
      origem) — comprovante/foto só deveriam conter uma imagem em base64
      (é assim que o app sempre gerou esses campos). Qualquer valor fora
      desse formato é descartado antes de virar HTML em algum card. */
  _sanitizeImportedImages(parsed) {
    const isDataImageUrl = (v) => typeof v === 'string' && /^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/]+=*$/i.test(v);
    (parsed.despesasVariaveis || []).forEach((d) => {
      if (d && d.comprovante != null && !isDataImageUrl(d.comprovante)) d.comprovante = null;
    });
    if (parsed.perfil && parsed.perfil.foto != null && !isDataImageUrl(parsed.perfil.foto)) {
      parsed.perfil.foto = null;
    }
  },

  /** Exclui todos os dados da conta (não a conta em si — o login continua existindo, só fica sem nenhum dado financeiro salvo). Confirmação em duas etapas, igual excluir uma conta de verdade. */
  async deleteAllData() {
    if (!await confirmDialog(
      'Isso vai apagar TODOS os seus dados (renda, despesas, parcelamentos, metas, histórico). Essa ação não pode ser desfeita.',
      { title: 'Excluir todos os dados', confirmLabel: 'Continuar', danger: true }
    )) return;
    if (!await confirmDialog(
      'Tem certeza mesmo? Considere exportar um backup antes — depois de excluir não tem como recuperar.',
      { title: 'Confirmar exclusão definitiva', confirmLabel: 'Sim, excluir tudo', danger: true }
    )) return;
    await Storage.clearAll();
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  },
};

function csvEscape(value) {
  const str = String(value == null ? '' : value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
