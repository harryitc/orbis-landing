// Single mutable scene state. GSAP (intro + scroll) tweens these numbers;
// Stage reads them every frame. earthX / earthY are lens-shift offsets in NDC.

export const state = {
  camDist: 16,
  camTheta: -2.2,
  camPhi: 0.75,
  earthX: 0,
  earthY: 0,
  sunAngle: Math.PI + 0.35,
  sunElev: 0.22,
  stars: 0,
  orbitsDraw: 0,
  orbitsOpacity: 1,
  sats: 0,
  drift: 0,
  focus: 0,
  biome: 0,
  markers: 0,
  links: 0,
  atmo: 1,
};

// Keyframe per section. Desktop values; mobile adjustments in kf().
const KF = {
  hero:      { camDist: 4.7, camTheta: 0.0, camPhi: 0.22,  earthX: 0.48, earthY: -0.04, sunAngle: 0.95, orbitsOpacity: 1,    drift: 1,   focus: 0, markers: 0, links: 0,   atmo: 1 },
  manifesto: { camDist: 4.9, camTheta: 0.5, camPhi: -0.05, earthX: -0.6, earthY: 0,     sunAngle: 1.45, orbitsOpacity: 0.55, drift: 1,   focus: 0, markers: 0, links: 0,   atmo: 1 },
  biomes:    { camDist: 3.7, camTheta: 0.5, camPhi: 0,     earthX: 0.42, earthY: 0,     sunAngle: 1.05, orbitsOpacity: 0.12, drift: 0,   focus: 1, markers: 1, links: 0,   atmo: 1 },
  stats:     { camDist: 2.15, camTheta: 0.9, camPhi: 0.05, earthX: 0,    earthY: -1.3,  sunAngle: 1.95, orbitsOpacity: 0,    drift: 0.3, focus: 0, markers: 0, links: 0,   atmo: 1.25 },
  network:   { camDist: 5.2, camTheta: 1.6, camPhi: 0.35,  earthX: 0.3,   earthY: 0.02,  sunAngle: 2.2,  orbitsOpacity: 1,    drift: 1,   focus: 0, markers: 0, links: 1,   atmo: 1 },
  chrono:    { camDist: 7.4, camTheta: 2.4, camPhi: -0.15, earthX: 0.58, earthY: 0.5,   sunAngle: 2.9,  orbitsOpacity: 0.5,  drift: 1,   focus: 0, markers: 0, links: 0.4, atmo: 1 },
  finale:    { camDist: 60,  camTheta: 3.2, camPhi: 0.1,   earthX: 0,    earthY: 0.12,  sunAngle: 3.6,  orbitsOpacity: 0,    drift: 0.4, focus: 0, markers: 0, links: 0,   atmo: 1.4 },
};

// Portrait screens: centre the planet and push it vertically away from text.
const MOBILE = {
  hero:      { y: -0.8,  dist: 6.3 },
  manifesto: { y: 0.5,   dist: 6.6 },
  biomes:    { y: 0.22,  dist: 7.4 },
  stats:     { y: -1.25, dist: 2.9 },
  network:   { y: 0.1,   dist: 7.0 },
  chrono:    { y: 0.55,  dist: 8.5 },
  finale:    { y: 0.12,  dist: 60 },
};

export const SCENE_KEYS = Object.keys(KF);

export function isPortrait() {
  return window.innerWidth / window.innerHeight < 0.9;
}

export function kf(key) {
  const base = KF[key];
  if (!isPortrait()) return base;
  return {
    ...base,
    earthX: base.earthX * 0.1,
    earthY: MOBILE[key].y,
    camDist: MOBILE[key].dist,
  };
}

/** GSAP vars whose values are re-evaluated on ScrollTrigger refresh. */
export function kfVars(key) {
  const out = {};
  for (const p of Object.keys(KF[key])) out[p] = () => kf(key)[p];
  return out;
}

export const BIOMES = [
  { lat: -3.5, lon: -62 },  // Amazon
  { lat: 23, lon: 13 },     // Sahara
  { lat: 76, lon: -42 },    // Arctic / Greenland
  { lat: -18.3, lon: 147.7 }, // Great Barrier Reef
  { lat: 60, lon: 100 },    // Siberian taiga
];

const D2R = Math.PI / 180;

/** Matches THREE.SphereGeometry UV layout with an equirectangular map (u=0 at lon -180). */
export function latLonToVec3(lat, lon, r = 1, out = { x: 0, y: 0, z: 0 }) {
  const phi = (lon + 180) * D2R;
  const th = lat * D2R;
  out.x = -Math.cos(phi) * Math.cos(th) * r;
  out.y = Math.sin(th) * r;
  out.z = Math.sin(phi) * Math.cos(th) * r;
  return out;
}
