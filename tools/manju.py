#!/usr/bin/env python3
"""Builds Manju (hostel guard) as a low-poly rigged GLB copied from his character sheet.

    python3 tools/manju.py [out.glb]      (default: public/models/manju.glb)

Shape: the front view (tools/ref/manju_front.webp) and the side view from the sheet
(tools/ref/manju_sheet.webp) are segmented into silhouettes. Every body part is a stack of
horizontal rings whose width comes from the front silhouette and whose depth comes from the
side silhouette at that height, so the model matches the sheet's outline in both views.
Texture: the sheet art itself is projected onto the mesh (front view for front-facing
surfaces, side view for the sides, the side view's back strip for the back), baked into one
512x512 atlas sampled NEAREST. Under 1500 triangles. 1.40 m tall, faces +Z, Y up.
Bones: root hips spine chest neck head + L/R upperArm foreArm hand thigh shin foot
(L = character's left = +X). Animations: Idle, Walk, Chase, Stare.
"""
import io, json, math, os, struct, sys
import numpy as np
from PIL import Image, ImageFilter

TAU = 2 * math.pi
HERE = os.path.dirname(os.path.abspath(__file__))
REF = os.path.join(HERE, 'ref')
AW, AH = 512, 512
H = 1.40
SCALE = 1.0

def norm(v):
    n = np.linalg.norm(v)
    return v / n if n > 1e-12 else v

def smooth(a, b, x):
    t = min(max((x - a) / (b - a), 0.0), 1.0)
    return t * t * (3 - 2 * t)

# ------------------------------------------------------- reference images
def median(m, k=5):
    return np.array(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(k))) > 127

def shift(a, dy, dx):
    out = np.roll(np.roll(a, dy, 0), dx, 1)
    return out

