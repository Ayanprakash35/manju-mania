// Retro look: Baldi's-Basics-style pixel textures, PS1 vertex wobble, low-res render with an analog
// (VHS) post pass. Toggle with V.
//
//  * every building surface gets a chunky procedural pixel texture chosen by its material colour
//    (box-projected UVs in metres, nearest filtering, no mipmaps)
//  * interior walls get a school-style band: dark green wainscot, a stripe and a skirting board,
//    computed per floor in the shader
//  * vertices snap to the low-res pixel grid (PS1 wobble)
//  * the scene renders into a ~240-line target, upscaled with nearest filtering, through a pass that
//    reduces the palette with ordered dithering and adds grain, scanlines, slight colour fringing and a vignette
import * as THREE from 'three';

const LEVELS = [0.76, 4.03, 7.17];
const LINES = 240;                       // vertical resolution of the low-res render

// ---------------------------------------------------------------- pixel textures
function makeTex(px, draw, metres = 1) {
  const c = document.createElement('canvas'); c.width = c.height = px;
  const g = c.getContext('2d');
  draw(g, px);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(1 / metres, 1 / metres);
  return t;
}
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const rgb = (r, g, b) => `rgb(${r | 0},${g | 0},${b | 0})`;
const speckle = (g, px, base, amt, n = px * px * 0.35) => {
  g.fillStyle = rgb(...base); g.fillRect(0, 0, px, px);
  for (let i = 0; i < n; i++) { const d = (rnd() - 0.5) * amt; g.fillStyle = rgb(base[0] + d, base[1] + d, base[2] + d); g.fillRect((rnd() * px) | 0, (rnd() * px) | 0, 1, 1); }
};

const TEX = {
  plaster: () => makeTex(16, (g, p) => speckle(g, p, [190, 189, 184], 26)),
  wall: () => makeTex(32, (g, p) => {                       // tired grey paint, a few hairline cracks
    speckle(g, p, [196, 196, 190], 16);
    for (let i = 0; i < 3; i++) { let x = rnd() * p, y = rnd() * p; g.fillStyle = rgb(150, 150, 146); for (let k = 0; k < 10; k++) { g.fillRect(x | 0, y | 0, 1, 1); x += rnd() * 2 - 0.6; y += rnd() * 2 - 1; } }
  }, 2),
  floor: () => makeTex(32, (g, p) => {                       // 2x2 tiles per 1.2 m, beige / pale grey, dark grout
    for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
      const base = (tx + ty) % 2 ? [160, 158, 150] : [146, 147, 145];
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const d = (rnd() - 0.5) * 14; g.fillStyle = rgb(base[0] + d, base[1] + d, base[2] + d); g.fillRect(tx * 16 + x, ty * 16 + y, 1, 1);
      }
    }
    g.fillStyle = rgb(78, 76, 72); g.fillRect(0, 0, p, 1); g.fillRect(0, 16, p, 1); g.fillRect(0, 0, 1, p); g.fillRect(16, 0, 1, p);
  }, 1.2),
  ceiling: () => makeTex(16, (g, p) => {                     // acoustic tiles, 0.6 m
    speckle(g, p, [176, 176, 170], 14);
    g.fillStyle = rgb(170, 168, 160); g.fillRect(0, 0, p, 1); g.fillRect(0, 0, 1, p);
    for (let i = 0; i < 14; i++) { g.fillStyle = rgb(196, 194, 186); g.fillRect(2 + ((rnd() * 12) | 0), 2 + ((rnd() * 12) | 0), 1, 1); }
  }, 0.6),
  pavers: () => makeTex(32, (g, p) => {                      // red interlocking pavers
    g.fillStyle = rgb(120, 52, 40); g.fillRect(0, 0, p, p);
    for (let row = 0; row < 8; row++) for (let col = -1; col < 5; col++) {
      const x = col * 8 + (row % 2) * 4, y = row * 4, sh = (rnd() - 0.5) * 30;
      g.fillStyle = rgb(178 + sh, 74 + sh * 0.5, 58 + sh * 0.4); g.fillRect(x + 1, y + 1, 6, 2);
    }
  }),
  grass: () => makeTex(16, (g, p) => { speckle(g, p, [104, 150, 70], 50, p * p); for (let i = 0; i < 30; i++) { g.fillStyle = rgb(70, 112, 48); g.fillRect((rnd() * p) | 0, (rnd() * p) | 0, 1, 2); } }),
  lawn: () => makeTex(16, (g, p) => { speckle(g, p, [150, 182, 104], 40, p * p); }),
  stone: () => makeTex(16, (g, p) => { speckle(g, p, [70, 96, 88], 26, p * p); g.fillStyle = rgb(120, 146, 136); for (let i = 0; i < 6; i++) g.fillRect((rnd() * p) | 0, (rnd() * p) | 0, 3, 1); }),
  asphalt: () => makeTex(16, (g, p) => speckle(g, p, [46, 46, 48], 26, p * p)),
  wood: () => makeTex(16, (g, p) => { for (let y = 0; y < p; y++) { const d = (rnd() - 0.5) * 30 + (y % 4 === 0 ? -20 : 0); g.fillStyle = rgb(110 + d, 64 + d * 0.6, 40 + d * 0.4); g.fillRect(0, y, p, 1); } }),
};

