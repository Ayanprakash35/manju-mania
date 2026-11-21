// Fog atmosphere: drifting ground mist (soft billboards) and a faint visible torch beam in the haze.
import * as THREE from 'three';

// Night sky: dark overhead, fading to exactly the fog colour at the horizon (so distant buildings melt into it),
// with a faint smudge of moonlight behind the cloud.
export function skyDome(moonDir) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uHorizon: { value: new THREE.Color() }, uZenith: { value: new THREE.Color(0x07090c) }, uMoon: { value: moonDir.clone().normalize() } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uHorizon, uZenith, uMoon; varying vec3 vDir;
      void main(){ vec3 d = normalize(vDir);
        vec3 c = mix(uHorizon, uZenith, smoothstep(-0.02, 0.55, d.y));
        float m = max(dot(d, uMoon), 0.0);
        c += vec3(0.55, 0.62, 0.75) * (pow(m, 28.0) * 0.05 + pow(m, 600.0) * 0.12);
        gl_FragColor = vec4(c, 1.0); }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), mat);
  m.userData.noRetro = true; m.renderOrder = -10; m.frustumCulled = false;
  return m;
}

// a soft cone of light from the torch, visible in the haze
export function torchBeam(len = 7, radius = 2.2) {
  const geo = new THREE.ConeGeometry(radius, len, 28, 1, true);
  geo.translate(0, -len / 2, 0);            // apex at the origin, opening along -y
  geo.rotateX(Math.PI / 2);                 // ... now along -z (camera forward)
  const mat = new THREE.ShaderMaterial({
    uniforms: { uLen: { value: len }, uStrength: { value: 0.07 } },
    vertexShader: `varying float vD; varying vec3 vN; varying vec3 vV;
      void main(){ vD = -position.z; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uLen; uniform float uStrength; varying float vD; varying vec3 vN; varying vec3 vV;
      void main(){ float along = 1.0 - clamp(vD / uLen, 0.0, 1.0);
        float edge = pow(abs(dot(vN, vV)), 2.0);
        float near = smoothstep(0.6, 3.0, vD);        // nothing right at the lens
        gl_FragColor = vec4(vec3(1.0, 0.9, 0.75) * uStrength * along * along * edge * near, 1.0); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(geo, mat);
  m.userData.noRetro = true; m.renderOrder = 3; m.frustumCulled = false;
  return m;
}
