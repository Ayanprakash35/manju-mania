#!/usr/bin/env python3
"""Builds Dr Zoya (Manju Mania's first-floor spotter) as a low-poly rigged GLB, plus her
character profile sheet, from the reference photos tools/ref/zoya_face.png (close selfie)
and tools/ref/zoya_full.png (seated, shows the outfit).

    python3 tools/zoya.py           -> public/models/zoya.glb
                                       public/models/zoya_albedo.png
                                       tools/ref/zoya_profile.png

Same design principles as tools/manju.py / tools/crawler.py: body parts are stacks of
horizontal rings (proportions from the photos, 1.73 m = 5'8"), the photos are baked into one
512x512 atlas sampled NEAREST (face projected from the selfie, leaf-print shirt and capris
tiled from the seated photo), under 1500 triangles, the same 18-bone rig and bone names as
Manju. Her tinted glasses faintly catch the light (emissive). Faces +Z, Y up, L = +X.
Animations (in place):
  Idle       - standing, slowly scanning the corridor (4 s loop)
  Walk       - measured patrol walk, 1.2 s cycle, WALK_STRIDE m per cycle
  LookAround - stops and turns head and shoulders left/right (3 s loop)
  Spot       - freezes, head snaps to you, points, throws her arm up to summon (2.0 s)
  Point      - holds the point at you, trembling (2 s loop, play after Spot)
"""
import io, json, math, os, struct, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

NAME = 'DR ZOYA'
TAU = 2 * math.pi
HERE = os.path.dirname(os.path.abspath(__file__))
REF = os.path.join(HERE, 'ref')
OUT_DIR = os.path.join(HERE, '..', 'public', 'models')
AW, AH = 512, 512
D = math.radians

def norm(v):
    n = np.linalg.norm(v)
    return v / n if n > 1e-12 else v

def smooth(a, b, x):
    t = min(max((x - a) / (b - a), 0.0), 1.0)
    return t * t * (3 - 2 * t)

def interp(x, pts):
    xs, ys = zip(*sorted(pts))
    return float(np.interp(x, xs, ys))

# ------------------------------------------------------------- reference photos
FACE_IMG = np.array(Image.open(os.path.join(REF, 'zoya_face.png')).convert('RGB')).astype(np.float64)
FULL_IMG = np.array(Image.open(os.path.join(REF, 'zoya_full.png')).convert('RGB')).astype(np.float64)
def px(img, x, y):
    return img[int(np.clip(round(y), 0, img.shape[0] - 1)), int(np.clip(round(x), 0, img.shape[1] - 1))]
def patch(img, x0, y0, x1, y1):
    return img[y0:y1, x0:x1]
def tile(pt, u, v):
    h, w = pt.shape[:2]
    def m(a, n):
        a = int(math.floor(a)) % (2 * n)
        return a if a < n else 2 * n - 1 - a
    return pt[m(v, h), m(u, w)]

SHIRT = patch(FULL_IMG, 150, 540, 325, 850)     # tropical leaf print
PANTS = patch(FULL_IMG, 190, 1060, 330, 1240)   # pale grey-green capris
HAIR = patch(FACE_IMG, 520, 300, 600, 420)
SKIN = patch(FACE_IMG, 420, 690, 470, 730).reshape(-1, 3).mean(0)
SKIN_ARM = patch(FULL_IMG, 140, 860, 165, 900).reshape(-1, 3).mean(0)
GOLD = np.array([196, 160, 92.0])
SANDAL = np.array([78, 58, 48.0])
SOLE = np.array([40, 34, 30.0])

# face: selfie pixel anchors for model X / Y on the front of the head
FACE_X = [(-.078, 198), (-.031, 265), (0, 362), (.031, 455), (.078, 592)]
FACE_Y = [(1.712, 228), (1.68, 292), (1.615, 492), (1.578, 592), (1.555, 650), (1.525, 715), (1.50, 765), (1.485, 790)]
HAIRLINE, CHIN_Y = 1.672, 1.50
LENSES = [((265, 505), (98, 62)), ((455, 485), (92, 62))]

# ------------------------------------------------------------- skeleton
J = {}; PARENT = {}
def bone(name, pos, parent=None):
    J[name] = np.array(pos, float); PARENT[name] = parent
bone('root', (0, 0, 0))
bone('hips', (0, .92, 0), 'root')
bone('spine', (0, 1.06, 0), 'hips')
bone('chest', (0, 1.22, 0), 'spine')
bone('neck', (0, 1.43, -.008), 'chest')
bone('head', (0, 1.50, 0), 'neck')
for sd, s in (('L', 1), ('R', -1)):
    bone('upperArm' + sd, (s * .19, 1.37, -.005), 'chest')
    bone('foreArm' + sd, (s * .22, 1.10, -.005), 'upperArm' + sd)
    bone('hand' + sd, (s * .235, .86, .01), 'foreArm' + sd)
    bone('thigh' + sd, (s * .10, .86, 0), 'hips')
    bone('shin' + sd, (s * .10, .47, .005), 'thigh' + sd)
    bone('foot' + sd, (s * .10, .075, -.01), 'shin' + sd)