def pad_colors(img, mask, iters=40):
    """Erode the mask a little (drop the grey halo) then bleed edge colours outward,
    so samples that land just outside the silhouette still get body colours."""
    m = mask.copy()
    for _ in range(2):
        m = m & shift(m, 1, 0) & shift(m, -1, 0) & shift(m, 0, 1) & shift(m, 0, -1)
    col = img.astype(np.float32) * m[..., None]
    for _ in range(iters):
        acc = np.zeros_like(col); cnt = np.zeros(m.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            mm = shift(m, dy, dx)
            acc += shift(col, dy, dx) * mm[..., None]; cnt += mm
        grow = (~m) & (cnt > 0)
        col[grow] = acc[grow] / cnt[grow][:, None]
        m = m | grow
    return col

FRONT = np.array(Image.open(os.path.join(REF, 'manju_front.webp')).convert('RGB')).astype(int)[:, :650]
d = np.abs(FRONT - 97).sum(2); sat = FRONT.max(2) - FRONT.min(2)
MF = (d > 18) | (sat > 10); MF[:60] = False; MF[905:] = False
MF = median(MF)
FCOL = pad_colors(FRONT, MF)

SHEET = np.array(Image.open(os.path.join(REF, 'manju_sheet.webp')).convert('RGB')).astype(int)
SY0, SX0 = 140, 430
SIDE = SHEET[SY0:780, SX0:640]
d = np.abs(SIDE - np.array([62, 62, 61])).sum(2); sat = SIDE.max(2) - SIDE.min(2)
MS = (d > 30) | (sat > 14); MS[:6, 150:] = False
MS = median(MS)
# fill small holes (light shoe highlights etc.) row-wise between the outer edges of the body
for y in range(MS.shape[0]):
    xs = np.nonzero(MS[y])[0]
    if len(xs) and y > 500:
        MS[y, xs.min():xs.max() + 1] = True
SCOL = pad_colors(SIDE, MS)

def rows_extent(m):
    ys = np.nonzero(m.any(1))[0]
    return ys.min(), ys.max()

F_TOP, F_BOT = rows_extent(MF)
S_TOP, S_BOT = rows_extent(MS)
KF = H / (F_BOT - F_TOP)          # metres per front pixel
KS = H / (S_BOT - S_TOP)          # metres per side pixel
# body centre line in the front image (mean of the torso run at belly height)
def runs(row):
    r = []; x = 0; n = len(row)
    while x < n:
        if row[x]:
            s = x
            while x < n and row[x]:
                x += 1
            r.append((s, x - 1))
        else:
            x += 1
    return r

_head = runs(MF[int(F_BOT - 1.30 / KF)])
CXF = (_head[0][0] + _head[-1][1]) / 2  # head is centred on the body axis
_knee = runs(MS[int(S_BOT - .30 / KS)])
CZS = (_knee[0][0] + _knee[-1][1]) / 2  # z = 0 at the legs' centre at knee height

def frow(Y):
    return int(round(np.clip(F_BOT - Y / KF, 0, MF.shape[0] - 1)))

def srow(Y):
    return int(round(np.clip(S_BOT - Y / KS, 0, MS.shape[0] - 1)))

def fx(px):  return (px - CXF) * KF          # front pixel -> world X
def fpx(X):  return CXF + X / KF
def sz(px):  return (px - CZS) * KS          # side pixel -> world Z
def spx(Z):  return CZS + Z / KS

def front_runs(Y):
    return [(fx(a), fx(b)) for a, b in runs(MF[frow(Y)])]

def side_main(Y):
    r = [q for q in runs(MS[srow(Y)]) if q[1] - q[0] > 3]
    if not r:
        return None
    a, b = r[0][0], r[-1][1]
    return sz(a), sz(b + 1)

def sample(img, px, py):
    x = int(np.clip(round(px), 0, img.shape[1] - 1)); y = int(np.clip(round(py), 0, img.shape[0] - 1))
    return img[y, x]

def front_col(X, Y):
    return sample(FCOL, fpx(X), F_BOT - Y / KF)

def side_col(Z, Y):
    return sample(SCOL, spx(Z), S_BOT - Y / KS)

# ---------------------------------------------------------- measurements
SPLIT_Y = None   # highest Y where the arms are separated from the torso
for Y in np.arange(1.2, .8, -.004):
    if len(front_runs(Y)) >= 3:
        SPLIT_Y = Y; break
CROTCH_Y = None
for Y in np.arange(.8, .3, -.004):
    if len(front_runs(Y)) >= 2 and all(not (a < 0 < b) for a, b in front_runs(Y)):
        CROTCH_Y = Y; break
HAND_Y = None
for Y in np.arange(.8, .3, -.004):
    if len(front_runs(Y)) <= 1:
        HAND_Y = Y; break
ARM_W = .125  # upper-arm thickness used where the arm is merged into the torso outline

def torso_run(Y):
    r = front_runs(Y)
    for a, b in r:
        if a <= 0 <= b:
            return a, b
    return min(r, key=lambda q: abs((q[0] + q[1]) / 2)) if r else (-.05, .05)

def arm_run(Y, s):
    """(inner, outer) X extents of one arm at height Y (s=+1 left/+X, -1 right)."""
    r = front_runs(Y)
    ta, tb = torso_run(Y)
    if Y > SPLIT_Y:  # merged: arm is the outer ARM_W of the outline
        edge = tb if s > 0 else ta
        return edge - s * ARM_W, edge
    out = [q for q in r if (q[0] > tb if s > 0 else q[1] < ta)]
    if not out:
        return None
    lo = min(q[0] for q in out); hi = max(q[1] for q in out)
    return (lo, hi) if s > 0 else (hi, lo)

# ------------------------------------------------------------- skeleton
J = {}; PARENT = {}
def bone(name, pos, parent=None):
    J[name] = np.array(pos, float); PARENT[name] = parent

HIP_Y = CROTCH_Y + .07
bone('root', (0, 0, 0))
bone('hips', (0, HIP_Y, 0), 'root')
bone('spine', (0, HIP_Y + .22, 0), 'hips')
bone('chest', (0, HIP_Y + .42, 0), 'spine')
NECK_Y = 1.17
bone('neck', (0, NECK_Y, -.01), 'chest')
bone('head', (0, NECK_Y + .07, 0), 'neck')
SH_Y, EL_Y, WR_Y = SPLIT_Y + .17, SPLIT_Y - .04, HAND_Y + .155
for side, s in (('L', 1), ('R', -1)):
    def mid(Y):
        a, b = arm_run(Y, s); return (a + b) / 2
    bone('upperArm' + side, (mid(SH_Y) - s * .01, SH_Y, -.01), 'chest')
    bone('foreArm' + side, (mid(EL_Y), EL_Y, -.01), 'upperArm' + side)
    bone('hand' + side, (mid(WR_Y), WR_Y, .01), 'foreArm' + side)
    lr = [q for q in front_runs(CROTCH_Y - .06) if (q[0] > 0 if s > 0 else q[1] < 0)]
    lc = (lr[0][0] + lr[0][1]) / 2 if lr else s * .09
    bone('thigh' + side, (lc, HIP_Y - .04, 0), 'hips')
    bone('shin' + side, (lc, .30, .0), 'thigh' + side)
    bone('foot' + side, (lc, .075, -.01), 'shin' + side)
BONES = list(J.keys())
BI = {n: i for i, n in enumerate(BONES)}

# ---------------------------------------------------------------- parts
class Part:
    """Stack of horizontal rings. rows: list of (Y, cx, cz, rx, zf, zb) with zf/zb measured
    from cz. P(theta, t) interpolates linearly between rows; theta=0 faces +Z."""
    def __init__(self, name, rows, nth, region, sampler, weights, e=.9, cap_top=False, cap_bot=False):
        self.name, self.rows, self.nth, self.region = name, np.array(rows, float), nth, region
        self.sampler, self.weights, self.e = sampler, weights, e
        self.cap_top, self.cap_bot = cap_top, cap_bot
        self.nt = len(rows) - 1

    def fn(self, th, t):
        k = min(max(t, 0), 1) * self.nt
        i = min(int(k), self.nt - 1); u = k - i
        Y, cx, cz, rx, zf, zb = self.rows[i] * (1 - u) + self.rows[i + 1] * u
        s, c = math.sin(th), math.cos(th)
        e = self.e
        x = rx * math.copysign(abs(s) ** e, s)
        z = (zf if c > 0 else zb) * math.copysign(abs(c) ** e, c)
        return np.array([cx + x, Y, cz + z])

def column_rows():
    """Head + neck + torso + pelvis as one continuous column."""
    top = (F_BOT - F_TOP) * KF
    Ys = [CROTCH_Y - .03, CROTCH_Y + .04, .64, .72, .80, .88, .95, 1.02, 1.08, 1.13, 1.17,
          1.205, 1.235, 1.265, 1.295, 1.32, 1.345, 1.368, top - .012, top - .002]
    rows = []
    for Y in Ys:
        a, b = torso_run(Y)
        if Y > SPLIT_Y:  # shoulders: take the arms off the outline, blended in
            k = smooth(SPLIT_Y, SPLIT_Y + .06, Y) * smooth(1.19, 1.15, Y)
            a, b = a + ARM_W * .55 * k, b - ARM_W * .55 * k
        sm = side_main(Y)
        za, zb_ = sm if sm else (-.08, .08)
        half = max((b - a) / 2, .01)
        cz = (za + zb_) / 2
        rows.append((Y, (a + b) / 2 * 0, cz, half, (zb_ - za) / 2, (zb_ - za) / 2))
    # smooth the face profile so the nose doesn't push the whole face forward
    r = np.array(rows)
    for i in range(1, len(r) - 1):
        if r[i, 0] > 1.24:
            r[i, 4] = r[i, 5] = (r[i - 1, 4] + 2 * r[i, 4] + r[i + 1, 4]) / 4
    r[-1, 3] *= .55; r[-1, 4] *= .55; r[-1, 5] *= .55
    return r.tolist()

def arm_rows(s):
    Ys = [SH_Y + .02, SH_Y - .05, SPLIT_Y + .02, SPLIT_Y - .04, EL_Y - .06, EL_Y - .11,
          WR_Y + .03, WR_Y - .01, WR_Y - .06, WR_Y - .11, HAND_Y + .012]
    rows = []
    for Y in Ys:
        a, b = arm_run(min(Y, SH_Y - .04), s)
        half = abs(b - a) / 2
        cz = -.012 + .03 * smooth(SH_Y, HAND_Y, Y)
        dep = half * (1.0 if Y > WR_Y else 1.08)
        rows.append((Y, (a + b) / 2, cz, half, dep, dep))
    rows[0] = (rows[0][0], rows[0][1] - s * .02, rows[0][2], rows[0][3] * .8, rows[0][4] * .9, rows[0][5] * .9)
    rows[-1] = (rows[-1][0], rows[-1][1], rows[-1][2], rows[-1][3] * .6, rows[-1][4] * .6, rows[-1][5] * .6)
    return rows

def leg_rows(s):
    Ys = [CROTCH_Y + .08, CROTCH_Y - .02, .42, .33, .26, .18, .12, .075]
    rows = []
    for Y in Ys:
        if Y >= CROTCH_Y - .005:
            ta, tb = torso_run(Y)
            a, b = (0.0, tb) if s > 0 else (ta, 0.0)
            a, b = (a + .01, b) if s > 0 else (a, b - .01)
        else:
            r = [q for q in front_runs(Y) if (q[0] + q[1]) / 2 * s > 0]
            q = min(r, key=lambda q: abs((q[0] + q[1]) / 2 - J['thigh' + ('L' if s > 0 else 'R')][0]))
            a, b = q
        sm = side_main(max(Y, .1))
        za, zb_ = sm
        dep = (zb_ - za) / 2
        if Y >= CROTCH_Y - .005:
            dep *= .9
        rows.append((Y, (a + b) / 2, (za + zb_) / 2, (b - a) / 2, dep, dep))
    return rows

def shoe_rows(s, lc):
    """Shoe as rings along Y is wrong for a foot, so we build it along Z instead (see shoe_fn)."""
    return None

SHOE_LEN = (lambda r: (sz(r[0][0]), sz(r[-1][1] + 1)))(runs(MS[srow(.035)]))
def shoe_part(s):
    lr = [q for q in front_runs(.04) if (q[0] + q[1]) / 2 * s > 0]
    a, b = lr[0] if lr else (s * .05, s * .14)
    cx, hw = (a + b) / 2, abs(b - a) / 2
    z0, z1 = SHOE_LEN
    top = .085
    def fn(th, t):
        z = z0 + t * (z1 - z0)
        # side-view height profile of the shoe at this z
        col = int(round(spx(z)))
        ys = np.nonzero(MS[srow(.11):, np.clip(col, 0, MS.shape[1] - 1)])[0] if 0 <= col < MS.shape[1] else []
        h = (len(ys) * KS) if len(ys) else .03
        h = min(max(h, .02), top)
        w = hw * (.55 + .45 * math.sin(min(t, .999) * math.pi) ** .35)
        sn, cs = math.sin(th), math.cos(th)
        x = w * math.copysign(abs(sn) ** .7, sn)
        y = h * (.5 + .5 * math.copysign(abs(cs) ** .7, cs))
        return np.array([cx + x, y, z])
    p = Part('shoe' + ('L' if s > 0 else 'R'), [(0, 0, 0, 0, 0, 0)] * 2, 8, None, None, None)
    p.fn = fn
    p.nt = 6
    return p

# --------------------------------------------------------------- samplers
def surface_normal(p, th, t):
    e = 1e-3
    P1, P0 = p.fn(th + e, t), p.fn(th - e, t)
    dt = 1e-3
    Q1, Q0 = p.fn(th, min(t + dt, 1)), p.fn(th, max(t - dt, 0))
    n = np.cross(P1 - P0, Q1 - Q0)
    P = p.fn(th, t)
    c = p.fn(0, t) * 0 + np.array([np.mean([p.fn(a, t)[0] for a in (0, 1.57, 3.14, -1.57)]), P[1],
                                    np.mean([p.fn(a, t)[2] for a in (0, 1.57, 3.14, -1.57)])])
    if np.linalg.norm(n) < 1e-10:
        n = P - c
    n = norm(n)
    if np.dot(n, P - c) < 0:
        n = -n
    return n

def back_strip(Z_back, X, Y, depth_px=12):
    """Colour for back-facing points: the side view just inside the back edge."""
    px = spx(Z_back) + 2 + (abs(X) * 61 % 4)
    return sample(SCOL, px, S_BOT - Y / KS)

def col_column(P, N, th):
    X, Y, Z = P
    if N[2] >= abs(N[0]) * .9:
        return front_col(X, Y)
    if Y > NECK_Y + .04 and -N[2] <= abs(N[0]) * 1.1:
        # head sides: the side view's face would give a second set of eyes, so only use it
        # behind the cheek line (ear, sideburn, hair); in front of it stretch the front edge
        sm = side_main(Y)
        zf = sm[1] if sm else .1
        # skip the profile's eye / moustache / nose: sample the cheek just behind them
        Zs = min(Z, zf - .045)
        c = side_col(Zs, Y)
        if c[0] > 1.5 * c[1] and c[0] > 110:  # red eye glow
            c = side_col(Zs - .02, Y - .02)
        return c
        return side_col(Z, Y)
    if -N[2] > abs(N[0]) * 1.1:
        sm = side_main(Y)
        c = back_strip(sm[0] if sm else Z, X, Y)
        if Y < NECK_Y:  # match the flank brightness so the back isn't a dark panel
            a, b = torso_run(Y)
            ref = (front_col(a + .015, Y) + front_col(b - .015, Y)) / 2
            g = np.clip(ref.mean() / max(c.mean(), 1), 1, 1.9)
            c = c * g
        return c
    # flanks: side view, except where the arm hangs in front of the torso in the side view
    if HAND_Y - .02 < Y < SPLIT_Y + .1:
        a, b = torso_run(Y)
        edge = b if X > 0 else a
        return front_col(edge - math.copysign(.012 + .02 * abs(N[2]), X), Y)
    return side_col(Z, Y)

def col_limb_factory(kind, s):
    def f(P, N, th):
        X, Y, Z = P
        if kind == 'arm':
            r = arm_run(min(Y, SH_Y - .04), s)
            lo, hi = min(r), max(r)
        else:
            r = [q for q in front_runs(Y) if (q[0] + q[1]) / 2 * s > 0] if Y < CROTCH_Y else []
            if r:
                q = min(r, key=lambda q: abs((q[0] + q[1]) / 2 - X)); lo, hi = q
            else:
                lo, hi = X - .05, X + .05
        Xs = min(max(X, lo + .006), hi - .006)
        if kind == 'leg' and abs(N[0]) > abs(N[2]) and Y > .1:
            return side_col(Z, Y)
        return front_col(Xs, Y)
    return f

def col_shoe(P, N, th):
    X, Y, Z = P
    if N[2] > .6:
        return front_col(X, Y)
    return side_col(Z, max(Y, .006))

# ---------------------------------------------------------------- weights
def w_column(P):
    Y = P[1]
    out = {}
    a = smooth(HIP_Y + .05, HIP_Y + .2, Y); b = smooth(HIP_Y + .3, HIP_Y + .45, Y)
    c = smooth(NECK_Y - .02, NECK_Y + .03, Y); d = smooth(NECK_Y + .04, NECK_Y + .09, Y)
    out['hips'] = 1 - a; out['spine'] = a * (1 - b); out['chest'] = b * (1 - c)
    out['neck'] = c * (1 - d); out['head'] = d
    for side, s in (('L', 1), ('R', -1)):
        k = .5 * smooth(.6, .95, s * P[0] / max(abs(torso_run(Y)[1 if s > 0 else 0]), .05)) \
            * smooth(SPLIT_Y - .05, SPLIT_Y + .05, Y) * smooth(NECK_Y + .02, NECK_Y - .04, Y)
        if k > 0:
            out = {n: w * (1 - k) for n, w in out.items()}; out['upperArm' + side] = k
    # upper thighs follow the legs a little
    side = 'L' if P[0] > 0 else 'R'
    k = .4 * smooth(CROTCH_Y + .1, CROTCH_Y - .02, Y)
    if k > 0:
        out = {n: w * (1 - k) for n, w in out.items()}; out['thigh' + side] = k
    return out

def w_arm(side):
    def f(P):
        Y = P[1]
        k = smooth(EL_Y + .04, EL_Y - .04, Y); h = smooth(WR_Y + .02, WR_Y - .03, Y)
        c = .35 * smooth(SH_Y - .06, SH_Y + .02, Y)
        out = {'upperArm' + side: (1 - k) * (1 - c), 'foreArm' + side: k * (1 - h), 'chest': c}
        if h > 0:
            out['hand' + side] = h
        return out
    return f

def w_leg(side):
    def f(P):
        Y = P[1]
        k = smooth(.34, .26, Y); hp = .5 * smooth(CROTCH_Y - .02, CROTCH_Y + .08, Y)
        ft = smooth(.12, .07, Y)
        return {'thigh' + side: (1 - k) * (1 - hp) * (1 - ft), 'hips': hp * (1 - ft),
                'shin' + side: k * (1 - ft), 'foot' + side: ft}
    return f

# ------------------------------------------------------------- part list
PARTS = []
col = Part('column', column_rows(), 12, (0, 0, 320, 288), col_column, w_column, e=.85,
           cap_top=True)
PARTS.append(col)
for side, s in (('L', 1), ('R', -1)):
    PARTS.append(Part('arm' + side, arm_rows(s), 8, (320 + (0 if s > 0 else 64), 0, 64, 288),
                      col_limb_factory('arm', s), w_arm(side), e=.9, cap_bot=True))
    PARTS.append(Part('leg' + side, leg_rows(s), 8, ((0 if s > 0 else 112), 288, 112, 160),
                      col_limb_factory('leg', s), w_leg(side), e=.9))
    sp = shoe_part(s)
    sp.region = (224 + (0 if s > 0 else 96), 288, 96, 96)
    sp.sampler = col_shoe
    sp.weights = (lambda side: (lambda P: {'foot' + side: 1.0}))(side)
    sp.cap_top = sp.cap_bot = True
    PARTS.append(sp)

# ------------------------------------------------------------- build
atlas = np.zeros((AH, AW, 3), np.float32) + 60
positions, normals, uvs, joints, weights, tris = [], [], [], [], [], []

def add_vertex(P, N, uv, wd):
    top = sorted(((b, w) for b, w in wd.items() if w > 1e-4), key=lambda kv: -kv[1])[:4]
    tot = sum(w for _, w in top)
    positions.append(P); normals.append(N); uvs.append(uv)
    joints.append([BI[b] for b, _ in top] + [0] * (4 - len(top)))
    weights.append([w / tot for _, w in top] + [0.0] * (4 - len(top)))
    return len(positions) - 1

for p in PARTS:
    x0, y0, w, h = p.region
    # texture: every texel samples the reference art at its own 3D position
    for j in range(h):
        t = 1 - (j + .5) / h
        for i in range(w):
            th = -math.pi + TAU * (i + .5) / w
            P = p.fn(th, t)
            N = surface_normal(p, th, t)
            atlas[y0 + j, x0 + i] = p.sampler(P, N, th)
    def uv(u, t):
        return ((x0 + .5 + u * (w - 1)) / AW, (y0 + .5 + (1 - t) * (h - 1)) / AH)
    grid = {}
    for k in range(p.nt + 1):
        t = k / p.nt
        for m in range(p.nth + 1):
            u = m / p.nth
            th = -math.pi + TAU * u
            P = p.fn(th, t)
            grid[k, m] = add_vertex(P, surface_normal(p, th, t), uv(u, t), p.weights(P))
    for k in range(p.nt):
        for m in range(p.nth):
            a, b, c, d = grid[k, m], grid[k, m + 1], grid[k + 1, m], grid[k + 1, m + 1]
            tris += [(a, b, d), (a, d, c)]
    for end, on in ((1.0, p.cap_top), (0.0, p.cap_bot)):
        if not on:
            continue
        ring = [p.fn(-math.pi + TAU * m / p.nth, end) for m in range(p.nth)]
        C = np.mean(ring, axis=0)
        Nc = norm(np.cross(ring[1] - ring[0], ring[2] - ring[0]))
        tt = end
        ci = add_vertex(C, Nc, uv(.5, tt), p.weights(C))
        k = p.nt if end == 1.0 else 0
        for m in range(p.nth):
            tris.append((grid[k, m], grid[k, m + 1], ci))

positions = np.array(positions, np.float32)
normals = np.array(normals, np.float32)
uvs = np.array(uvs, np.float32)
joints = np.array(joints, np.uint8)
weights = np.array(weights, np.float32)
indices = np.array(tris, np.uint32)
# orient every triangle so its winding agrees with its vertex normals; drop degenerates
fn_ = np.cross(positions[indices[:, 1]] - positions[indices[:, 0]],
               positions[indices[:, 2]] - positions[indices[:, 0]])
bad = (fn_ * normals[indices].sum(1)).sum(1) < 0
indices[bad] = indices[bad][:, ::-1]
indices = indices[np.linalg.norm(fn_, axis=1) > 1e-12]
assert len(indices) < 1500, len(indices)
# cap normals: point them along the face normal (outward)
fn_ = np.cross(positions[indices[:, 1]] - positions[indices[:, 0]],
               positions[indices[:, 2]] - positions[indices[:, 0]])

def to_png(arr, alpha=None):
    rgb = np.clip(arr, 0, 255).astype(np.uint8)
    if alpha is not None:
        rgb = np.dstack([rgb, np.clip(alpha, 0, 255).astype(np.uint8)])
    img = Image.fromarray(rgb)
    b = io.BytesIO(); img.save(b, 'PNG', optimize=True)
    return b.getvalue(), img

JOINT_UV = (448, 0, 32, 16)
_x0, _y0, _w, _h = JOINT_UV
for _j in range(_h):
    for _i in range(_w):
        v = (_i + .5) / _w   # along the joint: 0 = mouth end, 1 = lit end
        if v < .16:
            c = (196, 172, 128) if (_i + _j) % 2 else (176, 152, 110)      # rolled card crutch
        elif v > .9:
            c = (96, 92, 88) if (_i + _j) % 2 else (70, 66, 64)            # ash
        else:
            c = (226, 220, 204) if (_i * 3 + _j) % 5 else (204, 198, 182)  # paper
        atlas[_y0 + _j, _x0 + _i] = c
# smoke: chunky 2-texel blocks in the sheet's muted greys, with a dithered alpha cut-out
# (rendered as alphaMode MASK) so the puffs break up like PS1 sprites instead of smooth glass
SMOKE_UV = (480, 0, 32, 32)
ALPHA = np.full((AH, AW), 255, np.float32)
_x0, _y0, _w, _h = SMOKE_UV
_rs = np.random.default_rng(11)
_SMOKE_COLS = [(176, 180, 182), (164, 168, 171), (152, 157, 161), (190, 193, 194), (140, 146, 151)]
_cells = _rs.random((_h // 2, _w // 2))
for _j in range(_h):
    for _i in range(_w):
        cj, ci = _j // 2, _i // 2
        n = _cells[cj, ci]
        k = 0 if n < .35 else 1 if n < .6 else 2 if n < .78 else 3 if n < .92 else 4
        atlas[_y0 + _j, _x0 + _i] = _SMOKE_COLS[k]
        edge = abs((_j + .5) / _h - .5) * 2           # thinner toward the poles
        hole = _cells[(cj + 3) % (_h // 2), (ci + 5) % (_w // 2)]
        bayer = ((ci % 2) * 2 + (cj % 2)) / 4         # 2x2 ordered dither on the blocks
        ALPHA[_y0 + _j, _x0 + _i] = 255 if hole * .8 + bayer * .3 > .45 + .4 * edge ** 2 else 0
png_base, img_base = to_png(atlas, ALPHA)
print(f'split {SPLIT_Y:.3f} crotch {CROTCH_Y:.3f} hand {HAND_Y:.3f}')

# ------------------------------------------------------------- animation
def quat_axis(axis, ang):
    axis = norm(np.array(axis, float))
    s = math.sin(ang / 2)
    return [axis[0] * s, axis[1] * s, axis[2] * s, math.cos(ang / 2)]

def qmul(a, b):
    ax, ay, az, aw = a; bx, by, bz, bw = b
    return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx,
            aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz]

def rot(rx=0, ry=0, rz=0):
    q = [0, 0, 0, 1]
    for ax, a in (((1, 0, 0), rx), ((0, 1, 0), ry), ((0, 0, 1), rz)):
        if a:
            q = qmul(q, quat_axis(ax, a))
    return q

D = math.radians
def anim_walk(ph, run=False):
    s = math.sin(ph); c = math.cos(ph)
    amp = 1.35 if run else 1.0
    r = {}
    r['thighL'] = rot(D(-21 * s * amp))
    r['thighR'] = rot(D(21 * s * amp))
    r['shinL'] = rot(D((22 + 26 * max(-math.cos(ph - .6), 0) * amp * 1.4)))
    r['shinR'] = rot(D((22 + 26 * max(math.cos(ph - .6), 0) * amp * 1.4)))
    r['shinL'] = rot(D(8 + 38 * amp * max(math.sin(ph + 1.9), 0)))
    r['shinR'] = rot(D(8 + 38 * amp * max(math.sin(ph + 1.9 + math.pi), 0)))
    r['footL'] = rot(D(-8 * math.sin(ph + .6)))
    r['footR'] = rot(D(8 * math.sin(ph + .6)))
    r['upperArmL'] = rot(D(7 * s * amp), 0, D(2))
    r['upperArmR'] = rot(D(-7 * s * amp), 0, D(-2))
    r['foreArmL'] = rot(D(-4 - 4 * max(s, 0) * amp))
    r['foreArmR'] = rot(D(-4 - 4 * max(-s, 0) * amp))
    lean = 12 if run else 3
    r['hips'] = rot(D(lean * .3), D(3 * s), D(1.5 * c))
    r['spine'] = rot(D(lean * .4), D(-2 * s), D(-1 * c))
    r['chest'] = rot(D(lean * .3), D(-1 * s))
    r['neck'] = rot(D(-lean * .5))
    r['head'] = rot(D(-4 if run else 0))
    bob = (abs(math.cos(ph)) - .6) * (.035 if run else .022) * SCALE
    return r, {'hips': [0, J['hips'][1] + bob, 0]}

# ------------------------------------------------------- the joint (prop)
def qmat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])

def slerp(a, b, t):
    a, b = np.array(a, float), np.array(b, float)
    if np.dot(a, b) < 0:
        b = -b
    d = np.clip(np.dot(a, b), -1, 1)
    if d > .9995:
        q = a + t * (b - a)
    else:
        th = math.acos(d)
        q = (math.sin((1 - t) * th) * a + math.sin(t * th) * b) / math.sin(th)
    return list(q / np.linalg.norm(q))

# The joint sits between the fingers of the right hand (yellow-band hand). Its placement in
# the hand is derived from the smoking pose: first the arm is solved so the fingers reach just
# in front of the lips, then the joint is laid from the lips outward and expressed in hand space.
JOINT_LEN = .078
MOUTH_Y = 1.255
MOUTH = np.array([-.010, MOUTH_Y, side_main(MOUTH_Y)[1] + .002])
JOINT_WORLD_DIR = norm(np.array([-.22, -.12, 1.0]))      # out from the lips, toward his right
GRIP_HAND = J['handR'] + np.array([.005, -.105, .028])   # between index and middle finger (rest)
GRIP_TARGET = MOUTH + JOINT_WORLD_DIR * .04

def fk_right(qu, qf, qh, p):
    """World position of rest-space point p (in the hand) for upperArm/foreArm/hand rotations."""
    sh, el, wr = J['upperArmR'], J['foreArmR'], J['handR']
    R1, R2, R3 = qmat(qu), qmat(qf), qmat(qh)
    return sh + R1 @ ((el - sh) + R2 @ ((wr - el) + R3 @ (p - wr)))

def body_pen(P):
    """How deep P is inside the torso column (0 outside)."""
    rows = np.array(col.rows)
    Y = P[1]
    if Y < rows[0, 0] or Y > rows[-1, 0]:
        return 0.0
    i = int(np.clip(np.searchsorted(rows[:, 0], Y) - 1, 0, len(rows) - 2))
    u = (Y - rows[i, 0]) / (rows[i + 1, 0] - rows[i, 0])
    _, cx, cz, rx, zf, zb = rows[i] * (1 - u) + rows[i + 1] * u
    v = ((P[0] - cx) / (rx + .035)) ** 2 + ((P[2] - cz) / ((zf if P[2] > cz else zb) + .035)) ** 2
    return max(0.0, 1 - v)

HEAD_C = np.array([0, 1.29, -.005])
def head_pen(P):
    v = ((P[0] - HEAD_C[0]) / .11) ** 2 + ((P[1] - HEAD_C[1]) / .14) ** 2 + ((P[2] - HEAD_C[2]) / .125) ** 2
    return max(0.0, 1 - v)

def smoke_pose_params(x):
    return rot(x[0], x[1], x[2]), rot(x[3]), rot(x[4], x[5], x[6])

def smoke_cost(x):
    qu, qf, qh = smoke_pose_params(x)
    g = fk_right(qu, qf, qh, GRIP_HAND)
    el = J['upperArmR'] + qmat(qu) @ (J['foreArmR'] - J['upperArmR'])
    wr = fk_right(qu, qf, qh, J['handR'])
    c = 4e4 * np.sum((g - GRIP_TARGET) ** 2)
    c += 30 * (body_pen(el) + body_pen((el + wr) / 2) + body_pen(wr))
    for q, wgt in ((J['handR'], 80), (J['handR'] + np.array([0, -.05, .02]), 80),
                   (J['handR'] + np.array([0, -.15, .02]), 40)):
        c += wgt * head_pen(fk_right(qu, qf, qh, q))
    c += 30 * max(0, wr[1] - (MOUTH[1] - .02))         # wrist below the lips, fingers up
    c += 20 * max(0, -.05 - (wr[2] - MOUTH[2])) * 0
    c += .02 * (x[3] ** 2) + .05 * (x[1] ** 2 + x[4] ** 2 + x[5] ** 2 + x[6] ** 2)
    return c

def solve_smoke_pose():
    rs = np.random.default_rng(3)
    best, bx = 1e9, None
    lo = np.array([-2.2, -1.0, -1.6, -2.6, -1.2, -1.2, -1.2])
    hi = np.array([0.4, 1.0, 0.3, 0.0, 1.2, 1.2, 1.2])
    for _ in range(60):
        x = lo + rs.random(7) * (hi - lo)
        step = .3
        f = smoke_cost(x)
        while step > 1e-3:
            moved = False
            for k in range(7):
                for sgn in (1, -1):
                    y = x.copy(); y[k] = np.clip(y[k] + sgn * step, lo[k], hi[k])
                    fy = smoke_cost(y)
                    if fy < f:
                        x, f, moved = y, fy, True
            if not moved:
                step *= .5
        if f < best:
            best, bx = f, x
    qu, qf, qh = smoke_pose_params(bx)
    err = np.linalg.norm(fk_right(qu, qf, qh, GRIP_HAND) - GRIP_TARGET)
    print(f'smoke pose: grip error {err * 100:.1f} cm, cost {best:.2f}, angles {np.degrees(bx).round(0)}')
    return qu, qf, qh

def to_hand_rest(p, qs, direction=False):
    """Inverse of fk_right: world point (or direction) in the smoking pose -> rest hand space."""
    qu, qf, qh = qs
    R1, R2, R3 = qmat(qu), qmat(qf), qmat(qh)
    if direction:
        return (R1 @ R2 @ R3).T @ p
    sh, el, wr = J['upperArmR'], J['foreArmR'], J['handR']
    v = R1.T @ (p - sh) - (el - sh)
    v = R2.T @ v - (wr - el)
    return wr + R3.T @ v

SMOKE_Q = solve_smoke_pose()
MOUTH_END = to_hand_rest(MOUTH, SMOKE_Q)
JOINT_DIR = norm(to_hand_rest(JOINT_WORLD_DIR, SMOKE_Q, True))
PUFFS = 5
MOUTH_LOCAL = MOUTH - J['head']  # smoke nodes hang off the head bone

def idle_base(ph):
    s = math.sin(ph)
    r = {'spine': rot(D(1.5 * s)), 'chest': rot(D(-1.5 * s)),
         'head': rot(D(2 * math.sin(ph * .5)), D(5 * math.sin(ph * .5 + .4)), D(2 * math.sin(ph * .5))),
         'upperArmL': rot(D(1.5 * s), 0, D(2)), 'upperArmR': rot(D(1.5 * s), 0, D(-2)),
         'foreArmL': rot(D(-6)), 'foreArmR': rot(D(-6))}
    return r

def anim_idle(ph):
    """8 s loop: stand, raise the joint, drag on it (ember flares), lower, exhale smoke."""
    p = ph / TAU
    r = idle_base(ph * 2)
    up = smooth(.10, .25, p) * (1 - smooth(.44, .58, p))
    hold = smooth(.24, .27, p) * (1 - smooth(.43, .46, p))
    for b, q in zip(('upperArmR', 'foreArmR', 'handR'), SMOKE_Q):
        r[b] = slerp(r.get(b, [0, 0, 0, 1]), q, up)
    # keep the head and chest still while the joint is at the lips, lean back a touch on the drag
    for b in ('head', 'chest', 'spine'):
        r[b] = slerp(r[b], [0, 0, 0, 1], up)
    drag = hold * math.sin(math.pi * min(max((p - .27) / .17, 0), 1))
    r['chest'] = qmul(r['chest'], rot(D(-2.5 * drag)))
    r['head'] = qmul(r['head'], rot(D(-4 * drag)))
    exhale = smooth(.56, .62, p) * (1 - smooth(.78, .9, p))
    r['head'] = qmul(r['head'], rot(D(-3 * exhale), D(-8 * exhale)))
    tr = {'hips': [0, J['hips'][1] - .004 * (1 + math.sin(ph * 2)), 0]}
    sc = {'ember': [1 + .8 * drag] * 3}
    for k in range(PUFFS):
        t0 = .58 + .035 * k
        u = (p - t0) / .32
        if 0 <= u <= 1:
            g = math.sin(math.pi * u) ** .5 * (.45 + 1.5 * u)
            sway = .03 * math.sin(k * 2.1 + u * 4)
            off = np.array([sway - .012 * k, -.01 - .03 * u + .006 * k, .02 + .36 * u])
        else:
            g, off = 0.0, np.zeros(3)
        sc['smoke%d' % k] = [g] * 3
        tr['smoke%d' % k] = list(MOUTH_LOCAL + off)
    return r, tr, sc

def anim_stare(ph):
    # creepy: slow head tilt toward the player, hands twitch
    k = .5 - .5 * math.cos(ph)
    tw = 1 if (math.sin(ph * 7) > .97) else 0
    r = {'head': rot(D(-6 * k), D(3 * k), D(24 * k)), 'neck': rot(D(-4 * k)),
         'chest': rot(D(3 * k)),
         'foreArmL': rot(D(-8 - 10 * tw)), 'foreArmR': rot(D(-8)),
         'handL': rot(0, 0, D(10 * tw)), 'upperArmL': rot(0, 0, D(3)), 'upperArmR': rot(0, 0, D(-3))}
    return r, {}

def sample(fn, dur, n, *a):
    times = [dur * k / n for k in range(n + 1)]
    frames = [fn(TAU * k / n, *a) for k in range(n + 1)]
    return times, frames

ANIMS = [('Idle',) + sample(anim_idle, 8.0, 96), ('Walk',) + sample(anim_walk, 1.15, 24),
         ('Chase',) + sample(lambda ph: anim_walk(ph, True), .72, 18),
         ('Stare',) + sample(anim_stare, 6.0, 60)]

# ------------------------------------------------------------- GLB writer
buf = bytearray()
views, accs = [], []

def add_view(data, target=None):
    while len(buf) % 4:
        buf.append(0)
    off = len(buf); buf.extend(data)
    v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
    if target:
        v['target'] = target
    views.append(v)
    return len(views) - 1

def add_acc(arr, ctype, typ, target=None, minmax=False, normalized=False):
    arr = np.ascontiguousarray(arr)
    vi = add_view(arr.tobytes(), target)
    a = {'bufferView': vi, 'componentType': ctype, 'count': int(arr.shape[0]), 'type': typ}
    if normalized:
        a['normalized'] = True
    if minmax:
        a['min'] = [float(v) for v in arr.reshape(arr.shape[0], -1).min(0)]
        a['max'] = [float(v) for v in arr.reshape(arr.shape[0], -1).max(0)]
    accs.append(a)
    return len(accs) - 1

ARR, ELE = 34962, 34963
FLOAT, U8, U16, U32 = 5126, 5121, 5123, 5125
a_pos = add_acc(positions, FLOAT, 'VEC3', ARR, True)
a_nrm = add_acc(normals, FLOAT, 'VEC3', ARR)
a_uv = add_acc(uvs, FLOAT, 'VEC2', ARR)
a_j = add_acc(joints, U8, 'VEC4', ARR)
a_w = add_acc(weights, FLOAT, 'VEC4', ARR)
idx = indices.reshape(-1).astype(np.uint16 if len(positions) < 65535 else np.uint32)
a_idx = add_acc(idx, U16 if idx.dtype == np.uint16 else U32, 'SCALAR', ELE)

img0 = add_view(png_base)

# nodes: 0 = scene root "Manju", 1 = mesh node, 2.. = bones
nodes = [{'name': 'Manju', 'children': [1, 2]}, {'name': 'ManjuMesh', 'mesh': 0, 'skin': 0}]
bone_node = {n: 2 + i for i, n in enumerate(BONES)}
for n in BONES:
    par = PARENT[n]
    local = J[n] - (J[par] if par else 0)
    nd = {'name': n, 'translation': [float(v) for v in local]}
    kids = [bone_node[c] for c in BONES if PARENT[c] == n]
    if kids:
        nd['children'] = kids
    nodes.append(nd)

ibm = []
for n in BONES:
    m = np.eye(4, dtype=np.float32); m[:3, 3] = -J[n]
    ibm.append(m.T.reshape(-1))  # column-major
a_ibm = add_acc(np.array(ibm, np.float32), FLOAT, 'MAT4')

# ---- prop meshes (rigid, parented to bones)
def cone_mesh(r0, r1, length, n, uvr):
    x0, y0, w, h = uvr
    P, N, U, I = [], [], [], []
    for k, (r, zz) in enumerate(((r0, 0.0), (r1, length))):
        for m in range(n + 1):
            a = TAU * m / n
            P.append([r * math.cos(a), r * math.sin(a), zz]); N.append([math.cos(a), math.sin(a), 0])
            U.append([(x0 + .5 + (w - 1) * (zz / length)) / AW, (y0 + .5 + (h - 1) * m / n) / AH])
    for m in range(n):
        a, b, c, d = m, m + 1, n + 1 + m, n + 2 + m
        I += [a, c, b, b, c, d]
    for zz, nz, r in ((0.0, -1, r0), (length, 1, r1)):  # end caps
        ci = len(P); P.append([0, 0, zz]); N.append([0, 0, nz])
        U.append([(x0 + .5 + (w - 1) * (zz / length)) / AW, (y0 + h / 2) / AH])
        base = len(P)
        for m in range(n):
            a = TAU * m / n
            P.append([r * math.cos(a), r * math.sin(a), zz]); N.append([0, 0, nz]); U.append(U[ci])
        for m in range(n):
            i0, i1 = base + m, base + (m + 1) % n
            I += [ci, i1, i0] if nz > 0 else [ci, i0, i1]
    return np.array(P, np.float32), np.array(N, np.float32), np.array(U, np.float32), np.array(I, np.uint16)

def octa_mesh(r, squash=1.0):
    V = np.array([[r, 0, 0], [-r, 0, 0], [0, r * squash, 0], [0, -r * squash, 0], [0, 0, r], [0, 0, -r]], np.float32)
    F = [(0, 2, 4), (2, 1, 4), (1, 3, 4), (3, 0, 4), (2, 0, 5), (1, 2, 5), (3, 1, 5), (0, 3, 5)]
    P, N = [], []
    for f in F:  # flat-shaded
        a, b, c = V[list(f)]
        n_ = norm(np.cross(b - a, c - a))
        P += [a, b, c]; N += [n_] * 3
    return np.array(P, np.float32), np.array(N, np.float32), None, np.arange(len(P), dtype=np.uint16)

def add_mesh(name, mesh, material):
    P, N, U, I = mesh
    attrs = {'POSITION': add_acc(P, FLOAT, 'VEC3', ARR, True), 'NORMAL': add_acc(N, FLOAT, 'VEC3', ARR)}
    if U is not None:
        attrs['TEXCOORD_0'] = add_acc(U, FLOAT, 'VEC2', ARR)
    prim = {'attributes': attrs, 'indices': add_acc(I, U16, 'SCALAR', ELE), 'material': material}
    MESHES.append({'name': name, 'primitives': [prim]})
    return len(MESHES)  # mesh 0 is the body

MESHES = []
m_joint = add_mesh('Joint', cone_mesh(.0034, .0058, JOINT_LEN, 6, JOINT_UV), 1)
m_ember = add_mesh('Ember', octa_mesh(.0062, 1.0), 2)
def puff_mesh(r, uvr, seed):
    """Lumpy low-poly blob (octahedron subdivided once, jittered), smooth normals, pixel UVs."""
    rs = np.random.default_rng(seed)
    V = [np.array(v, float) for v in ([1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1])]
    F = [(0, 2, 4), (2, 1, 4), (1, 3, 4), (3, 0, 4), (2, 0, 5), (1, 2, 5), (3, 1, 5), (0, 3, 5)]
    mids = {}
    def mid(a, b):
        key = tuple(sorted((a, b)))
        if key not in mids:
            V.append(norm(V[a] + V[b])); mids[key] = len(V) - 1
        return mids[key]
    F2 = []
    for a, b, c in F:
        ab, bc, ca = mid(a, b), mid(b, c), mid(c, a)
        F2 += [(a, ab, ca), (ab, b, bc), (ca, bc, c), (ab, bc, ca)]
    lump = [1 + rs.uniform(-.22, .22) for _ in V]
    P = np.array([v * r * l * np.array([1, .8, 1]) for v, l in zip(V, lump)], np.float32)
    N = np.zeros_like(P)
    for a, b, c in F2:
        n_ = np.cross(P[b] - P[a], P[c] - P[a]); N[[a, b, c]] += n_
    N /= np.linalg.norm(N, axis=1, keepdims=True)
    x0, y0, w, h = uvr
    U = np.array([[(x0 + .5 + (w - 1) * (.5 + math.atan2(v[0], v[2]) / TAU)) / AW,
                   (y0 + .5 + (h - 1) * (.5 - math.asin(np.clip(v[1], -1, 1)) / math.pi)) / AH] for v in V],
                 np.float32)
    return P, N.astype(np.float32), U, np.array(F2, np.uint16).reshape(-1)

m_smoke = add_mesh('Smoke', puff_mesh(.05, SMOKE_UV, 5), 3)
PROP_TRIS = sum(len(_m[3]) // 3 for _m in (cone_mesh(.0034, .0058, JOINT_LEN, 6, JOINT_UV), octa_mesh(1),
                                            puff_mesh(1, SMOKE_UV, 5))) + 32 * (PUFFS - 1)

def look_quat(d):
    """Rotation taking +Z to direction d."""
    z = np.array([0, 0, 1.0]); a = np.cross(z, d); s_ = np.linalg.norm(a)
    if s_ < 1e-9:
        return [0, 0, 0, 1]
    ang = math.atan2(s_, np.dot(z, d)); a /= s_
    return [*(a * math.sin(ang / 2)), math.cos(ang / 2)]

NODE = dict(bone_node)
def add_node(name, parent, translation, mesh=None, rotation=None, scale=None):
    nd = {'name': name, 'translation': [float(v) for v in translation]}
    if mesh is not None: nd['mesh'] = mesh
    if rotation is not None: nd['rotation'] = [float(v) for v in rotation]
    if scale is not None: nd['scale'] = [float(v) for v in scale]
    nodes.append(nd); NODE[name] = len(nodes) - 1
    nodes[NODE[parent]].setdefault('children', []).append(NODE[name])
    return nd

PROP_BASE = {}
add_node('joint', 'handR', MOUTH_END - J['handR'], m_joint, look_quat(JOINT_DIR))
add_node('ember', 'joint', [0, 0, JOINT_LEN], m_ember)
PROP_BASE['ember'] = [0, 0, JOINT_LEN]
for k in range(PUFFS):
    add_node('smoke%d' % k, 'head', MOUTH_LOCAL, m_smoke, scale=[1e-4] * 3,
             rotation=rot(k * 1.3, k * 2.2, k * .7))  # each puff turned so they don't look cloned
    PROP_BASE['smoke%d' % k] = list(MOUTH_LOCAL)

def base_translation(b):
    if b in PROP_BASE:
        return PROP_BASE[b]
    return J[b] - (J[PARENT[b]] if PARENT[b] else 0)

animations = []
for name, times, frames in ANIMS:
    frames = [f if len(f) == 3 else (f[0], f[1], {}) for f in frames]
    t_acc = add_acc(np.array(times, np.float32), FLOAT, 'SCALAR', minmax=True)
    ch, sm = [], []
    rot_bones = sorted({b for r, _, _ in frames for b in r})
    for b in rot_bones:
        q = np.array([r.get(b, [0, 0, 0, 1]) for r, _, _ in frames], np.float32)
        # keep quaternion hemisphere continuous
        for k in range(1, len(q)):
            if np.dot(q[k], q[k - 1]) < 0:
                q[k] = -q[k]
        o = add_acc(q, FLOAT, 'VEC4')
        sm.append({'input': t_acc, 'output': o, 'interpolation': 'LINEAR'})
        ch.append({'sampler': len(sm) - 1, 'target': {'node': NODE[b], 'path': 'rotation'}})
    tr_bones = sorted({b for _, tr, _ in frames for b in tr})
    for b in tr_bones:
        base_t = base_translation(b)
        v = np.array([tr.get(b, base_t) for _, tr, _ in frames], np.float32)
        o = add_acc(v, FLOAT, 'VEC3')
        sm.append({'input': t_acc, 'output': o, 'interpolation': 'LINEAR'})
        ch.append({'sampler': len(sm) - 1, 'target': {'node': NODE[b], 'path': 'translation'}})
    sc_nodes = sorted({b for _, _, sc in frames for b in sc})
    for b in sc_nodes:
        v = np.array([[max(c, 1e-4) for c in sc.get(b, [1, 1, 1])] for _, _, sc in frames], np.float32)
        o = add_acc(v, FLOAT, 'VEC3')
        sm.append({'input': t_acc, 'output': o, 'interpolation': 'LINEAR'})
        ch.append({'sampler': len(sm) - 1, 'target': {'node': NODE[b], 'path': 'scale'}})
    animations.append({'name': name, 'channels': ch, 'samplers': sm})

gltf = {
    'asset': {'version': '2.0', 'generator': 'manju.py (Manju Mania)'},
    'extensionsUsed': ['KHR_materials_unlit'],
    'scene': 0, 'scenes': [{'name': 'Manju', 'nodes': [0]}],
    'nodes': nodes,
    'meshes': [{'name': 'Manju', 'primitives': [{
        'attributes': {'POSITION': a_pos, 'NORMAL': a_nrm, 'TEXCOORD_0': a_uv,
                       'JOINTS_0': a_j, 'WEIGHTS_0': a_w},
        'indices': a_idx, 'material': 0}]}] + MESHES,
    'skins': [{'name': 'ManjuRig', 'joints': [bone_node[n] for n in BONES],
               'inverseBindMatrices': a_ibm, 'skeleton': bone_node['root']}],
    'materials': [{'name': 'Manju', 'doubleSided': True,
                   'pbrMetallicRoughness': {'baseColorTexture': {'index': 0},
                                            'metallicFactor': 0.0, 'roughnessFactor': 1.0}},
                  {'name': 'JointPaper', 'pbrMetallicRoughness': {'baseColorTexture': {'index': 0},
                                            'metallicFactor': 0.0, 'roughnessFactor': 1.0}},
                  {'name': 'Ember', 'emissiveFactor': [1.0, 0.32, 0.06],
                   'pbrMetallicRoughness': {'baseColorFactor': [1.0, 0.35, 0.08, 1.0],
                                            'metallicFactor': 0.0, 'roughnessFactor': 1.0}},
                  {'name': 'Smoke', 'alphaMode': 'MASK', 'alphaCutoff': 0.5, 'doubleSided': True,
                   'extensions': {'KHR_materials_unlit': {}},
                   'pbrMetallicRoughness': {'baseColorTexture': {'index': 0},
                                            'metallicFactor': 0.0, 'roughnessFactor': 1.0}}],
    'samplers': [{'magFilter': 9728, 'minFilter': 9728, 'wrapS': 33071, 'wrapT': 33071}],
    'images': [{'bufferView': img0, 'mimeType': 'image/png', 'name': 'manju_albedo'}],
    'textures': [{'sampler': 0, 'source': 0}],
    'animations': animations,
    'accessors': accs, 'bufferViews': views,
}
while len(buf) % 4:
    buf.append(0)
gltf['buffers'] = [{'byteLength': len(buf)}]
js = json.dumps(gltf, separators=(',', ':')).encode()
js += b' ' * ((4 - len(js) % 4) % 4)

here = os.path.dirname(os.path.abspath(__file__))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, '..', 'public', 'models', 'manju.glb')
os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
with open(out, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(buf)))
    f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
    f.write(struct.pack('<II', len(buf), 0x004E4942)); f.write(buf)
img_base.save(os.path.join(os.path.dirname(os.path.abspath(out)), 'manju_albedo.png'))
print(f'{out}: {positions[:, 1].max():.2f} m, {len(positions)} verts, {len(indices)} + {PROP_TRIS} prop tris, {len(BONES)} bones, '
      f'{len(ANIMS)} anims, {os.path.getsize(out) / 1024:.0f} KB')
