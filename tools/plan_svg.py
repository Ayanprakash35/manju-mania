"""Debug: top-down plan SVG of the export, one rectangle per body footprint, coloured by height band."""
import sys, numpy as np
sys.path.insert(0, 'tools'); from objload import load
V, C, G = load(sys.argv[1]); out = sys.argv[2]
rows = []
for n, f in G:
    u = np.unique(f); lo = V[u].min(0); hi = V[u].max(0)
    rows.append((n, len(f), lo, hi, C[u[0]]))
X0, X1, Y0, Y1 = -100, 80, -85, 25
S = 8
W, H = (X1 - X0) * S, (Y1 - Y0) * S
el = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" style="background:#fff;font:9px sans-serif">']
# grid every 10 units
for x in range(X0, X1 + 1, 10): el.append(f'<line x1="{(x-X0)*S}" y1="0" x2="{(x-X0)*S}" y2="{H}" stroke="#eee"/><text x="{(x-X0)*S+2}" y="10" fill="#999">{x}</text>')
for y in range(Y0, Y1 + 1, 10): el.append(f'<line x1="0" y1="{(Y1-y)*S}" x2="{W}" y2="{(Y1-y)*S}" stroke="#eee"/><text x="2" y="{(Y1-y)*S-2}" fill="#999">{y}</text>')
rows.sort(key=lambda r: -(r[3][0]-r[2][0])*(r[3][1]-r[2][1]))
for n, k, lo, hi, c in rows:
    tall = hi[2] - lo[2]
    if tall < 0.5 and (hi[0]-lo[0])*(hi[1]-lo[1]) < 50: continue
    col = '#%02x%02x%02x' % tuple(int(v*255) for v in c)
    stroke = 'red' if (k <= 60 and tall > 15) else ('blue' if 'window' in n else '#333')
    x, y, w, h = (lo[0]-X0)*S, (Y1-hi[1])*S, (hi[0]-lo[0])*S, (hi[1]-lo[1])*S
    el.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{max(w,1):.1f}" height="{max(h,1):.1f}" fill="{col}" fill-opacity="0.35" stroke="{stroke}" stroke-width="{2 if stroke=="red" else 0.5}"><title>{n} {k} z{lo[2]:.1f}-{hi[2]:.1f}</title></rect>')
    if k <= 60 and tall > 15: el.append(f'<text x="{x+3:.0f}" y="{y+12:.0f}" fill="red">{n.replace("Body_","")} z{lo[2]:.0f}-{hi[2]:.0f}</text>')
el.append('</svg>')
open(out, 'w').write('\n'.join(el))
