/**
 * simplecharts.js
 * -----------------------------------------------------------------------
 * Gráficos em SVG puro, gerados no próprio navegador — SEM depender de
 * nenhuma biblioteca externa ou CDN. Isso existe porque o Chart.js (via
 * CDN) falhou repetidamente em carregar em alguns navegadores/redes,
 * deixando os gráficos em branco. Com SVG nativo isso nunca mais acontece:
 * funciona 100% offline, sem exceção.
 *
 * Visual: paleta muda conforme o tema (claro/escuro) para nunca depender
 * só de roxo nem perder contraste em fundo escuro; a rosca usa gradiente
 * por segmento e mostra o total no centro, como em dashboards financeiros
 * de referência.
 *
 * API pequena de propósito — cobre só os 3 tipos de gráfico que o app usa:
 * doughnut, barra (vertical ou horizontal) e linha (uma ou mais séries).
 */

const SimpleCharts = {
  // Paleta para fundo claro: reordenada pra nunca ter dois matizes
  // próximos lado a lado (cada cor consecutiva fica a pelo menos ~90° de
  // distância no círculo cromático), e recalibrada pra toda cor manter
  // contraste mínimo legível contra fundo branco.
  paletteLight: ['#5F3DC4', '#C96A1E', '#2F6FB5', '#D9534F', '#1E8880', '#A15C99', '#A6790E', '#5C6370', '#8B6146', '#1C97AC', '#D6336C', '#1F9E6B'],
  // Paleta para fundo escuro: mesma sequência de matizes (mesma "família"
  // do produto), recalibrada com luminância própria pra esse fundo — não
  // é a de cima só clareada.
  paletteDark: ['#9B8CF2', '#F2A968', '#6FA8E8', '#F0847F', '#5FD6CC', '#C48FC0', '#E8C468', '#9AA3B2', '#C9A487', '#5FCBDC', '#F284AC', '#4FD1A0'],

  _uid: 0,

  isDark() { return document.documentElement.getAttribute('data-theme') === 'dark'; },
  palette() { return this.isDark() ? this.paletteDark : this.paletteLight; },
  colorFor(i) { const p = this.palette(); return p[i % p.length]; },

  _empty(container, msg) {
    container.innerHTML = `<p class="sc-empty">${msg || 'Sem dados para exibir ainda.'}</p>`;
  },

  /** Clareia ou escurece uma cor hex por um fator (-1 a 1) — usado para gerar o gradiente de cada fatia. */
  _shade(hex, amount) {
    const n = hex.replace('#', '');
    const num = parseInt(n.length === 3 ? n.split('').map((c) => c + c).join('') : n, 16);
    let r = (num >> 16) & 0xff, g = (num >> 8) & 0xff, b = num & 0xff;
    const mix = (c) => amount >= 0 ? Math.round(c + (255 - c) * amount) : Math.round(c * (1 + amount));
    r = Math.min(255, Math.max(0, mix(r)));
    g = Math.min(255, Math.max(0, mix(g)));
    b = Math.min(255, Math.max(0, mix(b)));
    return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
  },

  /** Gráfico de rosca com gradiente por fatia e total no centro. items: [{label, value, color?}] */
  doughnut(containerId, items, opts = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const data = (items || []).filter((i) => i.value > 0);
    const total = data.reduce((s, i) => s + i.value, 0);
    if (!data.length || total <= 0) return this._empty(container);

    const uid = `sc${this._uid++}`;
    const size = 176, r = 62, stroke = 26, cx = size / 2, cy = size / 2;
    const circumference = 2 * Math.PI * r;
    const gap = data.length > 1 ? 3 : 0; // pequeno respiro entre fatias, visual mais "premium"

    let offset = 0;
    let defs = '';
    let segments = '';
    data.forEach((item, i) => {
      const color = item.color || this.colorFor(i);
      const rawLen = (item.value / total) * circumference;
      const len = Math.max(rawLen - gap, 1);
      const gradId = `${uid}-g${i}`;
      defs += `<linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${this._shade(color, 0.18)}"/>
        <stop offset="100%" stop-color="${this._shade(color, -0.12)}"/>
      </linearGradient>`;
      segments += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="url(#${gradId})" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${len.toFixed(2)} ${(circumference - len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`;
      offset += rawLen;
    });

    const centerLabel = opts.centerLabel === false ? null : (opts.centerLabel || 'Total');
    const centerValue = opts.centerValue === false ? null : (opts.centerValue || formatBRL(total));

    const legend = data.map((item, i) => {
      const pct = (item.value / total) * 100;
      if (opts.compactLegend) {
        return `
          <div class="sc-legend-item sc-legend-compact">
            <span class="sc-dot" style="background:${item.color || this.colorFor(i)}"></span>
            <span class="sc-legend-label">${escapeHtml(item.label)}</span>
          </div>
        `;
      }
      return `
        <div class="sc-legend-item">
          <span class="sc-dot" style="background:${item.color || this.colorFor(i)}"></span>
          <span class="sc-legend-label">${escapeHtml(item.label)}</span>
          <span class="sc-legend-pct">${pct.toFixed(0)}%</span>
          <span class="sc-legend-value">${formatBRL(item.value)}</span>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="sc-doughnut-wrap${opts.layout === 'side' ? ' side' : ''}">
        <div class="sc-doughnut-svg-box">
          <svg viewBox="0 0 ${size} ${size}" class="sc-doughnut-svg" role="img" aria-label="Gráfico de rosca">
            <defs>${defs}</defs>
            ${segments}
          </svg>
          <div class="sc-doughnut-center${centerValue == null ? ' no-value' : ''}">
            ${centerValue != null ? `<span class="sc-doughnut-center-value">${centerValue}</span>` : ''}
            ${centerLabel != null ? `<span class="sc-doughnut-center-label">${escapeHtml(centerLabel)}</span>` : ''}
          </div>
        </div>
        <div class="sc-legend">${legend}</div>
      </div>
    `;
  },

  /**
   * Gráfico de barras (uma série). opts: { labels, values, colors?, horizontal? }
   * `colors` pode ser uma cor única, um array (uma por barra), ou omitido (usa a paleta).
   */
  bar(containerId, opts) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const { labels, values, horizontal } = opts;
    if (!values || !values.length || values.every((v) => !v)) return this._empty(container);

    const max = Math.max(...values, 0.0001);
    const colorAt = (i) => Array.isArray(opts.colors) ? opts.colors[i % opts.colors.length] : (opts.colors || this.colorFor(i));

    if (horizontal) {
      const rows = values.map((v, i) => {
        const color = colorAt(i);
        const width = Math.max((v / max) * 100, 2);
        const gradient = `linear-gradient(90deg, ${this._shade(color, 0.35)}, ${color})`;
        return `
        <div class="sc-hbar-row">
          <span class="sc-hbar-label">${escapeHtml(labels[i])}</span>
          <div class="sc-hbar-track"><div class="sc-hbar-fill" data-w="${width}" style="width:0%;background:${gradient};transition-delay:${i * 45}ms"></div></div>
          <span class="sc-hbar-value">${formatBRL(v)}</span>
        </div>
      `;
      }).join('');
      container.innerHTML = `<div class="sc-hbar-wrap">${rows}</div>`;
      this._animateFills(container);
      return;
    }

    const bars = values.map((v, i) => {
      const color = colorAt(i);
      const height = Math.max((v / max) * 100, 2);
      const gradient = `linear-gradient(180deg, ${this._shade(color, 0.35)}, ${color})`;
      return `
      <div class="sc-vbar-col">
        <span class="sc-vbar-value">${formatBRLShort(v)}</span>
        <div class="sc-vbar-track"><div class="sc-vbar-fill" data-h="${height}" style="height:0%;background:${gradient};transition-delay:${i * 45}ms"></div></div>
        <span class="sc-vbar-label">${escapeHtml(labels[i])}</span>
      </div>
    `;
    }).join('');
    container.innerHTML = `<div class="sc-vbar-wrap">${bars}</div>`;
    this._animateFills(container);
  },

  /**
   * Barras pra comparar a MESMA métrica em dois (ou mais) pontos no tempo
   * (ex.: "Comparar dois meses") — diferente de `bar()`, que usa uma cor da
   * paleta por barra (pensado pra categorias diferentes). Aqui as barras
   * são um só matiz em duas tonalidades (mês mais antigo mais claro, mais
   * recente mais escuro — `opts.colors` default `[--purple-500,
   * --purple-700]`), preenchimento sólido (sem gradiente decorativo), topo
   * arredondado/base reta, com eixo Y (grade + valores formatados) e
   * tooltip ao passar o mouse/tocar mostrando o valor EXATO — o mesmo
   * `opts.valueFormatter` (default `formatBRL`) usado pela tabela de
   * detalhamento logo abaixo no card, pra nunca mostrar um número
   * arredondado ali e o exato aqui.
   */
  comparisonBars(containerId, opts) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const { labels, values } = opts;
    if (!values || values.length < 2 || values.every((v) => !v)) return this._empty(container);

    const fmt = opts.valueFormatter || formatBRL;
    const w = 320, h = 150, padL = 46, padR = 8, padT = 14, padB = 20;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    const bottomY = h - padB;
    const max = Math.max(...values, 0.0001);
    const n = values.length;
    const gap = plotW / n;
    const barW = Math.min(gap * 0.32, 44);
    const yFor = (v) => padT + plotH * (1 - v / max);
    const colors = opts.colors || ['var(--purple-500)', 'var(--purple-700)'];

    const tickCount = 4;
    let gridSvg = '';
    let yLabelsHtml = '';
    for (let i = 0; i < tickCount; i++) {
      const v = (max * i) / (tickCount - 1);
      const y = yFor(v);
      gridSvg += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${w - padR}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="1" stroke-dasharray="2 3" opacity="0.6"/>`;
      yLabelsHtml += `<span class="sc-line-ytick" style="top:${((y / h) * 100).toFixed(1)}%">${escapeHtml(fmt(v))}</span>`;
    }

    const barRadius = 6;
    const barsSvg = values.map((v, i) => {
      const x = padL + gap * i + (gap - barW) / 2;
      const y = yFor(v);
      const r = Math.min(barRadius, Math.max(bottomY - y, 0) / 2);
      // Retângulo com cantos arredondados só no topo (SVG <rect rx> arredonda
      // os 4 cantos igual — sem controle por canto — por isso é um <path>).
      const path = r > 0
        ? `M ${x.toFixed(1)},${bottomY} L ${x.toFixed(1)},${(y + r).toFixed(1)} Q ${x.toFixed(1)},${y.toFixed(1)} ${(x + r).toFixed(1)},${y.toFixed(1)} L ${(x + barW - r).toFixed(1)},${y.toFixed(1)} Q ${(x + barW).toFixed(1)},${y.toFixed(1)} ${(x + barW).toFixed(1)},${(y + r).toFixed(1)} L ${(x + barW).toFixed(1)},${bottomY} Z`
        : `M ${x.toFixed(1)},${bottomY} L ${x.toFixed(1)},${bottomY} Z`;
      return `<path class="sc-cbar-bar" data-index="${i}" d="${path}" fill="${colors[i % colors.length]}"/>`;
    }).join('');

    const xLabels = labels.map((l) => `<span>${escapeHtml(l)}</span>`).join('');

    container.innerHTML = `
      <div class="sc-cbar-wrap">
        <div class="sc-cbar-plot">
          <svg viewBox="0 0 ${w} ${h}" class="sc-cbar-svg" preserveAspectRatio="none" role="img" aria-label="${escapeAttr(opts.ariaLabel || 'Gráfico de barras comparando dois meses')}">${gridSvg}${barsSvg}</svg>
          <div class="sc-line-overlay">${yLabelsHtml}</div>
          <div class="sc-cbar-tooltip"></div>
        </div>
        <div class="sc-cbar-xlabels">${xLabels}</div>
      </div>
    `;
    this._attachBarHover(container, {
      values,
      fmt,
      h,
      barCentersPct: values.map((v, i) => ((padL + gap * i + gap / 2) / w) * 100),
      barTopsPct: values.map((v) => (yFor(v) / h) * 100),
    });
  },

  /**
   * Lista ranqueada (maior pro menor) com barra proporcional — estilo
   * "Detalhamento de Despesas": um item por linha, nome à esquerda, barra
   * no meio, valor à direita. Cada barra usa `item.color` se informado
   * (uma cor por item, ex.: categorias) ou `opts.color`/paleta padrão como
   * cor única (o destaque vem do tamanho da barra e da ordem). `opts.showPercent`
   * soma o valor de todos os itens e mostra a % de cada um sobre esse total.
   * `item.icon` (nome de um Material Symbol) acrescenta um chip circular
   * colorido antes do nome — mesma cor da barra, reforça a identidade visual
   * de cada categoria também no ícone, não só no tamanho da barra.
   * As barras crescem de 0 até o valor final ao renderizar (`_animateFills`).
   */
  rankedList(containerId, items, opts = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!items || !items.length) return this._empty(container);

    const max = Math.max(...items.map((i) => i.valor), 0.0001);
    const total = opts.showPercent ? items.reduce((s, i) => s + (i.valor || 0), 0) : null;
    const hasIcon = items.some((i) => i.icon);
    const rows = items.map((item, i) => {
      const color = item.color || opts.color || this.colorFor(0);
      const pct = total > 0 ? ` <span class="sc-ranked-pct">${((item.valor / total) * 100).toFixed(0)}%</span>` : '';
      const rank = opts.showRank ? `<span class="sc-ranked-rank">${i + 1}º</span>` : '';
      const icon = hasIcon
        ? `<span class="sc-ranked-icon" style="background:${this._rgba(color, 0.16)};color:${color}">${item.icon ? `<span class="material-symbols-outlined" aria-hidden="true">${item.icon}</span>` : ''}</span>`
        : '';
      const width = Math.max((item.valor / max) * 100, 3);
      const gradient = `linear-gradient(90deg, ${this._shade(color, 0.35)}, ${color})`;
      const rowClass = `sc-ranked-row${opts.showRank ? ' has-rank' : ''}${hasIcon ? ' has-icon' : ''}`;
      return `
        <div class="${rowClass}">
          ${rank}
          ${icon}
          <span class="sc-ranked-label">${escapeHtml(item.nome)}</span>
          <div class="sc-ranked-track"><div class="sc-ranked-fill" data-w="${width}" style="width:0%;background:${gradient};transition-delay:${i * 45}ms"></div></div>
          <span class="sc-ranked-value">${formatBRL(item.valor)}${pct}</span>
        </div>
      `;
    }).join('');
    container.innerHTML = `<div class="sc-ranked-wrap">${rows}</div>`;
    this._animateFills(container);
  },

  /** Converte hex pra "rgba(r,g,b,alpha)" — usado no fundo translúcido do chip de ícone (mesma cor da barra, só mais suave). */
  _rgba(hex, alpha) {
    const n = hex.replace('#', '');
    const num = parseInt(n.length === 3 ? n.split('').map((c) => c + c).join('') : n, 16);
    const r = (num >> 16) & 0xff, g = (num >> 8) & 0xff, b = num & 0xff;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  },

  /** Deixa as barras de preenchimento (largura em data-w, altura em data-h) crescerem de 0% até o valor final, em cascata. */
  _animateFills(container) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      container.querySelectorAll('[data-w]').forEach((el) => { el.style.width = el.dataset.w + '%'; });
      container.querySelectorAll('[data-h]').forEach((el) => { el.style.height = el.dataset.h + '%'; });
    }));
  },

  /**
   * Barra de fluxo/alocação: um total dividido em segmentos empilhados
   * lado a lado (ex.: renda dividida em fixos/parcelas/variáveis/sobra).
   * opts: { total, segments: [{label, value, color}] }
   */
  stackedBar(containerId, opts) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const { total, segments } = opts;
    const validSegments = (segments || []).filter((s) => s.value > 0);
    if (!total || total <= 0 || !validSegments.length) return this._empty(container);

    const bar = validSegments.map((s, i) => `
      <div class="sc-flow-seg" style="width:${Math.max((s.value / total) * 100, 0.5)}%;background:${s.color || this.colorFor(i)}" title="${escapeAttr(s.label)}: ${formatBRL(s.value)}"></div>
    `).join('');

    const legend = validSegments.map((s, i) => `
      <div class="sc-legend-item">
        <span class="sc-dot" style="background:${s.color || this.colorFor(i)}"></span>
        <span class="sc-legend-label">${escapeHtml(s.label)}</span>
        <span class="sc-legend-pct">${((s.value / total) * 100).toFixed(0)}%</span>
        <span class="sc-legend-value">${formatBRL(s.value)}</span>
      </div>
    `).join('');

    container.innerHTML = `
      <div class="sc-flow-wrap">
        <div class="sc-flow-bar">${bar}</div>
        <div class="sc-legend">${legend}</div>
      </div>
    `;
  },

  /**
   * Grupo de mini-anéis de progresso — um por categoria, mostrando a
   * participação (%) de cada uma sobre um total de referência. items:
   * [{label, value, color?}], opts: { total } (se omitido, usa a soma dos items).
   */
  miniRingGroup(containerId, items, opts = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const data = items || [];
    if (!data.length) return this._empty(container);
    const total = opts.total || data.reduce((s, i) => s + i.value, 0) || 1;

    const size = 64, r = 26, stroke = 7, cx = size / 2, cy = size / 2;
    const circumference = 2 * Math.PI * r;

    const rings = data.map((item, i) => {
      const pct = Math.min((item.value / total) * 100, 100);
      const color = item.color || this.colorFor(i);
      const len = (pct / 100) * circumference;
      return `
        <div class="sc-ring-item">
          <svg viewBox="0 0 ${size} ${size}" class="sc-ring-svg" role="img" aria-label="${escapeAttr(item.label)}: ${pct.toFixed(0)}%"
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--surface-soft)" stroke-width="${stroke}"/>
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${len.toFixed(2)} ${(circumference - len).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>
            <text x="${cx}" y="${cy + 4}" text-anchor="middle" class="sc-ring-text">${pct.toFixed(0)}%</text>
          </svg>
          <span class="sc-ring-label">${escapeHtml(item.label)}</span>
        </div>
      `;
    }).join('');

    container.innerHTML = `<div class="sc-ring-group">${rings}</div>`;
  },

  /**
   * Anel de progresso único, maior que os mini-anéis de miniRingGroup —
   * usado onde faz sentido destacar um só percentual sobre um card (ex.:
   * meta de reserva de emergência), sem o contexto extra do medidor
   * semicircular (.gauge). Trilha de fundo sólida e fina; o traço de
   * progresso aceita uma cor única (opts.color) ou um gradiente diagonal de
   * duas cores (opts.gradient: [de, para]).
   *
   * A animação (anel enchendo do zero + número central contando) não roda
   * só uma vez: um IntersectionObserver replay a cada vez que o anel entra
   * de novo na viewport (ex.: usuária rola a página, sai da área do card e
   * volta) — ele reseta pro estado vazio quando sai de vista, pra sempre
   * ter algo pra animar na próxima entrada. Respeita prefers-reduced-motion
   * (mostra o valor final direto, sem animação nem replay).
   * opts: { pct, centerValue?, ariaLabel?, color?, gradient?, size?, radius?, strokeWidth?, trackColor? }
   */
  progressRing(containerId, opts = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const pct = Math.max(0, Math.min(opts.pct || 0, 100));
    const size = opts.size || 148, r = opts.radius || 60, stroke = opts.strokeWidth || 14, cx = size / 2, cy = size / 2;
    const trackColor = opts.trackColor || 'var(--border)';
    const circumference = 2 * Math.PI * r;
    const targetOffset = circumference - (pct / 100) * circumference;
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animateNumber = opts.centerValue == null;
    const finalLabel = opts.centerValue != null ? opts.centerValue : `${Math.round(pct)}%`;

    let strokePaint = opts.color || 'var(--purple-500)';
    let gradientDefs = '';
    if (opts.gradient && opts.gradient.length === 2) {
      const gradId = `sc-ring-g${this._uid++}`;
      gradientDefs = `<linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${opts.gradient[0]}"/><stop offset="100%" stop-color="${opts.gradient[1]}"/></linearGradient>`;
      strokePaint = `url(#${gradId})`;
    }

    // Cada render troca o conteúdo do container inteiro — sem desconectar,
    // o observer da renderização anterior ficaria preso a um <circle> que
    // não existe mais no DOM.
    if (container._ringObserver) { container._ringObserver.disconnect(); container._ringObserver = null; }

    container.innerHTML = `
      <div class="sc-progress-ring-wrap" style="width:${size}px;height:${size}px;">
        <svg viewBox="0 0 ${size} ${size}" class="sc-progress-ring-svg" role="img" aria-label="${escapeAttr(opts.ariaLabel || finalLabel)}">
          ${gradientDefs ? `<defs>${gradientDefs}</defs>` : ''}
          <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${trackColor}" stroke-width="${stroke}"/>
          <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${strokePaint}" stroke-width="${stroke}" stroke-linecap="round" class="sc-progress-ring-fill" stroke-dasharray="${circumference.toFixed(2)} ${circumference.toFixed(2)}" stroke-dashoffset="${circumference.toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>
        </svg>
        <div class="sc-progress-ring-center">
          <span class="sc-progress-ring-value">${escapeHtml(reduceMotion || !animateNumber ? finalLabel : '0%')}</span>
          ${opts.centerSub ? `<span class="sc-progress-ring-sub">${escapeHtml(opts.centerSub)}</span>` : ''}
        </div>
      </div>
    `;

    const wrap = container.querySelector('.sc-progress-ring-wrap');
    const fillCircle = container.querySelector('.sc-progress-ring-fill');
    const valueEl = container.querySelector('.sc-progress-ring-value');

    if (reduceMotion) {
      if (fillCircle) fillCircle.style.strokeDashoffset = targetOffset.toFixed(2);
      return;
    }

    const playIn = () => {
      if (fillCircle) {
        // Duas rAF encadeadas: a primeira só garante que o navegador já
        // pintou o offset vazio (definido acima) antes de trocar pro valor
        // final — sem isso as duas mudanças de estilo caem no mesmo frame
        // e a transição CSS não dispara.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            fillCircle.style.strokeDashoffset = targetOffset.toFixed(2);
          });
        });
      }
      if (animateNumber && valueEl) {
        const duration = 1200;
        const start = performance.now();
        const ease = (t) => 1 - Math.pow(1 - t, 3);
        const step = (now) => {
          const t = Math.min((now - start) / duration, 1);
          valueEl.textContent = `${Math.round(pct * ease(t))}%`;
          if (t < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }
    };

    // Volta pro estado "vazio" sem transição (troca temporariamente pra
    // "none" e força o navegador a recalcular o layout com getBoundingClientRect
    // antes de restaurar) — sem isso a próxima entrada na viewport animaria
    // a partir do valor cheio de volta pro vazio, ao contrário do efeito
    // pedido.
    const resetOut = () => {
      if (fillCircle) {
        fillCircle.style.transition = 'none';
        fillCircle.style.strokeDashoffset = circumference.toFixed(2);
        fillCircle.getBoundingClientRect();
        fillCircle.style.transition = '';
      }
      if (animateNumber && valueEl) valueEl.textContent = '0%';
    };

    if (wrap && window.IntersectionObserver) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => (entry.isIntersecting ? playIn() : resetOut()));
      }, { threshold: 0.3 });
      observer.observe(wrap);
      container._ringObserver = observer;
    } else {
      playIn();
    }
  },

  /**
   * Gráfico de linha (uma ou mais séries). opts: { labels, series: [{name, data, color}] }
   */
  line(containerId, opts) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const { labels, series } = opts;
    const hasData = series && series.some((s) => s.data.some((v) => v !== 0 && v != null));
    if (!series || !series.length || !labels.length || !hasData) return this._empty(container);

    const uid = `scl${this._uid++}`;
    const hasOverlay = opts.pointLabels || opts.labelLastOnly || (opts.annotations && opts.annotations.length);
    const w = 320, h = 150, padL = opts.showYAxis ? 34 : 8, padR = 8, padT = hasOverlay ? 34 : 14, padB = 10;
    const allValues = series.flatMap((s) => s.data).concat((opts.referenceLines || []).map((r) => r.value));
    const max = Math.max(...allValues, 0);
    const min = Math.min(...allValues, 0);
    const range = (max - min) || 1;
    const n = labels.length;
    const xStep = n > 1 ? (w - padL - padR) / (n - 1) : 0;
    const yFor = (v) => padT + (h - padT - padB) * (1 - (v - min) / range);
    const xFor = (i) => padL + i * xStep;
    const bottomY = h - padB;

    // Eixo Y opcional: gridlines horizontais tracejadas + rótulos de valor à
    // esquerda, em 4 níveis igualmente espaçados entre o mínimo e o máximo
    // (incluindo o valor de eventuais referenceLines, já contado em min/max
    // acima). Some sozinho (opts.showYAxis não informado) pros gráficos que
    // já funcionam bem só com o eixo X, pra não sobrecarregar tudo de uma vez.
    let yAxisGridSvg = '';
    let yAxisLabelsHtml = '';
    if (opts.showYAxis) {
      const fmtY = opts.labelFormatter || ((v) => String(Math.round(v)));
      const tickCount = 4;
      for (let i = 0; i < tickCount; i++) {
        const v = min + (range * i) / (tickCount - 1);
        const y = yFor(v);
        yAxisGridSvg += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${w - padR}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="1" stroke-dasharray="2 3" opacity="0.6"/>`;
        yAxisLabelsHtml += `<span class="sc-line-ytick" style="top:${((y / h) * 100).toFixed(1)}%">${escapeHtml(fmtY(v))}</span>`;
      }
      // Linhas verticais só decorativas (grade completa, "papel quadriculado"),
      // em posições fixas — não uma por ponto de dado, senão com muitos pontos
      // (ex.: 30 dias) a grade vira uma poluição visual só de traços verticais.
      const vLines = 5;
      for (let i = 0; i <= vLines; i++) {
        const x = padL + ((w - padL - padR) * i) / vLines;
        yAxisGridSvg += `<line x1="${x.toFixed(1)}" y1="${padT}" x2="${x.toFixed(1)}" y2="${bottomY}" stroke="var(--border)" stroke-width="1" stroke-dasharray="2 3" opacity="0.4"/>`;
      }
    }

    // Linhas de referência opcionais (opts.referenceLines: [{value, color, label}])
    // — um teto/meta fixo pra comparar a série real com ele (ex.: renda do mês
    // no Ritmo de gasto), sempre um valor real calculado por quem chama, nunca
    // fabricado aqui.
    let referenceLinesSvg = '';
    let referenceLabelsHtml = '';
    (opts.referenceLines || []).forEach((ref) => {
      const y = yFor(ref.value);
      const color = ref.color || 'var(--purple-500)';
      referenceLinesSvg += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${w - padR}" y2="${y.toFixed(1)}" stroke="${color}" stroke-width="1.5" stroke-dasharray="5 4"/>`;
      if (ref.label) {
        referenceLabelsHtml += `<span class="sc-line-reference-label" style="top:${((y / h) * 100).toFixed(1)}%;color:${color}"><span class="material-symbols-outlined" aria-hidden="true">flag</span>${escapeHtml(ref.label)}</span>`;
      }
    });

    let defs = '';
    const allPts = [];
    let endDotsOverlay = '';
    const layers = series.map((s, si) => {
      const color = s.color || this.colorFor(si);
      const pts = s.data.map((v, i) => [xFor(i), yFor(v)]);
      allPts[si] = pts;
      const linePath = opts.stepped ? this._stepPath(pts) : opts.monotone ? this._monotonePath(pts) : this._smoothPath(pts);
      const dotHidden = s.hideDots != null ? s.hideDots : opts.hideDots;
      const dotRadius = s.dotRadius || 2.5;
      const dotOpacity = s.opacity != null ? ` fill-opacity="${s.opacity}"` : '';
      // Com opts.emphasizeLastDot os dois pontos de ponta (primeiro/último)
      // saem daqui e viram overlay HTML (ver endDotsHtml) — não fica só o
      // último de fora porque, com preserveAspectRatio="none" (gráfico bem
      // mais largo que alto, como o de "Potencial de investimento"), um
      // <circle> do SVG estica proporcionalmente diferente no x e no y e
      // vira uma elipse, não um círculo. Um <div> com width/height fixos em
      // CSS não sofre esse esticamento (mesmo truque de .sc-line-hover-dot).
      const skipEndDots = opts.emphasizeLastDot && pts.length;
      const dots = dotHidden ? '' : pts.map(([x, y], i) => {
        if (skipEndDots && (i === 0 || i === pts.length - 1)) return '';
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${dotRadius}" fill="${color}"${dotOpacity}/>`;
      }).join('');
      if (skipEndDots) {
        endDotsOverlay += [0, pts.length - 1].map((i) => {
          const [x, y] = pts[i];
          const isLast = i === pts.length - 1;
          const size = isLast ? 12 : 6;
          return `<span class="sc-line-end-dot" style="left:${((x / w) * 100).toFixed(1)}%;top:${((y / h) * 100).toFixed(1)}%;width:${size}px;height:${size}px;margin:-${size / 2}px 0 0 -${size / 2}px;background:${color};"></span>`;
        }).join('');
      }

      let areaFill = '';
      if (series.length === 1 || s.fillArea) {
        const gradId = `${uid}-area${si}`;
        const fillOpacity = s.fillOpacity != null ? s.fillOpacity : 0.32;
        defs += `<linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="${fillOpacity}"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
        </linearGradient>`;
        const areaPath = `${linePath} L ${pts[pts.length - 1][0].toFixed(1)},${bottomY} L ${pts[0][0].toFixed(1)},${bottomY} Z`;
        areaFill = `<path d="${areaPath}" fill="url(#${gradId})" stroke="none"/>`;
      }

      const strokeWidth = s.strokeWidth || 2.5;
      const dashArray = s.dashed ? ` stroke-dasharray="6 4"` : '';
      const opacity = s.opacity != null ? ` stroke-opacity="${s.opacity}"` : '';
      return `${areaFill}<path d="${linePath}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linejoin="round" stroke-linecap="round"${dashArray}${opacity}/>${dots}`;
    }).join('');

    const zeroY = yFor(0).toFixed(1);
    const zeroLine = min < 0 && max > 0 ? `<line x1="${padL}" y1="${zeroY}" x2="${w - padR}" y2="${zeroY}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3 3"/>` : '';

    // Perto de qualquer uma das bordas, centralizar um rótulo no ponto
    // (transform: translateX(-50%)) faz metade dele vazar pra fora do card —
    // isso sempre acontecia no rótulo do último ponto/mês (ele é sempre o
    // mais à direita). Ancora pela esquerda/direita nesses casos, só
    // centraliza de verdade quando o ponto está numa faixa segura no meio.
    // Usado tanto pelos rótulos do eixo X quanto pelos rótulos/anotações de
    // valor sobrepostos ao gráfico (mesmo problema, mesma solução).
    const hAnchor = (xPct) => {
      if (xPct > 85) return { pos: `right:${(100 - xPct).toFixed(1)}%;`, tx: '0%' };
      if (xPct < 15) return { pos: `left:${xPct.toFixed(1)}%;`, tx: '0%' };
      return { pos: `left:${xPct.toFixed(1)}%;`, tx: '-50%' };
    };

    const xLabels = labels.map((l, i) => {
      const { pos, tx } = hAnchor((xFor(i) / w) * 100);
      return `<span style="${pos}transform:translateX(${tx})">${escapeHtml(l)}</span>`;
    }).join('');

    const legend = series.length > 1 ? `
      <div class="sc-legend sc-legend-inline">
        ${series.map((s, i) => `<div class="sc-legend-item"><span class="sc-dot" style="background:${s.color || this.colorFor(i)}"></span>${escapeHtml(s.name)}</div>`).join('')}
      </div>
    ` : '';

    let overlay = '';
    const labelSeriesIndex = opts.labelSeriesIndex || 0;
    const labelPts = allPts[labelSeriesIndex];
    if (opts.pointLabels || opts.labelLastOnly || (opts.annotations && opts.annotations.length)) {
      const fmt = opts.labelFormatter || ((v) => String(Math.round(v)));
      let labelsHtml = '';
      if (opts.pointLabels && labelPts) {
        const labelSeries = series[labelSeriesIndex];
        labelsHtml = labelPts.map(([x, y], i) => {
          const { pos, tx } = hAnchor((x / w) * 100);
          return `<span class="sc-line-point-label" style="${pos}top:${((y / h) * 100).toFixed(1)}%;transform:translate(${tx}, calc(-100% - 8px));">${escapeHtml(fmt(labelSeries.data[i]))}</span>`;
        }).join('');
      } else if (opts.labelLastOnly) {
        labelsHtml = series.map((s, si) => {
          const pts = allPts[si];
          const i = pts.length - 1;
          const [x, y] = pts[i];
          // Cor da série "clareada" pro texto — algumas cores de linha (ex.: roxo
          // bem escuro) têm contraste ótimo como traço, mas ficam ilegíveis como
          // texto pequeno sobre o fundo escuro do card.
          const color = this._shade(s.color || this.colorFor(si), 0.4);
          const { pos, tx } = hAnchor((x / w) * 100);
          return `<span class="sc-line-point-label" style="${pos}top:${((y / h) * 100).toFixed(1)}%;transform:translate(${tx}, calc(-100% - 8px));color:${color}">${escapeHtml(fmt(s.data[i]))}</span>`;
        }).join('');
      }
      const annotationsHtml = labelPts ? (opts.annotations || []).map((a) => {
        const pt = labelPts[a.index];
        if (!pt) return '';
        const [x, y] = pt;
        const { pos, tx } = hAnchor((x / w) * 100);
        return `<span class="sc-line-annotation" style="${pos}top:${((y / h) * 100).toFixed(1)}%;transform:translate(${tx}, calc(-100% - 20px));background:${a.color || 'var(--purple-600)'}">${escapeHtml(a.text)}</span>`;
      }).join('') : '';
      overlay = `<div class="sc-line-overlay">${labelsHtml}${annotationsHtml}</div>`;
    }

    const yAxisOverlay = (yAxisLabelsHtml || referenceLabelsHtml)
      ? `<div class="sc-line-overlay">${yAxisLabelsHtml}${referenceLabelsHtml}</div>`
      : '';

    container.innerHTML = `
      <div class="sc-line-wrap">
        <div class="sc-line-plot">
          <svg viewBox="0 0 ${w} ${h}" class="sc-line-svg" preserveAspectRatio="none" role="img" aria-label="${escapeAttr(opts.ariaLabel || 'Gráfico de linha')}"><defs>${defs}</defs>${yAxisGridSvg}${referenceLinesSvg}${zeroLine}${layers}</svg>
          ${yAxisOverlay}
          ${overlay}
          ${endDotsOverlay}
        </div>
        <div class="sc-line-xlabels">${xLabels}</div>
      </div>
      ${legend}
    `;

    if (opts.interactive !== false) {
      this._attachLineHover(container, { xFor, allPts, series, labels, labelFormatter: opts.labelFormatter, w, h });
    }
  },

  /**
   * Constrói um path "em degraus" (o valor muda de vez no ponto, não numa
   * transição suave) a partir de pontos [x,y] — usado pra séries que são
   * uma soma acumulada por dia (ex.: ritmo de gasto), onde uma curva suave
   * geraria ondulações artificiais nos trechos longos e planos entre um
   * salto e outro.
   */
  _stepPath(points) {
    if (!points.length) return '';
    let path = `M ${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`;
    for (let i = 1; i < points.length; i++) {
      const prevY = points[i - 1][1];
      const [x, y] = points[i];
      path += ` L ${x.toFixed(1)},${prevY.toFixed(1)} L ${x.toFixed(1)},${y.toFixed(1)}`;
    }
    return path;
  },

  /**
   * Path suave por interpolação cúbica monótona (Fritsch–Carlson) — pra
   * séries que só sobem (ou só descem), como uma soma acumulada por dia.
   * Diferente do Catmull-Rom (_smoothPath), essa curva NUNCA ultrapassa o
   * valor dos pontos vizinhos: nos trechos longos e planos entre um salto
   * e outro a tangente vira zero automaticamente, então a curva encosta
   * suave no salto em vez de balançar (era isso que causava a ondulação
   * estranha quando usávamos Catmull-Rom nessa mesma série).
   */
  _monotonePath(points) {
    const n = points.length;
    if (n < 2) {
      const [x, y] = points[0] || [0, 0];
      return `M ${x.toFixed(1)},${y.toFixed(1)}`;
    }
    if (n === 2) {
      return `M ${points[0][0].toFixed(1)},${points[0][1].toFixed(1)} L ${points[1][0].toFixed(1)},${points[1][1].toFixed(1)}`;
    }

    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const d = [];
    for (let i = 0; i < n - 1; i++) {
      const hx = xs[i + 1] - xs[i];
      d.push(hx !== 0 ? (ys[i + 1] - ys[i]) / hx : 0);
    }

    const m = new Array(n).fill(0);
    m[0] = d[0];
    m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) {
      if (d[i - 1] === 0 || d[i] === 0 || (d[i - 1] < 0) !== (d[i] < 0)) {
        m[i] = 0;
      } else {
        m[i] = (d[i - 1] + d[i]) / 2;
      }
    }
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) continue;
      const a = m[i] / d[i];
      const b = m[i + 1] / d[i];
      const s = a * a + b * b;
      if (s > 9) {
        const tau = 3 / Math.sqrt(s);
        m[i] = tau * a * d[i];
        m[i + 1] = tau * b * d[i];
      }
    }

    let path = `M ${xs[0].toFixed(1)},${ys[0].toFixed(1)}`;
    for (let i = 0; i < n - 1; i++) {
      const hx = xs[i + 1] - xs[i];
      const cp1x = xs[i] + hx / 3;
      const cp1y = ys[i] + (m[i] * hx) / 3;
      const cp2x = xs[i + 1] - hx / 3;
      const cp2y = ys[i + 1] - (m[i + 1] * hx) / 3;
      path += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${xs[i + 1].toFixed(1)},${ys[i + 1].toFixed(1)}`;
    }
    return path;
  },

  /** Constrói um path suave (curvas de Bézier via Catmull-Rom) a partir de pontos [x,y]. */
  _smoothPath(points) {
    if (points.length < 2) {
      const [x, y] = points[0] || [0, 0];
      return `M ${x.toFixed(1)},${y.toFixed(1)}`;
    }
    if (points.length === 2) {
      return `M ${points[0][0].toFixed(1)},${points[0][1].toFixed(1)} L ${points[1][0].toFixed(1)},${points[1][1].toFixed(1)}`;
    }
    let path = `M ${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] || points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] || p2;
      const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
      const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
      const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
      const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
      path += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return path;
  },

  /**
   * Mini gráfico de tendência (sparkline) para dentro de cards — uma curva
   * discreta com área em gradiente, sem eixos nem legenda. `values` é uma
   * lista simples de números (ex.: histórico mensal de um indicador).
   */
  /**
   * `opts.pulse`: acrescenta um ponto com glow pulsante no último valor da
   * série (pensado pro valor "de agora", quando ele ainda nem foi
   * arquivado no histórico). `opts.valueLabel`: mostra esse valor num
   * balão flutuante acima do ponto, senão o pulso fica sem contexto —
   * respeitam prefers-reduced-motion (regra global de css/style.css).
   */
  sparkline(containerId, values, color, opts = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const nums = (values || []).filter((v) => v != null);
    if (nums.length < 2) { container.innerHTML = ''; return; }

    const uid = `scs${this._uid++}`;
    const w = 140, h = 44, pad = 4;
    const max = Math.max(...nums);
    const min = Math.min(...nums);
    const flat = max === min; // sem variação real entre os meses — linha centralizada, não fabricamos oscilação
    const range = flat ? 1 : (max - min);
    const xStep = (w - pad * 2) / (nums.length - 1);
    const pts = nums.map((v, i) => [pad + i * xStep, flat ? h / 2 : pad + (h - pad * 2) * (1 - (v - min) / range)]);
    const c = color || this.colorFor(0);
    const linePath = this._smoothPath(pts);
    const areaPath = `${linePath} L ${pts[pts.length - 1][0].toFixed(1)},${h - pad} L ${pts[0][0].toFixed(1)},${h - pad} Z`;

    const [lastX, lastY] = pts[pts.length - 1];
    const pulseSvg = opts.pulse ? `
      <circle class="sc-spark-pulse-ring" cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="3" stroke="${c}"/>
      <circle class="sc-spark-pulse-dot" cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="3" fill="${c}"/>
    ` : '';
    // O ponto do pulso é sempre o último da série (o "agora") — por
    // construção, fica sempre perto da borda direita. Ancorar a tooltip
    // pela direita (em vez de centralizar em cima do ponto) evita que ela
    // vaze pra fora do card nesse caso, sem precisar calcular exceção pra
    // "ponto perto da borda".
    const tooltipHtml = opts.valueLabel ? `
      <div class="sc-spark-tooltip" style="right:${(100 - (lastX / w) * 100).toFixed(1)}%; top:${((lastY / h) * 100).toFixed(1)}%;">${escapeHtml(opts.valueLabel)}</div>
    ` : '';

    container.innerHTML = `
      <div class="sc-spark-wrap">
        <svg viewBox="0 0 ${w} ${h}" class="sc-spark-svg" preserveAspectRatio="none" role="img" aria-label="${opts.valueLabel ? escapeAttr(opts.valueLabel) : 'Tendência'}">
          <defs><linearGradient id="${uid}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${c}" stop-opacity="0.35"/>
            <stop offset="100%" stop-color="${c}" stop-opacity="0"/>
          </linearGradient></defs>
          <path d="${areaPath}" fill="url(#${uid})" stroke="none"/>
          <path d="${linePath}" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
          ${pulseSvg}
        </svg>
        ${tooltipHtml}
      </div>
    `;
  },

  /**
   * Medidor semicircular (estilo velocímetro) para destacar um único
   * percentual — usado no Raio-X financeiro. opts: { pct, limitPct?,
   * state?: 'normal'|'warning'|'danger', centerValue? }
   *
   * Cor do preenchimento por semáforo — verde (margem boa), amarelo
   * (aproximando do limite) ou vermelho (ultrapassado). O card do medidor
   * (.raiox-card) agora tem fundo neutro (mesmo dos outros cards), então as
   * cores seguem os mesmos tons de --success/--warning/--danger do tema
   * (um hex por claro/escuro aqui, porque _shade() abaixo precisa de hex
   * pra montar o gradiente do preenchimento — não dá pra passar var(...)).
   */
  gaugeColorsLight: { normal: '#187E56', warning: '#966319', danger: '#C0392B' },
  gaugeColorsDark: { normal: '#34D399', warning: '#FBBF24', danger: '#F87171' },

  gauge(containerId, opts = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const pct = Math.max(0, Math.min(opts.pct || 0, 100));
    const w = 220, h = 130, cx = 110, cy = 118, r = 92, stroke = 18;

    const pointFor = (p, radius) => {
      const angle = Math.PI * (1 - p / 100); // 180° (esquerda) em p=0 até 0° (direita) em p=100
      return [cx + radius * Math.cos(angle), cy - radius * Math.sin(angle)];
    };
    const [sx, sy] = pointFor(0, r);
    const [ex, ey] = pointFor(100, r);
    const trackPath = `M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${r} ${r} 0 0 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`;

    const state = opts.state || 'normal';
    const gaugeColors = this.isDark() ? this.gaugeColorsDark : this.gaugeColorsLight;
    const baseColor = gaugeColors[state] || gaugeColors.normal;
    const gradId = `sc-gauge-g${this._uid++}`;
    const gaugeGradient = `
      <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${this._shade(baseColor, -0.12)}"/>
        <stop offset="100%" stop-color="${this._shade(baseColor, 0.18)}"/>
      </linearGradient>`;
    const fillColor = `url(#${gradId})`;

    let markerSvg = '';
    if (opts.limitPct != null) {
      const innerR = r - stroke / 2 - 5;
      const outerR = r + stroke / 2 + 5;
      const [ix, iy] = pointFor(opts.limitPct, innerR);
      const [ox, oy] = pointFor(opts.limitPct, outerR);
      // Halo na cor do card (var(--surface)) por baixo do traço de destaque —
      // mesmo truque do ponto de hover no gráfico de linha (.sc-line-hover-dot)
      // pra "recortar" o marcador de cima do preenchimento em qualquer tema.
      markerSvg = `
        <line x1="${ix.toFixed(2)}" y1="${iy.toFixed(2)}" x2="${ox.toFixed(2)}" y2="${oy.toFixed(2)}" stroke="var(--surface)" stroke-width="6" stroke-linecap="round"/>
        <line x1="${ix.toFixed(2)}" y1="${iy.toFixed(2)}" x2="${ox.toFixed(2)}" y2="${oy.toFixed(2)}" stroke="var(--text-primary)" stroke-width="2.5" stroke-linecap="round"/>
      `;
    }

    const fillLen = Math.max(pct, pct > 0 ? 0.6 : 0);

    container.innerHTML = `
      <div class="sc-gauge-wrap">
        <svg viewBox="0 0 ${w} ${h}" class="sc-gauge-svg" role="img" aria-label="Medidor de ${Math.round(pct)}%">
          <defs>${gaugeGradient}</defs>
          <!-- Trilho em --border (não --surface-soft): a diferença de tom
               entre --surface-soft e o fundo translúcido do .raiox-card
               era pequena demais — a parte não preenchida do arco ficava
               quase invisível, e o traço do marcador de limite (markerSvg
               abaixo) parecia flutuar sozinho no vazio em vez de cruzar
               visivelmente o trilho. -->
          <path d="${trackPath}" fill="none" stroke="var(--border)" stroke-width="${stroke}" stroke-linecap="round"/>
          <path d="${trackPath}" fill="none" stroke="${fillColor}" stroke-width="${stroke}" stroke-linecap="round" pathLength="100" stroke-dasharray="${fillLen.toFixed(2)} ${(100 - fillLen).toFixed(2)}" class="sc-gauge-fill sc-gauge-fill-${state}"/>
          ${markerSvg}
        </svg>
        <div class="sc-gauge-center">
          <span class="sc-gauge-value">${escapeHtml(opts.centerValue != null ? opts.centerValue : `${Math.round(pct)}%`)}</span>
        </div>
      </div>
    `;
  },

  /**
   * Calendário de gastos do mês — heatmap num único matiz (roxo). `days`:
   * [{day, date:'AAAA-MM-DD', value}] para TODOS os dias do mês (o método
   * descobre sozinho em que coluna/dia da semana cada um cai a partir de
   * `date`). Nível 0 = sem gasto naquele dia — nunca inventamos
   * intensidade; níveis 1-4 vêm de quartis dos dias com valor > 0.
   * `opts.emptyMessage` substitui o grid por um estado vazio quando não há
   * nenhum dia com gasto real lançado ainda. Cada célula mostra o número do
   * dia, o dia de hoje ganha um anel de destaque, e passar o mouse/focar
   * (teclado) abre um tooltip próprio (ver _attachHeatmapHover) em vez do
   * title nativo do navegador.
   */
  heatmap(containerId, days, opts = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const list = days || [];
    const withSpend = list.map((d) => d.value).filter((v) => v > 0).sort((a, b) => a - b);
    if (!list.length || !withSpend.length) {
      container.innerHTML = `<div class="empty-state-mini"><span class="material-symbols-outlined" aria-hidden="true">calendar_month</span><p>${escapeHtml(opts.emptyMessage || 'Sem dados para exibir ainda.')}</p></div>`;
      return;
    }

    const thresholdAt = (p) => withSpend[Math.min(Math.floor(p * withSpend.length), withSpend.length - 1)];
    const q1 = thresholdAt(0.25), q2 = thresholdAt(0.5), q3 = thresholdAt(0.75);
    const levelFor = (v) => {
      if (!v) return 0;
      if (v <= q1) return 1;
      if (v <= q2) return 2;
      if (v <= q3) return 3;
      return 4;
    };

    // Data local (não toISOString, que é UTC e erraria o dia perto da meia-noite em fusos como o do Brasil).
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const [ano, mes] = list[0].date.split('-').map(Number);
    const firstWeekday = new Date(ano, mes - 1, 1).getDay();
    const leading = Array.from({ length: firstWeekday }, () => `<div class="sc-heatmap-cell is-empty"></div>`).join('');
    const cells = list.map((d) => {
      const level = levelFor(d.value);
      const dataCurta = `${d.date.slice(8, 10)}/${d.date.slice(5, 7)}`;
      const tooltip = `${dataCurta} — ${d.value > 0 ? formatBRL(d.value) : 'sem gastos'}`;
      const isToday = d.date === todayStr ? ' is-today' : '';
      return `<div class="sc-heatmap-cell${isToday}" data-level="${level}" data-tooltip="${escapeAttr(tooltip)}" tabindex="0" role="button" aria-label="${escapeAttr(tooltip)}"><span class="sc-heatmap-cell-day">${d.day}</span></div>`;
    }).join('');

    const weekdaysHtml = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((w) => `<span>${w}</span>`).join('');

    container.innerHTML = `
      <div class="sc-heatmap-wrap">
        <div class="sc-heatmap-weekdays">${weekdaysHtml}</div>
        <div class="sc-heatmap-grid">${leading}${cells}</div>
        <div class="sc-heatmap-legend">Menos<div class="sc-heatmap-legend-scale"></div>Mais</div>
      </div>
    `;
    this._attachHeatmapHover(container);
  },

  /**
   * Tooltip próprio do calendário de gastos — mesmo padrão de
   * _attachLineHover (um único elemento reaproveitado, ancorado perto do
   * alvo, sem vazar do card), só que disparado por célula (mouse ou foco de
   * teclado) em vez de posição X contínua do mouse sobre um SVG.
   */
  _attachHeatmapHover(container) {
    const wrap = container.querySelector('.sc-heatmap-wrap');
    const grid = container.querySelector('.sc-heatmap-grid');
    if (!wrap || !grid) return;

    const tooltip = document.createElement('div');
    tooltip.className = 'sc-heatmap-tooltip';
    wrap.appendChild(tooltip);

    const show = (cell) => {
      const text = cell.dataset.tooltip;
      if (!text) return;
      tooltip.textContent = text;
      const wrapRect = wrap.getBoundingClientRect();
      const cellRect = cell.getBoundingClientRect();
      const xPct = ((cellRect.left + cellRect.width / 2 - wrapRect.left) / wrapRect.width) * 100;
      const topPct = ((cellRect.top - wrapRect.top) / wrapRect.height) * 100;

      if (xPct > 85) { tooltip.style.left = 'auto'; tooltip.style.right = `${(100 - xPct).toFixed(1)}%`; tooltip.style.transform = 'translate(0, -100%)'; }
      else if (xPct < 15) { tooltip.style.right = 'auto'; tooltip.style.left = `${xPct.toFixed(1)}%`; tooltip.style.transform = 'translate(0, -100%)'; }
      else { tooltip.style.right = 'auto'; tooltip.style.left = `${xPct.toFixed(1)}%`; tooltip.style.transform = 'translate(-50%, -100%)'; }
      tooltip.style.top = `${topPct.toFixed(1)}%`;
      tooltip.classList.add('is-visible');
    };
    const hide = () => tooltip.classList.remove('is-visible');

    grid.querySelectorAll('.sc-heatmap-cell:not(.is-empty)').forEach((cell) => {
      cell.addEventListener('mouseenter', () => show(cell));
      cell.addEventListener('mouseleave', hide);
      cell.addEventListener('focus', () => show(cell));
      cell.addEventListener('blur', hide);
    });
  },

  /**
   * Anexa hover interativo a um gráfico de linha já renderizado: linha-guia
   * vertical + ponto destacado por série + tooltip com o valor de cada
   * série no índice mais próximo do mouse. Convive com pointLabels/
   * labelLastOnly/annotations (que continuam sempre visíveis) — é uma
   * camada adicional, não substitui nada.
   *
   * IMPORTANTE: o SVG usa `preserveAspectRatio="none"` (viewBox 320×150
   * abstrato, esticado via CSS pro tamanho real do container), então o
   * mapeamento mouse→dado tem que sempre passar por `getBoundingClientRect()`
   * do `.sc-line-plot` a cada evento — nunca assumir pixel 1:1 com o viewBox.
   */
  _attachLineHover(container, { xFor, allPts, series, labels, labelFormatter, w, h }) {
    const plot = container.querySelector('.sc-line-plot');
    if (!plot || labels.length < 2) return;
    const fmt = labelFormatter || ((v) => String(Math.round(v)));
    const n = labels.length;

    const guide = document.createElement('div');
    guide.className = 'sc-line-hover-guide';
    plot.appendChild(guide);

    const dots = series.map((s, si) => {
      const dot = document.createElement('div');
      dot.className = 'sc-line-hover-dot';
      dot.style.background = s.color || this.colorFor(si);
      plot.appendChild(dot);
      return dot;
    });

    const tooltip = document.createElement('div');
    tooltip.className = 'sc-line-tooltip';
    plot.appendChild(tooltip);

    const showAt = (i) => {
      const xPct = (xFor(i) / w) * 100;
      guide.style.left = `${xPct}%`;
      dots.forEach((dot, si) => {
        const pt = allPts[si][i];
        if (!pt) { dot.style.opacity = '0'; return; }
        dot.style.opacity = '1';
        dot.style.left = `${(pt[0] / w) * 100}%`;
        dot.style.top = `${(pt[1] / h) * 100}%`;
      });

      const rowsHtml = series.map((s, si) => {
        const color = s.color || this.colorFor(si);
        return `<div class="sc-line-tooltip-row"><span class="sc-dot" style="background:${color}"></span>${escapeHtml(s.name || '')}: ${escapeHtml(fmt(s.data[i]))}</div>`;
      }).join('');
      tooltip.innerHTML = `<div class="sc-line-tooltip-title">${escapeHtml(labels[i])}</div>${rowsHtml}`;

      // Ancora pela direita perto da borda direita (mesma ideia de hAnchor,
      // usada nos rótulos estáticos) pra tooltip nunca vazar pra fora do card.
      if (xPct > 70) { tooltip.style.left = 'auto'; tooltip.style.right = `${(100 - xPct).toFixed(1)}%`; tooltip.style.transform = 'translate(0, -100%)'; }
      else if (xPct < 15) { tooltip.style.right = 'auto'; tooltip.style.left = `${xPct.toFixed(1)}%`; tooltip.style.transform = 'translate(0, -100%)'; }
      else { tooltip.style.right = 'auto'; tooltip.style.left = `${xPct.toFixed(1)}%`; tooltip.style.transform = 'translate(-50%, -100%)'; }
      const topPts = allPts.map((pts) => pts[i]).filter(Boolean);
      const yTop = topPts.length ? Math.min(...topPts.map((p) => p[1])) : 0;
      tooltip.style.top = `${Math.max(((yTop / h) * 100) - 6, 2)}%`;
    };

    const indexFromClientX = (clientX) => {
      const rect = plot.getBoundingClientRect();
      const frac = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
      return Math.round(frac * (n - 1));
    };
    const onMove = (clientX) => { plot.classList.add('is-hovering'); showAt(indexFromClientX(clientX)); };
    const onLeave = () => plot.classList.remove('is-hovering');

    plot.addEventListener('mousemove', (e) => onMove(e.clientX));
    plot.addEventListener('mouseleave', onLeave);
    plot.addEventListener('touchstart', (e) => { if (e.touches[0]) onMove(e.touches[0].clientX); }, { passive: true });
    plot.addEventListener('touchmove', (e) => { if (e.touches[0]) onMove(e.touches[0].clientX); }, { passive: true });
    plot.addEventListener('touchend', onLeave);
  },

  /**
   * Tooltip ao passar o mouse/tocar/focar (teclado) em cada barra de
   * `comparisonBars` — mostra o valor exato (mesmo `fmt` da tabela abaixo
   * do gráfico) só na interação, em vez de um rótulo sempre visível que
   * pode arredondar diferente do resto do card.
   */
  _attachBarHover(container, { values, fmt, barCentersPct, barTopsPct }) {
    const tooltip = container.querySelector('.sc-cbar-tooltip');
    const bars = container.querySelectorAll('.sc-cbar-bar');
    if (!tooltip || !bars.length) return;

    const show = (i) => {
      tooltip.textContent = fmt(values[i]);
      tooltip.style.left = `${barCentersPct[i].toFixed(1)}%`;
      tooltip.style.top = `${Math.max(barTopsPct[i] - 4, 2).toFixed(1)}%`;
      tooltip.classList.add('is-visible');
    };
    const hide = () => tooltip.classList.remove('is-visible');

    bars.forEach((bar, i) => {
      bar.setAttribute('tabindex', '0');
      bar.setAttribute('role', 'img');
      bar.setAttribute('aria-label', fmt(values[i]));
      bar.addEventListener('mouseenter', () => show(i));
      bar.addEventListener('mouseleave', hide);
      bar.addEventListener('focus', () => show(i));
      bar.addEventListener('blur', hide);
      bar.addEventListener('touchstart', () => show(i), { passive: true });
    });
    container.querySelector('.sc-cbar-plot').addEventListener('touchend', hide);
  },
};

function formatBRLShort(v) {
  if (v == null) return '';
  const abs = Math.abs(v);
  if (abs >= 1000) return `${(v / 1000).toFixed(1).replace('.', ',')}k`;
  return Math.round(v).toString();
}

// Cópia local — simplecharts.js não deve depender da ordem de carregamento
// de outros arquivos (accounts.js também define a mesma função).
if (typeof escapeHtml === 'undefined') {
  var escapeHtml = function (str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  };
}
if (typeof escapeAttr === 'undefined') {
  var escapeAttr = function (str) {
    return escapeHtml(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
}
