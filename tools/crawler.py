#!/usr/bin/env python3
"""Builds Mutty (Manju Mania's first-floor crawler) as a low-poly rigged GLB, plus his
character profile sheet, from the reference photo tools/ref/crawler_photo.jpg.

    python3 tools/crawler.py        -> public/models/crawler.glb
                                       public/models/crawler_albedo.png
                                       tools/ref/crawler_profile.png

Same design principles as tools/manju.py: every body part is a stack of horizontal rings
(proportions measured from the photo), the photo itself is baked into one 512x512 atlas
sampled NEAREST (face projected from the photo, shirt / sleeves / jeans / sandals tiled from
patches of the photo), under 1500 triangles, the same 18-bone rig and bone names as Manju.
Very short (1.18 m standing), buck teeth sticking out of the grin, eyes that catch the light.
Faces +Z, Y up, L = +X. Animations (all in place):
  Idle      - crouched on all fours, twitching head (3 s loop)
  Crawl     - very fast diagonal-pair scuttle, 0.30 s cycle, CRAWL_STRIDE m per cycle
  Attack    - pounce up to face height, bite, drop back (0.9 s, ends where it starts)
  StandIdle - standing like the photo, grinning (4 s loop)
"""
import io, json, math, os, struct, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

NAME = 'MUTTY'
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

# ------------------------------------------------------------- reference photo
IMG = np.array(Image.open(os.path.join(REF, 'crawler_photo.jpg')).convert('RGB')).astype(np.float64)
def px(x, y):
    return IMG[int(np.clip(round(y), 0, IMG.shape[0] - 1)), int(np.clip(round(x), 0, IMG.shape[1] - 1))]

def patch(x0, y0, x1, y1):
    return IMG[y0:y1, x0:x1]

SHIRT = patch(248, 498, 392, 590)      # clean lower shirt, dusty stains
SLEEVE = patch(306, 402, 408, 450)     # crumpled rolled sleeve
JEANS = patch(320, 640, 372, 860)      # jeans with dark wet stains
HAIR = patch(286, 128, 344, 150)
SKIN = patch(316, 200, 336, 212).reshape(-1, 3).mean(0)
SKIN_DK = SKIN * .8
HAND = patch(240, 386, 262, 404).reshape(-1, 3).mean(0)
SOLE = patch(300, 1036, 380, 1046).reshape(-1, 3).mean(0)
STRAP = patch(320, 992, 352, 1004).reshape(-1, 3).mean(0)

def tile(pt, u, v):
    """Mirror-tile a photo patch; u, v in patch pixels."""
    h, w = pt.shape[:2]
    def m(a, n):
        a = int(math.floor(a)) % (2 * n)
        return a if a < n else 2 * n - 1 - a
    return pt[m(v, h), m(u, w)]

# face: photo pixel anchors for model X / Y on the front of the head
FACE_X = [(-.070, 268), (-.031, 277), (0, 296), (.031, 310), (.070, 348)]
FACE_Y = [(1.195, 140), (1.175, 152), (1.12, 196), (1.095, 215), (1.077, 230), (1.045, 254), (1.03, 262)]

# ------------------------------------------------------------- skeleton
J = {}; PARENT = {}
def bone(name, pos, parent=None):
    J[name] = np.array(pos, float); PARENT[name] = parent
bone('root', (0, 0, 0))
bone('hips', (0, .62, 0), 'root')
bone('spine', (0, .73, 0), 'hips')
bone('chest', (0, .84, 0), 'spine')
bone('neck', (0, .935, -.005), 'chest')
bone('head', (0, .98, 0), 'neck')
for sd, s in (('L', 1), ('R', -1)):
    bone('upperArm' + sd, (s * .150, .915, 0), 'chest')
    bone('foreArm' + sd, (s * .186, .72, 0), 'upperArm' + sd)
    bone('hand' + sd, (s * .198, .545, .01), 'foreArm' + sd)
    bone('thigh' + sd, (s * .072, .58, 0), 'hips')
    bone('shin' + sd, (s * .075, .335, .005), 'thigh' + sd)
    bone('foot' + sd, (s * .077, .07, -.01), 'shin' + sd)
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

# Head + neck + torso + pelvis. (Y, cx, cz, rx, zf, zb). Measured from the photo, scaled so
# he stands 1.18 m: a big curly-haired head on a slight body.
DY = -.065   # the head rows were laid out for a 1.245 m figure; shift to the final height
COL_ROWS = [(.545, 0, 0, .115, .082, .082), (.585, 0, 0, .135, .09, .088), (.625, 0, 0, .142, .092, .088),
            (.68, 0, 0, .136, .09, .086), (.75, 0, 0, .13, .092, .085), (.82, 0, .005, .135, .097, .087),
            (.875, 0, .005, .142, .095, .087), (.908, 0, 0, .12, .082, .078), (.935, 0, -.004, .06, .058, .054)]