BONES = list(J.keys())
BI = {n: i for i, n in enumerate(BONES)}

# ------------------------------------------------------------- parts
class Part:
    def __init__(self, name, rows, nth, region, sampler, weights, e=.9, cap_top=False, cap_bot=False):
        self.name, self.rows, self.nth, self.region = name, np.array(rows, float), nth, region
        self.sampler, self.weights, self.e = sampler, weights, e
        self.cap_top, self.cap_bot = cap_top, cap_bot
        self.nt = len(rows) - 1
        self.lump = None
    def fn(self, th, t):
        k = min(max(t, 0), 1) * self.nt
        i = min(int(k), self.nt - 1); u = k - i
        Y, cx, cz, rx, zf, zb = self.rows[i] * (1 - u) + self.rows[i + 1] * u
        s, c = math.sin(th), math.cos(th)
        x = rx * math.copysign(abs(s) ** self.e, s)
        z = (zf if c > 0 else zb) * math.copysign(abs(c) ** self.e, c)
        if self.lump:
            f = self.lump(th, Y)
            x, z = x * f, z * f
        return np.array([cx + x, Y, cz + z])

COL_ROWS = [(.79, 0, 0, .17, .11, .11), (.845, 0, 0, .195, .12, .125), (.885, 0, 0, .21, .128, .132),
            (.96, 0, 0, .195, .122, .122), (1.04, 0, 0, .178, .12, .112), (1.12, 0, .005, .182, .13, .112),
            (1.20, 0, .008, .186, .137, .11), (1.28, 0, .006, .19, .122, .105), (1.34, 0, 0, .185, .102, .096),
            (1.39, 0, -.004, .148, .086, .086), (1.425, 0, -.008, .075, .066, .06), (1.46, 0, -.008, .055, .055, .052),
            (1.485, 0, -.004, .058, .066, .056),
            (1.505, 0, .004, .063, .084, .07), (1.53, 0, .004, .07, .094, .084), (1.555, 0, .004, .074, .099, .09),
            (1.578, 0, .004, .076, .104, .095), (1.615, 0, .004, .078, .097, .10), (1.645, 0, .004, .082, .095, .105),
            (1.672, 0, .004, .088, .094, .108), (1.695, 0, .004, .088, .088, .105), (1.715, 0, .004, .075, .07, .09),
            (1.727, 0, .004, .048, .045, .058), (1.732, 0, .004, .024, .022, .03)]
H = COL_ROWS[-1][0]

def arm_rows(s):
    r = [(1.395, .165, 0, .05, .055, .055), (1.35, .198, 0, .062, .064, .064), (1.28, .208, 0, .06, .062, .062),
         (1.15, .218, 0, .06, .062, .062), (1.14, .219, 0, .044, .046, .046),
         (1.10, .221, 0, .042, .043, .043), (1.00, .227, .004, .038, .039, .039), (.90, .232, .008, .033, .034, .034),
         (.87, .234, .009, .03, .031, .031), (.84, .235, .01, .021, .044, .044), (.80, .235, .012, .019, .042, .042),
         (.76, .235, .014, .014, .028, .028)]
    return [(Y, s * cx, cz, rx, zf, zb) for Y, cx, cz, rx, zf, zb in r]

def leg_rows(s):
    r = [(.88, .092, 0, .1, .104, .104), (.80, .10, 0, .095, .098, .098), (.70, .10, 0, .086, .088, .088),
         (.60, .10, .003, .076, .078, .078), (.50, .10, .006, .066, .068, .068), (.33, .10, 0, .062, .063, .063), (.31, .10, 0, .05, .052, .052), (.22, .10, -.004, .046, .047, .047),
         (.13, .10, -.008, .036, .037, .037), (.08, .10, -.01, .032, .034, .034)]
    return [(Y, s * cx, cz, rx, zf, zb) for Y, cx, cz, rx, zf, zb in r]

def foot_part(s):
    cx = s * .10
    z0, z1 = -.055, .19
    def fn(th, t):
        z = z0 + t * (z1 - z0)
        h = interp(z, [(-.055, .05), (-.02, .075), (.04, .06), (.12, .035), (.17, .025), (.19, .015)])
        w = .045 * (.6 + .4 * math.sin(min(t, .999) * math.pi) ** .4)
        sn, cs = math.sin(th), math.cos(th)
        return np.array([cx + w * math.copysign(abs(sn) ** .7, sn), h * (.5 + .5 * math.copysign(abs(cs) ** .7, cs)), z])
    p = Part('foot' + ('L' if s > 0 else 'R'), [(0,) * 6] * 2, 8, None, None, None)
    p.fn = fn; p.nt = 6
    return p

def hair_bob(th, Y):
    """Short bob: hair volume on the sides and back from the crown down to the jaw."""
    c = math.cos(th)
    side_back = 1 - max(c, 0) ** 1.5
    band = smooth(1.49, 1.53, Y) * (1 - smooth(1.70, 1.73, Y))
    crown = smooth(1.66, 1.69, Y) * max(c, 0) * .5                 # hair over the forehead
    wave = 1 + .02 * math.sin(th * 7 + Y * 120)
    return 1 + (.13 * band * side_back + .06 * crown) * wave

