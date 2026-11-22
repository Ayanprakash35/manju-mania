#!/usr/bin/env python3
"""Builds Manju's monster form + his transformation as one rigged GLB.

    python3 tools/manju_monster.py [out.glb]   (default: public/models/manju_monster.glb)

Reuses tools/manju.py's mesh, rig and texture. The file holds two skinned layers on the
same 18-bone rig:
  * ManjuSkin   - Manju exactly as in manju.glb (his texture)
  * MonsterSkin - the same topology wearing a gory monster texture, plus claws and spine
                  spikes. At rest it sits shrunk inside ManjuSkin, hidden.
Morph target 0 "Monster" grows MonsterSkin into the monster (taller, long neck and arms,
broad hunched shoulders, bloated torn belly, jaw hanging open) while ManjuSkin collapses
inside it, so the gore bursts through his skin in patches. The bones grow with the same
weight, so the monster bends at its own elbows and knees. Target 1 "Bulge" makes the skin
bubble, target 2 "Scream" drops the jaw further.
Animations: Transform (Manju -> monster, 3.0 s), Caught (lunge + grab jumpscare, 2.4 s,
ends holding), MonsterIdle (4 s loop). Every clip keys every bone and morph weight, so
any clip can be played on its own.
"""
import io, json, math, os, struct, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
_path = os.path.join(HERE, 'manju.py')
_src = open(_path).read()
_src = _src[:_src.index('# ------------------------------------------------------------- GLB writer')]
_ns = {'__file__': _path, '__name__': 'manju_base'}
exec(compile(_src, _path, 'exec'), _ns)
globals().update({k: v for k, v in _ns.items() if not k.startswith('__')})

NV = len(positions)
P0 = positions.astype(np.float64)
N0 = normals.astype(np.float64)

# ------------------------------------------------------- per-vertex metadata
ring_c = np.zeros((NV, 3)); vpart = [''] * NV; vth = np.zeros(NV)
vi = 0
cap_vertex = {}; ring_end = {}
for p in PARTS:
    for k in range(p.nt + 1):
        t = k / p.nt
        ring = []
        for m in range(p.nth + 1):
            th = -math.pi + TAU * m / p.nth
            assert np.allclose(P0[vi], p.fn(th, t), atol=1e-4)
            vpart[vi] = p.name; vth[vi] = th; ring.append(vi); vi += 1
        ring_c[ring] = P0[ring[:-1]].mean(0)
        ring_end[p.name] = ring[:-1]  # last ring (t = 1): the fingertips for an arm
    for end, on in ((1.0, p.cap_top), (0.0, p.cap_bot)):
        if on:
            ring_c[vi] = P0[vi]; vpart[vi] = p.name; cap_vertex[p.name, end] = vi; vi += 1
assert vi == NV
vpart = np.array(vpart)
is_col = vpart == 'column'
is_arm = np.char.startswith(vpart, 'arm')

# ------------------------------------------------------- monster skeleton
Jarr = np.array([J[b] for b in BONES])
SC = {'root': (1, 1, 1), 'hips': (1.2, 1.15, 1.15), 'spine': (1.24, 1.2, 1.32),
      'chest': (1.34, 1.15, 1.22), 'neck': (.82, 2.7, .85), 'head': (1.16, 1.22, 1.16)}
for sd in 'LR':
    SC.update({'upperArm' + sd: (.95, 1.75, .95), 'foreArm' + sd: (.9, 1.8, .9),
               'hand' + sd: (1.45, 2.1, 1.4), 'thigh' + sd: (.95, 1.45, .95),
               'shin' + sd: (.85, 1.5, .85), 'foot' + sd: (1.15, 1.0, 1.55)})
Sarr = np.array([SC[b] for b in BONES], float)
JM = {'root': np.zeros(3)}
for b in BONES[1:]:
    p_ = PARENT[b]
    JM[b] = JM[p_] + np.array(SC[p_]) * (J[b] - J[p_])
_dy = J['footL'][1] - JM['footL'][1]          # keep the feet on the ground
for b in BONES[1:]:
    JM[b] = JM[b] + np.array([0, _dy, 0])
JMarr = np.array([JM[b] for b in BONES])

def skin_deform(P, jw, ww):
    out = np.zeros_like(P)
    for k in range(4):
        j = jw[:, k]
        out += ww[:, k, None] * (JMarr[j] + Sarr[j] * (P - Jarr[j]))
    return out

def skin_offset(jw, ww):
    return sum(ww[:, k, None] * (JMarr[jw[:, k]] - Jarr[jw[:, k]]) for k in range(4))

