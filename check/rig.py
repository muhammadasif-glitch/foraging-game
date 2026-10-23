"""Skeletons, motion capture and retargeting for the characters.

Quaternions are [x, y, z, w] arrays (as glTF has them); every function
takes arrays of any leading shape.

A clip of motion capture (BVH, the CMU database) moves a model of another
skeleton this way: each bone of the model turns, in the world, as its bone
in the capture turns from its rest, after the two rests are lined up bone
by bone (the shortest turn from the direction of the capture's bone to the
direction of the model's). So a bone points where the captured bone
points, with its twist, whatever the two rest poses (T or A) and the
lengths of the bones. The hips move as the captured hips, scaled by the
heights of the two hips.
"""
import re

import numpy as np


# ------------------------------------------------------------ quaternions
def qmul(a, b):
    ax, ay, az, aw = np.moveaxis(np.asarray(a, dtype=float), -1, 0)
    bx, by, bz, bw = np.moveaxis(np.asarray(b, dtype=float), -1, 0)
    return np.stack([aw * bx + ax * bw + ay * bz - az * by,
                     aw * by - ax * bz + ay * bw + az * bx,
                     aw * bz + ax * by - ay * bx + az * bw,
                     aw * bw - ax * bx - ay * by - az * bz], axis=-1)


def qinv(q):
    q = np.asarray(q, dtype=float)
    return q * np.array([-1, -1, -1, 1.0])


def qrot(q, v):
    q = np.asarray(q, dtype=float)
    v = np.asarray(v, dtype=float)
    u, w = q[..., :3], q[..., 3:4]
    t = 2 * np.cross(u, v)
    return v + w * t + np.cross(u, t)


def qaxis(axis, angle):
    axis = np.asarray(axis, dtype=float)
    angle = np.asarray(angle, dtype=float)[..., None]
    return np.concatenate([axis * np.sin(angle / 2), np.cos(angle / 2)], axis=-1)


def qnorm(q):
    q = np.asarray(q, dtype=float)
    return q / np.linalg.norm(q, axis=-1, keepdims=True)


def qbetween(u, v):
    """The shortest turn taking direction u to direction v."""
    u = np.asarray(u, dtype=float) / np.linalg.norm(u)
    v = np.asarray(v, dtype=float) / np.linalg.norm(v)
    d = float(np.dot(u, v))
    if d < -0.999999:
        side = np.cross([1.0, 0, 0], u)
        if np.linalg.norm(side) < 1e-6:
            side = np.cross([0, 1.0, 0], u)
        return qaxis(side / np.linalg.norm(side), np.pi)
    c = np.cross(u, v)
    return qnorm(np.array([c[0], c[1], c[2], 1 + d]))


def qcontinuous(q):
    """The same turns with no sign flips from frame to frame (for lerping)."""
    q = np.array(q, dtype=float)
    for i in range(1, len(q)):
        if np.dot(q[i], q[i - 1]) < 0:
            q[i] = -q[i]
    return q


def qslerp(a, b, t):
    a, b = np.asarray(a, dtype=float), np.asarray(b, dtype=float)
    t = np.asarray(t, dtype=float)[..., None]
    d = np.sum(a * b, axis=-1, keepdims=True)
    b = np.where(d < 0, -b, b)
    d = np.abs(d)
    ang = np.arccos(np.clip(d, -1, 1))
    s = np.sin(ang)
    small = s < 1e-6
    wa = np.where(small, 1 - t, np.sin((1 - t) * ang) / np.where(small, 1, s))
    wb = np.where(small, t, np.sin(t * ang) / np.where(small, 1, s))
    return qnorm(wa * a + wb * b)