# ------------------------------------------------------------- samplers
def is_bg(c):
    return c.mean() > 200 or (c[2] > c[0] + 10)                      # sky / background

def in_lens(x, y):
    return any(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1 for (cx, cy), (rx, ry) in LENSES)

def face_xy(X, Y):
    k = interp(Y, [(1.485, .55), (1.50, .62), (1.53, .82), (1.555, 1.0)])   # jaw narrows
    return 362 + (interp(X, FACE_X) - 362) * k, interp(Y, FACE_Y)

def col_column(P, N, th):
    X, Y, Z = P
    c = math.cos(th)
    if Y > 1.42:
        hair_zone = (Y > HAIRLINE + .005) or (c < .25 and Y > 1.50) or (c < -.1 and Y > 1.47)
        if Y > 1.64 and c > .3 and X < -.02 and Y < 1.69:
            hair_zone = True                                           # side-swept fringe
        if hair_zone:
            u = (th + math.pi) / TAU * 140
            col = tile(HAIR, u * .8, (H - Y) * 500)
            return np.minimum(col, 90) * (.8 + .12 * math.sin(u * 1.7 + Y * 300))
        if Y > CHIN_Y - .012 and c > .25:
            x, y = face_xy(X, Y)
            col = px(FACE_IMG, x, y)
            return SKIN if is_bg(col) else col
        if c > .3 and Y < 1.49:                                        # throat + V-neck skin
            return px(FACE_IMG, 362 + X * 2600, interp(Y, [(1.42, 900), (1.49, 800)]))
        return SKIN * .85
    if Y < .865:
        return col_pants(P, N, th)
    u = th / TAU * 1.0 * 560 + SHIRT.shape[1] / 2              # unmirrored patch centred on the front
    col = tile(SHIRT, u, (1.45 - Y) * 560).copy()
    vb = 1.34                                                         # V-neck opening
    if c > .55 and Y > vb and abs(X) < .055 * (Y - vb) / (1.425 - vb):
        col = px(FACE_IMG, 362 + X * 2200, interp(Y, [(vb, 1010), (1.425, 860)]))
        if is_bg(col):
            col = SKIN
    elif c > .55 and Y > vb - .01 and abs(abs(X) - .055 * (Y - vb) / (1.425 - vb)) < .006:
        col = col * .7                                                # collar edge
    if c > .6 and abs(X) < .005 and Y < vb:
        col = col * .85
        for by in (1.31, 1.24, 1.17, 1.10):
            if abs(Y - by) < .006:
                col = np.array([236, 236, 232.0])                    # white buttons
    # gold chain + pendant on the skin of the V
    chain_y = 1.425 - .1 * (1 - (X / .07) ** 2) if abs(X) < .07 else 9
    if c > .4 and abs(Y - chain_y) < .003:
        col = GOLD
    if c > .6 and abs(X) < .006 and abs(Y - 1.33) < .008:
        col = GOLD
    if Y < .88:
        col = col * .8                                                # hem shadow
    return col

def col_pants(P, N, th):
    X, Y, Z = P
    if Y < .31:
        return SKIN_ARM * (.85 + .15 * max(N[2], 0))                 # bare calves below the capris
    u = (th + math.pi) / TAU * .55 * 520
    col = tile(PANTS, u, (.9 - Y) * 520)
    if Y < .335:
        col = col * .85                                               # cuff
    return col

def col_arm(s):
    def f(P, N, th):
        X, Y, Z = P
        if Y > 1.145:
            u = (th + math.pi) / TAU * .38 * 560
            col = tile(SHIRT, u + 40, (1.45 - Y) * 560)
            return col * .8 if Y < 1.16 else col
        col = SKIN_ARM * (.85 + .15 * max(N[2], 0))
        if s < 0 and .865 < Y < .885:
            col = GOLD                                                # bangle on her right wrist
        if s < 0 and Y < .79 and int((th + math.pi) / TAU * 8) == 3:
            col = GOLD * .9                                           # ring
        if Y < .785 and int((th + math.pi) / TAU * 16) % 4 == 0:
            col = col * .78
        return col
    return f

def col_foot(P, N, th):
    X, Y, Z = P
    if Y < .018:
        return SOLE
    if abs(Z - .1) < .03 or (abs(Z + .01) < .012 and Y > .04):
        return SANDAL
    return SKIN_ARM * .85

# ------------------------------------------------------------- weights
def w_column(P):
    Y = P[1]
    a = smooth(.98, 1.10, Y); b = smooth(1.14, 1.26, Y); c = smooth(1.40, 1.44, Y); d = smooth(1.47, 1.51, Y)
    out = {'hips': 1 - a, 'spine': a * (1 - b), 'chest': b * (1 - c), 'neck': c * (1 - d), 'head': d}
    for sd, s in (('L', 1), ('R', -1)):
        k = .5 * smooth(.11, .18, s * P[0]) * smooth(1.24, 1.32, Y) * smooth(1.43, 1.38, Y)
        if k > 0:
            out = {n: w * (1 - k) for n, w in out.items()}; out['upperArm' + sd] = k
    sd = 'L' if P[0] > 0 else 'R'
    k = .45 * smooth(.90, .80, Y)
    if k > 0:
        out = {n: w * (1 - k) for n, w in out.items()}; out['thigh' + sd] = k
    return out