jw, ww = joints.astype(int), weights.astype(np.float64)
M = skin_deform(P0, jw, ww)
OFF = skin_offset(jw, ww)
Cm = skin_deform(ring_c, jw, ww)

def interp(x, pts):
    xs, ys = zip(*pts)
    return np.interp(x, xs, ys)

Y0 = P0[:, 1]
front = np.clip((np.cos(vth) - .05) / .55, 0, 1) * is_col
front = front * front * (3 - 2 * front)
# jaw: rows from the upper lip down drop open; the band above them becomes the maw
JAW = front * interp(Y0, [(1.10, 0), (1.13, .12), (1.17, .45), (1.205, .92), (1.235, 1), (1.25, 1), (1.262, 0)])
jaw_d = np.stack([np.zeros(NV), -.16 * JAW, .035 * JAW], 1)
M += jaw_d
M[:, 0] += (M[:, 0] - Cm[:, 0]) * .25 * JAW
# bloated belly
belly = front * interp(Y0, [(.74, 0), (.84, 1), (.95, 1), (1.04, 0)])
M[:, 2] += .055 * belly
# hands narrow into points
tip = is_arm * np.clip((WR_Y - .05 - Y0) / .07, 0, 1)
M = Cm + (M - Cm) * (1 - .45 * tip)[:, None]
M[:, 1] -= .05 * tip

scream_d = np.stack([np.zeros(NV), -.09 * JAW, .02 * JAW], 1)
rng = np.random.default_rng(7)

def vnoise(P, freq, seed):
    G = np.random.default_rng(seed).random((32, 32, 32))
    q = P * freq + 100.0
    i = np.floor(q).astype(int); f = q - i
    f = f * f * (3 - 2 * f)
    out = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w_ = (f[..., 0] if dx else 1 - f[..., 0]) * (f[..., 1] if dy else 1 - f[..., 1]) * \
                     (f[..., 2] if dz else 1 - f[..., 2])
                out = out + w_ * G[(i[..., 0] + dx) % 32, (i[..., 1] + dy) % 32, (i[..., 2] + dz) % 32]
    return out

bump = np.clip(vnoise(P0, 14, 3) - .5, 0, None) * 2
bulge_d = N0 * (.06 * bump)[:, None]

# hiding: the monster layer starts shrunk inside Manju; Manju collapses inside the monster.
# Per-vertex shrink amounts make the crossover patchy - the gore breaks through in pieces.
# chest and face break open first, then it spreads outward to the limbs
first = np.clip(1 - np.linalg.norm((P0 - [0, 1.12, .12]) * [1, .8, 1], axis=1) / .55, 0, 1)
patch = np.clip(.7 * vnoise(P0, 11, 9) + .3 * rng.random(NV) - .55 * first + .15, 0, 1)
fB = .04 + .34 * patch
fA = .5 + .3 * (1 - patch)
B_base = ring_c + (P0 - ring_c) * (1 - fB)[:, None]
A_tgt = Cm + (M - Cm) * (1 - fA)[:, None]

def vertex_normals(P, I):
    fn = np.cross(P[I[:, 1]] - P[I[:, 0]], P[I[:, 2]] - P[I[:, 0]])
    n = np.zeros_like(P)
    for c in range(3):
        np.add.at(n, I[:, c], fn)
    l = np.linalg.norm(n, axis=1, keepdims=True)
    return np.where(l > 1e-12, n / np.maximum(l, 1e-12), N0[:len(P)] if len(P) == NV else n)

NM = vertex_normals(M, indices.astype(int))

# ------------------------------------------------------- claws + spikes (monster only)
BONE_UV = (448, 64, 32, 32)
ex_P0, ex_M, ex_N, ex_U, ex_J, ex_W = [], [], [], [], [], []

def pyramid(base_c, d, length, half, bone, collapse_at):
    d = norm(d)
    a = norm(np.cross(d, [0, 0, 1.0] if abs(d[2]) < .9 else [1.0, 0, 0])); b = np.cross(d, a)
    corners = [base_c + half * (a * ca + b * cb) for ca, cb in ((1, 1), (-1, 1), (-1, -1), (1, -1))]
    apex = base_c + d * length
    x0, y0, w, h = BONE_UV
    for q in range(4):
        tri = [corners[q], corners[(q + 1) % 4], apex]
        n_ = norm(np.cross(tri[1] - tri[0], tri[2] - tri[0]))
        if np.dot(n_, tri[0] - base_c) < 0:
            tri = [tri[1], tri[0], tri[2]]; n_ = -n_
        for k, v in enumerate(tri):
            off = JM[bone] - J[bone]
            ex_M.append(v - off); ex_P0.append(collapse_at); ex_N.append(n_)
            ex_U.append([(x0 + .5 + (w - 1) * (q + .5 * (k == 2) + (k == 1)) / 4) / AW,
                         (y0 + .5 + (h - 1) * (1.0 if k == 2 else 0.0)) / AH])
            ex_J.append([BI[bone], 0, 0, 0]); ex_W.append([1.0, 0, 0, 0])

