"""Minimal loader for Shapr3D OBJ (global indices, per-vertex RGB colors, groups)."""
import numpy as np

def load(path):
    V, C, groups = [], [], []   # groups: (name, [face triples of vertex idx])
    cur = None
    with open(path) as fh:
        for line in fh:
            if line.startswith('v '):
                p = line.split()
                V.append([float(p[1]), float(p[2]), float(p[3])])
                C.append([float(x) for x in p[4:7]] if len(p) >= 7 else [0.8, 0.8, 0.8])
            elif line.startswith('f '):
                idx = [int(t.split('/')[0]) - 1 for t in line.split()[1:]]
                for k in range(1, len(idx) - 1):
                    cur[1].append((idx[0], idx[k], idx[k + 1]))
            elif line.startswith('g ') or line.startswith('o '):
                cur = (line[2:].strip(), [])
                groups.append(cur)
    return np.array(V), np.array(C), [(n, np.array(f, dtype=np.int64)) for n, f in groups if f]
