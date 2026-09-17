/**
 * Animation du site : scroll fluide (Lenis), formes en parallax, reveal au
 * scroll. Portage du `motion.js` de la v1, en module ES et non plus en IIFE
 * sur un CDN.
 *
 * `prefers-reduced-motion` coupe tout : les formes restent visibles mais
 * figees, et le contenu s'affiche immediatement.
 */
import { gsap } from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import Lenis from "lenis"

let demarre = false

export const initMotion = (): (() => void) => {
  // Les routes du dashboard se remontent au fil de la navigation : on ne
  // veut qu'un seul jeu de ScrollTriggers et une seule boucle Lenis.
  if (demarre) return () => {}
  demarre = true

  const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  gsap.registerPlugin(ScrollTrigger)

  const cibles = document.querySelectorAll<HTMLElement>("[data-anim]")

  if (reduit) {
    cibles.forEach((el) => el.classList.remove("anim-hidden"))
    return () => {
      demarre = false
    }
  }

  const lenis = new Lenis({
    duration: 1.05,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  })
  lenis.on("scroll", ScrollTrigger.update)
  const ticker = (time: number) => lenis.raf(time * 1000)
  gsap.ticker.add(ticker)
  gsap.ticker.lagSmoothing(0)

  const ctx = gsap.context(() => {
    // Formes : derive continue (x + rotation) et parallax au scroll (y).
    document.querySelectorAll<HTMLElement>("[data-shape]").forEach((shape, i) => {
      gsap.to(shape, {
        x: 12 + Math.random() * 16,
        rotate: (i % 2 === 0 ? 1 : -1) * (7 + Math.random() * 9),
        duration: 7 + Math.random() * 5,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
        delay: i * 0.4,
      })
      const depth = Number(shape.dataset.depth ?? "0.2")
      gsap.to(shape, {
        y: (i % 2 === 0 ? -1 : 1) * 420 * depth,
        ease: "none",
        scrollTrigger: {
          trigger: document.body,
          start: "top top",
          end: "bottom bottom",
          scrub: 0.6,
        },
      })
    })

    document.querySelectorAll<HTMLElement>("[data-blob]").forEach((blob) => {
      const depth = Number(blob.dataset.depth ?? "0.15")
      gsap.to(blob, {
        y: 380 * depth,
        ease: "none",
        scrollTrigger: {
          trigger: document.body,
          start: "top top",
          end: "bottom bottom",
          scrub: 0.6,
        },
      })
    })

    cibles.forEach((el, i) => {
      gsap.fromTo(
        el,
        { opacity: 0, y: 26 },
        {
          opacity: 1,
          y: 0,
          duration: 0.7,
          ease: "power2.out",
          delay: (i % 6) * 0.08,
          scrollTrigger: { trigger: el, start: "top 88%", once: true },
          onStart: () => el.classList.remove("anim-hidden"),
        },
      )
    })

    // Reveal mot-a-mot, comme un curseur de lecture qui suit le scroll.
    document
      .querySelectorAll<HTMLElement>("[data-reveal-text]")
      .forEach((el) => {
        const mots = (el.textContent ?? "").trim().split(/\s+/)
        el.innerHTML = mots
          .map((m) => `<span class="reveal-word">${m}</span>`)
          .join(" ")
        gsap.to(el.querySelectorAll(".reveal-word"), {
          opacity: 1,
          stagger: 0.045,
          ease: "none",
          scrollTrigger: {
            trigger: el,
            start: "top 75%",
            end: "bottom 45%",
            scrub: 0.4,
          },
        })
      })
  })

  return () => {
    ctx.revert()
    gsap.ticker.remove(ticker)
    lenis.destroy()
    demarre = false
  }
}
