"""Makes the people of the game from Microsoft Rocketbox (MIT licence):
2 children and 2 adults, each with Rocketbox's own clips for standing,
walking and running (check/rocketbox_blend.py, in Blender), the bite of
check/make_characters.py for eating, and recorded sounds; written as
characters/<name>.js, as the other characters.

    python check/make_rocketbox.py PATH/TO/Microsoft-Rocketbox BLENDER [name ...]

The sounds are those of the man and the woman of 2.7.1 (Freesound, CC0;
characters/CREDITS.md), taken from their files: the steps of shoes, the
voices of a man and a woman, eating; the children's voices are the same,
played higher (js/sound.js, OWN_PITCH).
"""
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import make_characters as MC  # noqa: E402

REPO = os.path.dirname(HERE)
IDLE = "Animations/all_animations_max_motextr_static/%s_idle_neutral_01.max.fbx"
WALK = "Animations/all_animations_max_motextr_xy/%s_walk_neutral_01.max.fbx"
RUN = "Animations/all_animations_max_motextr_xy/%s_run_fast_01.max.fbx"

# name: (Rocketbox avatar, the clips of a woman (f) or a man (m), the voice
# (the sounds of characters/<voice>.js), the mouth (up, ahead) for eating)
PEOPLE = {
    "girl": ("Avatars/Children/Female_Child_01", "f", "woman", (0.0, 0.05)),
    "boy": ("Avatars/Children/Male_Child_01", "m", "man", (0.0, 0.05)),
    "woman": ("Avatars/Adults/Female_Adult_17", "f", "woman", (0.0, 0.05)),
    "man": ("Avatars/Adults/Male_Adult_16", "m", "man", (0.0, 0.05)),
}


def old_sounds(voice):
    """The recorded sounds of characters/<voice>.js of 2.7.1 (git), as they are."""
    text = subprocess.run(["git", "-C", REPO, "show", "v2.7.1-characters:characters/%s.js" % voice],
                          capture_output=True, text=True)
    if text.returncode != 0:
        text = subprocess.run(["git", "-C", REPO, "show", "7691df2:characters/%s.js" % voice],
                              capture_output=True, text=True, check=True)
    t = text.stdout
    data = json.loads(t[t.index("= {") + 2:t.rindex("};") + 1])
    return data["sounds"]


def merge(avatar_path, clip_files):
    """Gives the avatar the clips: every bone's turn from its parent, bone by
    bone by its name, at the clip's own times; the root (Bip01) also its
    place (its height, rise and fall, sway). The bones keep the avatar's own
    lengths."""
    import numpy as np
    import glb
    import rig
    m = glb.read(avatar_path)
    names = [n.get("name") for n in m.doc["nodes"]]
    sk_a = rig.Skeleton(m.doc)
    root = names.index("Bip01")
    for clip, path in clip_files.items():
        c = glb.read(path)
        sk_c = rig.Skeleton(c.doc)
        a = c.doc["animations"][0]
        times = np.asarray(c.accessor(a["samplers"][0]["input"]), dtype=float).ravel()
        times = times - times[0]
        r, t = rig.sample_clip(c, sk_c, 0, times + float(np.asarray(c.accessor(a["samplers"][0]["input"])).ravel()[0]))
        tracks = []
        for i, nm in enumerate(sk_c.names):
            if nm in names and (nm == "Bip01" or nm.startswith("Bip01 ")):
                j = names.index(nm)
                if sk_a.under(j, root):
                    tracks.append((j, "rotation", rig.qcontinuous(r[:, i])))
                    if j == root:
                        tracks.append((j, "translation", t[:, i]))
        m.add_clip(clip, times, tracks)
    m.write(avatar_path)


def gait(path, info, travel):
    """The walk and the run of a Rocketbox clip, measured: 1 pair of steps a
    clip; the stride is how far the body went over the floor in it (in its
    file, before the travel was taken out); each foot lands when it is
    furthest in front of the hips."""
    import numpy as np
    import glb
    import rig
    m = glb.read(path)
    sk = rig.Skeleton(m.doc)
    bones, hips, feet = MC.bones_of("rocketbox", sk)
    fwd = MC.forward_of(sk, feet, "rocketbox")
    for clip in ("walk", "run"):
        d = rig.clip_duration(m, clip)
        ts = np.arange(0, d, 1.0 / 240)
        r, t = rig.sample_clip(m, sk, clip, ts)
        _, wp, _ = sk.world(r, t)
        lands = []
        for nodes in feet:
            p = np.mean([wp[:, k] for k in nodes], axis=0)
            lands.append(int(np.argmax((p - wp[:, hips]) @ fwd)))
        n = len(ts)
        info["clips"][clip].update({"cycles": 1, "offset": round(lands[0] / n, 4),
                                    "right": round(((lands[1] - lands[0]) % n) / n, 4),
                                    "stride": round(travel[clip], 4)})


def main():
    rb, blender = sys.argv[1], sys.argv[2]
    only = sys.argv[3:] or list(PEOPLE)
    work = tempfile.mkdtemp()
    for name in only:
        avatar, sex, voice, mouth = PEOPLE[name]
        base = os.path.join(rb, "Assets", avatar)
        fbx = os.path.join(base, "Export", os.path.basename(avatar) + ".fbx")
        glb_path = os.path.join(work, name + ".glb")
        A = os.path.join(rb, "Assets")
        blend = os.path.join(HERE, "rocketbox_blend.py")
        out = subprocess.run([blender, "-b", "--python", blend, "--", "avatar", fbx, os.path.join(base, "Textures"),
                              glb_path], check=True, capture_output=True, text=True).stdout
        hips_h = float(next(x for x in out.splitlines() if x.startswith("HIPS ")).split()[1])
        travel, clip_files = {}, {}
        for clip, rel in (("idle", IDLE), ("walk", WALK), ("run", RUN)):
            cpath = os.path.join(work, "%s_%s.glb" % (name, clip))
            out = subprocess.run([blender, "-b", "--python", blend, "--", "clip", os.path.join(A, rel % sex), clip, cpath,
                                  repr(hips_h), os.path.join(A, IDLE % sex)], check=True, capture_output=True,
                                 text=True).stdout
            for line in out.splitlines():
                if line.startswith("TRAVEL "):
                    travel[clip] = float(line.split()[2])
            clip_files[clip] = cpath
        merge(glb_path, clip_files)
        cfg = {"model": glb_path, "rig": "rocketbox",
               "clips": {"idle": ("own", "idle"), "walk": ("own", "walk"), "run": ("own", "run"),
                         "eat": ("bite",) + tuple(mouth)}}
        path, size, info = MC.make(name, cfg, "/")
        gait(path, info, travel)
        info["sounds"] = old_sounds(voice)
        MC.pack(name, path, info)
        os.remove(path)
        print("%s: %.1f MB %s" % (name, size / 1e6, json.dumps(info["clips"])), flush=True)


if __name__ == "__main__":
    main()