for sd, s in (('L', 1), ('R', -1)):
    t_m = M[ring_end['arm' + sd]].mean(0)  # monster bind position of the fingertips
    for zo in (-.042, -.014, .014, .042):
        base = t_m + np.array([-s * .004, .045, zo])
        pyramid(base, [s * .12, -1, .3 + zo * 4], .19, .016, 'hand' + sd, J['hand' + sd])
back_ids = [i for i in range(NV) if is_col[i] and abs(abs(vth[i]) - math.pi) < 1e-6]
for Yb, ln in ((.82, .07), (.89, .09), (.96, .11), (1.03, .12), (1.10, .10)):
    i = min(back_ids, key=lambda i: abs(Y0[i] - Yb))
    dom = BONES[jw[i][np.argmax(ww[i])]]
    pyramid(M[i] + np.array([0, 0, .03]), [0, .55, -1], ln, .02, dom, J[dom])
for sd, s in (('L', 1), ('R', -1)):   # elbow spurs
    e = JM['foreArm' + sd]
    pyramid(e + np.array([0, 0, -.015]), [s * .2, .3, -1], .08, .015, 'foreArm' + sd, J['foreArm' + sd])

ex_M = np.array(ex_M); ex_P0 = np.array(ex_P0); NEX = len(ex_M)
EX_TRIS = NEX // 3

# ------------------------------------------------------- monster texture
# texel -> bind position / part / angle, rebuilt the same way manju.py bakes its atlas
PM = np.zeros((AH, AW, 3)); TH = np.zeros((AH, AW)); PID = np.full((AH, AW), -1)
PNAMES = [p.name for p in PARTS]
for pi_, p in enumerate(PARTS):
    x0, y0, w, h = p.region
    for j in range(h):
        t = 1 - (j + .5) / h
        for i in range(w):
            th = -math.pi + TAU * (i + .5) / w
            PM[y0 + j, x0 + i] = p.fn(th, t)
            TH[y0 + j, x0 + i] = th; PID[y0 + j, x0 + i] = pi_
valid = PID >= 0
col_t = PID == PNAMES.index('column')
arm_t = np.isin(PID, [PNAMES.index('armL'), PNAMES.index('armR')])
X, Yt, Z = PM[..., 0], PM[..., 1], PM[..., 2]
cth = np.cos(TH)

A0 = atlas.astype(np.float64).copy()
r, g, b = A0[..., 0], A0[..., 1], A0[..., 2]
L = .3 * r + .59 * g + .11 * b
skin = valid & (r > g + 8) & (r - b > 22) & (L > 52)
polo = valid & (g > r + 3) & (g > b)
eye = valid & col_t & (Yt > 1.27) & (r > 120) & (r > 1.6 * g) & (r > 1.6 * b)
n1, n2, n3, n4 = (vnoise(PM, f, s) for f, s in ((9, 1), (26, 2), (60, 4), (120, 5)))
OUT = A0.copy()

# sickly grey-olive skin, mottled, with dark veins
pal = np.stack([L * .98 + 6, L * .97 + 10, L * .8 + 6], -1) * (.72 + .45 * n1)[..., None]
OUT[skin] = pal[skin]
vein = (np.abs(vnoise(PM, 34, 6) - .5) < .03) | (np.abs(vnoise(PM, 55, 8) - .5) < .02)
vm = skin & vein
OUT[vm] = OUT[vm] * .35 + np.array([70, 40, 66]) * .65
# shirt: dirtier, darker
OUT[polo] = OUT[polo] * np.array([.72, .66, .66])
OUT[valid & ~skin & ~polo] *= .82
# hair falling out in patches
scalp = col_t & (Yt > 1.33) & (n2 > .66)
OUT[scalp] = np.array([120, 112, 92]) * (.7 + .4 * n3[scalp, None])
OUT[scalp & (n3 > .6)] = (88, 34, 30)