for Y, rx, zf, zb in ((1.025, .052, .052, .052), (1.045, .056, .074, .052), (1.077, .066, .084, .074),
                      (1.095, .068, .089, .085), (1.12, .07, .084, .09), (1.15, .075, .085, .097),
                      (1.175, .085, .088, .104), (1.20, .088, .084, .104), (1.225, .08, .07, .09),
                      (1.24, .06, .05, .066), (1.249, .034, .028, .038)):
    COL_ROWS.append((Y + DY, 0, .006, rx, zf, zb))
H = COL_ROWS[-1][0]
FACE_X = [(x, p) for x, p in FACE_X]
FACE_Y = [(y + DY, p) for y, p in FACE_Y]
HAIRLINE, MOUTH_Y, CHIN_Y = 1.175 + DY, 1.077 + DY, 1.045 + DY

def arm_rows(s):
    r = [(.93, .136, 0, .038, .042, .042), (.90, .154, 0, .05, .053, .053), (.845, .166, 0, .05, .052, .052),
         (.78, .177, 0, .048, .048, .048), (.72, .186, 0, .046, .046, .046), (.655, .191, .004, .044, .044, .044),
         (.585, .196, .008, .042, .042, .042), (.565, .197, .009, .038, .038, .038),
         (.55, .198, .01, .027, .029, .029), (.52, .199, .012, .02, .038, .038), (.485, .199, .014, .019, .036, .036),
         (.455, .199, .016, .014, .024, .024)]
    return [(Y, s * cx, cz, rx, zf, zb) for Y, cx, cz, rx, zf, zb in r]

def leg_rows(s):
    r = [(.60, .068, 0, .072, .078, .078), (.545, .072, 0, .07, .073, .073), (.47, .074, 0, .064, .066, .066),
         (.395, .075, .003, .058, .059, .059), (.335, .075, .006, .053, .055, .055), (.26, .075, .002, .05, .05, .05),
         (.17, .076, -.004, .046, .046, .046), (.105, .077, -.01, .049, .05, .05), (.08, .077, -.01, .042, .045, .045)]
    return [(Y, s * cx, cz, rx, zf, zb) for Y, cx, cz, rx, zf, zb in r]

def foot_part(s):
    cx = s * .078
    z0, z1 = -.06, .165
    def fn(th, t):
        z = z0 + t * (z1 - z0)
        h = interp(z, [(-.06, .055), (-.02, .085), (.03, .07), (.09, .04), (.14, .03), (.165, .018)])
        w = .046 * (.62 + .38 * math.sin(min(t, .999) * math.pi) ** .4) * (1 + .12 * smooth(.04, .12, z))
        sn, cs = math.sin(th), math.cos(th)
        x = w * math.copysign(abs(sn) ** .7, sn)
        y = h * (.5 + .5 * math.copysign(abs(cs) ** .7, cs))
        return np.array([cx + x, y, z])
    p = Part('foot' + ('L' if s > 0 else 'R'), [(0,) * 6] * 2, 8, None, None, None)
    p.fn = fn; p.nt = 6
    return p

def hair_lump(th, Y):
    """Curly hair: bumpy outline above the hairline, everywhere but the face."""
    k = smooth(HAIRLINE - .035, HAIRLINE + .005, Y)
    front = max(math.cos(th), 0) ** 2 * (1 - smooth(HAIRLINE - .01, HAIRLINE + .02, Y))
    n = math.sin(th * 5 + Y * 140) * .5 + math.sin(th * 3 - Y * 90 + 1.3) * .5
    return 1 + k * (1 - front) * .07 * n

# ------------------------------------------------------------- samplers
def is_bg(c):
    return (c[0] > 1.6 * c[1] and c[0] > 80) or c.mean() > 160      # red wall / white wall

def face_col(X, Y):
    k = interp(Y, [(CHIN_Y - .02, .55), (CHIN_Y, .62), (MOUTH_Y, .85), (MOUTH_Y + .02, 1.0)])  # jaw narrows
    c = px(296 + (interp(X, FACE_X) - 296) * k, interp(Y, FACE_Y))
    return SKIN * (.8 + .2 * min(c.mean() / SKIN.mean(), 1.2)) if is_bg(c) else c

