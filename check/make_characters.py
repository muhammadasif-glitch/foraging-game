"""Makes the characters of the game from the files that
check/media/get_characters.py downloaded (the characters folder):
characters/<name>.js for each (its 3D model with its clips and its
sounds, packed so that the game also runs opened as a file) and their
credits (characters/CREDITS.md).

    python check/make_characters.py PATH/TO/characters

Each model keeps 3 clips that loop, each starting as the left foot lands:
idle (standing), walk and run. The man, the woman and the robot walk and
run as people of the CMU motion capture database did; the knight has its
own walk and run; the dog's trot and gallop are made here
(check/dog_gait.py). The game turns a clip as fast as the character goes
over the ground (characters.js), so its feet do not slide. A fourth clip,
eat, loops while the character eats: made here from the idle clip for a
person (eat_clip), with the dog's gaits for the dog.
"""
import base64
import json
import math
import os
import re
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import dog_gait  # noqa: E402
import glb  # noqa: E402
import rig  # noqa: E402

REPO = os.path.dirname(HERE)
OUT = os.path.join(REPO, "characters")
FPS = 30                     # clips made here: frames a second
TEXTURE = 1024               # largest texture, pixels a side

# fps: CMU subject 143 was captured at 60 frames a second (its files say 120)
TRIAL_FPS = {"143": 60}

CHARACTERS = {
    "man": {
        "model": "models/man/bfbb95c3cb2b4e89a20d3d201b05045f.glb", "rig": "renderpeople",
        "clips": {"idle": ("mocap", "86_10", 3110, 3250), "walk": ("mocap", "35_01", 144, 280),
                  "run": ("mocap", "16_46", 54, 134), "eat": ("bite", -0.004, 0.058)},
    },
    "woman": {
        "model": "models/extra/woman_realistic/d1ce2b8009b8401481408aeecea903d0.glb", "rig": "cc",
        "spread": 7, "drop": ["Std_Tongue", "Teeth", "Mouth", "EyeMoisture_Left", "EyeMoisture_Right"],
        "small": "Eyelash|Scalp|Nails|Eye_",
        "clips": {"idle": ("mocap", "91_29", 60, 280), "walk": ("mocap", "91_31", 324, 472),
                  "run": ("mocap", "16_46", 54, 134), "eat": ("bite", 0.0, 0.056)},
    },
    "knight": {
        "model": "models/knight/e3978fb660cf47278485d44eeba488ef.glb", "rig": "knight",
        "clips": {"idle": ("mocap", "86_10", 3110, 3250), "walk": ("own", "WALK_player_Root"),
                  "run": ("own", "run_player_Root"), "eat": ("bite", 0.0, 0.075)},
    },
    "dog": {
        "model": "models/dog/9abfce885a834399b2c3ccaed51cd474.glb", "rig": "dog",
        "clips": {"idle": ("own", "0|standing_0"), "walk": ("gait", "trot"), "run": ("gait", "gallop"),
                  "eat": ("gait", "eat")},
    },
    "robot": {
        "model": "models/robot/8993602ca91f4c499e690e5dae19f978.glb", "rig": "robot",
        "clips": {"idle": ("own", "IDLE"), "walk": ("mocap", "35_01", 144, 280),
                  "run": ("mocap", "16_46", 54, 134), "eat": ("bite", 0.05, 0.08)},
    },
}


# the sounds of each character (characters/sounds of the download, by
# Freesound id): steps, its voice when it finds a food room (found), bumps
# into a wall (oof) or is full (full), eating; seconds kept of each kind; a
# kind left out is made in the browser (js/sound.js)
SOUNDS = {
    "man": {"steps": ("steps_shoes", [32638, 32645, 32635, 32639, 504018]),
            "found": ("human_man", [519112, 170779]), "full": ("human_man", [334061]),
            "eat": ("eating", [275015, 348112, 816236, 700417])},
    "woman": {"steps": ("steps_shoes", [32638, 32645, 32635, 32639, 504018]),
              "found": ("human_woman", [170768]), "full": ("human_woman", [445872]),
              "eat": ("eating", [275015, 348112, 816236, 700417])},
    "knight": {"steps": ("steps_boots_armour", [384887, 384882, 384888, 384884]),
               "found": ("human_man", [519112, 170779]), "full": ("human_man", [334061]),
               "eat": ("eating", [275015, 348112, 816236, 700417])},
    "robot": {"steps": ("steps_robot", [813053, 813054]),
              "found": ("robot_voice", [676303, 676304]), "full": ("robot_voice", [636656]),
              "oof": ("robot_voice", [415556])},
    "dog": {"found": ("dog_bark", [517132, 483184, 535457]), "oof": ("dog_whine_pant", [350593]),
            "full": ("dog_whine_pant", [841349, 827433]), "eat": ("eating", [700417, 816236])},
}
LONGEST = {"steps": 0.26, "found": 1.2, "full": 1.6, "oof": 0.9, "eat": 0.7}
STEP_LONGEST = {"steps_robot": 0.34, "steps_boots_armour": 0.3}
SR = 44100


