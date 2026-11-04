"""Checks the bodies of the characters frame by frame, in every clip, as
the game has them (characters/<name>.js):

    python check/body_check.py [name ...]

Every clip at 60 frames a second:
  - bones keep their length (nothing stretches);
  - the feet never go under the floor (the soles at rest, standing), and in
    the walk and the run they reach it;
  - a planted foot goes back as fast as the stride says (the feet do not
    slide over the floor);
  - the knees bend only forwards, the knees and the elbows no further than
    a person's (150 and 160 degrees);
  - the head stays above the shoulders and turns no more than 80 degrees
    from the way the body faces; standing, the shoulders are level;
  - the end of a clip meets its start (it loops without a jump);
  - eating: the hand comes to the mouth and never into the head.
Prints every problem; exits with 1 if there was one.
"""
import base64
import json
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import glb  # noqa: E402
import make_characters as MC  # noqa: E402
import rig  # noqa: E402

REPO = os.path.dirname(HERE)
FPS = 60
KIND = {"girl": "rocketbox", "boy": "rocketbox", "woman": "rocketbox", "man": "rocketbox"}


def load(name):
    t = open(os.path.join(REPO, "characters", name + ".js")).read()
    f = json.loads(t[t.index("= {") + 2:t.rindex("};") + 1])
    path = "/tmp/body_check_%s.glb" % name
    open(path, "wb").write(base64.b64decode(f["model"]))
    return glb.read(path), f


def angle(a, b):
    c = np.sum(a * b, axis=-1) / (np.linalg.norm(a, axis=-1) * np.linalg.norm(b, axis=-1) + 1e-12)
    return np.degrees(np.arccos(np.clip(c, -1, 1)))