blood = np.zeros((AH, AW))
# drool + drips running from the mouth down the throat and shirt
bins = np.floor(X / .011).astype(int)
lens = np.random.default_rng(21).random(200) ** 1.7 * .55 + .05
dl = lens[(bins + 100) % 200] * np.clip(1 - np.abs(X) / .15, 0, 1)
drip = col_t & (cth > .2) & (Yt < 1.236) & (Yt > 1.236 - dl)
blood[drip] = 1
soak = col_t & (cth > -.3) & (n2 < .95 * interp(Yt, [(.98, 0), (1.10, .55), (1.17, .9), (1.235, .9), (1.24, 0)]))
blood[soak] = 1
# hands and forearms
blood[arm_t & (Yt < WR_Y + .03 + .04 * n2)] = 1
blood[arm_t & (Yt < EL_Y) & (n2 > .55)] = 1
# splatter everywhere
spat = interp(Yt, [(0, .5), (.6, .25), (1.0, .7), (1.3, .5)])  # more on the upper body
blood[valid & (n3 > .86 - .1 * spat) & (n4 > .35)] = 1
blood[valid & ~col_t & ~arm_t & (n4 > .93)] = 1
bc = np.array([88, 6, 9]) + (np.array([150, 18, 16]) - np.array([88, 6, 9])) * n4[..., None]
OUT[blood > 0] = bc[blood > 0]

# belly torn open: guts and ribs
gw = .06 * np.clip(1 - ((Yt - .905) / .1) ** 2, 0, 1) ** .6 * (.45 + .9 * n3) * (.8 + .3 * np.sin(Yt * 260))
gash = col_t & (cth > .3) & (np.abs(X) < gw)
rim = col_t & (cth > .25) & (np.abs(X) < gw + .014) & ~gash & (gw > 0)
OUT[rim] = (60, 4, 6)
guts = np.array([70, 8, 12]) + (np.array([150, 52, 56]) - np.array([70, 8, 12])) * ((n3 > .5) * (.4 + .6 * n4))[..., None]
OUT[gash] = guts[gash]
ribs = gash & (Yt > .945) & (((Yt - .945) / .016) % 1 < .45) & (np.abs(X) > .012)
OUT[ribs] = np.array([206, 190, 150]) * (.85 + .2 * n4[ribs, None])

# face: hollow black sockets with burning red eyes
def dilate(m, k):
    o = m.copy()
    for _ in range(k):
        o = o | np.roll(o, 1, 0) | np.roll(o, -1, 0) | np.roll(o, 1, 1) | np.roll(o, -1, 1)
    return o
eye2 = dilate(eye, 1) & col_t
sock = dilate(eye, 4) & col_t & ~eye2
OUT[sock] = (18, 7, 7)
OUT[eye2] = (255, 44, 26)
# the maw (stretched open by the jaw drop): teeth top and bottom, black-red throat
maw = col_t & (cth > .22) & (Yt > 1.236) & (Yt < 1.264)
OUT[maw] = (np.array([34, 4, 7]) * (.6 + .6 * np.clip(1 - cth, 0, 1)[..., None]) + np.array([20, 0, 0]))[maw]
u = (X / .0085) % 1
top_t = maw & ((1.264 - Yt) / .010 < 1 - np.abs(u - .5) * 2)
bot_t = maw & ((Yt - 1.236) / .008 < 1 - np.abs(((X / .0085 + .5) % 1) - .5) * 2)
teeth = top_t | bot_t
OUT[teeth] = np.array([214, 202, 166]) * (.8 + .25 * n4[teeth, None])
OUT[teeth & (n3 > .62)] = (150, 28, 24)
OUT[maw & ~teeth & ((Yt > 1.2615) | (Yt < 1.2375))] = (130, 26, 32)

# claws / spikes / spurs: bloody base, yellowed bone, black tip
x0, y0, w, h = BONE_UV
for j in range(h):
    v = (j + .5) / h
    for i in range(w):
        c = (120, 14, 14) if v < .22 else (196, 182, 140) if v < .7 else (110, 100, 80) if v < .86 else (30, 26, 24)
        if (i + j) % 3 == 0:
            c = tuple(int(q * .85) for q in c)
        OUT[y0 + j, x0 + i] = c

OUT = np.round(np.clip(OUT, 0, 255) / 8) * 8      # coarse PS1 colour depth
EMI = np.zeros((AH, AW, 3)); EMI[eye2] = (255, 40, 20)
png_monster, img_monster = to_png(OUT)
png_emis, img_emis = to_png(EMI)
png_manju, _ = to_png(atlas)

# ------------------------------------------------------- animation
Jl = {b: J[b] - (J[PARENT[b]] if PARENT[b] else 0) for b in BONES}
JMl = {b: JM[b] - (JM[PARENT[b]] if PARENT[b] else 0) for b in BONES}