def decode(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def cut(x, longest):
    """From just before the first loud moment, at most longest seconds,
    faded out; as loud as the others of its kind (peak at -3 dB)."""
    win = int(0.005 * SR)
    m = len(x) // win
    env = np.sqrt(np.mean(x[:m * win].reshape(m, win) ** 2, axis=1) + 1e-12)
    db = 20 * np.log10(env)
    loud = np.nonzero(db > db.max() - 24)[0]
    start = max(0, loud[0] * win - int(0.004 * SR))
    quiet = np.nonzero(db > db.max() - 40)[0]
    end = min(len(x), (quiet[-1] + 1) * win, start + int(longest * SR))
    y = x[start:end].astype(np.float64)
    fade = min(len(y) // 3, int(0.06 * SR))
    if fade > 0:
        y[-fade:] *= np.linspace(1, 0, fade) ** 2
    y[:int(0.002 * SR)] *= np.linspace(0, 1, int(0.002 * SR))
    peak = np.abs(y).max() or 1
    return (y / peak * 10 ** (-3 / 20)).astype(np.float32)


def mp3(y):
    out = subprocess.run(["ffmpeg", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-",
                          "-codec:a", "libmp3lame", "-b:a", "64k", "-f", "mp3", "-"],
                         input=y.tobytes(), capture_output=True, check=True).stdout
    return base64.b64encode(out).decode("ascii")


def sounds_of(name, src_dir):
    out, used = {}, []
    for kind, (folder, ids) in SOUNDS.get(name, {}).items():
        longest = STEP_LONGEST.get(folder, LONGEST[kind]) if kind == "steps" else LONGEST[kind]
        out[kind] = []
        for sid in ids:
            path = os.path.join(src_dir, "sounds", folder, "%d.mp3" % sid)
            out[kind].append(mp3(cut(decode(path), longest)))
            used.append((folder, sid))
    return out, used


# ------------------------------------------------------------ the bones
def bones_of(kind, sk):
    """{CMU joint: (node, node the bone points to)}, the hips, the feet
    [[left ankle, toe], [right ankle, toe]] and the toe tips."""
    f = sk.find
    b = {}
    if kind == "renderpeople":
        p = "walking_"
        chain = [("Hips", "hip_02$", "spine_01_03$"), ("LowerBack", "spine_01_03$", "spine_02_04$"),
                 ("Spine", "spine_02_04$", "spine_03_05$"), ("Spine1", "spine_03_05$", "neck_06$"),
                 ("Neck", "neck_06$", "head_07$"), ("Head", "head_07$", "head_end_08$")]
        for src, a, c in chain:
            b[src] = (f(p + a), f(p + c))
        for side, s in (("Left", "l"), ("Right", "r")):
            n = lambda part: f(p + part + "_%s_\\d+$" % s)
            b[side + "Shoulder"] = (n("shoulder"), n("upperarm"))
            b[side + "Arm"] = (n("upperarm"), n("lowerarm"))
            b[side + "ForeArm"] = (n("lowerarm"), n("hand"))
            b[side + "Hand"] = (n("hand"), n("middle_01"))
            b[side + "UpLeg"] = (n("upperleg"), n("lowerleg"))
            b[side + "Leg"] = (n("lowerleg"), n("foot"))
            b[side + "Foot"] = (n("foot"), n("ball"))
            b[side + "ToeBase"] = (n("ball"), n("foot_end"))
        hips = f(p + "hip_02$")
    elif kind == "cc":
        c = "CC_Base_"
        chain = [("Hips", "Hip", "Waist"), ("LowerBack", "Waist", "Spine01"), ("Spine", "Spine01", "Spine02"),
                 ("Spine1", "Spine02", "NeckTwist01"), ("Neck", "NeckTwist01", "NeckTwist02"),
                 ("Neck1", "NeckTwist02", "Head"), ("Head", "Head", None)]
        for src, a, t in chain:
            b[src] = (f(c + a + "_\\d+$"), f(c + t + "_\\d+$") if t else None)
        for side, s in (("Left", "L_"), ("Right", "R_")):
            n = lambda part: f(c + s + part + "_\\d+$")
            b[side + "Shoulder"] = (n("Clavicle"), n("Upperarm"))
            b[side + "Arm"] = (n("Upperarm"), n("Forearm"))
            b[side + "ForeArm"] = (n("Forearm"), n("Hand"))
            b[side + "Hand"] = (n("Hand"), n("Mid1"))
            b[side + "UpLeg"] = (n("Thigh"), n("Calf"))
            b[side + "Leg"] = (n("Calf"), n("Foot"))
            b[side + "Foot"] = (n("Foot"), n("ToeBase"))
            b[side + "ToeBase"] = (n("ToeBase"), None)
        hips = f(c + "Hip_\\d+$")
    elif kind == "knight":
        n = lambda part: f("^[ _]?" + part + "_\\d+$")
        b["Hips"] = (n("[ _]Pelvis"), n("[ _]Spine"))
        b["LowerBack"] = (n("[ _]Spine"), n("[ _]Spine1"))
        b["Spine1"] = (n("[ _]Spine1"), n("[ _]Neck"))
        b["Neck"] = (n("[ _]Neck"), n("[ _]Head"))
        b["Head"] = (n("[ _]Head"), None)
        for side, s in (("Left", "L"), ("Right", "R")):
            b[side + "Shoulder"] = (f("Bip01[ _]%s[ _]Clavicle_\\d+$" % s), n("[ _]%s[ _]UpperArm" % s))
            b[side + "Arm"] = (n("[ _]%s[ _]UpperArm" % s), n("[ _]%s[ _]ForeArm" % s))
            b[side + "ForeArm"] = (n("[ _]%s[ _]ForeArm" % s), n("[ _]%s[ _]Hand" % s))
            b[side + "Hand"] = (n("[ _]%s[ _]Hand" % s), n("[ _]%s[ _]Finger" % s))
            b[side + "UpLeg"] = (n("[ _]%s[ _]Thigh" % s), n("[ _]%s[ _]Calf" % s))
            b[side + "Leg"] = (n("[ _]%s[ _]Calf" % s), n("[ _]%s[ _]Foot" % s))
            b[side + "Foot"] = (n("[ _]%s[ _]Foot" % s), n("[ _]%s[ _]Toe0" % s))
            b[side + "ToeBase"] = (n("[ _]%s[ _]Toe0" % s), None)
        hips = n("[ _]Pelvis")
    elif kind == "dog":
        # the hind paws as its left and right feet (the clips start as the
        # hind left lands)
        n = lambda part: f("^" + part + "\\.\\d+_\\d+$")
        hips = n("pelvis_jnt")
        b["Hips"] = (n("pelvis_jnt"), None)
        b["LeftFoot"] = (n("L_foot_jnt"), None)
        b["RightFoot"] = (n("R_foot_jnt"), None)
        b["LeftToeBase"] = (n("LB_mid_jnt"), None)
        b["RightToeBase"] = (n("RB_mid_jnt"), None)
    elif kind == "robot":
        n = lambda part: f("^" + part + "_ROBOT_BONES$")
        # the robot's own names have no sides: the left leg is the one on
        # the left of the way it faces (+z)
        left = "" if sk.wp[n("UPLEG")][0] > sk.wp[n("UPLEG\\.001")][0] else ".001"
        right = ".001" if left == "" else ""
        b["Hips"] = (n("HIPS"), n("BODY"))
        b["Spine1"] = (n("BODY"), n("NECK"))
        b["Neck"] = (n("NECK"), n("HEAD"))
        b["Head"] = (n("HEAD"), None)
        for side, s in (("Left", left), ("Right", right)):
            e = re.escape(s)
            b[side + "Arm"] = (n("ARM" + e), n("FOREARM" + e))
            b[side + "ForeArm"] = (n("FOREARM" + e), n("HAND" + e))
            b[side + "Hand"] = (n("HAND" + e), n("FINGER" + e))
            b[side + "UpLeg"] = (n("UPLEG" + e), n("LEG" + e))
            b[side + "Leg"] = (n("LEG" + e), n("FEET" + e))
            b[side + "Foot"] = (n("FEET" + e), None)
        hips = n("HIPS")
    else:
        raise ValueError(kind)
    feet = []
    for side in ("Left", "Right"):
        nodes = [b[side + "Foot"][0]]
        toe = b.get(side + "ToeBase", (None,))[0]
        if toe is not None:
            nodes.append(toe)
        feet.append(nodes)
    return b, hips, feet


def forward_of(sk, feet, kind):
    """The way the model faces, level: left foot minus right foot, turned a
    quarter about up; a dog (whose paws stand apart): from its hips to its
    chest."""
    if kind == "dog":
        fwd = sk.wp[dog_gait.find(sk, "chest_jnt")] - sk.wp[dog_gait.find(sk, "pelvis_jnt")]
    else:
        fwd = np.cross(sk.wp[feet[0][0]] - sk.wp[feet[1][0]], [0, 1.0, 0])
    fwd[1] = 0
    return fwd / np.linalg.norm(fwd)


# ------------------------------------------------------------ clips
def loop_fold(q):
    """Spreads the difference between the last frame and the first over the
    clip, so that it loops without a jump (q: (frames, 4) turns)."""
    q = rig.qcontinuous(q)
    gap = rig.qmul(q[0], rig.qinv(q[-1]))
    w = np.linspace(0, 1, len(q))[:, None]
    ident = np.tile([0, 0, 0, 1.0], (len(q), 1))
    spread = rig.qslerp(ident, np.tile(gap, (len(q), 1)), w[:, 0])
    return rig.qcontinuous(rig.qnorm(rig.qmul(spread, q)))


def resample(values, src_dt, times, turns):
    n = len(values)
    x = times / src_dt
    i = np.clip(np.floor(x).astype(int), 0, n - 2)
    f = x - i
    if turns:
        return rig.qcontinuous(rig.qslerp(values[i], values[i + 1], f))
    return values[i] + (values[i + 1] - values[i]) * f[:, None]


def mocap_clip(src_dir, sk, bones, hips, floor, front, trial, a, b, spread=None, idle=False):
    """The tracks of a loop made from frames a to b of a CMU trial."""
    bvh = rig.BVH(os.path.join(src_dir, "mocap", trial + ".bvh"), fps=TRIAL_FPS.get(trial.split("_")[0]))
    frames = np.arange(a, b + 1)
    if idle:
        # standing: there and back again, so that the loop has no seam
        frames = np.concatenate([frames, frames[-2::-1]])
    wr, wp = bvh.pose(frames)
    h = bvh.index("Hips")
    travel = wp[-1, h] - wp[0, h]
    travel[1] = 0
    if np.linalg.norm(travel) > 0.05 * rig.Retarget.capture_hip_height(bvh):
        way = math.atan2(travel[0], travel[2])
        moving = True
    else:
        # standing: the way the hips face (+z at rest), on average
        f = rig.qrot(wr[:, h], [0, 0, 1.0]).mean(axis=0)
        way = math.atan2(f[0], f[2])
        moving = False
    turn = rig.qaxis([0, 1, 0], front - way)
    drift = rig.qrot(turn, travel) / (len(frames) - 1) if moving else None
    sides = {"Left": spread, "Right": spread} if spread else None
    rt = rig.Retarget(sk, bones, hips, floor)
    local, hips_local, _ = rt.run(bvh, frames, heading=-way, front=front, drift=drift, spread=sides)
    duration = (len(frames) - 1) * bvh.dt
    times = np.linspace(0, duration, max(2, int(round(duration * FPS))) + 1)
    tracks = []
    for node in sorted({n for n, _ in bones.values()}):
        tracks.append((node, "rotation", resample(loop_fold(local[:, node]), bvh.dt, times, True)))
    hl = hips_local + (hips_local[0] - hips_local[-1])[None, :] * np.linspace(0, 1, len(frames))[:, None]
    tracks.append((hips, "translation", resample(hl, bvh.dt, times, False)))
    return times, tracks


# ------------------------------------------------------------ eating
# A bite, in shares of its time: the right hand comes up from the chest
# with the food (UP), the back and the head bend to meet it (BEND), the hand
# pulls a little away (TEAR) and goes back down (DOWN), and the head nods a
# little as the mouth chews. A bite takes about BITE seconds.
BITE = 2.0
UP_, DOWN = (0.0, 0.22), (0.40, 0.62)
BEND, TEAR = (0.14, 0.28, 0.44), (0.30, 0.35, 0.42)


def ease(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def bump(p, a, b, c):
    """0 before a, up to 1 at b, back to 0 at c."""
    return ease((p - a) / (b - a)) * (1 - ease((p - b) / (c - b)))


def elbow_axes(m, sk, arm, fore, hand):
    """The axis the elbow bends about, in the upper arm's own frame and in
    the forearm's: as the run clip bends it."""
    d = rig.clip_duration(m, "run")
    r, t = rig.sample_clip(m, sk, "run", np.linspace(0, d, 60))
    wr, wp, _ = sk.world(r, t)
    n = np.cross(wp[:, fore] - wp[:, arm], wp[:, hand] - wp[:, fore])
    a = rig.qrot(rig.qinv(wr[:, arm]), n).sum(axis=0)
    b = rig.qrot(rig.qinv(wr[:, fore]), n).sum(axis=0)
    return a / np.linalg.norm(a), b / np.linalg.norm(b)


# the fingers holding the food: degrees each joint of a finger bends
# (from the hand out), and the thumb's
GRIP, THUMB = (50.0, 60.0, 40.0), (0.0, 20.0, 20.0)


def hand_of(sk, hand, knuckle, middle):
    """The way the palm of a hand faces at rest (out of it), its fingers
    and its thumb ([joints from the hand out]; no thumb: None). The palm is
    on the side of the thumb; a hand with no thumb (a gauntlet) faces the
    middle of the body (middle: a place there)."""
    along = sk.wp[knuckle] - sk.wp[hand]
    fingers, thumb = [], None
    for c in [i for i in range(len(sk.names)) if sk.parent[i] == hand]:
        chain = [c]
        while True:
            kids = [i for i in range(len(sk.names)) if sk.parent[i] == chain[-1]]
            if not kids:
                break
            chain.append(kids[0])
        if re.search("thumb", sk.names[c], re.I):
            thumb = chain
        else:
            fingers.append(chain)
    bases = [sk.wp[ch[0]] for ch in fingers]
    if thumb and len(bases) >= 2:
        across = max((a - b for a in bases for b in bases), key=np.linalg.norm)
        palm = np.cross(along, across)
        side = sk.wp[thumb[0]] - sk.wp[hand]
    else:
        side = middle - sk.wp[hand]
        palm = side - np.dot(side, along) / np.dot(along, along) * along
    palm = palm / np.linalg.norm(palm)
    return (palm if np.dot(palm, side) > 0 else -palm), fingers, thumb


def grip(sk, r, palm, chains, degrees):
    """Bends the joints of each chain (frames of local turns r) toward the
    palm by degrees, and gives the joints bent."""
    bent = []
    for chain in chains:
        for k, j in enumerate(chain[:len(degrees)]):
            nxt = chain[k + 1] if k + 1 < len(chain) else None
            d = sk.wp[nxt] - sk.wp[j] if nxt is not None else sk.wp[j] - sk.wp[sk.parent[j]]
            axis = np.cross(d, palm)
            if np.linalg.norm(axis) < 1e-9 or not degrees[k]:
                continue
            axis = rig.qrot(rig.qinv(sk.wr[j]), axis / np.linalg.norm(axis))
            r[:, j] = rig.qnorm(rig.qmul(r[:, j], rig.qaxis(axis, np.radians(degrees[k]))))
            bent.append(j)
    return bent


def set_world(sk, r, t, node, turn):
    """Turns node (frames of local turns r) by turn (frames, 4) in the
    world, about its place; gives the world turns after."""
    wr, _, _ = sk.world(r, t)
    par = sk.parent[node]
    r[:, node] = rig.qnorm(rig.qmul(rig.qinv(wr[:, par]), rig.qmul(turn, wr[:, node])))
    return sk.world(r, t)


def eat_clip(m, sk, bones, fwd, mouth):
    """The tracks of eating: the idle clip, with the right hand bringing
    food from the chest to the mouth, the back and the head bending to meet
    it and the head nodding as the mouth chews; a whole number of bites in
    the idle's loop. mouth: (up, ahead) of the mouth from the head at rest,
    shares of the height."""
    points = sk.points(m)[0]
    height = points[:, 1].max() - points[:, 1].min()
    duration = rig.clip_duration(m, "idle")
    bites = max(1, int(round(duration / BITE)))
    times = np.linspace(0, duration, max(2, int(round(duration * FPS))) + 1)
    p = (times * bites / duration) % 1.0
    r, t = rig.sample_clip(m, sk, "idle", times)
    nf = len(times)
    up = np.array([0, 1.0, 0])
    arm, fore, hand, knuckle = bones["RightArm"][0], bones["RightForeArm"][0], bones["RightHand"][0], bones["RightHand"][1]
    hips, chest, neck, head = bones["Hips"][0], bones["Spine1"][0], bones["Neck"][0], bones["Head"][0]
    hinge_arm, hinge_fore = elbow_axes(m, sk, arm, fore, hand)
    wr, wp, _ = sk.world(r, t)
    # the way the body faces, and its right
    ahead = rig.qrot(rig.qmul(wr[:, hips], rig.qinv(sk.wr[hips])), fwd)
    ahead[:, 1] = 0
    ahead /= np.linalg.norm(ahead, axis=1)[:, None]
    right = np.cross(ahead, up)

    def bend(share, deg):
        # bending forward (the face down) about the body's right
        return rig.qaxis(right, -np.radians(deg) * share)

    bow = 3.0 * bump(p, *BEND)
    nod = 7.0 * bump(p, *BEND)
    chewing = (p > DOWN[0]) * np.sin(np.pi * np.clip((p - DOWN[0]) / (1 - DOWN[0]), 0, 1))
    nod = nod + 1.2 * chewing * np.sin(2 * np.pi * 3 * np.clip((p - DOWN[0]) / (1 - DOWN[0]), 0, 1))
    set_world(sk, r, t, chest, bend(1, bow))
    set_world(sk, r, t, neck, bend(0.4, nod))
    wr, wp, _ = set_world(sk, r, t, head, bend(0.6, nod))
    # the mouth, as the head carries it
    H = height
    rest_mouth = sk.wp[head] + up * mouth[0] * H + fwd * mouth[1] * H
    at_mouth = wp[:, head] + rig.qrot(rig.qmul(wr[:, head], rig.qinv(sk.wr[head])), rest_mouth - sk.wp[head])
    # how far the chest stands out in front of the mouth
    rel = points - rest_mouth
    below = rel @ up
    chest_front = (rel @ fwd)[(below > -0.24 * H) & (below < -0.12 * H) & (np.abs(rel @ np.cross(fwd, up)) < 0.1 * H)].max()
    # the knuckles of the hand: in front of the chest, or just before the
    # mouth
    s = ease((p - UP_[0]) / (UP_[1] - UP_[0])) * (1 - ease((p - DOWN[0]) / (DOWN[1] - DOWN[0])))
    s = s[:, None]
    by_mouth = at_mouth + ahead * 0.035 * H - up * 0.015 * H + right * 0.01 * H
    by_chest = at_mouth + ahead * (chest_front + 0.09 * H) - up * 0.17 * H + right * 0.06 * H
    knuckles = by_chest * (1 - s) + by_mouth * s + ahead * (0.03 * H * np.sin(np.pi * s) + 0.012 * H * bump(p, *TEAR)[:, None])
    # the hand: along it (wrist to knuckles) and out of its palm
    along = (ahead * 0.85 + up * 0.3 - right * 0.2) * (1 - s) + (up * 0.6 - right * 0.7 + ahead * 0.1) * s
    along /= np.linalg.norm(along, axis=1)[:, None]
    palm = (up * 0.5 - right * 0.8) * (1 - s) + (-ahead) * s
    rest_palm, fingers, thumb = hand_of(sk, hand, knuckle, sk.wp[hips])
    hand_along = rig.qrot(rig.qinv(sk.wr[hand]), sk.wp[knuckle] - sk.wp[hand])
    hand_palm = rig.qrot(rig.qinv(sk.wr[hand]), rest_palm)
    arm_along = rig.qrot(rig.qinv(sk.wr[arm]), sk.wp[fore] - sk.wp[arm])
    fore_along = rig.qrot(rig.qinv(sk.wr[fore]), sk.wp[hand] - sk.wp[fore])
    wrist = knuckles - along * np.linalg.norm(sk.wp[knuckle] - sk.wp[hand])
    pole = -up + right * 0.4 + ahead * 0.2
    turns = {arm: [], fore: [], hand: []}
    for f in range(nf):
        e, w = rig.two_bone(wp[f, arm], sk.wp[fore], sk.wp[hand], wrist[f], pole[f], sk.wp[arm])
        n = np.cross(e - wp[f, arm], w - e)
        turns[arm].append(rig.frame_turn(arm_along, hinge_arm, e - wp[f, arm], n))
        turns[fore].append(rig.frame_turn(fore_along, hinge_fore, w - e, n))
        turns[hand].append(rig.frame_turn(hand_along, hand_palm, along[f], palm[f]))
    for node in (arm, fore, hand):
        wr, _, _ = sk.world(r, t)
        r[:, node] = rig.qnorm(rig.qmul(rig.qinv(wr[:, sk.parent[node]]), np.array(turns[node])))
    bent = grip(sk, r, rest_palm, fingers, GRIP) + grip(sk, r, rest_palm, [thumb] if thumb else [], THUMB)
    # the tracks: what the idle moves, and what moves here
    idle = next(a for a in m.doc["animations"] if a.get("name") == "idle")
    moved = {(c["target"]["node"], c["target"]["path"]) for c in idle["channels"]}
    moved.update((node, "rotation") for node in [chest, neck, head, arm, fore, hand] + bent)
    tracks = []
    for node, path in sorted(moved):
        if path == "rotation":
            tracks.append((node, path, rig.qcontinuous(r[:, node])))
        elif path == "translation":
            tracks.append((node, path, t[:, node]))
    return times, tracks


def measure(m, sk, clip, feet, hips, forward):
    """{duration, offset (where in the clip the left foot lands, 0 to 1),
    cycles, stride (units the ground goes by in a cycle), right (where the
    right foot lands, in a cycle)}."""
    d = rig.clip_duration(m, clip)
    out = {"duration": round(d, 4)}
    fps = 120
    ts = np.arange(0, d, 1.0 / fps)
    r, t = rig.sample_clip(m, sk, clip, ts)
    _, wp, _ = sk.world(r, t)
    # the clip loops: twice over, to see the feet land at the seam
    wp2 = np.concatenate([wp, wp], axis=0)
    g = rig.gait_of(wp2, feet, hips, forward, fps)
    n = len(ts)
    left = sorted({s % n for s in g["strikes"][0]})
    right = sorted({s % n for s in g["strikes"][1]})
    cycles = max(1, len(left))
    out["cycles"] = cycles
    out["offset"] = round(left[0] / n, 4) if left else 0.0
    if right and left:
        rp = ((right[0] - left[0]) % n) / n * cycles
        out["right"] = round(rp % 1, 4)
    else:
        out["right"] = 0.5
    out["stride"] = round(g["speed"] * d / cycles, 4)
    return out


# ------------------------------------------------------------ a character
def make(name, cfg, src_dir):
    m = glb.read(os.path.join(src_dir, cfg["model"]))
    m.spec_gloss_to_metal_rough()
    m.strip_morphs()
    drop = set(cfg.get("drop", []))
    if drop:
        for node in m.doc["nodes"]:
            if "mesh" in node:
                mats = {m.doc["materials"][p["material"]].get("name") for p in m.doc["meshes"][node["mesh"]]["primitives"]
                        if "material" in p}
                if mats & drop:
                    node.pop("mesh", None)
                    node.pop("skin", None)
    small = {i: 512 for i in m.images_of(cfg["small"])} if cfg.get("small") else None
    m.resize_images(TEXTURE, smaller=small)
    m.slim()
    sk = rig.Skeleton(m.doc)
    bones, hips, feet = bones_of(cfg["rig"], sk)
    fwd = forward_of(sk, feet, cfg["rig"])
    front = math.atan2(fwd[0], fwd[2])
    floor = sk.floor(m)
    own = {spec[1]: clip for clip, spec in cfg["clips"].items() if spec[0] == "own"}
    m.keep_clips(own)
    for clip, spec in cfg["clips"].items():
        if spec[0] == "gait":
            times, tracks = dog_gait.make(sk, spec[1])
            m.add_clip(clip, times, tracks)
        if spec[0] == "mocap":
            times, tracks = mocap_clip(src_dir, sk, bones, hips, floor, front, spec[1], spec[2], spec[3], cfg.get("spread"),
                                       idle=clip == "idle")
            m.add_clip(clip, times, tracks)
        if spec[0] == "bite":
            times, tracks = eat_clip(m, sk, bones, fwd, spec[1:])
            m.add_clip(clip, times, tracks)
    # every clip moves every node any clip moves (so that a node does not
    # stay as the last clip left it)
    moved = {}
    for a in m.doc["animations"]:
        for c in a["channels"]:
            moved[(c["target"]["node"], c["target"]["path"])] = True
    for a in m.doc["animations"]:
        have = {(c["target"]["node"], c["target"]["path"]) for c in a["channels"]}
        t0 = m.add_accessor(np.array([0.0], dtype=np.float32), "SCALAR")
        for node, path in moved:
            if (node, path) in have:
                continue
            value = {"rotation": sk.r[node], "translation": sk.t[node], "scale": sk.s[node]}[path]
            out = m.add_accessor(np.array([value], dtype=np.float32), "VEC4" if path == "rotation" else "VEC3")
            a["samplers"].append({"input": t0, "output": out, "interpolation": "STEP"})
            a["channels"].append({"sampler": len(a["samplers"]) - 1, "target": {"node": node, "path": path}})
    clips = {}
    for clip, spec in cfg["clips"].items():
        if clip in ("idle", "eat"):
            clips[clip] = {"duration": round(rig.clip_duration(m, clip), 4)}
        elif spec[0] == "gait":
            # made here: as it was made (the left hind paw lands at 0)
            G = dog_gait.GAITS[spec[1]]
            clips[clip] = {"duration": round(rig.clip_duration(m, clip), 4), "cycles": 1, "offset": 0.0,
                           "right": G["phase"]["RH"], "stride": G["stride"]}
        else:
            clips[clip] = measure(m, sk, clip, feet, hips, fwd)
    path = os.path.join(OUT, name + ".glb")
    size = m.write(path)
    return path, size, {"front": round(front, 5), "floor": round(floor, 5), "clips": clips}


def pack(name, path, info):
    data = base64.b64encode(open(path, "rb").read()).decode("ascii")
    info = dict(info, model=data)
    with open(os.path.join(OUT, name + ".js"), "w") as f:
        f.write("/* The %s of the game: its 3D model (glTF, base64), clips and sounds; made by "
                "check/make_characters.py. Credits: characters/CREDITS.md. */\n" % name)
        f.write("(function (root) {\n  var FG = root.FG = root.FG || {};\n"
                "  (FG.characterFiles = FG.characterFiles || {})[%s] = %s;\n"
                "})(typeof window !== \"undefined\" ? window : globalThis);\n" % (json.dumps(name), json.dumps(info)))


def main():
    src_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.expanduser("~"), "Downloads", "characters")
    os.makedirs(OUT, exist_ok=True)
    only = sys.argv[2:] or list(CHARACTERS)
    for name in only:
        path, size, info = make(name, CHARACTERS[name], src_dir)
        info["sounds"], used = sounds_of(name, src_dir)
        pack(name, path, info)
        os.remove(path)
        print("%s: %.1f MB, %d sounds %s" % (name, size / 1e6, len(used), json.dumps(info["clips"])))


if __name__ == "__main__":
    main()