def col_column(P, N, th):
    X, Y, Z = P
    c = math.cos(th)
    if Y > .935:                                    # neck + head
        if Y >= HAIRLINE + .012 or (Y > HAIRLINE - .045 and c < .2) or (c < -.25 and Y > CHIN_Y):
            u = (th + math.pi) / TAU * 110
            col = tile(HAIR, u * 1.3, (H - Y) * 520)
            return col * (.85 + .15 * math.sin(u * 2.1 + Y * 400))
        if c > .45 and Y > CHIN_Y - .012:
            return face_col(X, Y)
        if Y > CHIN_Y - .012:                       # cheeks / ears: the photo's face edge
            edge = (FACE_X[-1][1] - 3) if X > 0 else (FACE_X[0][1] + 3)
            col = px(edge, interp(Y, FACE_Y))
            return SKIN * .9 if is_bg(col) else col
        if Y > .965:
            return SKIN_DK * (.9 + .1 * c)          # neck
    # shirt
    if Y < .585:
        return col_jeans(P, N, th)
    u = (th + math.pi) / TAU * .78 * 330
    col = tile(SHIRT, u, (1 - Y) * 330).copy()
    if .935 < Y or (.9 < Y and abs(X) < .07):      # standing collar
        col = col * 1.06
        if Y > .955 or (Y > .925 and abs(abs(X) - .05) < .006):
            col = col * .72
    if c > .7 and abs(X) < .006 and Y < .93:       # placket seam + buttons
        col = col * .82
        for by in (.90, .835, .77, .705, .64):
            if abs(Y - by) < .006:
                col = np.array([62, 64, 74.0])
    if Y < .597:
        col = col * .78                            # hem shadow
    return col

def col_jeans(P, N, th):
    X, Y, Z = P
    u = (th + math.pi) / TAU * .38 * 330
    col = tile(JEANS, u, (.8 - Y) * 300)
    if Y < .11:
        col = col * (.85 + .15 * math.sin(th * 4 + Y * 300))   # bunched hem
    return col

def col_arm(s):
    def f(P, N, th):
        X, Y, Z = P
        if Y > .565:
            u = (th + math.pi) / TAU * .3 * 330
            col = tile(SLEEVE, u, (1 - Y) * 330)
            return col * .82 if Y < .58 else col
        k = .82 + .18 * max(N[2], 0)
        col = HAND * k
        if Y < .47 and (int((th + math.pi) / TAU * 16) % 4 == 0):
            col = col * .75                        # finger gaps
        return col
    return f

def col_foot(P, N, th):
    X, Y, Z = P
    if Y < .02:
        return SOLE * (.8 if N[1] < -.5 else 1.0)
    for zc, wd in ((-.01, .018), (.075, .022)):
        if abs(Z - zc) < wd:
            return STRAP * (.9 + .1 * math.sin(X * 600))
    if Z > .135:
        return HAND * .7 if int(X * 900) % 3 else HAND * .5   # toes
    return SKIN_DK * .95

# ------------------------------------------------------------- weights
def w_column(P):
    Y = P[1]
    a = smooth(.66, .76, Y); b = smooth(.79, .87, Y); c = smooth(.92, .95, Y); d = smooth(.965, .99, Y)
    out = {'hips': 1 - a, 'spine': a * (1 - b), 'chest': b * (1 - c), 'neck': c * (1 - d), 'head': d}
    for sd, s in (('L', 1), ('R', -1)):
        k = .5 * smooth(.075, .13, s * P[0]) * smooth(.80, .86, Y) * smooth(.95, .91, Y)
        if k > 0:
            out = {n: w * (1 - k) for n, w in out.items()}; out['upperArm' + sd] = k
    sd = 'L' if P[0] > 0 else 'R'
    k = .4 * smooth(.64, .55, Y)
    if k > 0:
        out = {n: w * (1 - k) for n, w in out.items()}; out['thigh' + sd] = k
    return out

def w_arm(sd):
    def f(P):
        Y = P[1]
        k = smooth(.76, .69, Y); h = smooth(.565, .535, Y); c = .35 * smooth(.88, .93, Y)
        out = {'upperArm' + sd: (1 - k) * (1 - c), 'foreArm' + sd: k * (1 - h), 'chest': c}
        if h > 0:
            out['hand' + sd] = h
        return out
    return f

def w_leg(sd):
    def f(P):
        Y = P[1]
        k = smooth(.37, .30, Y); hp = .5 * smooth(.55, .62, Y); ft = smooth(.11, .075, Y)
        return {'thigh' + sd: (1 - k) * (1 - hp) * (1 - ft), 'hips': hp * (1 - ft),
                'shin' + sd: k * (1 - ft), 'foot' + sd: ft}
    return f

