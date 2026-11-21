import * as THREE from 'three';
import { BIOMES, latLonToVec3 } from './state.js';

const v = (lat, lon, r = 1) => {
  const p = latLonToVec3(lat, lon, r);
  return new THREE.Vector3(p.x, p.y, p.z);
};

/* ---------- Biome markers: pulsing rings on the surface ---------- */

export class BiomeMarkers {
  constructor() {
    this.group = new THREE.Group();
    this.items = BIOMES.map(({ lat, lon }) => {
      const holder = new THREE.Group();
      const n = v(lat, lon, 1.012);
      holder.position.copy(n);
      holder.lookAt(n.clone().multiplyScalar(2));

      const mat = () =>
        new THREE.MeshBasicMaterial({ color: '#eadfca', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.012, 24), mat());
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.034, 64), mat());
      const pulse = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.033, 64), mat());
      holder.add(dot, ring, pulse);
      this.group.add(holder);
      return { holder, dot, ring, pulse };
    });
  }

  update(t, s) {
    this.items.forEach((it, i) => {
      const w = Math.max(0, 1 - Math.abs(s.biome - i));
      const base = s.markers * (0.25 + 0.75 * w);
      it.dot.material.opacity = base;
      it.ring.material.opacity = base * 0.85;
      it.ring.scale.setScalar(0.7 + w * 0.6);
      const p = (t * 0.6 + i * 0.2) % 1;
      it.pulse.scale.setScalar(1 + p * 2.6);
      it.pulse.material.opacity = base * w * (1 - p) * 0.8;
    });
  }
}

/* ---------- Observation network: stations + great-circle data arcs ---------- */

const STATIONS = [
  [78.2, 15.4],   // Svalbard
  [64.1, -21.9],  // Reykjavík
  [61.2, -149.9], // Anchorage
  [5.2, -52.8],   // Kourou
  [-33.4, -70.6], // Santiago
  [-1.3, 36.8],   // Nairobi
  [-33.9, 18.4],  // Cape Town
  [21.0, 105.8],  // Hà Nội
  [-33.9, 151.2], // Sydney
  [35.7, 139.7],  // Tokyo
  [48.1, 11.6],   // München
  [19.4, -99.1],  // Mexico City
];
const LINKS = [
  [0, 1], [1, 10], [10, 5], [5, 6], [6, 4], [4, 3], [3, 11], [11, 2], [2, 9], [9, 7], [7, 8], [8, 5], [0, 9], [3, 10],
];

const arcVert = /* glsl */ `
  varying float vT;
  void main() {
    vT = uv.x;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const arcFrag = /* glsl */ `
  uniform float uDraw;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uSeed;
  uniform vec3 uColor;
  varying float vT;
  void main() {
    float drawn = smoothstep(vT, vT + 0.02, uDraw * 1.02);
    float head = fract(uTime * 0.22 + uSeed);
    float pulse = smoothstep(0.1, 0.0, abs(head - vT));
    float a = (0.35 + pulse * 1.4) * drawn * uOpacity;
    gl_FragColor = vec4(uColor, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    gl_FragColor.rgb *= a;
  }
`;

export class Network {
  constructor() {
    this.group = new THREE.Group();
    this.arcs = [];

    const stationPos = STATIONS.map(([la, lo]) => v(la, lo, 1.004));
    const dots = new THREE.BufferGeometry().setFromPoints(stationPos);
    this.dotMat = new THREE.PointsMaterial({
      color: '#efe6d4',
      size: 6,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.group.add(new THREE.Points(dots, this.dotMat));

    const seg = 96;
    LINKS.forEach(([a, b], i) => {
      const A = stationPos[a].clone().normalize();
      const B = stationPos[b].clone().normalize();
      const angle = A.angleTo(B);
      const pts = [];
      const p = new THREE.Vector3();
      const q = new THREE.Quaternion();
      const axis = new THREE.Vector3().crossVectors(A, B).normalize();
      for (let s = 0; s <= seg; s++) {
        const t = s / seg;
        q.setFromAxisAngle(axis, angle * t);
        p.copy(A).applyQuaternion(q);
        const h = 1.004 + Math.sin(Math.PI * t) * (0.04 + 0.16 * (angle / Math.PI));
        pts.push(p.clone().multiplyScalar(h));
      }
      const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, 0.0032, 5, false);
      const mat = new THREE.ShaderMaterial({
        vertexShader: arcVert,
        fragmentShader: arcFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uDraw: { value: 0 },
          uOpacity: { value: 0 },
          uTime: { value: 0 },
          uSeed: { value: Math.random() },
          uColor: { value: new THREE.Color(i % 3 ? '#d8cbb3' : '#a9bdb6') },
        },
      });
      this.group.add(new THREE.Mesh(geo, mat));
      this.arcs.push({ mat, offset: i / LINKS.length });
    });
  }

  update(t, s) {
    this.dotMat.opacity = Math.min(1, s.links * 1.4) * 0.9;
    for (const { mat, offset } of this.arcs) {
      mat.uniforms.uDraw.value = THREE.MathUtils.clamp(s.links * 1.8 - offset * 0.8, 0, 1);
      mat.uniforms.uOpacity.value = Math.min(1, s.links * 1.5);
      mat.uniforms.uTime.value = t;
    }
  }
}
