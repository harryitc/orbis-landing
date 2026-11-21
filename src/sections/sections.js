import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

const fmt = (v, d) => v.toLocaleString('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d });

export function initSections({ reduce }) {
  // Section titles: masked line reveal.
  gsap.utils.toArray('.section-title, .finale__title').forEach((el) => {
    if (reduce) return;
    SplitText.create(el, {
      type: 'lines',
      mask: 'lines',
      linesClass: 'ln',
      autoSplit: true,
      onSplit: (self) =>
        gsap.from(self.lines, {
          yPercent: 110,
          duration: 1.3,
          ease: 'expo.out',
          stagger: 0.1,
          scrollTrigger: { trigger: el, start: 'top 82%', once: true },
        }),
    });
  });

  // Other reveals: fade-up.
  gsap.utils.toArray('.reveal:not(.section-title):not(.finale__title)').forEach((el) => {
    if (reduce) return;
    gsap.from(el, {
      autoAlpha: 0,
      y: 40,
      duration: 1.2,
      ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
    });
  });

  // Manifesto: words light up as you read.
  const words = document.querySelector('[data-words]');
  if (words && !reduce) {
    const split = SplitText.create(words, { type: 'words', wordsClass: 'w', aria: 'none' });
    gsap.to(split.words, {
      opacity: 1,
      stagger: 0.1,
      ease: 'none',
      scrollTrigger: { trigger: '.manifesto', start: 'top 60%', end: 'bottom 75%', scrub: true },
    });
  }

  // Stats: counters + sparkline draw.
  gsap.utils.toArray('.stat').forEach((stat, i) => {
    const num = stat.querySelector('[data-count]');
    const path = stat.querySelector('.spark path');
    const target = parseFloat(num.dataset.count);
    const dec = parseInt(num.dataset.decimals || '0', 10);
    if (reduce) {
      num.textContent = fmt(target, dec);
      return;
    }
    const len = path.getTotalLength();
    gsap.set(path, { strokeDasharray: len, strokeDashoffset: len });
    const o = { v: 0 };
    gsap.set(stat, { autoAlpha: 0, y: 40 });
    ScrollTrigger.create({
      trigger: stat,
      start: 'top 85%',
      once: true,
      onEnter: () => {
        gsap.to(stat, { autoAlpha: 1, y: 0, duration: 1, delay: i * 0.08, ease: 'power3.out' });
        gsap.to(o, { v: target, duration: 2.4, delay: i * 0.08, ease: 'power3.out', onUpdate: () => (num.textContent = fmt(o.v, dec)) });
        gsap.to(path, { strokeDashoffset: 0, duration: 2.2, delay: 0.2 + i * 0.08, ease: 'power2.inOut' });
      },
    });
  });

  // Chrono: horizontal track pinned via CSS sticky, scrubbed by scroll.
  const track = document.querySelector('.chrono__track');
  if (track) {
    const travel = () => Math.min(0, -(track.scrollWidth - document.documentElement.clientWidth));
    const st = { trigger: '.chrono', start: 'top top', end: 'bottom bottom', scrub: 1, invalidateOnRefresh: true };
    const move = gsap.to(track, { x: travel, ease: 'none', scrollTrigger: st });
    gsap.to('.chrono__progress span', { scaleX: 1, ease: 'none', scrollTrigger: { ...st, scrub: true } });
    if (!reduce) {
      gsap.utils.toArray('.era').forEach((era) => {
        gsap.from(era.children, {
          autoAlpha: 0.15,
          y: 40,
          stagger: 0.08,
          ease: 'power2.out',
          scrollTrigger: { containerAnimation: move, trigger: era, start: 'left 92%', end: 'left 55%', scrub: true },
        });
      });
    }
  }

  // Signup (no backend: client-side acknowledgement only).
  const form = document.getElementById('signup');
  const msg = document.getElementById('signup-msg');
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = form.querySelector('input');
    if (!input.checkValidity() || !input.value) {
      msg.textContent = 'Vui lòng nhập email hợp lệ.';
      input.focus();
      return;
    }
    msg.textContent = 'Đã ghi nhận — hẹn gặp bạn ở quỹ đạo tiếp theo.';
    form.reset();
  });
}

/** HUD: active section name, sub-satellite point, mission clock. */
export function initHud(stage) {
  const idx = document.getElementById('hud-index');
  const name = document.getElementById('hud-name');
  const lat = document.getElementById('hud-lat');
  const lon = document.getElementById('hud-lon');
  const clock = document.getElementById('hud-clock');

  gsap.utils.toArray('[data-scene]').forEach((sec, i) => {
    ScrollTrigger.create({
      trigger: sec,
      start: 'top 50%',
      end: 'bottom 50%',
      onToggle: (self) => {
        if (!self.isActive) return;
        idx.textContent = String(i + 1).padStart(2, '0');
        name.textContent = sec.dataset.name;
      },
    });
  });

  const t0 = performance.now();
  const pad = (n) => String(Math.floor(n)).padStart(2, '0');
  let acc = 0;
  gsap.ticker.add((_t, dt) => {
    acc += dt;
    if (acc < 100) return;
    acc = 0;
    const s = (performance.now() - t0) / 1000;
    clock.textContent = `${pad(s / 3600)}:${pad((s / 60) % 60)}:${pad(s % 60)}`;
    if (stage) {
      const { lat: la, lon: lo } = stage.subPoint;
      lat.textContent = `${Math.abs(la).toFixed(2).padStart(5, '0')}°${la >= 0 ? 'N' : 'S'}`;
      lon.textContent = `${Math.abs(lo).toFixed(2).padStart(6, '0')}°${lo >= 0 ? 'E' : 'W'}`;
    }
  });
}