def eul(dct):
    return {b: rot(D(v[0]), D(v[1]), D(v[2])) for b, v in dct.items()}

def add(*ds, k=None):
    out = {}
    for i, d in enumerate(ds):
        f = 1 if k is None else k[i]
        for bn, v in d.items():
            out[bn] = [a + f * c for a, c in zip(out.get(bn, [0, 0, 0]), v)]
    return out

def fk(q, g, hip_off):
    Rw, Pw = {}, {}
    for b in BONES:
        T = Jl[b] * (1 - g) + JMl[b] * g
        if b == 'hips':
            T = T + hip_off
        Rl = qmat(q.get(b, [0, 0, 0, 1]))
        if PARENT[b]:
            Rw[b] = Rw[PARENT[b]] @ Rl; Pw[b] = Pw[PARENT[b]] + Rw[PARENT[b]] @ T
        else:
            Rw[b] = Rl; Pw[b] = T
    return Rw, Pw

STANCE = {'hips': [6, 0, 0], 'spine': [14, 0, 0], 'chest': [16, 0, 4], 'neck': [24, 0, 0],
          'head': [-46, 8, 14], 'upperArmL': [-14, 0, 6], 'upperArmR': [-10, 0, -5],
          'foreArmL': [-14, 0, 0], 'foreArmR': [-22, 0, 0], 'handL': [0, 0, 8], 'handR': [0, 0, -8],
          'thighL': [-16, 0, -3], 'thighR': [-12, 0, 3], 'shinL': [26, 0, 0], 'shinR': [22, 0, 0],
          'footL': [-10, 0, 0], 'footR': [-10, 0, 0]}

def bump_(a, b, c, d, t):
    return smooth(a, b, t) * (1 - smooth(c, d, t))

def pose(eu, g, bulge, scream, hip_off=(0, 0, 0)):
    q = eul(eu)
    hip_off = np.array(hip_off, float)
    _, Pw = fk(q, g, hip_off)
    hip_off[1] += J['footL'][1] - min(Pw['footL'][1], Pw['footR'][1])  # feet on the floor
    return q, g, hip_off, [g, bulge, scream]

def anim_transform(t):
    s = lambda a, b: smooth(a, b, t)
    eu = {}
    # 0 - .55 s: frozen Manju, head snaps in jerks
    snaps = {'head': [0, 0, 0]}
    if .12 < t < .22: snaps['head'] = [0, 28, 0]
    elif .28 < t < .38: snaps['head'] = [10, -10, -32]
    elif .42 < t < .52: snaps['head'] = [-24, 6, 10]
    eu = add(eu, snaps)
    base = s(.5, 2.25) ** 1.3
    jit = .09 * math.sin(53 * t) * math.sin(17 * t) * 4 * base * (1 - base)
    g = float(np.clip(round((base + jit) * 14) / 14, 0, 1))
    # knees buckle as it starts
    kb = bump_(.55, .75, .95, 1.4, t)
    eu = add(eu, {'thighL': [-28, 0, 0], 'thighR': [-24, 0, 0], 'shinL': [50, 0, 0], 'shinR': [46, 0, 0],
                  'spine': [18, 0, 0], 'head': [20, 0, 0]}, k=[1, kb])
    # rears back screaming at the ceiling, arms flung out
    a = bump_(.85, 1.15, 1.55, 1.95, t)
    eu = add(eu, {'spine': [-14, 0, 0], 'chest': [-24, 0, 0], 'neck': [-20, 0, 0], 'head': [-42, 0, 0],
                  'upperArmL': [-10, 0, 42], 'upperArmR': [-10, 0, -42], 'foreArmL': [-30, 0, 0],
                  'foreArmR': [-30, 0, 0], 'handL': [0, 0, 25], 'handR': [0, 0, -25]}, k=[1, a])
    # convulsions while the body tears
    cv = bump_(.55, .7, 2.1, 2.35, t)
    eu = add(eu, {'chest': [3 * math.sin(41 * t), 0, 7 * math.sin(29 * t)],
                  'head': [8 * math.sin(37 * t), 12 * math.sin(23 * t), 9 * math.sin(31 * t)],
                  'upperArmL': [0, 0, 8 * math.sin(33 * t)], 'upperArmR': [0, 0, -8 * math.sin(27 * t)],
                  'hips': [0, 4 * math.sin(19 * t), 0]}, k=[1, cv])
    # folds forward into the hunched monster stance
    h = s(1.65, 2.4)
    eu = add(eu, STANCE, k=[1, h])
    eu = add(eu, {'head': [0, 0, 12], 'chest': [0, 6, 0]}, k=[1, s(2.4, 3.0)])
    if 2.72 < t < 2.8:
        eu = add(eu, {'handL': [0, 0, 30], 'head': [0, -14, 0]})
    bulge = .15 * s(.3, .5) + .85 * abs(math.sin(19 * t)) ** 3 * bump_(.5, .7, 2.0, 2.4, t)
    scream = .25 * s(.6, 1.0) + .75 * bump_(.8, 1.0, 1.6, 2.0, t) - .1 * s(2.3, 3.0)
    return pose(eu, g, bulge, max(scream, 0))

