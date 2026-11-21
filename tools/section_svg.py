"""Debug: true horizontal section of the export at given heights (metres above ground, game coords).
   python3 tools/section_svg.py <obj> <out.svg> h1 [h2 ...]"""
import sys, re, numpy as np
sys.path.insert(0, 'tools'); from objload import load
UNIT, GZ, CX, CZ = 1 / 2.54, 1.99344, -3.88, 11.75
V, C, G = load(sys.argv[1]); out = sys.argv[2]; hs = [float(h) for h in sys.argv[3:] if not h.startswith('-x')]
import os
EXC = os.environ.get('EXCLUDE')
if EXC: G = [(n, f) for n, f in G if not re.match(EXC, n)]
F = np.concatenate([f for _, f in G]); names = np.concatenate([[i] * len(f) for i, (_, f) in enumerate(G)])
P = np.stack([V[:, 0] * UNIT - CX, (V[:, 2] - GZ) * UNIT, -V[:, 1] * UNIT - CZ], 1)
X0, X1, Z0, Z1, S = -37, 31, -14, 22, 14
W, H = (X1 - X0) * S, (Z1 - Z0) * S
svg = []
for k, h in enumerate(hs):
    oy = k * (H + 30)
    svg.append(f'<g transform="translate(0,{oy})"><rect width="{W}" height="{H}" fill="#fff"/>')
    for x in range(X0, X1 + 1):
        stroke = '#bbb' if x % 5 == 0 else '#eee'
        svg.append(f'<line x1="{(x-X0)*S}" y1="0" x2="{(x-X0)*S}" y2="{H}" stroke="{stroke}"/>')
        if x % 5 == 0: svg.append(f'<text x="{(x-X0)*S+2}" y="11" font-size="10" fill="#c00">{x}</text>')
    for z in range(Z0, Z1 + 1):
        stroke = '#bbb' if z % 5 == 0 else '#eee'
        svg.append(f'<line x1="0" y1="{(z-Z0)*S}" x2="{W}" y2="{(z-Z0)*S}" stroke="{stroke}"/>')
        if z % 5 == 0: svg.append(f'<text x="2" y="{(z-Z0)*S-2}" font-size="10" fill="#c00">{z}</text>')
    a, b, c = P[F[:, 0]], P[F[:, 1]], P[F[:, 2]]
    ya, yb, yc = a[:, 1] - h, b[:, 1] - h, c[:, 1] - h
    m = (np.minimum(np.minimum(ya, yb), yc) < 0) & (np.maximum(np.maximum(ya, yb), yc) > 0)
    segs = []
    for i in np.where(m)[0]:
        pts = []
        for p, q, yp, yq in ((a[i], b[i], ya[i], yb[i]), (b[i], c[i], yb[i], yc[i]), (c[i], a[i], yc[i], ya[i])):
            if (yp < 0) != (yq < 0):
                t = yp / (yp - yq); pts.append(p + (q - p) * t)
        if len(pts) == 2:
            col = C[F[i, 0]]; name = G[names[i]][0]
            stroke = '#1565c0' if 'window' in name else '#%02x%02x%02x' % tuple(int(v * 200) for v in col)
            svg.append(f'<line x1="{(pts[0][0]-X0)*S:.1f}" y1="{(pts[0][2]-Z0)*S:.1f}" x2="{(pts[1][0]-X0)*S:.1f}" y2="{(pts[1][2]-Z0)*S:.1f}" stroke="{stroke}" stroke-width="1.6"/>')
    svg.append(f'<text x="{W-160}" y="{H-8}" font-size="16" fill="#000">section y = {h} m</text></g>')
svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{len(hs)*(H+30)}" style="font-family:sans-serif">'] + svg + ['</svg>']
open(out, 'w').write('\n'.join(svg))
