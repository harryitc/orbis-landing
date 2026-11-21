import * as THREE from 'three';

const lineVert = /* glsl */ `
  attribute float aT;
  varying float vT;
  void main() {
    vT = aT;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Ring draws itself from t=0 → uDraw; each satellite drags a comet tail along it.
const lineFrag = /* glsl */ `
  uniform float uDraw;
  uniform float uOpacity;
  uniform vec2 uHead;
  uniform vec3 uColor;
  varying float vT;
  void main() {
    float drawn = smoothstep(vT, vT + 0.004, uDraw * 1.004);
    float t1 = smoothstep(0.16, 0.0, fract(uHead.x - vT));
    float t2 = uHead.y >= 0.0 ? smoothstep(0.16, 0.0, fract(uHead.y - vT)) : 0.0;
    float a = (0.16 + (t1 + t2) * 0.85) * drawn * uOpacity;
    gl_FragColor = vec4(uColor, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const satVert = /* glsl */ `
  uniform float uPR;
  uniform float uSize;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPR * clamp(6.0 / -mv.z, 0.6, 2.2);
  }
`;
const satFrag = /* glsl */ `
  uniform float uOpacity;
  uniform vec3 uColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float core = smoothstep(0.12, 0.0, d);
    float halo = pow(smoothstep(0.5, 0.0, d), 3.0) * 0.6;
    gl_FragColor = vec4(uColor, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    gl_FragColor.rgb *= (core + halo) * uOpacity;
  }
`;

const RINGS = [
  { r: 1.42, rot: [0.35, 0.0, 0.15], speed: 0.07, sats: 2 },
  { r: 1.7, rot: [-0.55, 0.3, -0.2], speed: 0.05, sats: 1 },
  { r: 2.05, rot: [1.15, 0.1, 0.4], speed: 0.037, sats: 1 },
  { r: 2.5, rot: [0.12, 0.0, -0.32], speed: 0.024, sats: 2 },
];

export class Orbits {
  constructor() {
    this.group = new THREE.Group();
    this.rings = [];
    const pr = Math.min(window.devicePixelRatio, 1.75);
    const seg = 320;

    RINGS.forEach((cfg, i) => {
      const holder = new THREE.Group();
      holder.rotation.set(...cfg.rot);

      const pos = new Float32Array((seg + 1) * 3);
      const ts = new Float32Array(seg + 1);
      for (let s = 0; s <= seg; s++) {
        const t = s / seg;
        const a = t * Math.PI * 2;
        pos.set([Math.cos(a) * cfg.r, 0, Math.sin(a) * cfg.r], s * 3);
        ts[s] = t;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('aT', new THREE.BufferAttribute(ts, 1));
      const lineMat = new THREE.ShaderMaterial({
        vertexShader: lineVert,
        fragmentShader: lineFrag,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uDraw: { value: 0 },
          uOpacity: { value: 1 },
          uHead: { value: new THREE.Vector2(0, -1) },
          uColor: { value: new THREE.Color(i % 2 ? '#c8b79a' : '#d9d3c7') },
        },
      });
      holder.add(new THREE.Line(geo, lineMat));

      const satGeo = new THREE.BufferGeometry();
      satGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cfg.sats * 3), 3));
      const satMat = new THREE.ShaderMaterial({
        vertexShader: satVert,
        fragmentShader: satFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uPR: { value: pr },
          uSize: { value: 14 },
          uOpacity: { value: 0 },
          uColor: { value: new THREE.Color('#f4ecdc') },
        },
      });
      const sats = new THREE.Points(satGeo, satMat);
      sats.frustumCulled = false;
      holder.add(sats);

      this.group.add(holder);
      this.rings.push({ cfg, lineMat, satMat, satGeo, phase: Math.random() });
    });
  }

  setPixelRatio(pr) {
    for (const r of this.rings) r.satMat.uniforms.uPR.value = pr;
  }

  update(t, s) {
    const n = this.rings.length;
    this.rings.forEach((ring, i) => {
      const { cfg, lineMat, satMat, satGeo } = ring;
      // Stagger the draw-on per ring.
      const draw = THREE.MathUtils.clamp(s.orbitsDraw * 1.6 - (i / n) * 0.6, 0, 1);
      lineMat.uniforms.uDraw.value = draw;
      lineMat.uniforms.uOpacity.value = s.orbitsOpacity;

      const head = (ring.phase + t * cfg.speed) % 1;
      const head2 = cfg.sats > 1 ? (head + 0.5) % 1 : -1;
      lineMat.uniforms.uHead.value.set(head, head2);

      const arr = satGeo.attributes.position.array;
      for (let k = 0; k < cfg.sats; k++) {
        const a = (k === 0 ? head : head2) * Math.PI * 2;
        arr[k * 3] = Math.cos(a) * cfg.r;
        arr[k * 3 + 1] = 0;
        arr[k * 3 + 2] = Math.sin(a) * cfg.r;
      }
      satGeo.attributes.position.needsUpdate = true;
      satMat.uniforms.uOpacity.value = s.sats * s.orbitsOpacity * THREE.MathUtils.smoothstep(draw, 0.85, 1);
    });
  }
}