def anim_caught(t):
    s = lambda a, b: smooth(a, b, t)
    eu = dict(STANCE)
    w1 = bump_(0, .2, .22, .4, t)
    eu = add(eu, {'spine': [-10, 0, 0], 'head': [-14, 0, 0], 'upperArmL': [22, 0, 12], 'upperArmR': [22, 0, -12],
                  'thighL': [-10, 0, 0], 'thighR': [-10, 0, 0], 'shinL': [20, 0, 0], 'shinR': [20, 0, 0]}, k=[1, w1])
    Lg = s(.22, .45)
    eu = add(eu, {'hips': [4, 0, 0], 'spine': [5, 0, 0], 'chest': [3, 0, -4], 'neck': [-2, 0, 0],
                  'head': [-16, -8, -14],
                  'upperArmL': [-80, 0, 18], 'upperArmR': [-84, 0, -18], 'foreArmL': [-12, 0, 0],
                  'foreArmR': [-6, 0, 0], 'handL': [0, 0, 14], 'handR': [0, 0, -14],
                  'thighR': [-34, 0, 0], 'shinR': [6, 0, 0], 'thighL': [18, 0, 0], 'shinL': [12, 0, 0],
                  'footR': [10, 0, 0], 'footL': [-10, 0, 0]}, k=[1, Lg])
    G = s(.6, .9)
    eu = add(eu, {'upperArmL': [0, 0, -22], 'upperArmR': [0, 0, 22], 'foreArmL': [-42, 0, 0],
                  'foreArmR': [-42, 0, 0], 'handL': [0, 0, -20], 'handR': [0, 0, 20]}, k=[1, G])
    sh = s(.42, .5) * (1 - .45 * s(1.3, 2.4))
    eu = add(eu, {'head': [5 * math.sin(TAU * 7 * t), 10 * math.sin(TAU * 11 * t), 8 * math.sin(TAU * 8.3 * t + 1)],
                  'neck': [0, 3 * math.sin(TAU * 9 * t + 2), 0], 'chest': [2 * math.sin(TAU * 5 * t), 0, 0]},
             k=[1, sh])
    scream = .25 + .75 * s(.3, .5) - .08 * abs(math.sin(TAU * 10 * t)) * s(.5, .6)
    bulge = .1 + .3 * abs(math.sin(TAU * 1.6 * t)) ** 4
    return pose(eu, 1.0, bulge, scream, (0, 0, .45 * Lg))

def anim_idle_m(t, dur=4.0):
    ph = TAU * t / dur
    tw = 1 if math.sin(3 * ph + .4) > .96 else 0
    eu = add(STANCE, {'chest': [3 * math.sin(2 * ph), 0, 0], 'spine': [2 * math.sin(2 * ph - .5), 0, 0],
                      'head': [-2 * math.sin(2 * ph), 7 * math.sin(ph), 12 * tw],
                      'upperArmL': [3 * math.sin(2 * ph + 1), 0, 0], 'upperArmR': [3 * math.sin(2 * ph + 1.3), 0, 0],
                      'handL': [0, 0, 18 * tw], 'handR': [0, 0, -6 * math.sin(4 * ph)]})
    return pose(eu, 1.0, .08 + .12 * max(math.sin(5 * ph), 0), .2 + .1 * math.sin(2 * ph))

FPS = 30
def clip(fn, dur, loop=False):
    n = int(round(dur * FPS))
    times = [dur * k / n for k in range(n + 1)]
    frames = [fn(min(tt, dur) if not loop else tt % dur) if not loop else fn(tt) for tt in times]
    return times, frames

ANIMS = [('Transform',) + clip(anim_transform, 3.0), ('Caught',) + clip(anim_caught, 2.4),
         ('MonsterIdle',) + clip(anim_idle_m, 4.0, True)]