def w_arm(sd):
    def f(P):
        Y = P[1]
        k = smooth(1.14, 1.06, Y); h = smooth(.875, .835, Y); c = .35 * smooth(1.32, 1.38, Y)
        out = {'upperArm' + sd: (1 - k) * (1 - c), 'foreArm' + sd: k * (1 - h), 'chest': c}
        if h > 0:
            out['hand' + sd] = h
        return out
    return f

def w_leg(sd):
    def f(P):
        Y = P[1]
        k = smooth(.51, .43, Y); hp = .5 * smooth(.80, .88, Y); ft = smooth(.115, .08, Y)
        return {'thigh' + sd: (1 - k) * (1 - hp) * (1 - ft), 'hips': hp * (1 - ft),
                'shin' + sd: k * (1 - ft), 'foot' + sd: ft}
    return f

PARTS = []
COLP = Part('column', COL_ROWS, 12, (0, 0, 288, 256), col_column, w_column, e=.85, cap_top=True)
COLP.lump = hair_bob
PARTS.append(COLP)
for sd, s in (('L', 1), ('R', -1)):
    PARTS.append(Part('arm' + sd, arm_rows(s), 8, (288 + (0 if s > 0 else 80), 0, 80, 256),
                      col_arm(s), w_arm(sd), e=.9, cap_bot=True))
    PARTS.append(Part('leg' + sd, leg_rows(s), 8, ((0 if s > 0 else 112), 256, 112, 160),
                      col_pants, w_leg(sd), e=.9))
    fp = foot_part(s)
    fp.region = (224 + (0 if s > 0 else 96), 256, 96, 96)
    fp.sampler = col_foot
    fp.weights = (lambda sd: (lambda P: {'foot' + sd: 1.0}))(sd)
    fp.cap_top = fp.cap_bot = True
    PARTS.append(fp)

def surface_normal(p, th, t):
    e = 1e-3
    n = np.cross(p.fn(th + e, t) - p.fn(th - e, t), p.fn(th, min(t + e, 1)) - p.fn(th, max(t - e, 0)))
    P = p.fn(th, t)
    c = np.mean([p.fn(a, t) for a in (0, 1.57, 3.14, -1.57)], axis=0); c[1] = P[1]
    if np.linalg.norm(n) < 1e-10:
        n = P - c
    n = norm(n)
    return -n if np.dot(n, P - c) < 0 else n

# ------------------------------------------------------------- build
atlas = np.zeros((AH, AW, 3)) + 40
EMI = np.zeros((AH, AW, 3))
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
    for j in range(h):
        t = 1 - (j + .5) / h
        for i in range(w):
            th = -math.pi + TAU * (i + .5) / w
            P = p.fn(th, t)
            atlas[y0 + j, x0 + i] = p.sampler(P, surface_normal(p, th, t), th)
            if p is COLP and math.cos(th) > .25 and CHIN_Y < P[1] < HAIRLINE and in_lens(*face_xy(P[0], P[1])):
                EMI[y0 + j, x0 + i] = (38, 48, 50)                     # lenses catch the light
    def uv(u, t):
        return ((x0 + .5 + u * (w - 1)) / AW, (y0 + .5 + (1 - t) * (h - 1)) / AH)
    grid = {}
    for k in range(p.nt + 1):
        t = k / p.nt
        for m in range(p.nth + 1):
            u = m / p.nth; th = -math.pi + TAU * u
            P = p.fn(th, t)
            grid[k, m] = add_vertex(P, surface_normal(p, th, t), uv(u, t), p.weights(P))
    for k in range(p.nt):
        for m in range(p.nth):
            a, b, c, d = grid[k, m], grid[k, m + 1], grid[k + 1, m], grid[k + 1, m + 1]
            tris += [(a, b, d), (a, d, c)]
    for end, on in ((1.0, p.cap_top), (0.0, p.cap_bot)):
        if on:
            ring = [p.fn(-math.pi + TAU * m / p.nth, end) for m in range(p.nth)]
            C = np.mean(ring, axis=0)
            Nc = norm(np.cross(ring[1] - ring[0], ring[2] - ring[0]))
            ci = add_vertex(C, Nc, uv(.5, end), p.weights(C))
            k = p.nt if end == 1.0 else 0
            for m in range(p.nth):
                tris.append((grid[k, m], grid[k, m + 1], ci))

