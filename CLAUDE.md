# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

ORBIS: a single-page Vietnamese landing page about global ecosystems seen from orbit. It uses Vite, vanilla JS (ES modules), three.js, GSAP (ScrollTrigger + SplitText) and Lenis. The visual theme is warm-dark neutral. All user-facing copy is Vietnamese.

## Commands

- `npm run dev`: Vite dev server.
- `npm run build`: production build to `dist/`. `base: './'`, so the build can be served from any subpath.
- `npm run preview`: serve the build.

There are no tests or linter. Check changes visually in a real browser.

On this machine, headless Chrome via `agent-browser` needs these launch args:

```
AGENT_BROWSER_ARGS="--no-sandbox,--use-angle=swiftshader,--enable-unsafe-swiftshader,--ignore-gpu-blocklist"
```

Without them, WebGL does not render. To capture a section after the intro:

1. Click `#skip`.
2. Run `window.scrollTo(...)` inside that section.
3. Wait about 3 s so the camera smoothing settles.

## Architecture

### Shared scene state

`src/scene/state.js` exports one mutable `state` object: camera distance/azimuth/elevation, lens-shift `earthX/earthY`, sun angle, and visibility factors such as `orbitsDraw`, `focus`, `biome`, `links`. `Stage.tick()` reads it every frame. Nothing else in the scene holds its own animation state.

Each `<section data-scene="key">` in `index.html` has a keyframe `KF[key]` in `state.js`. `kf(key)` returns the portrait/mobile variant when the aspect ratio is under 0.9 (`MOBILE` table: centred planet, per-section `y`/`dist`). Always read keyframes through `kf()` at use time, never cache them, so rotation and resize work.

### Who writes `state`, in order

This order matters. Two writers on the same key has caused real bugs.

1. **Intro** (`src/timeline/intro.js`). `prepareIntro()` runs before the loader fades: it sets hidden states and splits the title. `play()` then runs a GSAP timeline that tweens `state` from the deep-space opening values (the defaults in `state.js`) to `kf('hero')`.
2. **Scroll driver** (`createSceneDriver()` in `src/timeline/scroll.js`). It is enabled only after the intro finishes. The target is a pure function of `scrollY`: while section *i*'s top travels from the viewport bottom to the top, it interpolates `kf(i-1) → kf(i)`. `follow(dt)` eases `state` toward that target each frame.
   - Do **not** reintroduce per-section `gsap.fromTo(state, …)` scroll tweens. On ScrollTrigger refresh they revert to stale values, which strands the camera on resize.
3. **`state.biome`** has exactly one writer: the scrubbed timeline in `initBiomeScroll()`. It runs over the tall `.biomes` section, which uses CSS `position: sticky`. There is no GSAP pin.

`src/main.js` wires boot in this order: wait for textures and fonts (10 s timeout), create the driver, register one `gsap.ticker` callback (`driver.follow` then `stage.tick`), init section animations, run the intro. A `finally` block always unlocks scroll and enables the driver. Lenis is driven by `gsap.ticker` and stopped during the intro.

### Rendering (`src/scene/`)

- **Lens shift.** The planet is moved on screen by patching `camera.projectionMatrix.elements[8]/[9]` after `updateProjectionMatrix()` every frame, not by moving it in world space. The camera always orbits and looks at the origin.
- **Biome focus.** `Stage` computes the Earth yaw that puts a lat/lon under the camera. It blends that yaw with the free spin by `state.focus`, and blends camera elevation toward the latitude.
- **lat/lon mapping.** `latLonToVec3()` matches `THREE.SphereGeometry` UVs with an equirectangular map (u=0 at lon −180). Use it for anything placed on the globe.
- **`earth.spinner`.** A group that rotates with the planet. Biome markers and network arcs/stations attach to it.
- **Shaders.**
  - All custom `ShaderMaterial` fragment shaders end with `#include <tonemapping_fragment>` and `#include <colorspace_fragment>`. Additive shaders write `vec4(col, 1.0)`, run the includes, then multiply `gl_FragColor.rgb` by their alpha factor. Follow this pattern or colours won't match the built-in materials.
  - Day and night maps use `SRGBColorSpace`. `earth_bump_roughness_clouds_*.jpg` is data (`NoColorSpace`): R = bump, G = roughness (ocean is low), B = clouds.
- **Sizing.** The renderer is sized from the canvas element (CSS `100lvh`) through a `ResizeObserver`. Point-size uniforms (`uPR`) are synced in `Stage.resize()`.

### Textures

`public/textures/`: 2K maps load first and gate the loader. 4K maps are swapped in after the intro on non-touch GPUs, uploaded one per frame. Source is three.js's planet textures (Solar System Scope, CC BY 4.0, based on NASA data). This is credited in the footer; keep the credit.

### DOM animation (`src/sections/sections.js`)

- **SplitText titles** use `mask: 'lines'` with `linesClass: 'ln'`. The `.ln-mask` CSS adds vertical padding so Vietnamese stacked diacritics aren't clipped; keep it.
- **Manifesto split** uses `aria: 'none'` so screen readers still read the paragraph.
- **Chrono strip** scrolls horizontally by scrubbing `x` inside a sticky container. Era reveals use `containerAnimation`.
- **Reduced motion** (`prefers-reduced-motion`) skips the intro (`skipIntro()`), Lenis and the decorative reveals.
- **No WebGL** adds `.no-webgl` to `<html>`; the code null-guards `stage`.
