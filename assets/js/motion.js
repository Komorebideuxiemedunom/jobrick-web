/**
 * Animation du site : smooth scroll (Lenis), formes/blobs en parallax,
 * reveal au scroll (formes + texte mot-par-mot). CDN : gsap, ScrollTrigger,
 * lenis, tous charges avant ce fichier. Respecte prefers-reduced-motion :
 * tout est statique si active.
 */
(function () {
  "use strict";

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (typeof gsap === "undefined") return;
  if (window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);

  // ------------------------------------------------------------------
  // Lenis : scroll fluide, synchronise avec ScrollTrigger pour que les
  // positions de declenchement restent justes pendant le lissage.
  // ------------------------------------------------------------------
  function initLenis() {
    if (reduced || typeof Lenis === "undefined" || !window.ScrollTrigger) return;
    var lenis = new Lenis({ duration: 1.05, easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); } });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
    gsap.ticker.lagSmoothing(0);
  }

  // ------------------------------------------------------------------
  // Formes/blobs : derive continue (x, rotation) + parallax au scroll
  // (y, via ScrollTrigger scrub) sur un canal de transform separe.
  // ------------------------------------------------------------------
  function initShapeField() {
    var shapes = document.querySelectorAll("[data-shape]");
    var blobs = document.querySelectorAll("[data-blob]");
    if (!shapes.length && !blobs.length) return;
    if (reduced) return; // formes visibles mais figees

    shapes.forEach(function (shape, i) {
      var driftX = 12 + Math.random() * 16;
      var duration = 7 + Math.random() * 5;
      var rotate = (i % 2 === 0 ? 1 : -1) * (7 + Math.random() * 9);

      gsap.to(shape, {
        x: driftX,
        rotate: rotate,
        duration: duration,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
        delay: i * 0.4,
      });

      if (window.ScrollTrigger) {
        var depth = parseFloat(shape.dataset.depth || "0.2");
        gsap.to(shape, {
          y: (i % 2 === 0 ? -1 : 1) * 420 * depth,
          ease: "none",
          scrollTrigger: { trigger: document.body, start: "top top", end: "bottom bottom", scrub: 0.6 },
        });
      }
    });

    blobs.forEach(function (blob) {
      if (!window.ScrollTrigger) return;
      var depth = parseFloat(blob.dataset.depth || "0.15");
      gsap.to(blob, {
        y: 380 * depth,
        ease: "none",
        scrollTrigger: { trigger: document.body, start: "top top", end: "bottom bottom", scrub: 0.6 },
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

  // ------------------------------------------------------------------
  // Reveal mot-a-mot : [data-reveal-text] s'eclaircit mot par mot au fil
  // du scroll de la section (scrub, comme un curseur de lecture).
  // ------------------------------------------------------------------
  function initWordReveal() {
    var blocks = document.querySelectorAll("[data-reveal-text]");
    if (!blocks.length || reduced || !window.ScrollTrigger) return;

    blocks.forEach(function (el) {
      var words = el.textContent.trim().split(/\s+/);
      el.innerHTML = words
        .map(function (w) { return '<span class="reveal-word">' + w + "</span>"; })
        .join(" ");
      var spans = el.querySelectorAll(".reveal-word");

      gsap.to(spans, {
        opacity: 1,
        stagger: 0.045,
        ease: "none",
        scrollTrigger: {
          trigger: el,
          start: "top 75%",
          end: "bottom 45%",
          scrub: 0.4,
        },
      });
    });
  }

  function init() {
    initLenis();
    initShapeField();
    initScrollReveal();
    initWordReveal();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
