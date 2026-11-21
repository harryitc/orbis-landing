import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { state, kf } from '../scene/state.js';

const KEYS = ['camDist', 'camTheta', 'camPhi', 'earthX', 'earthY', 'sunAngle', 'orbitsOpacity', 'drift', 'focus', 'markers', 'links', 'atmo'];
const ease = gsap.parseEase('power1.inOut');

/**
 * Camera choreography. The scene target is a pure function of scroll position:
 * while section i scrolls into view (its top going from viewport bottom → top),
 * the target interpolates kf(i-1) → kf(i). Stage-side smoothing comes from
 * `follow()`, which eases `state` toward that target every frame.
 * One writer, no tween reverts — resize/rotation can never strand stale values.
 */
export function createSceneDriver() {
  const sections = gsap.utils.toArray('[data-scene]');
  let tops = [];
  let enabled = false;
  const target = {};

  const measure = () => {
    tops = sections.map((s) => s.getBoundingClientRect().top + window.scrollY);
  };

  const compute = () => {
    const y = window.scrollY;
    const vh = window.innerHeight;
    let from = sections[0].dataset.scene;
    let to = from;
    let p = 0;
    for (let i = 1; i < sections.length; i++) {
      const start = tops[i] - vh;
      if (y < start) break;
      from = sections[i - 1].dataset.scene;
      to = sections[i].dataset.scene;
      p = Math.min(1, (y - start) / vh);
    }
    const a = kf(from);
    const b = kf(to);
    const e = ease(p);
    for (const k of KEYS) target[k] = a[k] + (b[k] - a[k]) * e;
  };

  measure();
  compute();
  ScrollTrigger.addEventListener('refresh', () => {
    measure();
    compute();
  });
  window.addEventListener('scroll', compute, { passive: true });

  return {
    /** Hand control from the intro timeline to scroll. */
    enable() {
      measure();
      compute();
      enabled = true;
    },
    /** Called every frame; frame-rate independent exponential smoothing. */
    follow(dt) {
      if (!enabled) return;
      const k = 1 - Math.exp(-dt * 3.2);
      for (const key of KEYS) state[key] += (target[key] - state[key]) * k;
    },
  };
}

export function initBiomeScroll({ reduce }) {
  const cards = gsap.utils.toArray('.biome-card');
  const items = gsap.utils.toArray('.biomes__index li');
  let active = -1;
  const show = (idx) => {
    if (idx === active) return;
    const dir = idx > active ? 1 : -1;
    cards.forEach((c, k) => {
      c.classList.toggle('is-active', k === idx);
      c.setAttribute('aria-current', k === idx ? 'true' : 'false');
    });
    items.forEach((li, k) => li.classList.toggle('is-active', k === idx));
    const prevCard = cards[active];
    const next = cards[idx];
    active = idx;
    if (reduce) {
      cards.forEach((c, k) => gsap.set(c, { opacity: k === idx ? 1 : 0, y: 0 }));
      return;
    }
    if (prevCard) gsap.to(prevCard, { opacity: 0, y: -24 * dir, duration: 0.5, ease: 'power2.in', overwrite: true });
    gsap.fromTo(next, { opacity: 0, y: 32 * dir }, { opacity: 1, y: 0, duration: 0.9, delay: 0.15, ease: 'expo.out', overwrite: true });
    gsap.fromTo(next.children, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.8, delay: 0.2, stagger: 0.06, ease: 'power3.out', overwrite: true });
  };
  show(0);

  // `biome` has exactly one writer: this scrubbed timeline.
  const tl = gsap.timeline({
    scrollTrigger: { trigger: '.biomes', start: 'top top', end: 'bottom bottom', scrub: reduce ? true : 1 },
    onUpdate: () => show(Math.round(state.biome)),
  });
  tl.to({}, { duration: 0.5 });
  for (let i = 1; i < cards.length; i++) {
    tl.to(state, { biome: i, duration: 1, ease: 'power2.inOut' }).to({}, { duration: 0.6 });
  }
  gsap.to('.biomes__progress span', {
    scaleY: 1,
    ease: 'none',
    scrollTrigger: { trigger: '.biomes', start: 'top top', end: 'bottom bottom', scrub: true },
  });

  if (!reduce) {
    gsap.to('.hero__inner, .scroll-cue', {
      y: -90,
      opacity: 0,
      ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom 35%', scrub: true },
    });
  }
}
