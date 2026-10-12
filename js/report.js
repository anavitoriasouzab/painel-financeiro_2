/**
 * report.js
 * -----------------------------------------------------------------------
 * Relatório financeiro mensal: pré-visualização num overlay + arquivo PDF.
 * Não inventa nenhum dado novo: cada seção reaproveita as mesmas funções de
 * Calc/SimpleCharts já usadas em Dashboard/Análises/Planejamento, só
 * reorganizadas num documento único e com uma "folha" sempre clara (ver
 * .report-sheet em css/style.css).
 *
 * O PDF NÃO sai mais de window.print(): no celular (sobretudo no app
 * instalado) a impressão saía como uma página preta e vazia, e no iPhone nem
 * sempre abria. Agora o arquivo é desenhado aqui mesmo (html2canvas + jsPDF,
 * carregados só no clique, ver _loadPdfLibs), sempre numa folha de largura
 * fixa — o PDF sai igual em qualquer aparelho. window.print() ficou só como
 * reserva no computador, quando as bibliotecas não carregam.
 */

// SRI fixo: se a CDN servir qualquer coisa diferente desses arquivos, o
// navegador recusa o script em vez de rodá-lo com acesso aos dados da pessoa.
const PDF_LIBS = [
  {
    src: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    integrity: 'sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H',
    ready: () => typeof window.html2canvas === 'function',
  },
  {
    src: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    integrity: 'sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk',
    ready: () => !!(window.jspdf && window.jspdf.jsPDF),
  },
];

// Folha A4 em mm. A largura da folha desenhada (REPORT_PDF_WIDTH_PX, igual
// à de .report-pdf-host no CSS) é o que define a escala px→mm do PDF.
const PDF_PAGE = { width: 210, height: 297, margin: 12 };
const REPORT_PDF_WIDTH_PX = 760;
// Teto de pixels de um <canvas> no Safari do iPhone (4096×4096): passou
// disso, o canvas sai em branco sem erro nenhum. Relatório comprido baixa a
// resolução em vez de sumir.
const MAX_CANVAS_AREA = 16000000;