def qfrom_matrix(m):
    m = np.asarray(m, dtype=float)
    tr = m[0, 0] + m[1, 1] + m[2, 2]
    if tr > 0:
        s = np.sqrt(tr + 1.0) * 2
        q = [(m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s, 0.25 * s]
    elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
        s = np.sqrt(1.0 + m[0, 0] - m[1, 1] - m[2, 2]) * 2
        q = [0.25 * s, (m[0, 1] + m[1, 0]) / s, (m[0, 2] + m[2, 0]) / s, (m[2, 1] - m[1, 2]) / s]
    elif m[1, 1] > m[2, 2]:
        s = np.sqrt(1.0 + m[1, 1] - m[0, 0] - m[2, 2]) * 2
        q = [(m[0, 1] + m[1, 0]) / s, 0.25 * s, (m[1, 2] + m[2, 1]) / s, (m[0, 2] - m[2, 0]) / s]
    else:
        s = np.sqrt(1.0 + m[2, 2] - m[0, 0] - m[1, 1]) * 2
        q = [(m[0, 2] + m[2, 0]) / s, (m[1, 2] + m[2, 1]) / s, 0.25 * s, (m[1, 0] - m[0, 1]) / s]
    return qnorm(np.array(q))


def frame(d, side):
    """Three axes as columns: along d, along side (made square to d), and
    the third."""
    d = np.asarray(d, dtype=float)
    d = d / np.linalg.norm(d)
    s = np.asarray(side, dtype=float)
    s = s - np.dot(s, d) * d
    s = s / np.linalg.norm(s)
    return np.stack([d, s, np.cross(d, s)], axis=1)


def frame_turn(d0, s0, d1, s1):
    """The turn taking a bone along d0, its side along s0, to d1 and s1."""
    return qfrom_matrix(frame(d1, s1) @ frame(d0, s0).T)


def two_bone(a, b0, c0, target, pole, a_rest):
    """Where the middle joint of a chain a-b-c (b0, c0 and a_rest: at
    rest) goes so that its end reaches target (as near as it can), bending
    toward pole; and where its end goes."""
    l1 = np.linalg.norm(b0 - a_rest)
    l2 = np.linalg.norm(c0 - b0)
    d = target - a
    dist = np.clip(np.linalg.norm(d), abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3)
    u = d / np.linalg.norm(d)
    v = pole - np.dot(pole, u) * u
    v = v / np.linalg.norm(v)
    cos_a = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist)
    ang = np.arccos(np.clip(cos_a, -1, 1))
    b = a + l1 * (np.cos(ang) * u + np.sin(ang) * v)
    c = a + dist * u
    return b, c