positions = np.array(positions, np.float32)
normals = np.array(normals, np.float32)
uvs = np.array(uvs, np.float32)
joints = np.array(joints, np.uint8)
weights = np.array(weights, np.float32)
indices = np.array(tris, np.uint32)
fn_ = np.cross(positions[indices[:, 1]] - positions[indices[:, 0]], positions[indices[:, 2]] - positions[indices[:, 0]])
bad = (fn_ * normals[indices].sum(1)).sum(1) < 0
indices[bad] = indices[bad][:, ::-1]
indices = indices[np.linalg.norm(fn_, axis=1) > 1e-12]
assert len(indices) < 1500, len(indices)
atlas = np.round(np.clip(atlas, 0, 255) / 6) * 6
def to_png(arr):
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    b = io.BytesIO(); img.save(b, 'PNG', optimize=True)
    return b.getvalue(), img
png_base, img_base = to_png(atlas)
png_emi, _ = to_png(EMI)

# ------------------------------------------------------------- animation
def quat_axis(axis, ang):
    axis = norm(np.array(axis, float)); s = math.sin(ang / 2)
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
def qmat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])

def E(d):
    """{bone: (rx, ry, rz) degrees} -> {bone: quat}"""
    return {b: rot(D(v[0]), D(v[1]), D(v[2])) for b, v in d.items()}

def add(*ds, k=None):
    out = {}
    for i, d in enumerate(ds):
        f = 1 if k is None else k[i]
        for b, v in d.items():
            out[b] = [a + f * c for a, c in zip(out.get(b, [0, 0, 0]), v)]
    return out

STAND = {'upperArmL': [0, 0, 5], 'upperArmR': [0, 0, -5], 'foreArmL': [-12, 0, 0], 'foreArmR': [-12, 0, 0],
         'chest': [-2, 0, 0], 'head': [3, 0, 0]}
HIPS_T = J['hips'] - J['root']

def anim_idle(t, dur=4.0):
    ph = TAU * t / dur
    d = add(STAND, {'head': [0, 30 * math.sin(ph), 0], 'neck': [0, 10 * math.sin(ph), 0],
                    'chest': [1.5 * math.sin(2 * ph), 4 * math.sin(ph - .4), 0],
                    'hips': [0, 0, 1.5 * math.sin(ph)], 'thighL': [0, 0, -1.5 * math.sin(ph)],
                    'thighR': [0, 0, -1.5 * math.sin(ph)]})
    return E(d), {'hips': HIPS_T + [0, -.004 * (1 - math.cos(2 * ph)), 0]}

WALK_STRIDE, WALK_CYCLE = 1.0, 1.2
def anim_walk(t):
    ph = TAU * t / WALK_CYCLE
    s, c = math.sin(ph), math.cos(ph)
    d = add(STAND, {'thighL': [-22 * s, 0, 0], 'thighR': [22 * s, 0, 0],
                    'shinL': [6 + 34 * max(math.sin(ph + 1.9), 0), 0, 0],
                    'shinR': [6 + 34 * max(math.sin(ph + 1.9 + math.pi), 0), 0, 0],
                    'footL': [-8 * math.sin(ph + .6), 0, 0], 'footR': [8 * math.sin(ph + .6), 0, 0],
                    'upperArmL': [14 * s, 0, 0], 'upperArmR': [-14 * s, 0, 0],
                    'foreArmL': [-6 - 8 * max(s, 0), 0, 0], 'foreArmR': [-6 - 8 * max(-s, 0), 0, 0],
                    'hips': [2, 4 * s, 2 * c], 'spine': [1, -3 * s, -1 * c], 'chest': [0, -2 * s, 0],
                    'head': [0, 2 * s, 0]})
    return E(d), {'hips': HIPS_T + [0, (abs(c) - .6) * .03, 0]}

def anim_look(t, dur=3.0):
    ph = TAU * t / dur
    turn = 55 * math.sin(ph) ** 3                                      # dwell at each side
    d = add(STAND, {'head': [6, turn * .6, 0], 'neck': [0, turn * .25, 0], 'chest': [0, turn * .15, 0],
                    'spine': [0, turn * .08, 0], 'upperArmL': [0, 0, 2], 'upperArmR': [0, 0, -2]})
    return E(d), {}

POINT = {'upperArmR': [-88, 0, 8], 'foreArmR': [-4, 0, 0], 'handR': [0, 0, 0], 'chest': [0, -4, 0],
         'spine': [0, -2, 0], 'head': [0, 4, 0], 'neck': [-4, 6, 0]}
SUMMON = {'upperArmL': [-10, 0, 155], 'foreArmL': [-20, 0, 0], 'handL': [0, 0, 10], 'chest': [-8, 0, 0],
          'head': [-24, 0, 0], 'neck': [-8, 0, 0]}

def anim_spot(t):
    s = lambda a, b: smooth(a, b, t)
    freeze = s(0, .08)
    snap = s(.10, .16)                                                 # head snaps to you
    pt = s(.30, .55)
    up = s(.7, .95) * (1 - .6 * s(1.5, 1.9))                           # arm flung up, calling them
    shake = s(.75, .85) * (1 - s(1.6, 1.95))
    d = add(STAND, {'head': [-6, 0, 0], 'chest': [-3, 0, 0]}, {'head': [0, 0, 0]}, POINT, SUMMON,
            {'head': [5 * math.sin(TAU * 9 * t), 6 * math.sin(TAU * 7 * t), 0]},
            k=[1, freeze, snap, pt, up, shake])
    return E(d), {'hips': HIPS_T + [0, -.02 * s(.7, .9) * (1 - s(1.4, 1.9)), 0]}

