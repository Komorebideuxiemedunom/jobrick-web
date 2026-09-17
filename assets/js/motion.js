/**
 * Animation du site : formes geometriques flottantes en fond + reveal au
 * scroll. Technique : GSAP + ScrollTrigger (CDN), chargee avant ce fichier.
 * Respecte prefers-reduced-motion : tout est statique si active.
 */
(function () {
  "use strict";

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (typeof gsap === "undefined") return;
  if (window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);

  // ------------------------------------------------------------------
  // Formes flottantes : derive + rotation lente, en continu.
  // ------------------------------------------------------------------
  function initShapeField() {
    var shapes = document.querySelectorAll("[data-shape]");
    if (!shapes.length) return;

    if (reduced) return; // formes visibles mais figees

    shapes.forEach(function (shape, i) {
      var driftX = 14 + Math.random() * 18;
      var driftY = 10 + Math.random() * 16;
      var duration = 7 + Math.random() * 5;
      var rotate = (i % 2 === 0 ? 1 : -1) * (8 + Math.random() * 10);

      gsap.to(shape, {
        x: driftX,
        y: driftY,
        rotate: rotate,
        duration: duration,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
        delay: i * 0.4,
      });
    });
  }

  // ------------------------------------------------------------------
  // Reveal au scroll : [data-anim] passe de anim-hidden a visible.
  // ------------------------------------------------------------------
  function initScrollReveal() {
    var targets = document.querySelectorAll("[data-anim]");
    if (!targets.length) return;

    if (reduced || !window.ScrollTrigger) {
      targets.forEach(function (el) { el.classList.remove("anim-hidden"); });
      return;
    }

    targets.forEach(function (el, i) {
      gsap.fromTo(
        el,
        { opacity: 0, y: 26 },
        {
          opacity: 1,
          y: 0,
          duration: 0.7,
          ease: "power2.out",
          delay: (i % 6) * 0.08,
          scrollTrigger: {
            trigger: el,
            start: "top 88%",
            once: true,
          },
          onStart: function () { el.classList.remove("anim-hidden"); },
        }
      );
    });
  }

  function init() {
    initShapeField();
    initScrollReveal();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