# ------------------------------------------------------------ a glTF skeleton
class Skeleton:
    """The nodes of a glTF scene at rest: local and world turn, place, scale."""

    def __init__(self, doc):
        nodes = doc["nodes"]
        self.names = [n.get("name", "node%d" % i) for i, n in enumerate(nodes)]
        self.parent = [-1] * len(nodes)
        for i, n in enumerate(nodes):
            for c in n.get("children", []):
                self.parent[c] = i
        self.t = np.zeros((len(nodes), 3))
        self.r = np.tile([0, 0, 0, 1.0], (len(nodes), 1))
        self.s = np.ones((len(nodes), 3))
        for i, n in enumerate(nodes):
            if "matrix" in n:
                m = np.array(n["matrix"], dtype=float).reshape(4, 4).T
                sc = np.linalg.norm(m[:3, :3], axis=0)
                self.t[i] = m[:3, 3]
                self.s[i] = sc
                self.r[i] = qfrom_matrix(m[:3, :3] / sc)
            else:
                self.t[i] = n.get("translation", [0, 0, 0])
                self.r[i] = n.get("rotation", [0, 0, 0, 1])
                self.s[i] = n.get("scale", [1, 1, 1])
        self.order = []
        seen = set()

        def visit(i):
            if i in seen:
                return
            if self.parent[i] >= 0:
                visit(self.parent[i])
            seen.add(i)
            self.order.append(i)

        for i in range(len(nodes)):
            visit(i)
        self.wr, self.wp, self.ws = self.world(self.r, self.t)

    def world(self, r, t):
        """World turns, places and (uniform) scales of every node for the
        local turns r and places t ((nodes, ...) or (frames, nodes, ...))."""
        r = np.asarray(r, dtype=float)
        t = np.asarray(t, dtype=float)
        wr = np.zeros_like(r)
        wp = np.zeros_like(t)
        ws = np.ones(r.shape[:-1])
        for i in self.order:
            p = self.parent[i]
            sc = float(np.mean(self.s[i]))
            if p < 0:
                wr[..., i, :] = r[..., i, :]
                wp[..., i, :] = t[..., i, :]
                ws[..., i] = sc
            else:
                wr[..., i, :] = qmul(wr[..., p, :], r[..., i, :])
                wp[..., i, :] = wp[..., p, :] + qrot(wr[..., p, :], t[..., i, :] * ws[..., p, None])
                ws[..., i] = ws[..., p] * sc
        return wr, wp, ws

    def matrix(self, i):
        """The world matrix (4 x 4) of node i at rest."""
        x, y, z, w = self.wr[i]
        r = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                      [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                      [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
        m = np.eye(4)
        m[:3, :3] = r * self.ws[i]
        m[:3, 3] = self.wp[i]
        return m

    def points(self, model):
        """The points of the meshes at rest, (points, 3), each moved by the
        bone that moves it most, and that bone's node (the mesh's own node
        for a mesh with no skin)."""
        places, nodes = [], []
        for i, node in enumerate(model.doc["nodes"]):
            if "mesh" not in node:
                continue
            skin = model.doc["skins"][node["skin"]] if "skin" in node else None
            for prim in model.doc["meshes"][node["mesh"]]["primitives"]:
                pos = model.accessor(prim["attributes"]["POSITION"]).astype(float)
                pts = np.concatenate([pos, np.ones((len(pos), 1))], axis=1)
                if skin is None or "JOINTS_0" not in prim["attributes"]:
                    places.append((pts @ self.matrix(i).T)[:, :3])
                    nodes.append(np.full(len(pts), i))
                    continue
                joints = model.accessor(prim["attributes"]["JOINTS_0"]).astype(int)
                weights = model.accessor(prim["attributes"]["WEIGHTS_0"]).astype(float)
                top = joints[np.arange(len(joints)), np.argmax(weights, axis=1)]
                ibm = model.accessor(skin["inverseBindMatrices"]).reshape(-1, 4, 4).transpose(0, 2, 1)
                p = np.empty((len(pts), 3))
                for j in np.unique(top):
                    sel = top == j
                    p[sel] = (pts[sel] @ (self.matrix(skin["joints"][j]) @ ibm[j]).T)[:, :3]
                places.append(p)
                nodes.append(np.asarray(skin["joints"])[top])
        return np.concatenate(places), np.concatenate(nodes)

    def floor(self, model):
        """The height of the soles at rest: the lowest point of the meshes."""
        return float(self.points(model)[0][:, 1].min())

    def under(self, i, top):
        """Whether node i is node top or below it."""
        while i >= 0:
            if i == top:
                return True
            i = self.parent[i]
        return False

    def find(self, pattern):
        """The node whose name matches pattern (a regular expression)."""
        hits = [i for i, n in enumerate(self.names) if re.search(pattern, n)]
        if len(hits) != 1:
            raise KeyError("%s: %d nodes (%s)" % (pattern, len(hits), ", ".join(self.names[i] for i in hits[:5])))
        return hits[0]


# ------------------------------------------------------------ motion capture
class BVH:
    """A BVH file: joints (name, parent, offset, channels) and frames. fps:
    the frame rate when the file's own is wrong (CMU subject 143 is at 60
    frames a second, its files say 120)."""

    def __init__(self, path, fps=None):
        text = open(path).read()
        head, motion = text.split("MOTION")
        self.names, self.parent, self.offset, self.channels = [], [], [], []
        stack, last = [], -1
        tokens = head.split()
        i = 0
        while i < len(tokens):
            tok = tokens[i]
            if tok in ("ROOT", "JOINT"):
                self.names.append(tokens[i + 1])
                self.parent.append(stack[-1] if stack else -1)
                self.offset.append(None)
                self.channels.append([])
                last = len(self.names) - 1
                i += 2
            elif tok == "End":
                self.names.append(self.names[stack[-1]] + "_end")
                self.parent.append(stack[-1])
                self.offset.append(None)
                self.channels.append([])
                last = len(self.names) - 1
                i += 2
            elif tok == "{":
                stack.append(last)
                i += 1
            elif tok == "}":
                stack.pop()
                i += 1
            elif tok == "OFFSET":
                self.offset[last] = [float(x) for x in tokens[i + 1:i + 4]]
                i += 4
            elif tok == "CHANNELS":
                n = int(tokens[i + 1])
                self.channels[last] = tokens[i + 2:i + 2 + n]
                i += 2 + n
            else:
                i += 1
        self.offset = np.array(self.offset, dtype=float)
        lines = motion.strip().splitlines()
        self.dt = 1.0 / fps if fps else float(lines[1].split(":")[1])
        self.data = np.array([[float(x) for x in ln.split()] for ln in lines[2:] if ln.strip()])

    def pose(self, frames=None):
        """World turns and places of the joints, (frames, joints, 4|3)."""
        data = self.data if frames is None else self.data[frames]
        nf, nj = len(data), len(self.names)
        local = np.tile([0, 0, 0, 1.0], (nf, nj, 1))
        root = np.zeros((nf, 3))
        col = 0
        axes = {"X": [1, 0, 0], "Y": [0, 1, 0], "Z": [0, 0, 1]}
        for j in range(nj):
            q = np.tile([0, 0, 0, 1.0], (nf, 1))
            for ch in self.channels[j]:
                v = data[:, col]
                col += 1
                if ch.endswith("position"):
                    root[:, "XYZ".index(ch[0])] = v
                else:
                    q = qmul(q, qaxis(axes[ch[0]], np.radians(v)))
            local[:, j] = q
        wr = np.zeros((nf, nj, 4))
        wp = np.zeros((nf, nj, 3))
        for j in range(nj):
            p = self.parent[j]
            if p < 0:
                wr[:, j] = local[:, j]
                wp[:, j] = root + self.offset[j]
            else:
                wr[:, j] = qmul(wr[:, p], local[:, j])
                wp[:, j] = wp[:, p] + qrot(wr[:, p], self.offset[j])
        return wr, wp

    def index(self, name):
        return self.names.index(name)


# ------------------------------------------------------------ retargeting
# the bones of the CMU skeleton, each with the joint its bone points to
CMU = {
    "Hips": "LowerBack", "LowerBack": "Spine", "Spine": "Spine1", "Spine1": "Neck", "Neck": "Neck1",
    "Neck1": "Head", "Head": "Head_end",
    "LeftShoulder": "LeftArm", "LeftArm": "LeftForeArm", "LeftForeArm": "LeftHand", "LeftHand": "LeftFingerBase",
    "RightShoulder": "RightArm", "RightArm": "RightForeArm", "RightForeArm": "RightHand",
    "RightHand": "RightFingerBase",
    "LeftUpLeg": "LeftLeg", "LeftLeg": "LeftFoot", "LeftFoot": "LeftToeBase", "LeftToeBase": "LeftToeBase_end",
    "RightUpLeg": "RightLeg", "RightLeg": "RightFoot", "RightFoot": "RightToeBase",
    "RightToeBase": "RightToeBase_end",
}


class Retarget:
    """Moves skeleton `sk` (glTF) by a BVH. bones: {CMU joint: (model node,
    node its bone points to or None)}; hips: the model's hips node; floor:
    the height of its soles at rest (Skeleton.floor)."""

    def __init__(self, sk, bones, hips, floor):
        self.sk, self.bones, self.hips = sk, bones, hips
        # the model's direction of each bone at rest
        self.dir = {}
        for src, (node, tip) in bones.items():
            if tip is not None:
                self.dir[src] = sk.wp[tip] - sk.wp[node]
        self.ground = floor
        self.hip_height = sk.wp[hips][1] - floor

    def run(self, bvh, frames, heading=0.0, front=0.0, drift=None, spread=None):
        """Local turns for every node and the hips' local place, (frames,
        nodes, 4) and (frames, 3), for the BVH frames. heading: the turn
        (about up) that sets the person captured facing +z; front: the way
        the model faces (radians from +z about up); drift: the speed taken
        out (the model's way, units of the capture a frame) so that the clip
        runs on the spot; spread: {"Left"|"Right": degrees} the arms held
        further out from the body (a model wider than the person captured)."""
        sk = self.sk
        wr, wp = bvh.pose(frames)
        nf = len(wr)
        face = qaxis([0, 1, 0], front)
        turn = qmul(face, qaxis([0, 1, 0], heading))
        target_world = {}
        for src, (node, _) in self.bones.items():
            s = bvh.index(src)
            # the bone's turn since rest, as the model faces
            delta = qmul(qmul(turn, wr[:, s]), qinv(face))
            rest = bvh.offset[bvh.index(CMU[src])] if src in CMU else None
            if rest is not None and src in self.dir and np.linalg.norm(rest) > 1e-6 and np.linalg.norm(self.dir[src]) > 1e-6:
                align = qbetween(qrot(face, rest), self.dir[src])
            else:
                align = np.array([0, 0, 0, 1.0])
            world = qmul(qmul(delta, qinv(align)), sk.wr[node])
            for side, deg in (spread or {}).items():
                if src in (side + "Arm", side + "ForeArm", side + "Hand"):
                    # about the way the body faces
                    world = qmul(qaxis(qrot(face, [0, 0, 1.0]), np.radians(deg if side == "Left" else -deg)), world)
            target_world[node] = qnorm(world)
        # the hips: height scaled by the two hip heights, on the spot
        h = bvh.index("Hips")
        p = qrot(turn, wp[:, h])
        src_ground = self.capture_ground(bvh)
        scale = self.hip_height / max(1e-6, self.capture_hip_height(bvh) - src_ground)
        if drift is not None:
            p = p - np.arange(nf)[:, None] * drift[None, :]
        p_mid = p.mean(axis=0)
        hips_world = np.zeros((nf, 3))
        hips_world[:, 0] = sk.wp[self.hips][0] + (p[:, 0] - p_mid[0]) * scale
        hips_world[:, 2] = sk.wp[self.hips][2] + (p[:, 2] - p_mid[2]) * scale
        hips_world[:, 1] = self.ground + (p[:, 1] - src_ground) * scale
        # local turns, parents first; the bones not moved keep their rest turn
        local = np.tile(sk.r, (nf, 1, 1))
        world = np.zeros((nf, len(sk.names), 4))
        wpos = np.zeros((nf, len(sk.names), 3))
        wsc = np.ones((nf, len(sk.names)))
        hips_local = np.tile(sk.t[self.hips], (nf, 1))
        for i in sk.order:
            par = sk.parent[i]
            pr = world[:, par] if par >= 0 else np.tile([0, 0, 0, 1.0], (nf, 1))
            pp = wpos[:, par] if par >= 0 else np.zeros((nf, 3))
            ps = wsc[:, par] if par >= 0 else np.ones(nf)
            if i in target_world:
                world[:, i] = target_world[i]
                local[:, i] = qnorm(qmul(qinv(pr), target_world[i]))
            else:
                world[:, i] = qmul(pr, local[:, i])
            if i == self.hips:
                hips_local = qrot(qinv(pr), hips_world - pp) / ps[:, None]
                wpos[:, i] = hips_world
            else:
                wpos[:, i] = pp + qrot(pr, sk.t[i] * ps[:, None])
            wsc[:, i] = ps * float(np.mean(sk.s[i]))
        return local, hips_local, wpos

    @staticmethod
    def capture_ground(bvh):
        _, wp = bvh.pose(slice(0, 1))
        toes = [bvh.index("LeftToeBase_end"), bvh.index("RightToeBase_end"), bvh.index("LeftFoot"),
                bvh.index("RightFoot")]
        return float(min(wp[0, t][1] for t in toes))

    @staticmethod
    def capture_hip_height(bvh):
        _, wp = bvh.pose(slice(0, 1))
        return float(wp[0, bvh.index("Hips")][1])


# ------------------------------------------------------------ glTF clips
def sample_clip(model, sk, anim, times):
    """Local turns and places of every node at times (seconds) in clip
    anim (an index or a name), (frames, nodes, 4) and (frames, nodes, 3)."""
    anims = model.doc.get("animations", [])
    if not isinstance(anim, int):
        anim = [a.get("name") for a in anims].index(anim)
    a = anims[anim]
    times = np.asarray(times, dtype=float)
    r = np.tile(sk.r, (len(times), 1, 1))
    t = np.tile(sk.t, (len(times), 1, 1))
    for ch in a["channels"]:
        node, path = ch["target"].get("node"), ch["target"]["path"]
        if node is None or path not in ("rotation", "translation"):
            continue
        s = a["samplers"][ch["sampler"]]
        inp = model.accessor(s["input"])[:, 0].astype(float)
        out = model.accessor(s["output"]).astype(float)
        how = s.get("interpolation", "LINEAR")
        if how == "CUBICSPLINE":
            out = out.reshape(len(inp), 3, -1)[:, 1]
        i = np.clip(np.searchsorted(inp, times, side="right") - 1, 0, len(inp) - 1)
        j = np.minimum(i + 1, len(inp) - 1)
        span = np.where(inp[j] > inp[i], inp[j] - inp[i], 1.0)
        f = np.clip((times - inp[i]) / span, 0, 1)
        if how == "STEP":
            f = np.zeros_like(f)
        if path == "rotation":
            r[:, node] = qslerp(out[i], out[j], f)
        else:
            t[:, node] = out[i] + (out[j] - out[i]) * f[:, None]
    return r, t


def clip_duration(model, anim):
    anims = model.doc.get("animations", [])
    if not isinstance(anim, int):
        anim = [a.get("name") for a in anims].index(anim)
    return max(float(model.accessor(s["input"]).max()) for s in anims[anim]["samplers"])


# ------------------------------------------------------------ gait
def gait_of(wpos, feet, hips, forward, fps, up=1):
    """The feet of a clip: wpos (frames, nodes, 3) world places, feet
    [[left nodes], [right nodes]] (ankle, toe), hips node, forward (the way
    the body goes, level), fps frames a second. A foot lands when it is
    furthest in front of the hips. Gives {strikes: [left frames, right
    frames], speed: how fast the ground goes by under a planted foot
    (units a second; 0 for a clip that moves over the ground), ground}."""
    forward = np.asarray(forward, dtype=float)
    forward = forward / np.linalg.norm(forward)
    out = {"strikes": [], "lift": []}
    ground = min(float(np.min([wpos[:, n, up] for n in nodes])) for nodes in feet)
    speeds = []
    min_gap = int(0.22 * fps)
    for nodes in feet:
        p = np.mean([wpos[:, k] for k in nodes], axis=0)
        ahead = (p - wpos[:, hips]) @ forward
        n = len(ahead)
        peaks = [i for i in range(1, n - 1) if ahead[i] >= ahead[i - 1] and ahead[i] > ahead[i + 1]]
        lows = [i for i in range(1, n - 1) if ahead[i] <= ahead[i - 1] and ahead[i] < ahead[i + 1]]
        span = ahead.max() - ahead.min()
        # only the real swings: a peak well above the lows around it
        good = []
        for i in peaks:
            before = [ahead[j] for j in lows if i - fps < j < i] or [ahead[:i + 1].min()]
            after = [ahead[j] for j in lows if i < j < i + fps] or [ahead[i:].min()]
            if ahead[i] - max(min(before), min(after)) > 0.5 * span:
                if not good or i - good[-1] >= min_gap:
                    good.append(i)
        out["strikes"].append(good)
        # on the ground (the lower part of its rise), the foot goes back as
        # fast as the ground goes by
        y = np.min([wpos[:, k, up] for k in nodes], axis=0) - ground
        rise = max(1e-9, np.percentile(y, 98))
        planted = y < 0.12 * rise
        v = np.gradient(p, axis=0) * fps
        back = -(v @ forward)
        if planted.any():
            speeds.append(back[planted])
    out["speed"] = float(np.median(np.concatenate(speeds))) if speeds else 0.0
    out["ground"] = ground
    return out