def anim_point(t, dur=2.0):
    ph = TAU * t / dur
    d = add(STAND, POINT, {'upperArmR': [1.5 * math.sin(TAU * 6 * t / dur * 4), 0, 0],
                           'head': [2 * math.sin(ph), 3 * math.sin(2 * ph), 4 * math.sin(ph)],
                           'chest': [1.5 * math.sin(2 * ph), 0, 0]})
    return E(d), {}

def clip(fn, dur, n):
    times = [dur * k / n for k in range(n + 1)]
    return times, [fn(min(tt, dur)) for tt in times]

ANIMS = [('Idle',) + clip(anim_idle, 4.0, 60), ('Walk',) + clip(anim_walk, WALK_CYCLE, 24),
         ('LookAround',) + clip(anim_look, 3.0, 60), ('Spot',) + clip(anim_spot, 2.0, 60),
         ('Point',) + clip(anim_point, 2.0, 60)]

def fk(local, hip=None):
    Rw, Pw = {}, {}
    for b in BONES:
        R = qmat(local.get(b, [0, 0, 0, 1]))
        if PARENT[b] is None:
            Rw[b], Pw[b] = R, J[b].copy()
        else:
            p_ = PARENT[b]
            Pw[b] = (Pw[p_] + Rw[p_] @ np.array(hip, float)) if (b == 'hips' and hip is not None) else Pw[p_] + Rw[p_] @ (J[b] - J[p_])
            Rw[b] = Rw[p_] @ R
    return Rw, Pw

# ------------------------------------------------------------- GLB writer
buf = bytearray(); views, accs = [], []
def add_view(data, target=None):
    while len(buf) % 4:
        buf.append(0)
    off = len(buf); buf.extend(data)
    v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
    if target:
        v['target'] = target
    views.append(v); return len(views) - 1
def add_acc(arr, ctype, typ, target=None, minmax=False):
    arr = np.ascontiguousarray(arr)
    a = {'bufferView': add_view(arr.tobytes(), target), 'componentType': ctype, 'count': int(arr.shape[0]), 'type': typ}
    if minmax:
        a['min'] = [float(v) for v in arr.reshape(arr.shape[0], -1).min(0)]
        a['max'] = [float(v) for v in arr.reshape(arr.shape[0], -1).max(0)]
    accs.append(a); return len(accs) - 1
ARR, ELE, FLOAT, U8, U16 = 34962, 34963, 5126, 5121, 5123
f32 = lambda a: np.asarray(a, np.float32)
prim = {'attributes': {'POSITION': add_acc(positions, FLOAT, 'VEC3', ARR, True),
                       'NORMAL': add_acc(normals, FLOAT, 'VEC3', ARR),
                       'TEXCOORD_0': add_acc(uvs, FLOAT, 'VEC2', ARR),
                       'JOINTS_0': add_acc(joints, U8, 'VEC4', ARR),
                       'WEIGHTS_0': add_acc(weights, FLOAT, 'VEC4', ARR)},
        'indices': add_acc(indices.reshape(-1).astype(np.uint16), U16, 'SCALAR', ELE), 'material': 0}
nodes = [{'name': 'DrZoya', 'children': [1, 2]}, {'name': 'DrZoyaMesh', 'mesh': 0, 'skin': 0}]
NODE = {b: 2 + i for i, b in enumerate(BONES)}
for b in BONES:
    nd = {'name': b, 'translation': [float(v) for v in (J[b] - (J[PARENT[b]] if PARENT[b] else 0))]}
    kids = [NODE[c] for c in BONES if PARENT[c] == b]
    if kids:
        nd['children'] = kids
    nodes.append(nd)
ibm = []
for b in BONES:
    m = np.eye(4, dtype=np.float32); m[:3, 3] = -J[b]; ibm.append(m.T.reshape(-1))
a_ibm = add_acc(np.array(ibm, np.float32), FLOAT, 'MAT4')
animations = []
for name, times, frames in ANIMS:
    t_acc = add_acc(f32(times), FLOAT, 'SCALAR', minmax=True)
    ch, sm = [], []
    for b in BONES:
        q = np.array([f[0].get(b, [0, 0, 0, 1]) for f in frames], np.float64)
        if not np.allclose(q, [0, 0, 0, 1]):
            for k in range(1, len(q)):
                if np.dot(q[k], q[k - 1]) < 0:
                    q[k] = -q[k]
            sm.append({'input': t_acc, 'output': add_acc(f32(q), FLOAT, 'VEC4'), 'interpolation': 'LINEAR'})
            ch.append({'sampler': len(sm) - 1, 'target': {'node': NODE[b], 'path': 'rotation'}})
    tr = np.array([f[1].get('hips', HIPS_T) for f in frames])
    sm.append({'input': t_acc, 'output': add_acc(f32(tr), FLOAT, 'VEC3'), 'interpolation': 'LINEAR'})
    ch.append({'sampler': len(sm) - 1, 'target': {'node': NODE['hips'], 'path': 'translation'}})
    animations.append({'name': name, 'channels': ch, 'samplers': sm})