# head position at the end of Caught - where the game should put the camera
_q, _g, _ho, _ = anim_caught(2.4)
_R, _P = fk(_q, 1.0, _ho)
FACE_END = _P['head'] + _R['head'] @ np.array([0, .03, .14])
_q, _g, _ho, _ = anim_idle_m(0)
_R, _P = fk(_q, 1.0, _ho)
HEAD_TOP_IDLE = (_P['head'] + _R['head'] @ ((JM['head'] - JM['head']) + np.array([0, .2, 0])))[1]
_q, _g, _ho, _ = pose({}, 1.0, 0, 0)
_R, _P = fk(_q, 1.0, _ho)

# ------------------------------------------------------- GLB writer
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
    a = {'bufferView': add_view(arr.tobytes(), target), 'componentType': ctype,
         'count': int(arr.shape[0]), 'type': typ}
    if minmax:
        a['min'] = [float(v) for v in arr.reshape(arr.shape[0], -1).min(0)]
        a['max'] = [float(v) for v in arr.reshape(arr.shape[0], -1).max(0)]
    accs.append(a); return len(accs) - 1

ARR, ELE, FLOAT, U8, U16 = 34962, 34963, 5126, 5121, 5123
f32 = lambda a: np.asarray(a, np.float32)

# layer A: Manju
idxA = indices.reshape(-1).astype(np.uint16)
primA = {'attributes': {'POSITION': add_acc(f32(P0), FLOAT, 'VEC3', ARR, True),
                        'NORMAL': add_acc(f32(N0), FLOAT, 'VEC3', ARR),
                        'TEXCOORD_0': add_acc(uvs, FLOAT, 'VEC2', ARR),
                        'JOINTS_0': add_acc(joints, U8, 'VEC4', ARR),
                        'WEIGHTS_0': add_acc(weights, FLOAT, 'VEC4', ARR)},
         'indices': add_acc(idxA, U16, 'SCALAR', ELE), 'material': 0,
         'targets': [{'POSITION': add_acc(f32(A_tgt - OFF - P0), FLOAT, 'VEC3', None, True)},
                     {'POSITION': add_acc(f32(bulge_d), FLOAT, 'VEC3', None, True)},
                     {'POSITION': add_acc(f32(scream_d), FLOAT, 'VEC3', None, True)}]}
# layer B: monster (+ claws/spikes appended)
B_P = np.vstack([B_base, ex_P0])
B_T0 = np.vstack([M - OFF - B_base, ex_M - ex_P0])
B_N = np.vstack([N0, np.array(ex_N)])
B_NT0 = np.vstack([NM - N0, np.zeros((NEX, 3))])
B_U = np.vstack([uvs, np.array(ex_U)])
B_J = np.vstack([joints, np.array(ex_J)]).astype(np.uint8)
B_W = np.vstack([weights, np.array(ex_W)])
z = np.zeros((NEX, 3))
idxB = np.concatenate([idxA, np.arange(NV, NV + NEX)]).astype(np.uint16)
zeroN = add_acc(f32(np.zeros_like(B_N)), FLOAT, 'VEC3')
primB = {'attributes': {'POSITION': add_acc(f32(B_P), FLOAT, 'VEC3', ARR, True),
                        'NORMAL': add_acc(f32(B_N), FLOAT, 'VEC3', ARR),
                        'TEXCOORD_0': add_acc(f32(B_U), FLOAT, 'VEC2', ARR),
                        'JOINTS_0': add_acc(B_J, U8, 'VEC4', ARR),
                        'WEIGHTS_0': add_acc(f32(B_W), FLOAT, 'VEC4', ARR)},
         'indices': add_acc(idxB, U16, 'SCALAR', ELE), 'material': 1,
         'targets': [{'POSITION': add_acc(f32(B_T0), FLOAT, 'VEC3', None, True),
                      'NORMAL': add_acc(f32(B_NT0), FLOAT, 'VEC3')},
                     {'POSITION': add_acc(f32(np.vstack([bulge_d, z])), FLOAT, 'VEC3', None, True),
                      'NORMAL': zeroN},
                     {'POSITION': add_acc(f32(np.vstack([scream_d, z])), FLOAT, 'VEC3', None, True),
                      'NORMAL': zeroN}]}
TNAMES = ['Monster', 'Bulge', 'Scream']

nodes = [{'name': 'ManjuMonster', 'children': [1, 2, 3]},
         {'name': 'ManjuSkin', 'mesh': 0, 'skin': 0, 'weights': [0, 0, 0]},
         {'name': 'MonsterSkin', 'mesh': 1, 'skin': 0, 'weights': [0, 0, 0]}]
