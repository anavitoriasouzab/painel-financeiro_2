/**
 * auth-particles.js
 * -----------------------------------------------------------------------
 * Fundo animado do login (login.html): rede de partículas em <canvas>,
 * substitui o antigo fundo de "bolhas" (ver histórico do projeto). Cada nó é
 * um dígito solto (estética "stream de números"), descendo devagar; feixes
 * de luz sobem rápido; linhas conectam nós próximos entre si e — só em
 * dispositivos com mouse de verdade — com o cursor.
 *
 * Cor lida de `--purple-text` (css/style.css), que já muda entre tema claro
 * e escuro sozinha; aqui só variamos a opacidade em cima dela. Puro
 * decorativo, não interfere no formulário de login/cadastro.
 *
 * `prefers-reduced-motion` desenha uma cena parada (sem loop de animação,
 * sem reação ao mouse) — mesmo cuidado de acessibilidade que o fundo
 * anterior já tinha.
 */
(function () {
  var canvas = document.getElementById('auth-particles-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasFinePointer = window.matchMedia('(pointer: fine)').matches;

  var DIGITS = '0123456789'.split('');
  var NODE_COUNT = 100;
  var BEAM_COUNT = 26;
  var LINK_DIST = 130;
  var MOUSE_DIST = 170;
  var FONT = '11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

  var width = 0, height = 0;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var nodes = [];
  var beams = [];
  var mouse = { x: -9999, y: -9999, active: false };
  var accentHex = '#B4B8FF';

  function randomDigit() {
    return DIGITS[Math.floor(Math.random() * DIGITS.length)];
  }

  function refreshAccentColor() {
    var v = getComputedStyle(document.documentElement).getPropertyValue('--purple-text').trim();
    if (v) accentHex = v;
  }

  /** Converte a cor de --purple-text (hex, ou rgb/rgba já pronto) pra rgba() com a opacidade pedida. */
  function rgba(alpha) {
    var c = accentHex;
    var hexMatch = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hexMatch) {
      var hex = hexMatch[1];
      if (hex.length === 3) hex = hex.split('').map(function (ch) { return ch + ch; }).join('');
      var r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
      return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    }
    var rgbMatch = c.match(/^rgba?\(([^)]+)\)$/i);
    if (rgbMatch) {
      var parts = rgbMatch[1].split(',').map(function (p) { return p.trim(); });
      return 'rgba(' + parts[0] + ',' + parts[1] + ',' + parts[2] + ',' + alpha + ')';
    }
    return c;
  }

  function resize() {
    var rect = canvas.parentElement.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function initParticles() {
    nodes = Array.from({ length: NODE_COUNT }).map(function () {
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        vy: Math.random() * 0.45 + 0.18,
        char: randomDigit(),
      };
    });
    beams = Array.from({ length: BEAM_COUNT }).map(function () {
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        length: Math.random() * 70 + 40,
        speed: Math.random() * 2.6 + 1.4,
        opacity: Math.random() * 0.5 + 0.35,
      };
    });
  }

  function drawFrame(animate) {
    ctx.clearRect(0, 0, width, height);

    beams.forEach(function (b) {
      if (animate) {
        b.y -= b.speed;
        if (b.y + b.length < 0) {
          b.y = height + 60;
          b.x = Math.random() * width;
        }
      }
      var g = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.length);
      g.addColorStop(0, rgba(b.opacity));
      g.addColorStop(1, rgba(0));
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x, b.y + b.length);
      ctx.stroke();
    });

    ctx.lineWidth = 0.6;
    for (var i = 0; i < nodes.length; i++) {
      for (var j = i + 1; j < nodes.length; j++) {
        var dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
        var d = Math.hypot(dx, dy);
        if (d < LINK_DIST) {
          ctx.strokeStyle = rgba(0.16 * (1 - d / LINK_DIST));
          ctx.beginPath();
          ctx.moveTo(nodes[i].x, nodes[i].y);
          ctx.lineTo(nodes[j].x, nodes[j].y);
          ctx.stroke();
        }
      }
    }

    ctx.font = FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    nodes.forEach(function (n) {
      if (animate) {
        n.y += n.vy;
        if (n.y > height + 10) {
          n.y = -10;
          n.x = Math.random() * width;
          n.char = randomDigit();
        }
      }

      var near = false;
      if (mouse.active) {
        var dist = Math.hypot(mouse.x - n.x, mouse.y - n.y);
        near = dist < MOUSE_DIST;
        if (near) {
          ctx.strokeStyle = rgba(0.45 * (1 - dist / MOUSE_DIST));
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(n.x, n.y);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.stroke();
        }
      }

      if (animate && (near || Math.random() > 0.985)) n.char = randomDigit();

      ctx.fillStyle = near ? rgba(0.9) : rgba(0.38);
      ctx.fillText(n.char, n.x, n.y);
    });
  }

  var rafId = null;
  function loop() {
    drawFrame(true);
    rafId = requestAnimationFrame(loop);
  }

  function start() {
    refreshAccentColor();
    resize();
    initParticles();
    drawFrame(false);
    if (reducedMotion) return;
    if (!rafId) rafId = requestAnimationFrame(loop);
  }

  window.addEventListener('resize', function () {
    resize();
    initParticles();
    if (reducedMotion) drawFrame(false);
  }, { passive: true });

  if (!reducedMotion && hasFinePointer) {
    window.addEventListener('mousemove', function (e) {
      var rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      mouse.active = true;
    }, { passive: true });
    window.addEventListener('mouseleave', function () {
      mouse.active = false;
    });
  }

  start();
})();