img0, img1 = add_view(png_base), add_view(png_emi)
gltf = {
    'asset': {'version': '2.0', 'generator': 'zoya.py (Manju Mania)'},
    'scene': 0, 'scenes': [{'name': 'DrZoya', 'nodes': [0]}], 'nodes': nodes,
    'meshes': [{'name': 'DrZoya', 'primitives': [prim]}],
    'skins': [{'name': 'DrZoyaRig', 'joints': [NODE[b] for b in BONES], 'inverseBindMatrices': a_ibm,
               'skeleton': NODE['root']}],
    'materials': [{'name': 'DrZoya', 'doubleSided': True, 'emissiveFactor': [1, 1, 1], 'emissiveTexture': {'index': 1},
                   'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicFactor': 0.0, 'roughnessFactor': 1.0}}],
    'samplers': [{'magFilter': 9728, 'minFilter': 9728, 'wrapS': 33071, 'wrapT': 33071}],
    'images': [{'bufferView': img0, 'mimeType': 'image/png', 'name': 'zoya_albedo'},
               {'bufferView': img1, 'mimeType': 'image/png', 'name': 'zoya_emissive'}],
    'textures': [{'sampler': 0, 'source': 0}, {'sampler': 0, 'source': 1}],
    'animations': animations, 'accessors': accs, 'bufferViews': views,
}
while len(buf) % 4:
    buf.append(0)
gltf['buffers'] = [{'byteLength': len(buf)}]
js = json.dumps(gltf, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(OUT_DIR, 'zoya.glb')
with open(out, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(buf)))
    f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
    f.write(struct.pack('<II', len(buf), 0x004E4942)); f.write(buf)
img_base.save(os.path.join(os.path.dirname(os.path.abspath(out)), 'zoya_albedo.png'))
print(f'{out}: {H:.2f} m, {len(positions)} verts, {len(indices)} tris, {len(BONES)} bones, '
      f'{len(ANIMS)} anims, {os.path.getsize(out) / 1024:.0f} KB')

# ------------------------------------------------------------- profile sheet
def render(pose, view, size, scale, center, light=(.4, .6, .7)):
    W, Hh = size
    if pose is None:
        V = positions.astype(np.float64)
    else:
        loc, tr = pose
        Rw, Pw = fk(loc, tr.get('hips'))
        V = np.zeros((len(positions), 3))
        for k in range(4):
            for bi, b in enumerate(BONES):
                m = joints[:, k] == bi
                if m.any():
                    V[m] += weights[m, k, None] * ((positions[m] - J[b]) @ Rw[b].T + Pw[b])
    yaw = D(view)
    Ry = np.array([[math.cos(yaw), 0, math.sin(yaw)], [0, 1, 0], [-math.sin(yaw), 0, math.cos(yaw)]])
    Vc = (V - center) @ Ry.T
    sx = W / 2 + Vc[:, 0] * scale; sy = Hh / 2 - Vc[:, 1] * scale; sz = Vc[:, 2]
    img = np.zeros((Hh, W, 3)); zb = np.full((Hh, W), -1e9); mask = np.zeros((Hh, W), bool)
    L = norm(np.array(light))
    for a, b, c in indices:
        xs, ys = np.array([sx[a], sx[b], sx[c]]), np.array([sy[a], sy[b], sy[c]])
        x0, x1 = max(int(xs.min()), 0), min(int(xs.max()) + 1, W - 1)
        y0, y1 = max(int(ys.min()), 0), min(int(ys.max()) + 1, Hh - 1)
        if x0 > x1 or y0 > y1:
            continue
        den = (ys[1] - ys[2]) * (xs[0] - xs[2]) + (xs[2] - xs[1]) * (ys[0] - ys[2])
        if abs(den) < 1e-9:
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + .5, np.arange(y0, y1 + 1) + .5)
        w0 = ((ys[1] - ys[2]) * (gx - xs[2]) + (xs[2] - xs[1]) * (gy - ys[2])) / den
        w1 = ((ys[2] - ys[0]) * (gx - xs[2]) + (xs[0] - xs[2]) * (gy - ys[2])) / den
        w2 = 1 - w0 - w1
        inside = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
        if not inside.any():
            continue
        z = w0 * sz[a] + w1 * sz[b] + w2 * sz[c]
        sub = zb[y0:y1 + 1, x0:x1 + 1]
        win = inside & (z > sub)
        if not win.any():
            continue
        u = w0 * uvs[a, 0] + w1 * uvs[b, 0] + w2 * uvs[c, 0]
        v = w0 * uvs[a, 1] + w1 * uvs[b, 1] + w2 * uvs[c, 1]
        tc = atlas[np.clip((v * AH).astype(int), 0, AH - 1), np.clip((u * AW).astype(int), 0, AW - 1)]
        n_ = norm(np.cross(Vc[b] - Vc[a], Vc[c] - Vc[a]))
        sub[win] = z[win]
        img[y0:y1 + 1, x0:x1 + 1][win] = tc[win] * (.55 + .45 * abs(np.dot(n_, L)))
        mask[y0:y1 + 1, x0:x1 + 1][win] = True
    return img, mask

