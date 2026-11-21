import 'lenis/dist/lenis.css';
import './styles/main.css';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';
import { Stage } from './scene/Stage.js';
import { prepareIntro, skipIntro } from './timeline/intro.js';
import { createSceneDriver, initBiomeScroll } from './timeline/scroll.js';
import { initSections, initHud } from './sections/sections.js';

gsap.registerPlugin(ScrollTrigger, SplitText);

// Always start the film from the top; a deep link is honoured after the intro.
const deepLink = location.hash && document.querySelector(location.hash);
if (location.hash) history.replaceState(null, '', location.pathname + location.search);
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const body = document.body;

// ---------- Smooth scroll, driven by the GSAP ticker ----------
let lenis = null;
if (!reduce) {
  lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  lenis.stop();
}

function goTo(target, href) {
  const focus = () => {
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  };
  if (href) history.replaceState(null, '', href);
  if (lenis) lenis.scrollTo(target, { duration: 2.2, onComplete: focus });
  else {
    target.scrollIntoView();
    focus();
  }
}

document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const href = a.getAttribute('href');
    const target = document.querySelector(href);
    if (!target) return;
    e.preventDefault();
    goTo(target, href);
  });
});

// ---------- WebGL stage ----------
const bar = document.getElementById('loader-bar');
const pct = document.getElementById('loader-pct');
const setProgress = (p) => {
  gsap.to(bar, { scaleX: p, duration: 0.4, ease: 'power2.out' });
  pct.textContent = `${String(Math.round(p * 100)).padStart(3, '0')}%`;
};

let stage = null;
try {
  stage = new Stage(document.getElementById('scene'), { onProgress: setProgress });
} catch (err) {
  console.warn('WebGL unavailable, falling back to static background.', err);
  document.documentElement.classList.add('no-webgl');
}

const timeout = (ms) => new Promise((r) => setTimeout(r, ms));

async function boot() {
  let driver = null;
  try {
    await Promise.race([
      Promise.all([
        (stage?.ready ?? Promise.resolve()).catch((e) => console.warn('Texture load failed', e)),
        document.fonts?.ready,
      ]),
      timeout(10000),
    ]);
    setProgress(1);

    driver = createSceneDriver();
    if (stage) gsap.ticker.add((_t, dtMs) => {
      const dt = Math.min(dtMs, 100) / 1000;
      driver.follow(dt);
      stage.tick(dt);
    });
    initSections({ reduce });
    initBiomeScroll({ reduce });
    initHud(stage);

    const intro = reduce || !stage ? null : prepareIntro();
    await gsap.to('#loader', { autoAlpha: 0, duration: 0.9, delay: 0.3, ease: 'power2.inOut' });
    body.classList.remove('is-loading');
    await (intro ? intro.play() : skipIntro());
  } catch (err) {
    console.error('Boot failed', err);
    skipIntro();
  } finally {
    gsap.set('#loader', { autoAlpha: 0 });
    body.classList.remove('is-loading', 'is-intro');
    driver?.enable();
    lenis?.start();
    ScrollTrigger.refresh();
    if (deepLink) goTo(deepLink, `#${deepLink.id}`);
  }
  stage?.upgradeTextures();
}

boot();