PARTS = []
COLP = Part('column', COL_ROWS, 12, (0, 0, 288, 256), col_column, w_column, e=.85, cap_top=True)
COLP.lump = hair_lump
PARTS.append(COLP)
for sd, s in (('L', 1), ('R', -1)):
    PARTS.append(Part('arm' + sd, arm_rows(s), 8, (288 + (0 if s > 0 else 80), 0, 80, 256),
                      col_arm(s), w_arm(sd), e=.9, cap_bot=True))
    PARTS.append(Part('leg' + sd, leg_rows(s), 8, ((0 if s > 0 else 112), 256, 112, 160),
                      col_jeans, w_leg(sd), e=.9))
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
            atlas[y0 + j, x0 + i] = p.sampler(p.fn(th, t), surface_normal(p, th, t), th)
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

# buck teeth: a big protruding upper row and a small lower row, skinned to the head
TEETH_UV = (448, 0, 64, 32)
def zfront(Y):
    rows = np.array(COL_ROWS)
    return float(np.interp(Y, rows[:, 0], rows[:, 4] + rows[:, 2]))

def box(c, size, pitch, uvr):
    x0, y0, w, h = uvr
    hx, hy, hz = np.array(size) / 2
    R = np.array([[1, 0, 0], [0, math.cos(pitch), -math.sin(pitch)], [0, math.sin(pitch), math.cos(pitch)]])
    faces = [((0, 0, 1), (1, 0, 0), (0, 1, 0)), ((0, 0, -1), (-1, 0, 0), (0, 1, 0)), ((1, 0, 0), (0, 0, -1), (0, 1, 0)),
             ((-1, 0, 0), (0, 0, 1), (0, 1, 0)), ((0, 1, 0), (1, 0, 0), (0, 0, -1)), ((0, -1, 0), (1, 0, 0), (0, 0, 1))]
    for n, a, b in faces:
        n, a, b = np.array(n, float), np.array(a, float), np.array(b, float)
        ext = np.abs(a) @ [hx, hy, hz], np.abs(b) @ [hx, hy, hz]
        ctr = n * (np.abs(n) @ [hx, hy, hz])
        ids = []
        for su, sv in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            P = c + R @ (ctr + a * su * ext[0] + b * sv * ext[1])
            uvp = ((x0 + .5 + (w - 1) * (su + 1) / 2) / AW, (y0 + .5 + (h - 1) * (1 - sv) / 2) / AH)
            if n[2] < .5:   # sides / back / top use the plain enamel strip
                uvp = ((x0 + 2) / AW, (y0 + h * .5) / AH)
            ids.append(add_vertex(P, R @ n, uvp, {'head': 1.0}))
        tris.extend([(ids[0], ids[1], ids[2]), (ids[0], ids[2], ids[3])])

ty = MOUTH_Y + .002
box(np.array([0, ty - .002, zfront(ty) + .006]), (.044, .02, .026), D(28), TEETH_UV)
box(np.array([0, ty - .019, zfront(ty - .019) - .004]), (.032, .012, .016), D(-8), (448, 32, 64, 16))
x0, y0, w, h = TEETH_UV
for j in range(48):
    for i in range(64):
        v = j / 32
        if j < 32:
            edge = [0, 10, 22, 32, 42, 54, 64]                    # big middle incisors
            gap = any(abs(i - e) < 1.5 for e in edge)
            col = np.array([226, 214, 178.0]) * (1 - .3 * smooth(.6, 1, v))
            if gap or (j > 26 and (i % 10) in (0, 1, 9)):
                col = np.array([58, 36, 32.0])                    # dark gaps, chipped tips
            if j < 4:
                col = np.array([150, 70, 70.0])                   # gum line
            if (i * 7 + j * 3) % 11 == 0:
                col = col * .88                                   # stains
        else:
            col = np.array([206, 196, 160.0]) * (.8 if i % 8 == 0 else 1.0)
        atlas[y0 + j, x0 + i] = col

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

# eyes catch the light: emissive glints where the photo's eye whites are
EMI = np.zeros((AH, AW, 3))
cx0, cy0, cw, ch = COLP.region
for ex, ey in ((276, 196), (310, 195)):
    for j in range(ch):
        t = 1 - (j + .5) / ch
        for i in range(cw):
            th = -math.pi + TAU * (i + .5) / cw
            if math.cos(th) < .45:
                continue
            P = COLP.fn(th, t)
            if P[1] < CHIN_Y or P[1] > HAIRLINE:
                continue
            if abs(interp(P[0], FACE_X) - ex) < 3.2 and abs(interp(P[1], FACE_Y) - ey) < 2.2:
                c_ = atlas[cy0 + j, cx0 + i]
                if c_.mean() > 95:
                    EMI[cy0 + j, cx0 + i] = (150, 140, 110)
