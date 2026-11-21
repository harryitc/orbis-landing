import * as THREE from 'three';

const vert = /* glsl */ `
  attribute float aSize;
  attribute float aDelay;
  attribute float aPhase;
  attribute vec3 aColor;
  uniform float uReveal;
  uniform float uTime;
  uniform float uPR;
  varying float vA;
  varying vec3 vC;
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    float r = smoothstep(aDelay, aDelay + 0.18, uReveal);
    float tw = 0.72 + 0.28 * sin(uTime * (0.5 + aPhase * 1.8) + aPhase * 40.0);
    vA = r * tw;
    vC = aColor;
    gl_PointSize = aSize * uPR * (0.5 + 0.5 * r);
  }
`;

const frag = /* glsl */ `
  varying float vA;
  varying vec3 vC;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = pow(smoothstep(0.5, 0.0, d), 1.8);
    gl_FragColor = vec4(vC, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    gl_FragColor.rgb *= a * vA;
  }
`;

const PALETTE = ['#f1ebe0', '#e9e2d4', '#d9d6cf', '#cfd6d6', '#f3dcc0'].map((c) => new THREE.Color(c));

/**
 * Stars live on a far shell that follows the camera, so they behave as if at infinity.
 * `revealFrom` is the direction stars first appear around (centre of the opening shot).
 */
export class Starfield {
  constructor(count, revealFrom) {
    const pos = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const delay = new Float32Array(count);
    const phase = new Float32Array(count);
    const color = new Float32Array(count * 3);
    const dir = new THREE.Vector3();
    const bandNormal = new THREE.Vector3(0.3, 1, 0.2).normalize();
    const from = revealFrom.clone().normalize();

    for (let i = 0; i < count; i++) {
      // ~40% of stars hug a galactic band.
      dir.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
      if (Math.random() < 0.4) {
        const off = dir.dot(bandNormal) * (Math.random() * 0.25);
        dir.addScaledVector(bandNormal, -dir.dot(bandNormal) + off).normalize();
      }
      const r = 150 + Math.random() * 150;
      pos.set([dir.x * r, dir.y * r, dir.z * r], i * 3);

      const big = Math.random();
      size[i] = big > 0.985 ? 3.6 + Math.random() * 2 : big > 0.9 ? 2.2 + Math.random() : 0.9 + Math.random() * 1.1;
      // Reveal outward from the centre of the opening frame.
      delay[i] = ((1 - dir.dot(from)) / 2) * 0.72 + Math.random() * 0.1;
      phase[i] = Math.random();
      const c = PALETTE[(Math.random() * PALETTE.length) | 0];
      const k = 0.55 + Math.random() * 0.45;
      color.set([c.r * k, c.g * k, c.b * k], i * 3);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aDelay', new THREE.BufferAttribute(delay, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3));

    this.uniforms = {
      uReveal: { value: 0 },
      uTime: { value: 0 },
      uPR: { value: Math.min(window.devicePixelRatio, 1.75) },
    };
    this.points = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        uniforms: this.uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = -1;
  }

  setPixelRatio(pr) {
    this.uniforms.uPR.value = pr;
  }
}
