// Fog atmosphere: drifting ground mist (soft billboards) and a faint visible torch beam in the haze.
import * as THREE from 'three';

function mistTexture() {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  // a few overlapping soft blobs -> irregular wisps rather than perfect circles
  for (let i = 0; i < 14; i++) {
    const x = S * (0.25 + Math.random() * 0.5), y = S * (0.3 + Math.random() * 0.4), r = S * (0.12 + Math.random() * 0.25);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.22)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Mist {
  // areas: [x0, x1, z0, z1] rectangles to scatter wisps over (courtyard, wells, outside)
  constructor(scene, areas, count = 70) {
    const tex = mistTexture();
    this.puffs = [];
    const weights = areas.map(([x0, x1, z0, z1]) => (x1 - x0) * (z1 - z0)), total = weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < count; i++) {
      let r = Math.random() * total, k = 0; while (r > weights[k]) r -= weights[k++];
      const [x0, x1, z0, z1] = areas[k];
      const size = 4 + Math.random() * 6;
      const mat = new THREE.MeshBasicMaterial({ map: tex, color: 0x9aa6b4, transparent: true, opacity: 0.18 + Math.random() * 0.2, depthWrite: false, fog: true });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size * 0.45), mat);
      m.userData.noRetro = true;
      m.position.set(x0 + Math.random() * (x1 - x0), 0.4 + Math.random() * 1.6, z0 + Math.random() * (z1 - z0));
      m.renderOrder = 2;
      scene.add(m);
      this.puffs.push({ m, area: areas[k], vx: (Math.random() - 0.5) * 0.25, vz: 0.1 + Math.random() * 0.2, ph: Math.random() * 6 });
    }
  }
  update(dt, camera, t) {
    for (const p of this.puffs) {
      const { m, area: [x0, x1, z0, z1] } = p;
      m.position.x += p.vx * dt; m.position.z += p.vz * dt * 0.5;
      if (m.position.x < x0) m.position.x = x1; if (m.position.x > x1) m.position.x = x0;
      if (m.position.z < z0) m.position.z = z1; if (m.position.z > z1) m.position.z = z0;
      m.position.y += Math.sin(t * 0.3 + p.ph) * 0.002;
      m.rotation.y = Math.atan2(camera.position.x - m.position.x, camera.position.z - m.position.z);   // face the camera (yaw only)
      // thin out wisps right in front of the face so they don't fill the screen
      const d = m.position.distanceTo(camera.position);
      m.visible = d > 2.5;
    }
  }
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
