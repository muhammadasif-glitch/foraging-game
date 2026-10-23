"""The dog's trot, gallop and eating (check/make_characters.py), made for
its own skeleton (the Shiba Inu of characters/CREDITS.md, which only
stands, sits and plays).

A gait is when each paw lands in the cycle and how long it stays down (the
footfalls of dogs: a trot moves the diagonal pairs together; the gallop is
a rotary one, hind left, hind right, fore right, fore left, with a moment
with no paw down). On the ground a paw goes back as fast as the ground
goes by; in the air it comes forward on a curve, folded. The legs reach
their paws by turning at the hip, knee and hock (hind) and at the shoulder
blade, shoulder, elbow and wrist (fore); the body rises and falls, bends
its back in the gallop, and the head and tail follow.

Eating, the dog stands with its paws where they are, its front low and
its head down at the floor, and bites (its jaw opens and shuts, its head
pushes down with each bite) as its tail wags.

At rest the dog looks to its left; in these clips it looks the way it
goes. Each clip runs on the spot, a gait starting as the hind left paw
lands.
"""
import math

import numpy as np

import rig

UP, AHEAD, SIDE = np.array([0, 1.0, 0]), np.array([0, 0, 1.0]), np.array([1.0, 0, 0])

# phase: where in the cycle each paw lands; duty: share of the cycle it is
# down; T: seconds a cycle; stride: units the ground goes by in a cycle;
# lift: how high a paw goes (units); bob, pitch (degrees), flex (degrees of
# the back bending), tail (degrees)
GAITS = {
    "trot": {"T": 0.4, "stride": 80.0, "duty": 0.52, "fps": 60,
             "phase": {"LH": 0.0, "RF": 0.02, "RH": 0.5, "LF": 0.52},
             "lift": {"hind": 7.0, "fore": 8.5}, "bob": 1.2, "pitch": 1.2, "flex": 0.0, "roll": 1.8,
             "tail": 9.0, "head": 2.0, "scap": 12.0},
    "gallop": {"T": 0.34, "stride": 168.0, "duty": 0.27, "fps": 60,
               "phase": {"LH": 0.0, "RH": 0.09, "RF": 0.46, "LF": 0.56},
               "lift": {"hind": 13.0, "fore": 15.0}, "bob": 3.2, "pitch": 5.0, "flex": 11.0, "roll": 1.0,
               "tail": 14.0, "head": 5.0, "scap": 18.0},
}

# eating: T seconds a loop of bites (bites of them); the body lower by
# drop (units) and turned front down by body degrees, the back bent down by
# spine, the neck (base, middle) down by those degrees and the head back up
# by -head (the muzzle down at the floor); jaw: how far it opens (degrees),
# bob: the head pushing down with a bite; tail: its wag
EAT = {"T": 1.2, "fps": 30, "bites": 3, "drop": 0.0, "body": 2.0, "spine": 6.0, "neck": (55.0, 35.0),
       "head": -20.0, "jaw": 20.0, "bob": 4.0, "tail": 12.0}

# the shares of the head's look to the left at rest that the base of the
# neck, its middle and the head take back
STRAIGHT = (0.4, 0.3, 0.3)


def find(sk, prefix):
    return sk.find("^" + prefix + "\\.\\d+_\\d+$")


def legs_of(sk):
    out = {}
    for side, s in (("L", "L"), ("R", "R")):
        out[side + "H"] = {"kind": "hind", "chain": [find(sk, s + "_hip_jnt"), find(sk, s + "_knee_jnt"),
                                                     find(sk, s + "_ankle_jnt"), find(sk, s + "_foot_jnt")],
                           "toes": find(sk, s + "B_mid_jnt"), "scap": None, "pole": AHEAD}
        out[side + "F"] = {"kind": "fore", "chain": [find(sk, s + "_shoulder_jnt"), find(sk, s + "_elbow_jnt"),
                                                     find(sk, s + "_wrist_jnt"), find(sk, s + "_hand_jnt")],
                           "toes": find(sk, s + "F_mid_jnt"), "scap": find(sk, s + "_clavicle_jnt"),
                           "pole": -AHEAD}
    return out