// material colour key (sRGB, as written by convert.mjs) -> texture kind
const KIND = {
  '0.831,0.831,0.831': 'plaster', '0.898,0.898,0.898': 'plaster', '0.902,0.894,0.871': 'wall', '0.792,0.776,0.737': 'floor',
  '0.937,0.933,0.922': 'ceiling', '0.690,0.443,0.333': 'pavers', '0.761,0.620,0.439': 'pavers', '0.345,0.141,0.055': 'pavers',
  '0.369,0.192,0.090': 'wood', '0.624,0.725,0.420': 'lawn', '0.322,0.400,0.373': 'stone', '0.176,0.176,0.176': 'asphalt',
  '0.184,0.184,0.184': 'asphalt', '0.208,0.208,0.208': 'asphalt', '0.627,0.627,0.643': 'plaster', '0.529,0.529,0.529': 'plaster',
  '0.494,0.494,0.525': 'plaster', '0.592,0.592,0.592': 'plaster', '0.788,0.690,0.533': 'wood', '0.420,0.243,0.157': 'wood',
  '0.267,0.212,0.180': 'wood', grass: 'grass',
};

// box-projected UVs in metres (geometry is already in world space)
function boxUV(geo) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (ay >= ax && ay >= az) { uv[2 * i] = x; uv[2 * i + 1] = z; }
    else if (ax >= az) { uv[2 * i] = z; uv[2 * i + 1] = y; }
    else { uv[2 * i] = x; uv[2 * i + 1] = y; }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