NODE = {b: 3 + i for i, b in enumerate(BONES)}
for b in BONES:
    nd = {'name': b, 'translation': [float(v) for v in Jl[b]]}
    kids = [NODE[c] for c in BONES if PARENT[c] == b]
    if kids:
        nd['children'] = kids
    nodes.append(nd)
ibm = []
for b in BONES:
    m = np.eye(4, dtype=np.float32); m[:3, 3] = -J[b]; ibm.append(m.T.reshape(-1))
a_ibm = add_acc(np.array(ibm, np.float32), FLOAT, 'MAT4')
im = [add_view(png_manju), add_view(png_monster), add_view(png_emis)]

animations = []
for name, times, frames in ANIMS:
    t_acc = add_acc(f32(times), FLOAT, 'SCALAR', minmax=True)
    ch, sm = [], []
    def chan(node, path, data, typ):
        sm.append({'input': t_acc, 'output': add_acc(f32(data), FLOAT, typ), 'interpolation': 'LINEAR'})
        ch.append({'sampler': len(sm) - 1, 'target': {'node': node, 'path': path}})
    for b in BONES:
        q = np.array([f[0].get(b, [0, 0, 0, 1]) for f in frames])
        for k in range(1, len(q)):
            if np.dot(q[k], q[k - 1]) < 0:
                q[k] = -q[k]
        chan(NODE[b], 'rotation', q, 'VEC4')
        tr = np.array([Jl[b] * (1 - f[1]) + JMl[b] * f[1] + (f[2] if b == 'hips' else 0) for f in frames])
        chan(NODE[b], 'translation', tr, 'VEC3')
    wts = np.array([f[3] for f in frames]).reshape(-1)
    chan(1, 'weights', wts, 'SCALAR'); chan(2, 'weights', wts, 'SCALAR')
    animations.append({'name': name, 'channels': ch, 'samplers': sm})

matte = {'metallicFactor': 0.0, 'roughnessFactor': 1.0}
gltf = {
    'asset': {'version': '2.0', 'generator': 'manju_monster.py (Manju Mania)'},
    'scene': 0, 'scenes': [{'name': 'ManjuMonster', 'nodes': [0]}],
    'nodes': nodes,
    'meshes': [{'name': 'ManjuSkin', 'primitives': [primA], 'weights': [0, 0, 0], 'extras': {'targetNames': TNAMES}},
               {'name': 'MonsterSkin', 'primitives': [primB], 'weights': [0, 0, 0], 'extras': {'targetNames': TNAMES}}],
    'skins': [{'name': 'ManjuRig', 'joints': [NODE[b] for b in BONES], 'inverseBindMatrices': a_ibm,
               'skeleton': NODE['root']}],
    'materials': [{'name': 'Manju', 'doubleSided': True,
                   'pbrMetallicRoughness': dict(matte, baseColorTexture={'index': 0})},
                  {'name': 'Monster', 'doubleSided': True, 'emissiveFactor': [1, 1, 1],
                   'emissiveTexture': {'index': 2},
                   'pbrMetallicRoughness': dict(matte, baseColorTexture={'index': 1})}],
    'samplers': [{'magFilter': 9728, 'minFilter': 9728, 'wrapS': 33071, 'wrapT': 33071}],
    'images': [{'bufferView': im[0], 'mimeType': 'image/png', 'name': 'manju_albedo'},
               {'bufferView': im[1], 'mimeType': 'image/png', 'name': 'monster_albedo'},
               {'bufferView': im[2], 'mimeType': 'image/png', 'name': 'monster_emissive'}],
    'textures': [{'sampler': 0, 'source': i} for i in range(3)],
    'animations': animations, 'accessors': accs, 'bufferViews': views,
}
while len(buf) % 4:
    buf.append(0)
gltf['buffers'] = [{'byteLength': len(buf)}]
js = json.dumps(gltf, separators=(',', ':')).encode()
js += b' ' * ((4 - len(js) % 4) % 4)
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'public', 'models', 'manju_monster.glb')
with open(out, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(buf)))
    f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
    f.write(struct.pack('<II', len(buf), 0x004E4942)); f.write(buf)
img_monster.save(os.path.join(os.path.dirname(os.path.abspath(out)), 'manju_monster_albedo.png'))
print(f'{out}: monster rest height {(M + 0)[:, 1].max():.2f} m, tris Manju {len(indices)} + monster '
      f'{len(indices) + EX_TRIS}, end-of-Caught face at {np.round(FACE_END, 2)}, '
      f'{os.path.getsize(out) / 1024:.0f} KB')