atlas = np.round(np.clip(atlas, 0, 255) / 6) * 6
def to_png(arr):
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    b = io.BytesIO(); img.save(b, 'PNG', optimize=True)
    return b.getvalue(), img
png_base, img_base = to_png(atlas)
png_emi, _ = to_png(EMI)

# ------------------------------------------------------------- pose tools
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
def mat2q(m):
    t = np.trace(m)
    if t > 0:
        s = math.sqrt(t + 1) * 2
        q = [(m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s, s / 4]
    else:
        i = int(np.argmax(np.diag(m)))
        j, k = (i + 1) % 3, (i + 2) % 3
        s = math.sqrt(1 + m[i, i] - m[j, j] - m[k, k]) * 2
        q = [0, 0, 0, 0]
        q[i] = s / 4; q[j] = (m[j, i] + m[i, j]) / s; q[k] = (m[k, i] + m[i, k]) / s
        q[3] = (m[k, j] - m[j, k]) / s
    q = np.array(q); return list(q / np.linalg.norm(q))
def eul(rx=0, ry=0, rz=0):
    return qmat(rot(D(rx), D(ry), D(rz)))

def fk(local, hip_pos=None):
    Rw, Pw = {}, {}
    for b in BONES:
        R = qmat(local.get(b, [0, 0, 0, 1]))
        if PARENT[b] is None:
            Rw[b], Pw[b] = R, J[b].copy()
        else:
            p_ = PARENT[b]
            T = J[b] - J[p_]
            if b == 'hips' and hip_pos is not None:
                Pw[b] = np.array(hip_pos, float)
            else:
                Pw[b] = Pw[p_] + Rw[p_] @ T
            Rw[b] = Rw[p_] @ R
    return Rw, Pw

def frame(u, p):
    u = norm(u); p = norm(p - u * np.dot(p, u))
    return np.column_stack([u, p, np.cross(u, p)])

def ik_limb(local, Rw, Pw, up, lo, end, target, pole, end_world, rest_pole):
    """Two-bone IK: set local rotations of up/lo/end so the end joint reaches target."""
    S = Pw[up]; a = np.linalg.norm(J[lo] - J[up]); b = np.linalg.norm(J[end] - J[lo])
    d = target - S; dist = float(np.clip(np.linalg.norm(d), 1e-4, (a + b) * .999)); dh = norm(d)
    ca = np.clip((a * a + dist * dist - b * b) / (2 * a * dist), -1, 1)
    pp = norm(pole - dh * np.dot(pole, dh))
    E = S + a * (ca * dh + math.sqrt(1 - ca * ca) * pp)
    T = S + dh * dist
    u0 = norm(J[lo] - J[up]); l0 = norm(J[end] - J[lo])
    Ru = frame(E - S, pole) @ frame(u0, rest_pole).T
    Rl = frame(T - E, pole) @ frame(l0, rest_pole).T
    Rp = Rw[PARENT[up]]
    local[up] = mat2q(Rp.T @ Ru); local[lo] = mat2q(Ru.T @ Rl); local[end] = mat2q(Rl.T @ end_world)

HAND_FLAT = {'L': eul(0, 0, 90) @ eul(-90, 0, 0), 'R': eul(0, 0, -90) @ eul(-90, 0, 0)}

def crawl_body(hip_y=.33, pitch=80, yaw=0, roll=0, head=(0, 0, 0), hip_z=0.0, spine=(10, 0, 0), chest=(8, 0, 0)):
    local = {'hips': rot(D(pitch), D(yaw), D(roll)), 'spine': rot(*map(D, spine)), 'chest': rot(*map(D, chest))}
    body = pitch + spine[0] + chest[0]
    local['neck'] = rot(D(-body * .45))
    local['head'] = rot(D(-body * .55 + head[0] - 4), D(head[1]), D(head[2]))
    return local, np.array([0, hip_y, hip_z])

def solve(local, hip, limb_targets):
    """limb_targets: {'handL': pos, ...}; poles chosen for a spidery splay."""
    Rw, Pw = fk(local, hip)
    for sd, s in (('L', 1), ('R', -1)):
        if 'hand' + sd in limb_targets:
            tgt, yaw_ = limb_targets['hand' + sd]
            ik_limb(local, Rw, Pw, 'upperArm' + sd, 'foreArm' + sd, 'hand' + sd, tgt,
                    np.array([s * 1.0, 1.1, -.15]), eul(0, yaw_, 0) @ HAND_FLAT[sd], np.array([0, 0, -1.0]))
        if 'foot' + sd in limb_targets:
            tgt, yaw_ = limb_targets['foot' + sd]
            ik_limb(local, Rw, Pw, 'thigh' + sd, 'shin' + sd, 'foot' + sd, tgt,
                    np.array([s * .8, .1, .6]), eul(0, yaw_, 0), np.array([0, 0, 1.0]))
    return local, {'hips': hip - J['hips'] + (J['hips'] - J['root'])}

# rest crawl footprint (in place, character faces +Z)
def shoulder_hip(local, hip):
    Rw, Pw = fk(local, hip)
    return Pw

CRAWL_STRIDE = .52
CRAWL_CYCLE = .30

def anim_crawl(t):
    ph = (t / CRAWL_CYCLE) % 1
    bob = .018 * math.cos(TAU * 2 * ph)
    sway = math.sin(TAU * ph)
    local, hip = crawl_body(hip_y=.33 + bob, pitch=80 + 3 * math.cos(TAU * 2 * ph), yaw=7 * sway, roll=4 * sway,
                            head=(0, -6 * sway, 3 * math.sin(TAU * 3 * ph)))
    Pw = shoulder_hip(local, hip)
    tg = {}
    for key, s, off, base in (('handL', 1, 0, 'upperArmL'), ('footR', -1, 0, 'thighR'),
                              ('handR', -1, .5, 'upperArmR'), ('footL', 1, .5, 'thighL')):
        sp = (ph + off) % 1
        hand = key.startswith('hand')
        x = s * (.34 if hand else .22)
        z0 = (Pw['upperArmL'][2] + .07) if hand else (Pw['thighL'][2] - .06)
        duty = .5
        if sp < duty:
            z = z0 + CRAWL_STRIDE / 2 - CRAWL_STRIDE * sp / duty; y = .03 if hand else .07
        else:
            u = (sp - duty) / (1 - duty)
            z = z0 - CRAWL_STRIDE / 2 + CRAWL_STRIDE * (u * u * (3 - 2 * u))
            y = (.03 if hand else .07) + .09 * math.sin(math.pi * u)
        tg[key] = (np.array([x, y, z]), s * (18 if hand else 12))
    return solve(local, hip, tg)

def idle_targets(local, hip, lift=None):
    Pw = shoulder_hip(local, hip)
    tg = {'handL': (np.array([.34, .03, Pw['upperArmL'][2] + .07]), 18),
          'handR': (np.array([-.34, .03, Pw['upperArmR'][2] + .07]), -18),
          'footL': (np.array([.22, .07, Pw['thighL'][2] - .06]), 12),
          'footR': (np.array([-.22, .07, Pw['thighR'][2] - .06]), -12)}
    return tg

def anim_idle(t, dur=3.0):
    ph = TAU * t / dur
    tw = 1 if math.sin(2 * ph + .3) > .93 else 0           # sudden sideways head cock
    scan = math.sin(ph) * 25
    local, hip = crawl_body(hip_y=.325 + .008 * math.sin(2 * ph), pitch=80 + 1.5 * math.sin(2 * ph),
                            head=(4 * math.sin(3 * ph), scan, 38 * tw + 6 * math.sin(5 * ph)))
    tg = idle_targets(local, hip)
    if math.sin(ph * 3 + 1) > .9:                         # fingers drum / twitch
        p_, y_ = tg['handL']; tg['handL'] = (p_ + [0, .02, 0], y_)
    return solve(local, hip, tg)

def anim_attack(t):
    crouch = smooth(0, .18, t) * (1 - smooth(.22, .3, t))
    leap = smooth(.22, .42, t) * (1 - smooth(.58, .82, t))
    bite = smooth(.40, .45, t) * (1 - smooth(.47, .55, t))
    local, hip = crawl_body(hip_y=.33 - .05 * crouch + .58 * leap, pitch=80 + 6 * crouch - 34 * leap,
                            hip_z=.55 * leap, head=(-14 * crouch + 22 * leap - 28 * bite, 0, 0),
                            spine=(10 - 14 * leap, 0, 0), chest=(8 - 10 * leap, 0, 0))
    tg = idle_targets(local, hip)
    if leap > 0:
        Pw = shoulder_hip(local, hip)
        for sd, s in (('L', 1), ('R', -1)):
            p0, y0 = tg['hand' + sd]
            reach = Pw['upperArm' + sd] + np.array([s * .16, .10, .30])
            tg['hand' + sd] = (p0 * (1 - leap) + reach * leap, y0)
            f0, fy = tg['foot' + sd]
            trail = np.array([s * .2, max(.07, hip[1] - .3), hip[2] - .3])
            tg['foot' + sd] = (f0 * (1 - leap) + trail * leap, fy)
    return solve(local, hip, tg)

def anim_stand(t, dur=4.0):
    ph = TAU * t / dur
    tw = 1 if math.sin(ph * 2 + 1) > .95 else 0
    r = {'head': rot(D(4 * math.sin(ph)), D(-14 + 6 * math.sin(ph)), D(10 + 14 * tw)),
         'neck': rot(D(3)), 'chest': rot(D(2 * math.sin(2 * ph)), D(-8), 0), 'spine': rot(0, D(-4), 0),
         'upperArmL': rot(D(-30), D(10), D(6)), 'foreArmL': rot(D(-70), D(-20), 0), 'handL': rot(0, 0, D(8)),
         'upperArmR': rot(D(-18), 0, D(-6)), 'foreArmR': rot(D(-55), D(25), 0),
         'thighL': rot(D(-3)), 'thighR': rot(D(3)), 'shinL': rot(D(4)), 'shinR': rot(D(2))}
    return r, {}

def clip(fn, dur, n):
    times = [dur * k / n for k in range(n + 1)]
    return times, [fn(min(tt, dur)) for tt in times]

ANIMS = [('Idle',) + clip(anim_idle, 3.0, 90), ('Crawl',) + clip(anim_crawl, CRAWL_CYCLE, 12),
         ('Attack',) + clip(anim_attack, .9, 27), ('StandIdle',) + clip(anim_stand, 4.0, 60)]

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
nodes = [{'name': 'Crawler', 'children': [1, 2]}, {'name': 'CrawlerMesh', 'mesh': 0, 'skin': 0}]
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
    base = J['hips'] - J['root']
    tr = np.array([f[1].get('hips', base) for f in frames])
    sm.append({'input': t_acc, 'output': add_acc(f32(tr), FLOAT, 'VEC3'), 'interpolation': 'LINEAR'})
    ch.append({'sampler': len(sm) - 1, 'target': {'node': NODE['hips'], 'path': 'translation'}})
    animations.append({'name': name, 'channels': ch, 'samplers': sm})
img0, img1 = add_view(png_base), add_view(png_emi)
gltf = {
    'asset': {'version': '2.0', 'generator': 'crawler.py (Manju Mania)'},
    'scene': 0, 'scenes': [{'name': 'Crawler', 'nodes': [0]}], 'nodes': nodes,
    'meshes': [{'name': 'Crawler', 'primitives': [prim]}],
    'skins': [{'name': 'CrawlerRig', 'joints': [NODE[b] for b in BONES], 'inverseBindMatrices': a_ibm,
               'skeleton': NODE['root']}],
    'materials': [{'name': 'Crawler', 'doubleSided': True, 'emissiveFactor': [1, 1, 1], 'emissiveTexture': {'index': 1},
                   'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicFactor': 0.0, 'roughnessFactor': 1.0}}],
    'samplers': [{'magFilter': 9728, 'minFilter': 9728, 'wrapS': 33071, 'wrapT': 33071}],
    'images': [{'bufferView': img0, 'mimeType': 'image/png', 'name': 'crawler_albedo'},
               {'bufferView': img1, 'mimeType': 'image/png', 'name': 'crawler_emissive'}],
    'textures': [{'sampler': 0, 'source': 0}, {'sampler': 0, 'source': 1}],
    'animations': animations, 'accessors': accs, 'bufferViews': views,
}
while len(buf) % 4:
    buf.append(0)