// ---------------------------------------------------------------- shader patches
const snapUniform = { value: new THREE.Vector2(426, 240) };
const retroOn = { value: 1 };
const snapOn = { value: 0 };
// ground fog: thick at ankle/knee height, thinning with height, patchy and slowly rolling (see fog_fragment below)
const mistU = { uMistColor: { value: new THREE.Color(0x3a424c) }, uMist: { value: 0.14 }, uMistH: { value: 0.5 }, uMistY: { value: 0.0 }, uFogTime: { value: 0 } };   // PS1 vertex wobble: off, it made the near-coplanar floor layers flicker
function patch(mat, { wallBand = false } = {}) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSnap = snapUniform; sh.uniforms.uRetro = retroOn; sh.uniforms.uSnapOn = snapOn; Object.assign(sh.uniforms, mistU);
    sh.vertexShader = 'uniform vec2 uSnap; uniform float uRetro; uniform float uSnapOn; varying vec3 vWPos;\n' + sh.vertexShader
      .replace('#include <project_vertex>', `#include <project_vertex>
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        if (uSnapOn > 0.5) { vec2 s = uSnap * 0.5; gl_Position.xy = floor(gl_Position.xy / gl_Position.w * s + 0.5) / s * gl_Position.w; }`);
    sh.fragmentShader = `varying vec3 vWPos; uniform float uRetro; uniform float uMist, uMistH, uMistY, uFogTime; uniform vec3 uMistColor;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
` + sh.fragmentShader.replace('#include <fog_fragment>', `
      #ifdef USE_FOG
        // distance haze (exp2) combined with a height-falloff ground mist integrated along the view ray
        float fd = length(vWPos - cameraPosition);
        float haze = 1.0 - exp(-fogDensity * fogDensity * fd * fd);
        float y0 = max(cameraPosition.y - uMistY, 0.0), y1 = max(vWPos.y - uMistY, 0.0), dy = y1 - y0;
        float e0 = exp(-y0 / uMistH), e1 = exp(-y1 / uMistH);
        float avg = abs(dy) > 0.02 ? uMistH * (e0 - e1) / dy : e0;
        vec2 mp = vWPos.xz;
        float n = vnoise(mp * 0.09 + vec2(uFogTime * 0.05, uFogTime * 0.02)) * 0.65 + vnoise(mp * 0.29 - vec2(uFogTime * 0.03, -uFogTime * 0.06)) * 0.35;
        float mist = 1.0 - exp(-uMist * (0.25 + 1.3 * n * n) * avg * fd);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uMistColor, mist);       // pale, moonlit mist low down
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, haze);         // dark haze with distance
      #endif`);
    if (wallBand) sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      if (uRetro > 0.5) {
        float fl = vWPos.y >= ${LEVELS[2].toFixed(2)} ? ${LEVELS[2].toFixed(2)} : (vWPos.y >= ${LEVELS[1].toFixed(2)} ? ${LEVELS[1].toFixed(2)} : ${LEVELS[0].toFixed(2)});
        float h = vWPos.y - fl;
        vec2 q = vec2(vWPos.x + vWPos.z, vWPos.y);
        float n = vnoise(q * 1.3) * 0.6 + vnoise(q * 4.1) * 0.4;           // blotchy damp patches
        float drip = vnoise(vec2((vWPos.x + vWPos.z) * 6.0, 0.0));          // streaks running down
        diffuseColor.rgb *= mix(0.62, 1.0, smoothstep(0.0, 0.9, h));        // grime near the floor
        diffuseColor.rgb *= 1.0 - 0.28 * smoothstep(0.55, 0.85, n);
        diffuseColor.rgb *= 1.0 - 0.18 * smoothstep(0.7, 0.95, drip) * smoothstep(3.1, 1.2, h);
        diffuseColor.rgb *= mix(1.0, 0.8, smoothstep(2.2, 3.0, h));         // soot under the ceiling
      }`);
  };
  mat.customProgramCacheKey = () => (wallBand ? 'retro-wall3' : 'retro3');
  return mat;
}

// ---------------------------------------------------------------- public API
export function setupRetro(renderer, scene, camera) {
  const tex = {};
  const getTex = (k) => (tex[k] ||= TEX[k]());
  const originals = new Map();
  const tubes = [];                     // tube-light materials (console: lights on/off)          // mesh -> original material (for the toggle)

  // building / doors / props: swap to retro materials
  function apply(root) {
    root.traverse((o) => {
      if (!o.isMesh || originals.has(o) || o.userData.noRetro) return;
      const m = o.material;
      originals.set(o, m);
      const key = (m.name || '').replace(/^c_/, '');
      let isDoor = false; for (let p = o; p; p = p.parent) if (p.name === 'doorL' || p.name === 'doorR') isDoor = true;
      const kind = isDoor ? (key.startsWith('0.76') ? null : 'wood') : KIND[key];   // entrance doors share colours with the pavers
      if (kind && o.geometry.attributes.normal) {
        if (!o.geometry.attributes.uv) boxUV(o.geometry);
        o.userData.retro = patch(new THREE.MeshLambertMaterial({ map: getTex(kind), side: m.side }), { wallBand: kind === 'wall' });
      } else {
        const r = patch(new THREE.MeshLambertMaterial({ color: m.color ? m.color.clone() : 0xffffff, map: m.map || null, vertexColors: !!m.vertexColors, transparent: m.transparent, opacity: m.opacity, side: m.side, emissive: m.emissive ? m.emissive.clone() : 0x000000, emissiveMap: m.emissiveMap || null, emissiveIntensity: m.emissiveIntensity ?? 1 }));
        if (key === '0.996,0.996,0.980') { r.emissive = new THREE.Color(0xc8d2e0); r.emissiveIntensity = 0.12; tubes.push(r); }   // tube lights
        o.userData.retro = r;
      }
      o.material = enabled ? o.userData.retro : m;
    });
  }

  // low-res target + post pass
  const rt = new THREE.WebGLRenderTarget(426, 240, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
  const post = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: rt.texture }, uRes: { value: new THREE.Vector2(426, 240) }, uTime: { value: 0 }, uOut: { value: new THREE.Vector2(1, 1) }, uChase: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform vec2 uRes; uniform vec2 uOut; uniform float uTime; uniform float uChase; varying vec2 vUv;
      float bayer(vec2 p){ int x=int(mod(p.x,4.0)), y=int(mod(p.y,4.0)); int i=x+y*4;
        int m[16]=int[16](0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5); return float(m[i])/16.0-0.5; }
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
      void main(){
        vec2 uv = vUv;
        // slight barrel distortion like an old screen
        vec2 cc = uv - 0.5; uv = 0.5 + cc * (1.0 + 0.015 * dot(cc, cc));
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0,0.0,0.0,1.0); return; }
        vec2 px = floor(uv * uRes);
        vec2 suv = (px + 0.5) / uRes;
        float ca = (0.4 + uChase * 1.6) / uRes.x;                        // faint chromatic fringe
        vec3 col = vec3(texture2D(tDiffuse, suv + vec2(ca,0.0)).r, texture2D(tDiffuse, suv).g, texture2D(tDiffuse, suv - vec2(ca,0.0)).b);
        col = clamp(col * (2.51 * col + 0.03) / (col * (2.43 * col + 0.59) + 0.14), 0.0, 1.0);   // ACES-ish tone map (target is linear)
        col = pow(col, vec3(1.0 / 2.2));                                                       // to sRGB
        // palette reduction with ordered dithering (about 5 bits per channel)
        float levels = 72.0;            // fine enough that the fog fades without visible steps
        float lum = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(vec3(lum), col, 0.32);                                  // nearly drained of colour
        col *= mix(vec3(0.86, 0.95, 1.0), vec3(1.0, 0.98, 0.94), smoothstep(0.05, 0.5, lum));   // cold shadows
        col = floor(col * levels + bayer(px) + 0.5) / levels;
        // analog: grain, faint horizontal jitter band, scanlines, vignette
        float t = floor(uTime * 24.0);
        col += (hash(px + t) - 0.5) * 0.045;
        float band = smoothstep(0.0, 0.02, abs(fract(uv.y * 0.7 - uTime * 0.08) - 0.5) - 0.48);
        col *= 0.985 + 0.015 * band;
        col *= 0.975 + 0.025 * sin(vUv.y * uOut.y * 3.14159);
        float pulse = 0.5 + 0.5 * sin(uTime * 9.5);
        col *= 1.0 - (0.7 + uChase * (0.5 + 0.25 * pulse)) * pow(length(cc) * 1.3, 2.2 - uChase * 0.6);
        col = mix(col, col * vec3(1.25, 0.72, 0.68), uChase * 0.55 * (1.0 - smoothstep(0.1, 0.6, lum)));   // red creeps into the shadows
                gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post);
  const postScene = new THREE.Scene(); postScene.add(quad);
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  let enabled = true;
  // flat, school-like fill so ceilings and shaded corridors don't go muddy (Baldi's Basics is near fullbright)
  const fill = new THREE.AmbientLight(0x8090b0, 0.07);   // night: just enough to read shapes
  scene.add(fill);
  function resize() {
    const w = Math.round(LINES * (innerWidth / innerHeight));
    rt.setSize(w, LINES); post.uniforms.uRes.value.set(w, LINES); snapUniform.value.set(w, LINES);
    post.uniforms.uOut.value.set(innerWidth, innerHeight);
  }
  resize(); addEventListener('resize', resize);

  function setEnabled(v) {
    enabled = v; retroOn.value = v ? 1 : 0; fill.visible = v;
    for (const [o, m] of originals) o.material = v ? o.userData.retro : m;
  }
  function render(dt) {
    if (!enabled) { renderer.setRenderTarget(null); renderer.render(scene, camera); return; }
    post.uniforms.uTime.value += dt; mistU.uFogTime.value += dt;
    renderer.setRenderTarget(rt); renderer.render(scene, camera);
    renderer.setRenderTarget(null); renderer.render(postScene, postCam);
  }
  const setTubes = (v) => { for (const t of tubes) t.emissiveIntensity = v ?? 0.12; };
  return { apply, render, setEnabled, setTubes, mist: mistU, setChase: (v) => { post.uniforms.uChase.value = v; }, fill, get enabled() { return enabled; } };
}