def smooth(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def paw_path(phi, duty, sweep, lift):
    """Where a paw is at phase phi of its own cycle (0: it lands): along
    (ahead of its rest place), up, and how folded it is (0 to 1)."""
    if phi < duty:
        k = phi / duty
        return sweep / 2 - k * sweep, 0.0, 0.0, k
    w = (phi - duty) / (1 - duty)
    along = -sweep / 2 + sweep * smooth(w)
    up = lift * math.sin(math.pi * w) ** 1.3
    return along, up, math.sin(math.pi * min(1.0, w * 1.25)), None


def look_left(sk):
    """Degrees the head looks to the left of the way the body goes, at rest."""
    b = sk.wp[find(sk, "chest_jnt")] - sk.wp[find(sk, "pelvis_jnt")]
    h = sk.wp[find(sk, "nose_jnt")] - sk.wp[find(sk, "head_jnt")]
    return math.degrees(math.atan2(h[0], h[2]) - math.atan2(b[0], b[2]))


def make(sk, kind):
    """The tracks of the dog's clip kind (a gait, or "eat"): (times,
    tracks) as make_characters wants them."""
    eat = kind == "eat"
    G = EAT if eat else GAITS[kind]
    legs = legs_of(sk)
    n = int(round(G["T"] * G["fps"]))
    times = np.arange(n + 1) / G["fps"]
    sweep = 0.0 if eat else G["stride"] * G["duty"]
    cog = find(sk, "COG_jnt")
    pelvis, chest = find(sk, "pelvis_jnt"), find(sk, "chest_jnt")
    spine = [find(sk, "spine_1_jnt"), find(sk, "spine_2_jnt"), chest]
    neck = [find(sk, "neck_base_jnt"), find(sk, "neck_mid_jnt")]
    head = find(sk, "head_jnt")
    jaw = find(sk, "jaw_jnt")
    tail = [find(sk, "tail_%d_jnt" % k) for k in range(1, 8)]
    look = -look_left(sk)

    tcog = np.tile(sk.t[cog], (n + 1, 1))
    turns = {}

    def pitch(deg):
        return rig.qaxis(SIDE, math.radians(deg))

    def yaw(deg):
        return rig.qaxis(UP, math.radians(deg))

    for f, t in enumerate(times):
        u = t / G["T"]
        if eat:
            # each bite: the jaw opens and shuts as the head pushes down
            bite = max(0.0, math.sin(2 * math.pi * G["bites"] * u)) ** 1.5
            tcog[f] = sk.t[cog] - UP * G["drop"]
            turns.setdefault(cog, []).append(pitch(G["body"]))
            for k, b in enumerate(spine):
                turns.setdefault(b, []).append(pitch(G["spine"] * (0.3, 0.3, 0.4)[k]))
            neck_deg = (G["neck"][0], G["neck"][1] + G["bob"] * 0.4 * bite)
            head_deg = G["head"] + G["bob"] * bite
            turns.setdefault(jaw, []).append(pitch(G["jaw"] * bite))
            tail_side = G["tail"] * math.sin(2 * math.pi * 2 * u)
            tail_up = 0.0
        else:
            two = math.cos(4 * math.pi * u)
            one = math.cos(2 * math.pi * (u - 0.3))
            if kind == "trot":
                bob = -G["bob"] * two
                body = G["pitch"] * math.sin(4 * math.pi * u)
                flex = 0.0
                roll = G["roll"] * math.sin(2 * math.pi * u)
                tail_side = G["tail"] * math.sin(2 * math.pi * (u - 0.15))
                tail_up = 0.0
            else:
                # the back gathers as the hind legs come forward, stretches as
                # the fore legs reach out; the body rises after the hind push
                flex = G["flex"] * math.cos(2 * math.pi * (u - 0.25))
                bob = G["bob"] * math.cos(2 * math.pi * (u - 0.3))
                body = G["pitch"] * math.sin(2 * math.pi * (u - 0.05))
                roll = G["roll"] * math.sin(2 * math.pi * u)
                tail_side = 3.0 * math.sin(2 * math.pi * u)
                tail_up = G["tail"] * math.cos(2 * math.pi * (u - 0.4))
            tcog[f] = sk.t[cog] + UP * bob
            # the body: about the side axis (pitch), a little about ahead (roll)
            q_body = rig.qmul(pitch(body), rig.qaxis(AHEAD, math.radians(roll)))
            turns.setdefault(cog, []).append(q_body)
            turns.setdefault(pelvis, []).append(pitch(flex * 0.6))
            for k, b in enumerate(spine):
                turns.setdefault(b, []).append(pitch(-flex * (0.45 if k < 2 else 0.25)))
            # the head stays level: the neck takes back what the body turned
            steady = -(body - flex * 0.6) * 0.7 + G["head"] * 0.3 * one
            neck_deg = (steady / len(neck),) * len(neck)
            head_deg = G["head"] * 0.4 * two
        for b, deg, share in zip(neck, neck_deg, STRAIGHT):
            turns.setdefault(b, []).append(rig.qmul(pitch(deg), yaw(look * share)))
        turns.setdefault(head, []).append(rig.qmul(pitch(head_deg), yaw(look * STRAIGHT[2])))
        for k, b in enumerate(tail):
            lag = k * 0.06
            side_deg = tail_side * (0.5 + 0.12 * k)
            up_deg = -tail_up * (0.6 + 0.1 * k) * math.cos(2 * math.pi * lag)
            turns.setdefault(b, []).append(rig.qmul(rig.qaxis(UP, math.radians(side_deg)), pitch(up_deg)))

    # the body's world turns (each its own turn on top of its parent's)
    body_nodes = set(turns)
    local = np.tile(sk.r, (n + 1, 1, 1))
    for b in body_nodes:
        # its own turn in the world, about its place: local = rest local
        # turned in the frame of the parent at rest
        q = np.array(turns[b])
        par = sk.parent[b]
        pr = sk.wr[par]
        local[:, b] = rig.qnorm(rig.qmul(rig.qmul(rig.qmul(rig.qinv(pr), q), pr), sk.r[b]))
    t_local = np.tile(sk.t, (n + 1, 1, 1))
    t_local[:, cog] = tcog
    wr, wp, ws = sk.world(local, t_local)

    # the legs
    for name, L in legs.items():
        a_node, b_node, c_node, d_node = L["chain"]
        rest = {k: sk.wp[k] for k in L["chain"] + [L["toes"]]}
        for f, t in enumerate(times):
            u = t / G["T"]
            if eat:
                along, up, fold, k = 0.0, 0.0, 0.0, 0.5
                paw = rest[d_node]
            else:
                phi = (u - G["phase"][name]) % 1.0
                along, up, fold, k = paw_path(phi, G["duty"], sweep, G["lift"][L["kind"]])
                # (the hind paws a little forward: a hind leg reaches less far back)
                paw = rest[d_node] + AHEAD * (along + (4.0 if L["kind"] == "hind" else 0.0)) + UP * up
            # the shoulder blade swings with the fore leg
            if L["scap"] is not None:
                s_node = L["scap"]
                swing = 0.0 if eat else G["scap"] * (along / (sweep / 2 + 1e-9)) * 0.5
                q_s = rig.qmul(pitch(-swing), wr[f, s_node])
                wr[f, s_node] = q_s
                a_pos = wp[f, s_node] + rig.qrot(q_s, sk.t[a_node] * ws[f, s_node])
            else:
                p = sk.parent[a_node]
                a_pos = wp[f, p] + rig.qrot(wr[f, p], sk.t[a_node] * ws[f, p])
            # the lowest bone (metatarsus, metacarpus): its lean over the
            # stride, folded back in the air
            if L["kind"] == "hind":
                lean = (-14 + 40 * k) if k is not None else 26 - 40 * smooth((phi - G["duty"]) / (1 - G["duty"])) + 25 * fold
            else:
                lean = (-6 + 26 * k) if k is not None else 20 + 70 * fold
            c_target = paw + rig.qrot(pitch(lean), rest[c_node] - rest[d_node])
            b_pos, c_pos = rig.two_bone(a_pos, rest[b_node], rest[c_node], c_target, L["pole"], rest[a_node])
            # (short of the paw when the leg cannot reach: the same bones)
            d_pos = c_pos + (paw - c_target)
            # the paw: flat on the ground, its toes curled back in the air
            curl = -55 * fold if L["kind"] == "fore" else -40 * fold
            toes_dir = rig.qrot(pitch(curl), rest[L["toes"]] - rest[d_node])
            for node, here, there, d0 in ((a_node, a_pos, b_pos, rest[b_node] - rest[a_node]),
                                          (b_node, b_pos, c_pos, rest[c_node] - rest[b_node]),
                                          (c_node, c_pos, d_pos, rest[d_node] - rest[c_node]),
                                          (d_node, d_pos, d_pos + toes_dir, rest[L["toes"]] - rest[d_node])):
                q = rig.frame_turn(d0, SIDE, there - here, SIDE)
                wr[f, node] = rig.qnorm(rig.qmul(q, sk.wr[node]))
                wp[f, node] = here

    # every node's local turn from the world turns, parents first
    moved = set(body_nodes)
    for L in legs.values():
        moved.update(L["chain"])
        if L["scap"] is not None:
            moved.add(L["scap"])
    out_local = np.tile(sk.r, (n + 1, 1, 1))
    for i in sk.order:
        par = sk.parent[i]
        if i in moved and par >= 0:
            out_local[:, i] = rig.qnorm(rig.qmul(rig.qinv(wr[:, par]), wr[:, i]))
    # the clip loops: its last frame is its first
    out_local[-1] = out_local[0]
    tcog[-1] = tcog[0]
    tracks = [(i, "rotation", rig.qcontinuous(out_local[:, i])) for i in sorted(moved)]
    tracks.append((cog, "translation", tcog))
    return times, tracks