def font(sz, bold=False):
    for f in ('/System/Library/Fonts/Supplemental/Courier New Bold.ttf' if bold else
              '/System/Library/Fonts/Supplemental/Courier New.ttf', '/System/Library/Fonts/Menlo.ttc'):
        if os.path.exists(f):
            return ImageFont.truetype(f, sz)
    return ImageFont.load_default()

SW, SH = 1880, 760
sheet = Image.new('RGB', (SW, SH), (24, 22, 22))
dr = ImageDraw.Draw(sheet)
RED, PALE, DIM = (200, 40, 34), (222, 214, 196), (140, 132, 120)
dr.text((40, 26), NAME, fill=RED, font=font(52, True))
dr.text((44, 88), 'MANJU MANIA  //  CHARACTER PROFILE  //  FIRST FLOOR', fill=DIM, font=font(20))
px0, py0, pw, ph_ = 40, 130, 236, 520
SC = 290
panels = [('REFERENCE', None), ('FRONT', (None, 0)), ('SIDE', (None, 90)), ('WALK', (anim_walk(.15), 30)),
          ('SUMMON', (anim_spot(1.2), 25))]
for i, (label, spec) in enumerate(panels):
    x = px0 + i * (pw + 14)
    dr.rectangle([x, py0, x + pw, py0 + ph_], fill=(52, 50, 50), outline=(80, 76, 72))
    if spec is None:
        a = Image.open(os.path.join(REF, 'zoya_face.png')).convert('RGB').crop((150, 180, 650, 820))
        a.thumbnail((pw - 8, 250))
        b = Image.open(os.path.join(REF, 'zoya_full.png')).convert('RGB').crop((40, 180, 440, 1300))
        b.thumbnail((pw - 8, ph_ - 12 - a.height))
        sheet.paste(a, (x + (pw - a.width) // 2, py0 + 4))
        sheet.paste(b, (x + (pw - b.width) // 2, py0 + 8 + a.height))
    else:
        pose, view = spec
        im, m = render(pose, view, (pw, ph_), SC, np.array([0, H / 2 + .02, 0]))
        bg = np.array(sheet.crop((x, py0, x + pw, py0 + ph_))).astype(float)
        bg[m] = im[m]
        sheet.paste(Image.fromarray(bg.astype(np.uint8)), (x, py0))
    dr.text((x + 8, py0 + ph_ + 8), label, fill=PALE, font=font(18, True))
fx = px0 + pw + 14
for k in range(0, 19):
    yy = py0 + ph_ / 2 - (k * .1 - (H / 2 + .02)) * SC
    if py0 < yy < py0 + ph_:
        dr.line([(fx + 4, yy), (fx + (16 if k % 5 == 0 else 9), yy)], fill=DIM)
        if k % 5 == 0:
            dr.text((fx + 18, yy - 7), f'{k / 10:.1f}m', fill=DIM, font=font(12))

TX = 40 + 5 * (pw + 14) + 10
y = 130
def block(title, lines, gap=10):
    global y
    dr.text((TX, y), title, fill=RED, font=font(20, True)); y += 28
    for ln in lines:
        dr.text((TX, y), ln, fill=PALE, font=font(16)); y += 21
    y += gap
block('VITALS', [f'Height        {H:.2f} m  (5\'8")',
                 'Speed         slow, measured patrol walk',
                 'Damage        none herself',
                 'Ability       SUMMONS the others on sight',
                 'Territory     FIRST FLOOR ONLY'])
block('BEHAVIOUR', ['Patrols the first-floor corridors, stopping',
                    'to scan left and right. The moment she sees',
                    'you she freezes, snaps her head round, points',
                    'straight at you and throws her arm up to call',
                    'Manju and the others to your position - then',
                    'keeps pointing until they arrive.'])
block('LOOK', ['Short black bob swept across the forehead,',
               'tinted rimless glasses that catch the light,',
               'pearl studs, thin gold chain with a pendant.',
               'White tropical leaf-print shirt, V-neck, half',
               'sleeves; pale grey-green capris; gold bangle.'])
block('MODEL', ['public/models/zoya.glb  (1 texture, 512 px)',
                f'{len(indices)} tris, 18 bones (same names as Manju)',
                'Idle 4s  Walk 1.2s  LookAround 3s',
                'Spot 2.0s (one-shot) -> Point 2s loop',
                f'Walk stride {WALK_STRIDE:.2f} m per cycle = '
                f'{WALK_STRIDE / WALK_CYCLE:.2f} m/s'])
sheet.save(os.path.join(REF, 'zoya_profile.png'))
print('profile:', os.path.join(REF, 'zoya_profile.png'))