gltf['buffers'] = [{'byteLength': len(buf)}]
js = json.dumps(gltf, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(OUT_DIR, 'crawler.glb')
with open(out, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(buf)))
    f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
    f.write(struct.pack('<II', len(buf), 0x004E4942)); f.write(buf)
img_base.save(os.path.join(os.path.dirname(os.path.abspath(out)), 'crawler_albedo.png'))

# head height in the crawl and at the top of the pounce (for the profile + the coder)
def head_at(pose):
    Rw, Pw = fk(pose[0], pose[0] and (J['hips'] + pose[1]['hips'] - (J['hips'] - J['root'])) if pose[1] else None)
    return Pw['head'] + Rw['head'] @ np.array([0, .07, .04])
CRAWL_HEAD = head_at(anim_crawl(0))
POUNCE_HEAD = max((head_at(anim_attack(t)) for t in np.linspace(0, .9, 46)), key=lambda p: p[1])
print(f'{out}: {H:.2f} m standing, {len(positions)} verts, {len(indices)} tris, {len(BONES)} bones, '
      f'{len(ANIMS)} anims, crawl head {CRAWL_HEAD[1]:.2f} m, pounce head {np.round(POUNCE_HEAD, 2)}, '
      f'{os.path.getsize(out) / 1024:.0f} KB')