const Report = {
  _data: null,
  _pdfFile: null,
  _busy: false,
  _libsPromise: null,

  open(data) {
    const sheet = document.getElementById('report-sheet');
    const overlay = document.getElementById('report-overlay');
    if (!sheet || !overlay) return;

    this._data = data;
    // PDF gerado numa abertura anterior pode estar com dados velhos.
    this._pdfFile = null;
    this._setPdfBtn('idle');

    // Reforça o modo claro por segurança (já vem assim no HTML) — o
    // relatório não deve variar com o tema escuro/claro escolhido no app.
    sheet.setAttribute('data-theme', 'light');
    sheet.innerHTML = this._build(data, '');
    this._renderCharts(data, '');
    overlay.classList.add('active');
  },

  close() {
    const overlay = document.getElementById('report-overlay');
    if (overlay) overlay.classList.remove('active');
  },

  /**
   * `idSuffix` existe porque o PDF desenha uma SEGUNDA cópia do relatório
   * (fora da tela, ver _generatePdf) enquanto a pré-visualização continua
   * aberta — SimpleCharts acha o container pelo id, então as duas cópias
   * não podem repetir o mesmo.
   */
  _build(data, idSuffix) {
    const mes = data.meta.mesReferenciaAtual;
    return `
      ${this._buildBrand(data, mes)}
      ${this._buildResumo(data, mes)}
      ${this._buildAlertas(data)}
      ${this._buildFluxo(idSuffix)}
      ${this._buildCategorias(idSuffix)}
      ${this._buildCompromissos(data)}
      ${this._buildMetas(data)}
      ${this._buildCompras(data, mes)}
      ${this._buildFooter(data)}
    `;
  },

  _buildBrand(data, mes) {
    const nome = data.perfil && data.perfil.nome ? data.perfil.nome : null;
    return `
      <div class="report-brand">
        <div>
          <div class="report-brand-title">Relatório financeiro · ${escapeHtml(formatMonthKey(mes))}</div>
          <div class="report-brand-sub">${nome ? escapeHtml(nome) + ' · ' : ''}Resumo do mês, gerado automaticamente</div>
        </div>
        <div class="report-brand-logo">
          <span class="material-symbols-outlined" aria-hidden="true">insights</span>
          Painel Financeiro
        </div>
      </div>
    `;
  },

  /**
   * Os 4 números do mês + a frase de comprometimento (a mesma do Raio-X do
   * Dashboard). Saldo negativo e comprometimento acima do limite ganham a
   * cor de alerta: no mesmo tom neutro dos outros, "-R$ 2.851,00" e
   * "139,6%" passavam como números normais.
   */
  _buildResumo(data, mes) {
    const renda = Calc.calculateMonthlyIncome(data, mes);
    const gastos = Calc.calculateMonthlyExpenses(data, mes);
    const saldo = Calc.calculateRemainingBalance(data, mes);
    const pct = Calc.calculateCommittedPercentage(data, mes);
    const limite = Calc.calculateCommitmentLimit(data);
    const nivel = limite ? Calc.calculateCommitmentLevel(pct, limite.percentual) : null;
    const estadoPct = nivel === 'ultrapassado' || nivel === 'atingido' ? 'is-danger' : nivel === 'aproximando' ? 'is-warning' : '';
    const msg = typeof buildRaioXMessage === 'function' ? buildRaioXMessage(pct, renda, gastos, limite, nivel) : null;
    return `
      <div class="report-section">
        <div class="report-section-title">Resumo do mês</div>
        <div class="report-cards">
          <div class="report-card"><div class="report-card-label">Renda</div><div class="report-card-value">${formatBRL(renda)}</div></div>
          <div class="report-card"><div class="report-card-label">Gastos</div><div class="report-card-value">${formatBRL(gastos)}</div></div>
          <div class="report-card"><div class="report-card-label">Saldo</div><div class="report-card-value${saldo < 0 ? ' is-danger' : ''}">${formatBRL(saldo)}</div></div>
          <div class="report-card">
            <div class="report-card-label">Renda comprometida</div>
            <div class="report-card-value ${estadoPct}">${pct == null ? '—' : formatPercent(pct)}</div>
            ${limite ? `<div class="report-card-note">limite de ${escapeHtml(String(limite.percentual))}%</div>` : ''}
          </div>
        </div>
        ${msg ? `<p class="report-summary-msg"><strong>${escapeHtml(msg.title)}</strong> ${escapeHtml(msg.detail)}</p>` : ''}
      </div>
    `;
  },

  _buildFluxo(idSuffix) {
    return `
      <div class="report-section">
        <div class="report-section-title">Fluxo financeiro (últimos meses)</div>
        <div class="report-chart-block"><div id="report-chart-fluxo${idSuffix}" class="sc-container"></div></div>
      </div>
    `;
  },

  _buildCategorias(idSuffix) {
    return `
      <div class="report-section">
        <div class="report-section-title">Onde o dinheiro foi</div>
        <div id="report-chart-categorias${idSuffix}"></div>
      </div>
    `;
  },

  /**
   * Extrato completo do mês: uma linha por cobrança, com o número da parcela
   * quando a compra é parcelada, e o total fechando a tabela. NADA é cortado:
   * é a lista que justifica o número de gastos do resumo, então a soma das
   * linhas tem que bater com ele (ver Calc.calculateMonthPurchases). Fica no
   * fim do relatório, como anexo — é a parte longa, e as conclusões vêm antes.
   * (Já existiu uma seção "Maiores despesas" com o top 6 — eram exatamente
   * as 6 primeiras linhas desta tabela, na mesma ordem, então saiu.)
   */
  _buildCompras(data, mes) {
    const { itens, total } = Calc.calculateMonthPurchases(data, mes);
    if (!itens.length) {
      return `
        <div class="report-section">
          <div class="report-section-title">Compras do mês</div>
          <p class="report-empty">Nenhuma cobrança lançada em ${escapeHtml(formatMonthKey(mes))}.</p>
        </div>
      `;
    }
    const rows = itens.map((i) => `
      <tr>
        <td>${escapeHtml(i.nome)}</td>
        <td>${escapeHtml(i.categoria || 'Sem categoria')}</td>
        <td class="report-col-tipo">${escapeHtml(i.tipo)}</td>
        <td>${escapeHtml(i.parcela || '—')}</td>
        <td class="num">${formatBRL(i.valor)}</td>
      </tr>
    `).join('');
    return `
      <div class="report-section">
        <div class="report-section-title">Compras do mês</div>
        <div class="report-table-wrap"><table class="report-table report-table--wide">
          <thead>
            <tr><th>Compra</th><th>Categoria</th><th class="report-col-tipo">Tipo</th><th>Parcela</th><th class="num">Valor</th></tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr>
              <td colspan="2"><strong>Total de ${itens.length} cobrança${itens.length > 1 ? 's' : ''} em ${escapeHtml(formatMonthKey(mes))}</strong></td>
              <td class="report-col-tipo"></td>
              <td></td>
              <td class="num"><strong>${formatBRL(total)}</strong></td>
            </tr>
          </tfoot>
        </table></div>
      </div>
    `;
  },

  /** Mesma lógica de agrupamento por mês de Installments._renderUpcoming — aqui só como texto, sem os ícones de ação (não faz sentido editar a partir de um relatório impresso). */
  _buildCompromissos(data) {
    const upcoming = Calc.calculateUpcomingEndings(data, 2);
    if (!upcoming.length) {
      return `
        <div class="report-section">
          <div class="report-section-title">Compromissos e parcelamentos</div>
          <p class="report-empty">Nenhum parcelamento com término previsto nos próximos meses.</p>
        </div>
      `;
    }
    const margem = Calc.calculateMarginFreedNextMonth(data);
    const grupos = [];
    upcoming.forEach((x) => {
      const ultimo = grupos[grupos.length - 1];
      if (ultimo && ultimo.mesKey === x.endMonthKey) ultimo.itens.push(x);
      else grupos.push({ mesKey: x.endMonthKey, mesLabel: formatMonthKey(x.endMonthKey), itens: [x] });
    });
    const gruposHtml = grupos.map((g) => {
      const rows = g.itens.map((x) => `
        <tr><td>${escapeHtml(x.parcelamento.nome)}</td><td class="num">${formatBRL(x.parcelamento.valorParcela)}/mês</td></tr>
      `).join('');
      return `
        <div class="report-table-wrap"><table class="report-table" style="margin-bottom:10px;">
          <thead><tr><th>${escapeHtml(g.mesLabel)}</th><th class="num">${g.itens.length} conta${g.itens.length > 1 ? 's' : ''}</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      `;
    }).join('');
    return `
      <div class="report-section">
        <div class="report-section-title">Compromissos e parcelamentos</div>
        ${margem > 0 ? `<p class="report-empty" style="color:#187E56;font-weight:600;">+ ${escapeHtml(formatBRL(margem))} de margem liberada a partir do próximo mês.</p>` : ''}
        ${gruposHtml}
      </div>
    `;
  },

  _buildMetas(data) {
    const metas = (data.metas || []).filter((m) => m.valorDesejado != null);
    if (!metas.length) return '';
    const rows = metas.map((m) => {
      const prog = Calc.calculateGoalProgress(m);
      return `<tr><td>${escapeHtml(m.nome)}</td><td class="num">${formatPercent(prog.percent)}</td><td class="num">${formatBRL(prog.restante)}</td></tr>`;
    }).join('');
    return `
      <div class="report-section">
        <div class="report-section-title">Metas</div>
        <div class="report-table-wrap"><table class="report-table">
          <thead><tr><th>Meta</th><th class="num">Progresso</th><th class="num">Falta</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </div>
    `;
  },

  /**
   * Classifica cada alerta de Calc.generateAlerts em um dos 4 quadrantes de
   * insight (mesmo agrupamento da referência em PDF) — não dá pra usar só
   * o `tipo` do alerta (success/warning/...) porque, por exemplo, tanto uma
   * melhora real (gastos caindo) quanto uma margem liberada por parcela
   * terminando são "tipo: success", mas são categorias diferentes.
   */
  _categorizeInsight(alert) {
    if (alert.id === 'parcelamentos-terminando') return 'oportunidades';
    if (alert.id === 'variacao-gastos') return alert.icon === 'trending_down' ? 'melhorou' : 'piorou';
    if (alert.id === 'variacao-potencial') return alert.icon === 'savings' ? 'melhorou' : 'piorou';
    if (alert.id === 'sem-alertas') return null;
    return 'atencao'; // limite-comprometimento, renda-utilizada e qualquer alerta novo não mapeado
  },

  _buildAlertas(data) {
    const grupos = { melhorou: [], piorou: [], atencao: [], oportunidades: [] };
    Calc.generateAlerts(data).forEach((a) => {
      const cat = this._categorizeInsight(a);
      if (cat) grupos[cat].push(a);
    });

    const quadrante = (chave, titulo, icone, cor) => {
      const itens = grupos[chave];
      const corpo = itens.length
        ? `<ul>${itens.map((a) => `<li>${escapeHtml(a.texto)}</li>`).join('')}</ul>`
        : '<p class="report-insight-empty">Nenhum item neste mês.</p>';
      // A cor da categoria fica só no título (ícone + nome); quadrante sem
      // nada perde o fundo, pra quem lê ir direto aos que têm conteúdo.
      return `
        <div class="report-insight-box${itens.length ? '' : ' is-empty'}">
          <div class="report-insight-title" style="color:${cor};"><span class="material-symbols-outlined" aria-hidden="true">${icone}</span> ${titulo}</div>
          ${corpo}
        </div>
      `;
    };

    return `
      <div class="report-section">
        <div class="report-section-title">Insights do mês</div>
        <div class="report-insights-grid">
          ${quadrante('melhorou', 'Melhorou', 'trending_up', '#187E56')}
          ${quadrante('piorou', 'Piorou', 'trending_down', '#B9362A')}
          ${quadrante('atencao', 'Atenção', 'warning', '#966319')}
          ${quadrante('oportunidades', 'Oportunidades', 'lightbulb', '#4B2E9E')}
        </div>
      </div>
    `;
  },

  _buildFooter(data) {
    const agora = new Date();
    const dataStr = agora.toLocaleDateString('pt-BR');
    const horaStr = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `<div class="report-footer">Painel Financeiro · gerado em ${dataStr} às ${horaStr}</div>`;
  },

  /** SimpleCharts desenha em cima do DOM real, então só depois do innerHTML acima já ter os containers no lugar. */
  _renderCharts(data, idSuffix) {
    const mes = data.meta.mesReferenciaAtual;

    const hist = Calc.buildHistoricoComProjecao(data);
    SimpleCharts.line(`report-chart-fluxo${idSuffix}`, {
      labels: hist.map((h) => formatMonthKey(h.mes)),
      monotone: true,
      labelLastOnly: true,
      labelFormatter: formatBRLShort,
      series: [
        { name: 'Renda', data: hist.map((h) => h.renda), color: '#4B2E9E', fillArea: true, fillOpacity: 0.18 },
        { name: 'Gastos', data: hist.map((h) => h.gastos), color: '#C0392B' },
      ],
    });

    // Sempre a paleta clara: a folha é clara mesmo com o app no tema escuro,
    // e SimpleCharts.colorFor() escolhe pelo tema do <html> — no escuro
    // (padrão do app) devolvia os tons pastel feitos pra fundo preto.
    const paleta = SimpleCharts.paletteLight;
    const breakdown = Calc.calculateCategoryBreakdown(data, mes);
    const items = breakdown.map((b, i) => ({ nome: b.categoria, valor: b.valor, color: paleta[i % paleta.length] }));
    SimpleCharts.rankedList(`report-chart-categorias${idSuffix}`, items);
  },

  /* ------------------------------ PDF ------------------------------ */

  /**
   * Dois toques no celular, um no computador. O Compartilhar do sistema
   * (navigator.share) só pode ser chamado logo depois de um toque — o iPhone
   * recusa se passou o tempo de gerar o arquivo. Então: 1º toque gera e já
   * tenta compartilhar; se o sistema recusar, o botão vira "Compartilhar PDF"
   * e o 2º toque entrega o arquivo que já está pronto.
   */
  async exportPdf() {
    if (this._busy || !this._data) return;
    if (this._pdfFile) return this._deliverPdf(this._pdfFile);

    this._busy = true;
    this._setPdfBtn('loading');
    try {
      try {
        await this._loadPdfLibs();
      } catch (e) {
        console.error('Falha ao carregar o gerador de PDF.', e);
        this._setPdfBtn('idle');
        // No computador a impressão do navegador ainda serve (e tem "Salvar
        // como PDF"). No celular é justamente ela que saía preta — melhor
        // explicar do que cair nela.
        if (this._isTouchDevice()) toast('Não deu pra gerar o PDF agora. Confira a internet e tente de novo.');
        else window.print();
        return;
      }
      this._pdfFile = await this._generatePdf(this._data);
    } catch (e) {
      console.error('Falha ao gerar o PDF do relatório.', e);
      this._setPdfBtn('idle');
      toast('Não foi possível gerar o PDF. Tente de novo.');
      return;
    } finally {
      this._busy = false;
    }
    this._setPdfBtn('ready');
    return this._deliverPdf(this._pdfFile);
  },

  _isTouchDevice() {
    return window.matchMedia('(pointer: coarse)').matches;
  },

  /** Só no celular/tablet: no computador o Compartilhar do sistema existe, mas quem clica em "Gerar PDF" espera um download. */
  _canShare(file) {
    return !!(file && this._isTouchDevice() && navigator.canShare && navigator.canShare({ files: [file] }));
  },

  async _deliverPdf(file) {
    if (this._canShare(file)) {
      try {
        await navigator.share({ files: [file], title: file.name });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return; // a pessoa fechou o Compartilhar
        if (e.name === 'NotAllowedError') {
          toast('PDF pronto! Toque em "Compartilhar PDF".');
          return;
        }
        console.error('Compartilhar falhou, caindo pro download.', e);
      }
    }
    this._downloadFile(file);
  },

  _downloadFile(file) {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revogar na hora cancela o download em alguns navegadores.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  },

  _setPdfBtn(estado) {
    const btn = document.getElementById('report-pdf-btn');
    if (!btn) return;
    const label = btn.querySelector('.report-pdf-label');
    const icon = btn.querySelector('.material-symbols-outlined');
    const compartilhar = this._canShare(this._pdfFile);
    const estados = {
      idle: { icon: 'picture_as_pdf', texto: 'Gerar PDF' },
      loading: { icon: 'hourglass_top', texto: 'Gerando…' },
      ready: compartilhar ? { icon: 'ios_share', texto: 'Compartilhar PDF' } : { icon: 'download', texto: 'Baixar PDF' },
    };
    const e = estados[estado] || estados.idle;
    btn.disabled = estado === 'loading';
    btn.setAttribute('aria-busy', estado === 'loading' ? 'true' : 'false');
    if (icon) icon.textContent = e.icon;
    if (label) label.textContent = e.texto;
  },

  /** Carrega html2canvas + jsPDF uma vez só, no primeiro clique — ninguém paga esse peso só por abrir o app. */
  _loadPdfLibs() {
    if (PDF_LIBS.every((lib) => lib.ready())) return Promise.resolve();
    if (this._libsPromise) return this._libsPromise;
    const carregar = (lib) => new Promise((resolve, reject) => {
      if (lib.ready()) return resolve();
      const s = document.createElement('script');
      s.src = lib.src;
      s.integrity = lib.integrity;
      s.crossOrigin = 'anonymous';
      s.referrerPolicy = 'no-referrer';
      s.onload = () => (lib.ready() ? resolve() : reject(new Error(`${lib.src} carregou mas não expôs a biblioteca`)));
      s.onerror = () => { s.remove(); reject(new Error(`Falha ao carregar ${lib.src}`)); };
      document.head.appendChild(s);
    });
    this._libsPromise = Promise.all(PDF_LIBS.map(carregar))
      // Sem isso, uma falha (ex.: sem internet) ficaria em cache e o
      // próximo clique nem tentaria de novo.
      .catch((e) => { this._libsPromise = null; throw e; });
    return this._libsPromise;
  },

  /**
   * Desenha o relatório numa cópia fora da tela, com largura fixa de folha
   * (não a largura do celular), fotografa com html2canvas e fatia em páginas
   * A4 nos pontos em que nenhuma linha/card fica cortado ao meio.
   */
  async _generatePdf(data) {
    const host = document.createElement('div');
    host.className = 'report-pdf-host';
    host.setAttribute('aria-hidden', 'true');
    host.innerHTML = `<div class="report-sheet report-sheet--pdf" data-theme="light">${this._build(data, '-pdf')}</div>`;
    document.body.appendChild(host);

    try {
      const sheet = host.firstElementChild;
      this._renderCharts(data, '-pdf');
      // rankedList anima as barras a partir de 0% — aqui não tem animação,
      // a "foto" precisa do estado final.
      sheet.querySelectorAll('[data-w]').forEach((el) => { el.style.width = `${el.dataset.w}%`; });
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      this._inlineSvgPaint(sheet);

      const mmPorPx = (PDF_PAGE.width - 2 * PDF_PAGE.margin) / REPORT_PDF_WIDTH_PX;
      const alturaPaginaPx = (PDF_PAGE.height - 2 * PDF_PAGE.margin) / mmPorPx;
      const alturaTotal = sheet.offsetHeight;
      const paginas = this._pageCuts(sheet, alturaPaginaPx);

      const scale = Math.min(2, Math.sqrt(MAX_CANVAS_AREA / (REPORT_PDF_WIDTH_PX * alturaTotal)));
      const canvas = await window.html2canvas(sheet, {
        scale,
        backgroundColor: '#FFFFFF',
        logging: false,
        useCORS: true,
        // Sem isso, html2canvas mede a partir da rolagem atual da página e
        // a cópia fora da tela sai deslocada.
        scrollX: 0,
        scrollY: 0,
      });

      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
      const k = canvas.height / alturaTotal; // px do canvas por px CSS
      paginas.forEach(([inicio, fim], i) => {
        const sy = Math.round(inicio * k);
        const sh = Math.max(1, Math.round(fim * k) - sy);
        const pagina = document.createElement('canvas');
        pagina.width = canvas.width;
        pagina.height = sh;
        const ctx = pagina.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, pagina.width, pagina.height);
        ctx.drawImage(canvas, 0, sy, canvas.width, sh, 0, 0, canvas.width, sh);

        if (i > 0) pdf.addPage();
        pdf.addImage(
          pagina.toDataURL('image/jpeg', 0.92), 'JPEG',
          PDF_PAGE.margin, PDF_PAGE.margin,
          PDF_PAGE.width - 2 * PDF_PAGE.margin, (fim - inicio) * mmPorPx,
        );
        if (paginas.length > 1) {
          pdf.setFontSize(8);
          pdf.setTextColor(120, 112, 140);
          pdf.text(`Página ${i + 1} de ${paginas.length}`, PDF_PAGE.width / 2, PDF_PAGE.height - 6, { align: 'center' });
        }
      });

      const nome = `relatorio-financeiro-${data.meta.mesReferenciaAtual}.pdf`;
      return new File([pdf.output('blob')], nome, { type: 'application/pdf' });
    } finally {
      host.remove();
    }
  },

  /**
   * Onde dá pra virar a página: no topo de uma seção, de uma linha de
   * tabela, de um card... nunca no meio de um deles. Título de seção e
   * cabeçalho de tabela "puxam" o que vem logo depois, pra não ficarem
   * sozinhos no pé da página. Devolve [[início, fim], ...] em px CSS.
   */
  _pageCuts(sheet, alturaPagina) {
    const topo = sheet.getBoundingClientRect().top;
    const caixa = (el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top - topo, bottom: r.bottom - topo };
    };
    const elementos = Array.from(sheet.querySelectorAll(
      '.report-brand, .report-section-title, .report-card, .report-chart-block, .report-table tr, '
      + '.report-insight-box, .report-empty, .report-summary-msg, .sc-ranked-row, .report-footer',
    ));
    const inteiros = elementos.map(caixa);
    const grudados = Array.from(sheet.querySelectorAll('.report-section-title, .report-table thead'))
      .map(caixa).map((c) => ({ top: c.top, bottom: c.bottom + 48 }));
    const dentro = (y, c) => y > c.top + 0.5 && y < c.bottom - 0.5;
    // A linha de total (tfoot) nunca abre página: sozinha lá em cima ela não
    // diz total DE QUÊ. O corte recua uma linha e ela desce acompanhada.
    const candidatos = Array.from(new Set(
      elementos.filter((el) => !el.matches('tfoot tr')).map((el) => Math.round(caixa(el).top)),
    )).filter((y) => !inteiros.some((c) => dentro(y, c)) && !grudados.some((c) => dentro(y, c)));

    const total = sheet.offsetHeight;
    const paginas = [];
    let inicio = 0;
    while (total - inicio > alturaPagina) {
      const limite = inicio + alturaPagina;
      // Não aceita uma página quase vazia só pra respeitar um corte perfeito.
      const ok = candidatos.filter((y) => y > inicio + alturaPagina * 0.4 && y <= limite);
      const corte = ok.length ? Math.max(...ok) : limite;
      paginas.push([inicio, corte]);
      inicio = corte;
    }
    paginas.push([inicio, total]);
    return paginas;
  },

  /**
   * html2canvas desenha <svg> serializando o elemento sozinho, sem o CSS da
   * página — então `stroke="var(--border)"` e cores vindas de classe sumiam
   * ou viravam preto no PDF. Copia o valor já resolvido pra dentro de cada
   * elemento antes da "foto".
   */
  _inlineSvgPaint(root) {
    const props = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stop-color', 'stop-opacity', 'fill-opacity', 'stroke-opacity', 'opacity'];
    root.querySelectorAll('svg, svg *').forEach((el) => {
      const cs = getComputedStyle(el);
      props.forEach((p) => {
        const v = cs.getPropertyValue(p);
        if (v) el.style.setProperty(p, v);
      });
    });
  },
};
