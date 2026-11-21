import * as THREE from 'three';
import { Earth } from './Earth.js';
import { Starfield } from './Starfield.js';
import { Orbits } from './Orbits.js';
import { BiomeMarkers, Network } from './Network.js';
import { state, BIOMES, latLonToVec3 } from './state.js';

const D2R = Math.PI / 180;
const TAU = Math.PI * 2;
const wrap = (a) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;

export class Stage {
  constructor(canvas, { onProgress } = {}) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor('#0b0a09', 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.05, 1200);

    const manager = new THREE.LoadingManager();
    manager.onProgress = (_url, loaded, total) => onProgress?.(loaded / total);

    this.earth = new Earth(this.renderer, manager);
    this.scene.add(this.earth.group);

    this.markers = new BiomeMarkers();
    this.network = new Network();
    this.earth.spinner.add(this.markers.group, this.network.group);

    this.orbits = new Orbits();
    this.scene.add(this.orbits.group);

    // Opening shot looks from (theta, phi) toward the origin; stars bloom from behind the planet.
    const open = new THREE.Vector3(Math.sin(state.camTheta), Math.sin(state.camPhi), Math.cos(state.camTheta)).negate();
    this.stars = new Starfield(matchMedia('(pointer: coarse)').matches ? 2600 : 5200, open);
    this.scene.add(this.stars.points);

    this.ready = this.earth.ready;
    this.pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    this.subPoint = { lat: 0, lon: 0 };
    this.time = 0;
    this.visible = true;

    this._sun = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._p = { x: 0, y: 0, z: 0 };

    this.resize = this.resize.bind(this);
    new ResizeObserver(this.resize).observe(canvas);
    this.resize();

    window.addEventListener('pointermove', (e) => {
      this.pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
      this.pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
    });
    document.addEventListener('visibilitychange', () => (this.visible = !document.hidden));
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    if (w === this._w && h === this._h) return;
    this._w = w;
    this._h = h;
    const pr = Math.min(window.devicePixelRatio, w < 768 ? 1.5 : 1.75);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.stars?.setPixelRatio(pr);
    this.orbits?.setPixelRatio(pr);
  }

  /** Earth yaw that puts (lat, lon) under a camera at azimuth theta. */
  #focusYaw(theta, lat, lon) {
    const p = latLonToVec3(lat, lon, 1, this._p);
    return theta - Math.atan2(p.x, p.z);
  }

  tick(dt) {
    if (!this.visible) return;
    const s = state;
    this.time += dt;
    const t = this.time;
    const P = this.pointer;
    P.x += (P.tx - P.x) * 0.04;
    P.y += (P.ty - P.y) * 0.04;

    // --- Biome focus target (interpolated between consecutive biomes) ---
    const bi = THREE.MathUtils.clamp(s.biome, 0, BIOMES.length - 1);
    const i0 = Math.floor(bi);
    const i1 = Math.min(i0 + 1, BIOMES.length - 1);
    const f = THREE.MathUtils.smootherstep(bi - i0, 0, 1);
    const A = BIOMES[i0];
    const B = BIOMES[i1];
    const fLat = THREE.MathUtils.lerp(A.lat, B.lat, f);
    const fLon = A.lon + wrap((B.lon - A.lon) * D2R) / D2R * f;

    // --- Camera on a sphere around the origin ---
    const theta = s.camTheta + Math.sin(t * 0.045) * 0.35 * s.drift + P.x * 0.06;
    let phi = s.camPhi + Math.sin(t * 0.07) * 0.05 * s.drift - P.y * 0.04;
    phi = THREE.MathUtils.lerp(phi, THREE.MathUtils.clamp(fLat * D2R, -1.25, 1.25), s.focus);
    const dist = s.camDist;
    this.camera.position.set(
      Math.sin(theta) * Math.cos(phi) * dist,
      Math.sin(phi) * dist,
      Math.cos(theta) * Math.cos(phi) * dist,
    );
    this.camera.lookAt(0, 0, 0);

    // Lens shift: move the planet on screen without changing perspective.
    this.camera.updateProjectionMatrix();
    const e = this.camera.projectionMatrix.elements;
    e[8] = -s.earthX;
    e[9] = -s.earthY;
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();

    // --- Earth spin, blended toward the focused biome ---
    const spin = t * 0.025;
    const target = this.#focusYaw(theta, fLat, fLon);
    this.earth.spinner.rotation.y = spin + wrap(target - spin) * s.focus;

    // --- Sun follows camera azimuth offset so lighting reads consistently ---
    const sa = s.sunAngle + (theta - s.camTheta) * 0.6;
    const se = s.sunElev + phi * 0.6;
    this._sun.set(Math.sin(sa) * Math.cos(se), Math.sin(se), Math.cos(sa) * Math.cos(se)).normalize();
    const u = this.earth.uniforms;
    u.uSun.value.copy(this._sun);
    u.uCloudShift.value = t * 0.0016;
    u.uIntensity.value = s.atmo;

    // --- Children ---
    this.stars.points.position.copy(this.camera.position);
    this.stars.uniforms.uReveal.value = s.stars * 1.05;
    this.stars.uniforms.uTime.value = t;
    this.orbits.update(t, s);
    this.markers.update(t, s);
    this.network.update(t, s);

    this.renderer.render(this.scene, this.camera);

    // Sub-camera point in Earth coordinates (for the HUD read-out).
    this._tmp.copy(this.camera.position).normalize();
    this._q.copy(this.earth.spinner.quaternion).invert();
    this._tmp.applyQuaternion(this._q);
    this.subPoint.lat = Math.asin(this._tmp.y) / D2R;
    const lonPhi = Math.atan2(this._tmp.z, -this._tmp.x) / D2R - 180;
    this.subPoint.lon = ((((lonPhi + 180) % 360) + 360) % 360) - 180;
  }

  upgradeTextures() {
    return this.earth.upgrade();
  }
}
