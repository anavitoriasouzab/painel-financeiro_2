/**
 * auth-orbs.js
 * -----------------------------------------------------------------------
 * Interação do mouse com o fundo animado da tela de login (login.html):
 * - a partícula marcada como ".is-leader" persegue o cursor pela tela
 *   (com atraso suave, não gruda instantâneo).
 * - as demais se afastam do cursor quando ele chega perto (espalham) e
 *   voltam sozinhas pro lugar quando ele se afasta.
 * A deriva ambiente de cada partícula (@keyframes em css/auth.css) roda
 * por conta própria em cada .auth-orb — este script só escreve o
 * deslocamento de interação no .auth-orb-wrap por fora, então as duas
 * animações nunca competem pela mesma propriedade no mesmo elemento.
 * Não mexe em login/cadastro — isso é só decoração.
 */
(function () {
  var container = document.querySelector('.auth-orbs');
  if (!container) return;

  // Sem "reduzir movimento", e só em dispositivos com mouse de verdade
  // (touch não dispara mousemove mesmo, mas evita registrar os listeners à toa).
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!window.matchMedia('(pointer: fine)').matches) return;

  var wraps = Array.prototype.slice.call(container.querySelectorAll('.auth-orb-wrap'));
  if (!wraps.length) return;

  var REPEL_RADIUS = 280;    // px — só partículas a menos que isso do cursor reagem
  var REPEL_STRENGTH = 82;   // px — deslocamento máximo bem colado no cursor
  var REPEL_EASE = 0.12;
  var LEADER_EASE = 0.08;    // menor = a líder "atrasa" mais atrás do cursor

  var mouse = { x: 0, y: 0, active: false };

  var particles = wraps.map(function (wrap) {
    var rect = wrap.getBoundingClientRect();
    return {
      wrap: wrap,
      isLeader: wrap.classList.contains('is-leader'),
      restX: rect.left + rect.width / 2,
      restY: rect.top + rect.height / 2,
      curX: 0,
      curY: 0,
    };
  });

  function refreshRestPositions() {
    particles.forEach(function (p) {
      var prevTransform = p.wrap.style.transform;
      p.wrap.style.transform = 'none';
      var rect = p.wrap.getBoundingClientRect();
      p.wrap.style.transform = prevTransform;
      p.restX = rect.left + rect.width / 2;
      p.restY = rect.top + rect.height / 2;
    });
  }
  window.addEventListener('resize', refreshRestPositions, { passive: true });

  var rafId = null;
  function ensureLoop() {
    if (!rafId) rafId = requestAnimationFrame(tick);
  }

  window.addEventListener('mousemove', function (e) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.active = true;
    ensureLoop();
  }, { passive: true });

  window.addEventListener('mouseleave', function () {
    mouse.active = false;
    ensureLoop();
  });

  function tick() {
    var maxDelta = 0;

    particles.forEach(function (p) {
      var targetX = 0;
      var targetY = 0;

      if (p.isLeader) {
        if (mouse.active) {
          targetX = mouse.x - p.restX;
          targetY = mouse.y - p.restY;
        }
        p.curX += (targetX - p.curX) * LEADER_EASE;
        p.curY += (targetY - p.curY) * LEADER_EASE;
      } else {
        if (mouse.active) {
          var dx = p.restX - mouse.x;
          var dy = p.restY - mouse.y;
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < REPEL_RADIUS && dist > 0.001) {
            var pushFactor = (1 - dist / REPEL_RADIUS) * (REPEL_STRENGTH / dist);
            targetX = dx * pushFactor;
            targetY = dy * pushFactor;
          }
        }
        p.curX += (targetX - p.curX) * REPEL_EASE;
        p.curY += (targetY - p.curY) * REPEL_EASE;
      }

      p.wrap.style.transform = 'translate(' + p.curX.toFixed(1) + 'px, ' + p.curY.toFixed(1) + 'px)';
      maxDelta = Math.max(maxDelta, Math.abs(targetX - p.curX), Math.abs(targetY - p.curY));
    });

    rafId = maxDelta > 0.05 ? requestAnimationFrame(tick) : null;
  }
})();
