import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { state, kf } from '../scene/state.js';

const HERO_UI = ['[data-intro="eyebrow"]', '[data-intro="lead"]', '[data-intro="cta"]', '[data-intro="cue"]', '.nav', '.hud'];
const TITLE = '[data-intro="title"]';

function endIntro() {
  document.body.classList.remove('is-intro');
  gsap.set('.letterbox, .intro-captions, .skip', { autoAlpha: 0 });
}

/** Static end state: reduced motion, no WebGL, or a failed boot. */
export function skipIntro() {
  Object.assign(state, kf('hero'), { stars: 1, orbitsDraw: 1, sats: 1 });
  gsap.set([...HERO_UI, TITLE], { autoAlpha: 1 });
  endIntro();
  return Promise.resolve();
}

/**
 * Opening "orbital cinema": black → stars bloom outward → camera dollies in from deep space
 * while the sun sweeps from behind the planet → orbits draw on → title types in → letterbox opens.
 *
 * Setup (initial hidden states, title split) runs before the loader fades so nothing flashes;
 * `play()` starts the film and resolves when it ends.
 */
export function prepareIntro() {
  const title = document.querySelector(TITLE);
  const split = SplitText.create(title, { type: 'lines,words', mask: 'lines', linesClass: 'ln', wordsClass: 'w' });
  const [cap1, cap2] = document.querySelectorAll('.intro-caption');

  gsap.set(HERO_UI, { autoAlpha: 0 });
  gsap.set(split.words, { yPercent: 115 });
  gsap.set(title, { autoAlpha: 1 });

  return {
    play() {
      // Read keyframes at play time so the current orientation is used.
      const hero = kf('hero');
      return new Promise((resolve) => {
        const tl = gsap.timeline({
          defaults: { ease: 'power2.inOut' },
          onComplete() {
            split.revert();
            endIntro();
            resolve();
          },
        });

        // Captions in the dark.
        tl.fromTo(cap1, { autoAlpha: 0, letterSpacing: '0.4em' }, { autoAlpha: 1, letterSpacing: '0.14em', duration: 1.4, ease: 'power3.out' }, 0.3)
          .to(cap1, { autoAlpha: 0, duration: 0.7 }, 1.9)
          .fromTo(cap2, { autoAlpha: 0, y: 14, filter: 'blur(10px)' }, { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: 1.2, ease: 'power3.out' }, 2.4)
          .to(cap2, { autoAlpha: 0, y: -10, filter: 'blur(8px)', duration: 0.9 }, 4.0);

        // Scene.
        tl.to(state, { stars: 1, duration: 3.4, ease: 'power1.out' }, 0.2)
          .to(state, { camDist: hero.camDist, duration: 6.0, ease: 'power3.inOut' }, 0.6)
          .to(state, { camTheta: hero.camTheta, camPhi: hero.camPhi, duration: 6.4 }, 0.4)
          .to(state, { sunAngle: hero.sunAngle, duration: 5.2, ease: 'power2.inOut' }, 1.4)
          .to(state, { earthX: hero.earthX, earthY: hero.earthY, duration: 2.8, ease: 'power3.inOut' }, 4.0)
          .to(state, { orbitsDraw: 1, duration: 3.0 }, 2.8)
          .to(state, { sats: 1, duration: 1.2 }, 5.0)
          .to(state, { drift: 1, duration: 3 }, 5.2);

        // Letterbox opens like the end of an opening title.
        tl.to('.lb--top', { yPercent: -100, duration: 1.6, ease: 'expo.inOut' }, 5.2)
          .to('.lb--bottom', { yPercent: 100, duration: 1.6, ease: 'expo.inOut' }, 5.2)
          .to('.skip', { autoAlpha: 0, duration: 0.4 }, 5.2);

        // Hero copy.
        tl.fromTo('[data-intro="eyebrow"]', { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 1, ease: 'power3.out' }, 5.4)
          .to(split.words, { yPercent: 0, duration: 1.4, ease: 'expo.out', stagger: 0.07 }, 5.6)
          .fromTo('[data-intro="lead"]', { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 1.2, ease: 'power3.out' }, 6.5)
          .fromTo('[data-intro="cta"]', { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 1.2, ease: 'power3.out' }, 6.75)
          .fromTo('.nav', { autoAlpha: 0, y: -16 }, { autoAlpha: 1, y: 0, duration: 1.2, ease: 'power3.out' }, 6.2)
          .to('.hud', { autoAlpha: 1, duration: 1.2 }, 6.9)
          .to('[data-intro="cue"]', { autoAlpha: 1, duration: 1 }, 7.2);

        document.getElementById('skip')?.addEventListener('click', () => tl.timeScale(6), { once: true });
      });
    },
  };
}