# ------------------------------------------------------------- profile sheet
def render(pose, view, size, scale, center, light=(.4, .6, .7)):
    """Tiny software rasteriser: skinned mesh, NEAREST texture, flat lambert."""
    W, Hh = size
    if pose is None:
        V = positions.astype(np.float64)
    else:
        loc, tr = pose
        hip = J['hips'] + tr['hips'] - (J['hips'] - J['root']) if 'hips' in tr else None
        Rw, Pw = fk(loc, hip)
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
    tex = atlas; L = norm(np.array(light))
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
        tc = tex[np.clip((v * AH).astype(int), 0, AH - 1), np.clip((u * AW).astype(int), 0, AW - 1)]
        n_ = norm(np.cross(Vc[b] - Vc[a], Vc[c] - Vc[a]))
        shade = .55 + .45 * abs(np.dot(n_, L))
        sub[win] = z[win]
        img[y0:y1 + 1, x0:x1 + 1][win] = tc[win] * shade
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
panels = [('REFERENCE', None), ('FRONT', (None, 0)), ('SIDE', (None, 90)), ('CRAWL', (anim_crawl(.05), 35)),
          ('POUNCE', (anim_attack(.44), 90))]
px0, py0, pw, ph_ = 40, 130, 236, 520
for i, (label, spec) in enumerate(panels):
    x = px0 + i * (pw + 14)
    dr.rectangle([x, py0, x + pw, py0 + ph_], fill=(52, 50, 50), outline=(80, 76, 72))
    if spec is None:
        ref = Image.open(os.path.join(REF, 'crawler_photo.jpg')).convert('RGB').crop((150, 90, 470, 1070))
        ref.thumbnail((pw - 8, ph_ - 8))
        sheet.paste(ref, (x + (pw - ref.width) // 2, py0 + (ph_ - ref.height) // 2))
    else:
        pose, view = spec
        if label in ('FRONT', 'SIDE'):
            im, m = render(pose, view, (pw, ph_), 400, np.array([0, H / 2 + .01, 0]))
        elif label == 'CRAWL':
            im, m = render(pose, view, (pw, ph_), 300, np.array([0, .42, .12]))
        else:
            im, m = render(pose, view, (pw, ph_), 220, np.array([0, .72, .6]))
        bg = np.array(sheet.crop((x, py0, x + pw, py0 + ph_))).astype(float)
        bg[m] = im[m]
        sheet.paste(Image.fromarray(bg.astype(np.uint8)), (x, py0))
    dr.text((x + 8, py0 + ph_ + 8), label, fill=PALE, font=font(18, True))
# height ruler next to the front view
fx = px0 + pw + 14
for k in range(0, 13):
    yy = py0 + ph_ / 2 - (k * .1 - (H / 2 + .01)) * 400
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
block('VITALS', [f'Height        {H:.2f} m standing (very short)',
                 f'Crawl height  head at ~{CRAWL_HEAD[1]:.2f} m',
                 'Speed         EXTREMELY fast',
                 'Damage        1 heart per bite',
                 'Territory     FIRST FLOOR ONLY'])
block('BEHAVIOUR', ['Scuttles on all fours at terrifying speed,',
                    'elbows and knees splayed like a spider.',
                    'Never leaves the first floor - stairs are',
                    'his border. Pounces up to face height,',
                    'bites once (one heart) and drops back to',
                    'the floor to scurry off again.'])
block('LOOK', ['Big curly black hair, thin moustache,',
               'buck teeth jutting out of a fixed grin.',
               'Dusty off-white long-sleeve shirt, untucked;',
               'stained blue jeans; brown strap sandals.',
               'Eyes catch the torchlight in the dark.'])
block('MODEL', ['public/models/crawler.glb  (1 texture, 512 px)',
                f'{len(indices)} tris, 18 bones (same names as Manju)',
                'Idle 3.0s  Crawl 0.30s loop  Attack 0.9s',
                'StandIdle 4.0s  - all in place',
                f'Crawl stride {CRAWL_STRIDE:.2f} m per cycle',
                f'  = {CRAWL_STRIDE / CRAWL_CYCLE:.1f} m/s at 1x speed'])
sheet.save(os.path.join(REF, 'crawler_profile.png'))
print('profile:', os.path.join(REF, 'crawler_profile.png'))