def check(name):
    m, f = load(name)
    sk = rig.Skeleton(m.doc)
    bones, hips, feet = MC.bones_of(KIND[name], sk)
    fwd = MC.forward_of(sk, feet, KIND[name])
    up = np.array([0, 1.0, 0])
    pts = sk.points(m)[0]
    height = pts[:, 1].max() - pts[:, 1].min()
    problems, notes = [], []
    soles = sk.floor(m)
    # the soles' nodes at rest, above the soles of the mesh
    rest_feet = min(sk.wp[n][1] for nodes in feet for n in nodes)
    lift = rest_feet - soles
    chain = [bones[k] for k in ("LeftUpLeg", "LeftLeg", "RightUpLeg", "RightLeg", "LeftArm", "LeftForeArm",
                                "RightArm", "RightForeArm", "Neck", "LeftFoot", "RightFoot")]
    rest_len = {a: np.linalg.norm(sk.wp[b] - sk.wp[a]) for a, b in chain}
    n = lambda k: bones[k][0]
    for clip in ("idle", "walk", "run", "eat"):
        d = rig.clip_duration(m, clip)
        ts = np.arange(0, d, 1.0 / FPS)
        r, t = rig.sample_clip(m, sk, clip, ts)
        wr, wp, _ = sk.world(r, t)
        where = "%s %s" % (name, clip)
        # 1 bones keep their length
        worst = max(np.abs(np.linalg.norm(wp[:, b] - wp[:, a], axis=1) - L).max() / L for (a, b), L in
                    zip(chain, rest_len.values()))
        if worst > 0.005:
            problems.append("%s: a bone stretches by %.1f%%" % (where, 100 * worst))
        # 2 the feet and the floor (the nodes of the feet, as high above the soles as at rest)
        low = np.min([wp[:, k, 1] for nodes in feet for k in nodes], axis=0) - lift
        if low.min() < rest_feet - lift - 0.015 * height:
            problems.append("%s: a foot goes %.1f cm under the floor" % (where, 100 * (soles - low.min()) * 1.0))
        if clip in ("walk", "run") and low.min() > soles + 0.03 * height:
            problems.append("%s: the feet never reach the floor (%.1f%% of the height above it)" %
                            (where, 100 * (low.min() - soles) / height))
        # 3 planted feet go back as fast as the stride says
        if clip in ("walk", "run"):
            meta = f["clips"][clip]
            want = meta["stride"] * meta["cycles"] / meta["duration"]
            speeds = []
            for nodes in feet:
                p = np.mean([wp[:, k] for k in nodes], axis=0)
                y = np.min([wp[:, k, 1] for k in nodes], axis=0)
                planted = y < y.min() + 0.012 * height
                v = -(np.gradient(p, axis=0) * FPS) @ fwd
                speeds.extend(v[planted])
            got = float(np.median(speeds))
            notes.append("%s: planted feet go back %.2f, the stride says %.2f (units a second)" % (where, got, want))
            if abs(got - want) > 0.25 * want:
                problems.append("%s: the feet slide: planted feet go back %.2f units a second, the stride says %.2f" %
                                (where, got, want))
        # 4 knees and elbows
        for side in ("Left", "Right"):
            hip, knee, ankle = wp[:, n(side + "UpLeg")], wp[:, n(side + "Leg")], wp[:, n(side + "Foot")]
            bend = angle(knee - hip, ankle - knee)
            if bend.max() > 150:
                problems.append("%s: the %s knee bends %.0f degrees" % (where, side.lower(), bend.max()))
            # forwards: the knee in front of the line from the hip to the ankle (when bent at all)
            mid = hip + (ankle - hip) * np.sum((knee - hip) * (ankle - hip), axis=1)[:, None] / \
                np.sum((ankle - hip) ** 2, axis=1)[:, None]
            facing = rig.qrot(wr[:, hips], fwd) if False else None
            out = (knee - mid) @ fwd
            backwards = (bend > 15) & (out < -0.01 * height)
            if backwards.any():
                problems.append("%s: the %s knee bends backwards in %d frames" % (where, side.lower(), backwards.sum()))
            sh, el, wrist = wp[:, n(side + "Arm")], wp[:, n(side + "ForeArm")], wp[:, n(side + "Hand")]
            eb = angle(el - sh, wrist - el)
            if eb.max() > 160:
                problems.append("%s: the %s elbow bends %.0f degrees" % (where, side.lower(), eb.max()))
        # 5 the head over the shoulders, turned no more than a person turns it
        head, ls, rs = wp[:, n("Head")], wp[:, n("LeftShoulder")], wp[:, n("RightShoulder")]
        if (head[:, 1] < np.maximum(ls[:, 1], rs[:, 1])).any():
            problems.append("%s: the head goes below the shoulders" % where)
        body_fwd = np.cross(ls - rs, up)
        body_fwd[:, 1] = 0
        head_fwd = rig.qrot(rig.qmul(wr[:, n("Head")], rig.qinv(np.tile(sk.wr[n("Head")], (len(ts), 1)))), fwd)
        head_fwd[:, 1] = 0
        turn = angle(head_fwd, body_fwd)
        if turn.max() > 80:
            problems.append("%s: the head turns %.0f degrees from the body" % (where, turn.max()))
        if clip == "idle":
            tilt = np.abs(ls[:, 1] - rs[:, 1]).max()
            if tilt > 0.035 * height:
                problems.append("%s: the shoulders are %.1f%% of the height apart in height" % (where, 100 * tilt / height))
        # 6 the loop
        if clip != "eat":
            r1, t1 = rig.sample_clip(m, sk, clip, np.array([0.0, d - 1e-4]))
            _, w1, _ = sk.world(r1, t1)
            jump = np.linalg.norm(w1[1] - w1[0], axis=1)
            jump = jump[[i for i in range(len(sk.names)) if sk.under(i, hips)]].max()
            if jump > 0.03 * height:
                problems.append("%s: the loop jumps %.1f%% of the height at its seam" % (where, 100 * jump / height))
        # 7 eating: the hand to the mouth, never into the head
        if clip == "eat":
            hand = wp[:, bones["RightHand"][1]]
            dist = np.linalg.norm(hand - head, axis=1) / height
            notes.append("%s: the hand comes to %.3f of the height from the head" % (where, dist.min()))
            if dist.min() > 0.16:
                problems.append("%s: the hand never comes to the mouth (%.2f of the height)" % (where, dist.min()))
            if dist.min() < 0.035:
                problems.append("%s: the hand goes into the head (%.3f of the height)" % (where, dist.min()))
    notes.append("%s: %.3f units high, %d nodes" % (name, height, len(sk.names)))
    return problems, notes


def main():
    names = sys.argv[1:] or list(KIND)
    bad = []
    for name in names:
        p, notes = check(name)
        for x in notes:
            print("  " + x)
        for x in p:
            print("PROBLEM " + x)
        bad += p
    print("%d problems" % len(bad))
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
