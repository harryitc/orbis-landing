import * as THREE from 'three';

const surfaceVert = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const earthFrag = /* glsl */ `
  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform sampler2D uBRC;      // R bump, G roughness, B clouds
  uniform vec3 uSun;
  uniform vec3 uAtmo;
  uniform float uCloudShift;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vPosW);
    float ndl = dot(N, uSun);
    float dayMix = smoothstep(-0.18, 0.32, ndl);

    // Day side, graded toward a warm neutral palette.
    vec3 day = texture2D(uDay, vUv).rgb;
    float l = dot(day, vec3(0.2126, 0.7152, 0.0722));
    day = mix(vec3(l), day, 0.56) * vec3(1.06, 1.0, 0.88);

    vec3 brc = texture2D(uBRC, vUv).rgb;
    float rough = brc.g;
    float cloudShadow = texture2D(uBRC, vUv + vec2(uCloudShift - 0.002, 0.001)).b;

    vec3 lit = day * (max(ndl, 0.0) * 1.3 + 0.025);
    lit *= 1.0 - cloudShadow * 0.35 * dayMix;

    // Ocean glint.
    vec3 H = normalize(uSun + V);
    float nh = max(dot(N, H), 0.0);
    float spec = (pow(nh, 900.0) * 0.55 + pow(nh, 60.0) * 0.05) * (1.0 - rough) * dayMix;
    lit += vec3(1.0, 0.9, 0.76) * spec;

    // City lights, sodium-warm.
    vec3 night = texture2D(uNight, vUv).rgb;
    night = pow(night, vec3(1.35)) * vec3(1.0, 0.76, 0.5) * 2.4;
    night *= 1.0 - cloudShadow * 0.75;

    vec3 col = mix(night, lit, dayMix);

    // Rim haze + warm twilight band.
    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    float atmoDay = smoothstep(-0.1, 0.6, ndl);
    col = mix(col, uAtmo, fres * 0.7 * atmoDay);
    float tw = smoothstep(-0.14, 0.0, ndl) * smoothstep(0.16, 0.0, ndl);
    col += vec3(0.5, 0.3, 0.17) * tw * fres * 0.45;

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const cloudFrag = /* glsl */ `
  uniform sampler2D uBRC;
  uniform vec3 uSun;
  uniform float uCloudShift;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vec3 N = normalize(vNormalW);
    float c = texture2D(uBRC, vUv + vec2(uCloudShift, 0.0)).b;
    c = smoothstep(0.12, 0.85, c);
    float light = smoothstep(-0.22, 0.45, dot(N, uSun));
    vec3 col = vec3(0.96, 0.94, 0.9) * (0.04 + light * 0.96);
    gl_FragColor = vec4(col, c * (0.08 + 0.82 * light));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const atmoFrag = /* glsl */ `
  uniform vec3 uSun;
  uniform vec3 uAtmo;
  uniform float uIntensity;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vPosW);
    // Back faces: d is 0 at the shell silhouette, ~0.48 at the planet limb.
    float d = clamp(-dot(N, V), 0.0, 1.0);
    float glow = pow(smoothstep(0.0, 0.5, d), 2.6);
    float s = smoothstep(-0.55, 0.65, dot(N, uSun));
    vec3 col = mix(uAtmo, vec3(0.86, 0.62, 0.42), smoothstep(0.25, -0.2, dot(N, uSun)) * 0.5);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    gl_FragColor.rgb *= glow * (0.08 + s) * uIntensity * 0.62;
  }
`;

const TEX = (size) => ({
  day: `textures/earth_day_${size}.jpg`,
  night: `textures/earth_night_${size}.jpg`,
  brc: `textures/earth_bump_roughness_clouds_${size}.jpg`,
});

export class Earth {
  constructor(renderer, manager) {
    this.renderer = renderer;
    this.group = new THREE.Group();
    this.spinner = new THREE.Group(); // rotates with the planet (markers / links attach here)
    this.group.add(this.spinner);

    this.uniforms = {
      uDay: { value: null },
      uNight: { value: null },
      uBRC: { value: null },
      uSun: { value: new THREE.Vector3(1, 0.2, 0.5).normalize() },
      uAtmo: { value: new THREE.Color('#9fb3ad') },
      uCloudShift: { value: 0 },
      uIntensity: { value: 1 },
    };

    const loader = new THREE.TextureLoader(manager);
    this.ready = this.#loadSet(loader, TEX(2048));

    const geo = new THREE.SphereGeometry(1, 128, 96);
    this.surface = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({ vertexShader: surfaceVert, fragmentShader: earthFrag, uniforms: this.uniforms }),
    );
    this.spinner.add(this.surface);

    this.clouds = new THREE.Mesh(
      new THREE.SphereGeometry(1.008, 128, 96),
      new THREE.ShaderMaterial({
        vertexShader: surfaceVert,
        fragmentShader: cloudFrag,
        uniforms: this.uniforms,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.spinner.add(this.clouds);

    this.atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.14, 96, 64),
      new THREE.ShaderMaterial({
        vertexShader: surfaceVert,
        fragmentShader: atmoFrag,
        uniforms: this.uniforms,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.group.add(this.atmosphere);
  }

  async #loadSet(loader, paths, stagger = false) {
    const aniso = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const load = (url, srgb) =>
      loader.loadAsync(url).then((t) => {
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.anisotropy = aniso;
        t.wrapS = THREE.RepeatWrapping;
        return t;
      });
    const [day, night, brc] = await Promise.all([load(paths.day, true), load(paths.night, true), load(paths.brc, false)]);
    if (stagger) {
      for (const t of [day, night, brc]) {
        await new Promise(requestAnimationFrame);
        this.renderer.initTexture(t);
      }
    }
    for (const [k, t] of [['uDay', day], ['uNight', night], ['uBRC', brc]]) {
      const old = this.uniforms[k].value;
      this.uniforms[k].value = t;
      old?.dispose();
    }
  }

  /** Swap in 4K maps after the intro on capable desktop GPUs. */
  upgrade() {
    const big = this.renderer.capabilities.maxTextureSize >= 4096;
    const coarse = matchMedia('(pointer: coarse)').matches;
    if (!big || coarse) return Promise.resolve();
    return this.#loadSet(new THREE.TextureLoader(), TEX(4096), true).catch(() => {});
  }
}
