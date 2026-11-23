// Static web build for hosting (Vercel): everything the game loads, in dist/.
//   npm run build   ->  dist/index.html, dist/src, dist/public, dist/vendor (three + three-mesh-bvh)
// The game imports three.js through an import map pointing into node_modules; static hosts don't serve
// node_modules, so the libraries are copied to dist/vendor and the import map is rewritten to match.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, 'dist');
const skip = new Set(['public/debug.glb']);                    // local debugging only
const skipRe = /_albedo\.png$|\.DS_Store$/;                   // textures are embedded in the GLBs

fs.rmSync(out, { recursive: true, force: true });
const copy = (rel, to = rel) => {
  const src = path.join(root, rel), dst = path.join(out, to);
  if (skip.has(rel) || skipRe.test(rel)) return;
  const st = fs.statSync(src);
  if (st.isDirectory()) { for (const f of fs.readdirSync(src)) copy(path.join(rel, f), path.join(to, f)); return; }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
};

copy('src');
copy('public');
copy('node_modules/three/build/three.module.js', 'vendor/three/build/three.module.js');
copy('node_modules/three/examples/jsm', 'vendor/three/examples/jsm');
copy('node_modules/three-mesh-bvh/build/index.module.js', 'vendor/three-mesh-bvh/build/index.module.js');

let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const before = html;
html = html.replaceAll('./node_modules/three/build/', './vendor/three/build/')
  .replaceAll('./node_modules/three/examples/jsm/', './vendor/three/examples/jsm/')
  .replaceAll('./node_modules/three-mesh-bvh/build/', './vendor/three-mesh-bvh/build/');
if (html === before || html.includes('node_modules')) throw new Error('index.html import map not rewritten');
fs.writeFileSync(path.join(out, 'index.html'), html);

let bytes = 0, files = 0;
const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f), s = fs.statSync(p); if (s.isDirectory()) walk(p); else { bytes += s.size; files++; } } };
walk(out);
console.log(`dist/: ${files} files, ${(bytes / 1e6).toFixed(1)} MB`);
