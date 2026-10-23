"""Finds and downloads the characters of the game and their sounds, under
open licences only: 3D models (animated: walking, running, standing) from
Sketchfab under CC0 or CC BY (a credit), and recorded sounds from Freesound
under CC0. Runs on your own computer (Python 3.8 or newer, nothing to
install).

Step 1, search (no account needed for the models; a Freesound API key for
the sounds):

    python get_characters.py search

  finds candidates for every character and sound and writes
  characters\\review.html: open it, pick 1 model per character (and the
  sounds you like), press "Save my picks" at the bottom. The browser saves
  picks.json (in Downloads); put it into the characters folder (or leave it
  in Downloads: step 2 looks there too).

Step 2, download (needs a free Sketchfab API token for the models: Sketchfab,
Settings, Password & API):

    python get_characters.py download

  downloads what you picked into characters\\models and characters\\sounds,
  with characters\\CREDITS.md (who made each file, its licence, its page);
  also three.js (the 3D library the game draws them with, MIT licence) into
  characters\\libs, and motion capture of people walking and running (CMU
  Graphics Lab, free to use) into characters\\mocap, to give every person a
  walk, a run and a way of standing.

Step 3, what step 2 did not bring (a realistic cat, other dogs, motion
capture, steps of bare feet and of paws):

    python get_characters.py more

  asks the Sketchfab token and the Freesound key again; writes
  characters\\more.json (what came, with the clips of each model) and
  characters\\CREDITS_MORE.md.

Only the motion capture again (no token, no key):

    python get_characters.py mocap

The keys and the token are asked when needed, never saved and never written
into any file. Every file kept is checked again for its licence: CC0 or CC BY
only (no NonCommercial, NoDerivatives or ShareAlike).
"""
import getpass
import html
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "characters")
SKETCHFAB = "https://api.sketchfab.com/v3"
FREESOUND = "https://freesound.org/apiv2"
AGENT = "food-rooms-characters/1.0 (research game; open licences only)"
LICENCES = {"cc0": "CC0 (public domain)", "by": "CC BY 4.0 (credit the author)"}
MOST_FACES = 200000          # heavier models are too slow for the browser
MOST_MB = 80                 # the download archive at most this big
PER_CHARACTER = 12           # candidates shown for each character

# what to look for: several searches each, realistic first
CHARACTERS = {
    "man": ["realistic man walking animated", "male human walk cycle", "man rigged animated walk run idle",
            "scanned man animated"],
    "woman": ["realistic woman walking animated", "female human walk cycle", "woman rigged animated walk idle",
              "scanned woman animated"],
    "child": ["child walking animated", "kid walk cycle animated", "boy animated walk", "girl animated walk"],
    "dog": ["realistic dog walk animated", "dog walk run idle animated", "labrador animated", "shiba inu animated",
            "german shepherd animated"],
    "cat": ["realistic cat walk animated", "cat walk cycle animated", "cat idle walk run", "kitten animated"],
    "robot": ["robot walk animated", "humanoid robot walk cycle", "android robot animated"],
    "knight": ["knight walk animated", "medieval knight armor animated", "armored knight walk cycle"],
}

# sounds: category -> (searches, longest seconds); several can be picked
SOUNDS = {
    "steps_shoes": (["footsteps shoes tile floor", "footstep single shoe indoor", "walking shoes hard floor"], 6),
    "steps_heels": (["high heels footsteps", "heels walking tile"], 6),
    "steps_boots_armour": (["armor walking footsteps", "chainmail walking", "heavy boots footsteps stone"], 6),
    "steps_paws_dog": (["dog paws claws walking floor", "dog nails tile walking"], 6),
    "steps_paws_cat": (["cat paws walking", "cat walking floor"], 6),
    "steps_robot": (["robot footsteps metal", "robot servo walk", "mechanical footstep"], 6),
    "dog_bark": (["dog bark single", "medium dog bark", "dog woof"], 3),
    "dog_whine_pant": (["dog whine", "dog panting", "dog yelp"], 4),
    "cat_meow_purr": (["cat meow", "cat purr", "cat trill chirp"], 4),
    "human_man": (["man hmm", "man surprised oh", "man grunt effort short", "male sigh satisfied"], 3),
    "human_woman": (["woman hmm", "woman surprised oh", "female sigh satisfied", "woman grunt short"], 3),
    "human_child": (["child giggle", "kid surprised", "child oh"], 3),
    "robot_voice": (["robot beep", "robot servo", "robot power up short"], 3),
    "eating": (["eating crunch apple", "dog eating kibble", "chewing bread"], 4),
}


def say(text):
    try:
        print(text)
    except UnicodeEncodeError:
        print(text.encode("ascii", "replace").decode("ascii"))
    sys.stdout.flush()


def get(url, headers=None, tries=3):
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers=dict({"User-Agent": AGENT}, **(headers or {})))
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except urllib.error.HTTPError as err:
            if err.code in (401, 403, 404) or k == tries - 1:
                raise
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            if k == tries - 1:
                raise
        time.sleep(2 + 3 * k)
    return None


def get_json(url, headers=None):
    return json.loads(get(url, headers).decode("utf-8"))


def save_file(url, path, headers=None):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    data = get(url, headers)
    tmp = path + ".part"
    with open(tmp, "wb") as f:
        f.write(data)
    os.replace(tmp, path)
    return len(data)


# ------------------------------------------------------------ models
def licence_of(model):
    lic = model.get("license")
    slug = lic.get("slug") if isinstance(lic, dict) else lic
    return (slug or "").lower()


def thumb_of(model, width=400):
    imgs = ((model.get("thumbnails") or {}).get("images")) or []
    imgs = sorted(imgs, key=lambda i: abs((i.get("width") or 0) - width))
    return imgs[0]["url"] if imgs else ""


def search_models(query):
    out, base = [], {"type": "models", "q": query, "downloadable": "true", "animated": "true",
                     "sort_by": "-likeCount", "count": "24"}
    for lic in ("cc0", "by"):
        params = dict(base, license=lic)
        url = SKETCHFAB + "/search?" + urllib.parse.urlencode(params)
        try:
            out += get_json(url).get("results", [])
        except urllib.error.HTTPError:
            # the filter not taken: search without it, the licence is checked below
            try:
                out += get_json(SKETCHFAB + "/search?" + urllib.parse.urlencode(base)).get("results", [])
            except Exception as err:
                say("  search failed (%s): %s" % (query, err))
        except Exception as err:
            say("  search failed (%s): %s" % (query, err))
    return out


def details(uid):
    return get_json(SKETCHFAB + "/models/" + uid)


def find_models():
    found = {}
    for name, queries in CHARACTERS.items():
        say("models: %s" % name)
        seen, keep = set(), []
        for q in queries:
            for m in search_models(q):
                uid = m.get("uid")
                if not uid or uid in seen:
                    continue
                seen.add(uid)
                if licence_of(m) and licence_of(m) not in LICENCES:
                    continue
                keep.append(m)
        # the most liked first; then each checked in full
        keep.sort(key=lambda m: -(m.get("likeCount") or 0))
        good = []
        for m in keep:
            if len(good) >= PER_CHARACTER:
                break
            try:
                d = details(m["uid"])
            except Exception as err:
                say("  %s: no details (%s)" % (m.get("name"), err))
                continue
            lic = licence_of(d)
            faces = d.get("faceCount") or 0
            arch = d.get("archives") or {}
            size = max([(a or {}).get("size") or 0 for a in arch.values()] or [0]) / 1e6
            if lic not in LICENCES or not d.get("isDownloadable") or not (d.get("animationCount") or 0):
                continue
            if faces > MOST_FACES or size > MOST_MB:
                continue
            user = d.get("user") or {}
            good.append({"uid": d["uid"], "name": d.get("name", ""), "author": user.get("displayName") or
                         user.get("username", ""), "author_url": user.get("profileUrl", ""),
                         "licence": lic, "page": d.get("viewerUrl", ""), "thumb": thumb_of(d),
                         "animations": d.get("animationCount") or 0, "faces": faces, "mb": round(size, 1),
                         "likes": d.get("likeCount") or 0})
            time.sleep(0.3)
        say("  %d candidates" % len(good))
        found[name] = good
    return found


# ------------------------------------------------------------ sounds
def find_sounds(key, wanted=None):
    found = {}
    for cat, (queries, longest) in (wanted or SOUNDS).items():
        say("sounds: %s" % cat)
        seen, good = set(), []
        for q in queries:
            params = {"query": q, "filter": 'license:"Creative Commons 0" duration:[0.1 TO %d]' % longest,
                      "fields": "id,name,username,license,previews,duration,url,avg_rating,num_downloads",
                      "sort": "rating_desc", "page_size": "15", "token": key}
            try:
                res = get_json(FREESOUND + "/search/text/?" + urllib.parse.urlencode(params)).get("results", [])
            except Exception as err:
                say("  search failed (%s): %s" % (q, err))
                continue
            for s in res:
                if s["id"] in seen or "publicdomain/zero" not in (s.get("license") or ""):
                    continue
                seen.add(s["id"])
                good.append({"id": s["id"], "name": s.get("name", ""), "author": s.get("username", ""),
                             "licence": "cc0", "page": s.get("url", ""), "seconds": round(s.get("duration", 0), 2),
                             "preview": (s.get("previews") or {}).get("preview-hq-mp3", ""),
                             "rating": round(s.get("avg_rating") or 0, 1), "downloads": s.get("num_downloads") or 0})
        good.sort(key=lambda s: (-s["rating"], -s["downloads"]))
        found[cat] = good[:16]
        say("  %d candidates" % len(found[cat]))
    return found


# ------------------------------------------------------------ the review page
PAGE = """<!doctype html><meta charset="utf-8"><title>Characters to pick</title>
<style>
body{font:14px system-ui,sans-serif;background:#10151c;color:#e8edf4;margin:24px}
h2{margin:28px 0 8px} .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}
.c{background:#1a2230;border:2px solid #2a3443;border-radius:10px;padding:8px} .c img{width:100%;border-radius:6px}
.c.on{border-color:#5ac8fa} .m{color:#8b9bb0;font-size:12px} a{color:#5ac8fa} audio{width:100%}
label{display:block;cursor:pointer} button{font-size:16px;padding:10px 18px;margin:24px 0;border-radius:8px}
</style>
<h1>Pick the characters and sounds</h1>
<p>Open licences only (CC0, or CC BY: a credit in the game's README). Click a picture to choose that model
(1 per character; "open in 3D" shows it moving on Sketchfab). Tick the sounds you like (several are fine).
Then press <b>Save my picks</b> at the bottom: it saves picks.json.</p>
{{BODY}}
<button id="save">Save my picks</button>
<script>
document.querySelectorAll('.c input[type=radio]').forEach(function (r) {
  r.addEventListener('change', function () {
    document.querySelectorAll('input[name="' + r.name + '"]').forEach(function (o) {
      o.closest('.c').classList.toggle('on', o.checked);
    });
  });
});
document.getElementById('save').onclick = function () {
  var picks = {models: {}, sounds: {}};
  document.querySelectorAll('.c input[type=radio]:checked').forEach(function (r) {
    if (r.value) { picks.models[r.name] = r.value; }
  });
  document.querySelectorAll('.c input[type=checkbox]:checked').forEach(function (c) {
    (picks.sounds[c.name] = picks.sounds[c.name] || []).push(Number(c.value));
  });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(picks, null, 1)], {type: 'application/json'}));
  a.download = 'picks.json';
  a.click();
};
</script>
"""


def page(models, sounds):
    parts = []
    for name, cands in models.items():
        parts.append("<h2>%s</h2><div class=grid>" % html.escape(name))
        for c in cands:
            parts.append(
                '<label class=c><input type=radio name="%s" value="%s"> <img src="%s" loading=lazy>'
                '<div><b>%s</b></div><div class=m>by %s &middot; %s<br>%d animations &middot; %d faces &middot; '
                '%.1f MB &middot; %d likes<br><a href="%s" target=_blank>open in 3D</a></div></label>'
                % (name, c["uid"], html.escape(c["thumb"]), html.escape(c["name"]), html.escape(c["author"]),
                   LICENCES[c["licence"]], c["animations"], c["faces"], c["mb"], c["likes"], html.escape(c["page"])))
        parts.append('<label class=c><input type=radio name="%s" value=""> none of these</label></div>' % name)
    for cat, cands in sounds.items():
        parts.append("<h2>sounds: %s</h2><div class=grid>" % html.escape(cat))
        for s in cands:
            parts.append(
                '<label class=c><input type=checkbox name="%s" value="%d"> <b>%s</b><div class=m>by %s &middot; '
                '%.1f s &middot; CC0 &middot; <a href="%s" target=_blank>page</a></div>'
                '<audio controls preload=none src="%s"></audio></label>'
                % (cat, s["id"], html.escape(s["name"]), html.escape(s["author"]), s["seconds"],
                   html.escape(s["page"]), html.escape(s["preview"])))
        parts.append("</div>")
    return PAGE.replace("{{BODY}}", "\n".join(parts))


# ------------------------------------------------------------ download
def find_picks():
    for place in (os.path.join(OUT, "picks.json"), os.path.join(os.path.expanduser("~"), "Downloads", "picks.json")):
        if os.path.exists(place):
            return place
    return None


def download_model(uid, name, token):
    for scheme in ("Token", "Bearer"):
        try:
            links = get_json(SKETCHFAB + "/models/%s/download" % uid, {"Authorization": "%s %s" % (scheme, token)})
            break
        except urllib.error.HTTPError as err:
            if err.code != 401 or scheme == "Bearer":
                raise
    folder = os.path.join(OUT, "models", name)
    if links.get("glb"):
        path = os.path.join(folder, uid + ".glb")
        n = save_file(links["glb"]["url"], path)
        return path, n
    path = os.path.join(folder, uid + "_gltf.zip")
    n = save_file(links["gltf"]["url"], path)
    with zipfile.ZipFile(path) as z:
        z.extractall(os.path.join(folder, uid + "_gltf"))
    return path, n


# three.js r147: the last with plain scripts (no modules), so that the game
# also runs opened as a file
THREE = "https://cdn.jsdelivr.net/npm/three@0.147.0/"
THREE_FILES = ["build/three.min.js", "examples/js/loaders/GLTFLoader.js", "examples/js/loaders/BVHLoader.js",
               "examples/js/utils/SkeletonUtils.js", "LICENSE"]
# motion capture: the CMU database as BVH files, in folders by subject
# (Sequence-001-009/02/...); the trials are picked by what the index says
# they show
MOCAP_REPO = "Shriinivas/cmubvh"
MOCAP_INDEX = "cmu-mocap-index-text.txt"
MOCAP_WORDS = ("walk", "run", "jog", "stand", "idle", "wait", "look around")
MOCAP_SUBJECTS = (9, 35, 2, 16, 86, 143, 7, 8, 38, 91)
MOCAP_MOST = 200


def libs():
    for f in THREE_FILES:
        path = os.path.join(OUT, "libs", "three", f.replace("/", os.sep))
        try:
            n = save_file(THREE + f, path)
            say("three.js: %s (%d KB)" % (f, n // 1024))
        except Exception as err:
            say("three.js: %s failed: %s" % (f, err))


def github_list(path):
    url = "https://api.github.com/repos/%s/contents/%s" % (MOCAP_REPO, urllib.parse.quote(path))
    return get_json(url, {"Accept": "application/vnd.github+json"})


def mocap_trials(index_text):
    """{"02_01": "walk", ...}: the trials of MOCAP_SUBJECTS whose words are wanted."""
    import re
    found = {}
    for line in index_text.splitlines():
        m = re.match(r"\s*(\d{1,3})_(\d{1,3})\s+(.*\S)", line)
        if not m:
            continue
        subject, trial, what = int(m.group(1)), int(m.group(2)), m.group(3).strip().lower()
        if subject in MOCAP_SUBJECTS and any(w in what for w in MOCAP_WORDS):
            found["%02d_%02d" % (subject, trial)] = what
    return found


def mocap():
    folder = os.path.join(OUT, "mocap")
    os.makedirs(folder, exist_ok=True)
    try:
        top = github_list("")
    except Exception as err:
        say("motion capture: cannot list github.com/%s: %s" % (MOCAP_REPO, err))
        return 0
    names = [t["name"] for t in top]
    index = next((t for t in top if t["name"].lower() == MOCAP_INDEX), None)
    wanted = {}
    if index and index.get("download_url"):
        try:
            text = get(index["download_url"]).decode("utf-8", "replace")
            with open(os.path.join(folder, MOCAP_INDEX), "w", encoding="utf-8") as f:
                f.write(text)
            wanted = mocap_trials(text)
        except Exception as err:
            say("motion capture: index failed: %s" % err)
    say("motion capture: %d trials wanted from the index" % len(wanted))
    # Sequence-001-009/09/Data/09_01.zip (a zip with the BVH file in it)
    listed, n = {}, 0
    for subject in MOCAP_SUBJECTS:
        seq = None
        for name in names:
            parts = name.split("-")
            if len(parts) == 3 and parts[0] == "Sequence" and parts[1].isdigit() and parts[2].isdigit():
                if int(parts[1]) <= subject <= int(parts[2]):
                    seq = name
        if not seq:
            say("motion capture: no folder for subject %d" % subject)
            continue
        try:
            if seq not in listed:
                listed[seq] = github_list(seq)
            sub = next((t for t in listed[seq] if t["name"].lstrip("0") == str(subject)), None)
            if not sub:
                say("motion capture: subject %d not in %s" % (subject, seq))
                continue
            try:
                files = github_list(sub["path"] + "/Data")
            except urllib.error.HTTPError as err:
                if err.code != 404:
                    raise
                files = github_list(sub["path"])
        except urllib.error.HTTPError as err:
            say("motion capture: listing subject %d failed: %s%s" % (subject, err, (
                " (GitHub allows 60 listings an hour without an account: run it again in an hour)"
                if err.code == 403 else "")))
            continue
        except Exception as err:
            say("motion capture: listing subject %d failed: %s" % (subject, err))
            continue
        takes = [t for t in files if t["type"] == "file" and os.path.splitext(t["name"])[1].lower() in (".bvh", ".zip")]
        for t in sorted(takes, key=lambda t: t["name"]):
            trial = os.path.splitext(t["name"])[0]
            if wanted and trial not in wanted:
                continue
            if n >= MOCAP_MOST:
                break
            dest = os.path.join(folder, trial + ".bvh")
            try:
                if not os.path.exists(dest):
                    if t["name"].lower().endswith(".bvh"):
                        save_file(t["download_url"], dest)
                    else:
                        zpath = os.path.join(folder, t["name"])
                        save_file(t["download_url"], zpath)
                        with zipfile.ZipFile(zpath) as z:
                            inner = [m for m in z.namelist() if m.lower().endswith(".bvh")]
                            if not inner:
                                raise ValueError("no BVH in %s" % t["name"])
                            with open(dest, "wb") as f:
                                f.write(z.read(inner[0]))
                        os.remove(zpath)
                n += 1
                say("motion capture: %s.bvh %s" % (trial, wanted.get(trial, "")))
            except Exception as err:
                say("motion capture: %s failed: %s" % (t["name"], err))
    say("motion capture: %d files" % n)
    return n


def credit_mocap():
    line = ("- motion capture: CMU Graphics Lab Motion Capture Database, mocap.cs.cmu.edu (created with funding from "
            "NSF EIA-0196217; free to use), as BVH files from github.com/%s" % MOCAP_REPO)
    with open(os.path.join(OUT, "CREDITS_MOCAP.md"), "w", encoding="utf-8") as f:
        f.write("# Credits of the motion capture\n\n" + line + "\n")


def download(picks):
    cands = json.load(open(os.path.join(OUT, "candidates.json"), encoding="utf-8"))
    credits = ["# Credits of the characters and their sounds", "",
               "Open licences only: CC0 (public domain) or CC BY 4.0 (credit below).", ""]
    models = dict(picks.get("models") or {})
    # other candidates to compare with (models/extra)
    for name, uid in (picks.get("extra_models") or {}).items():
        models["extra/" + name] = uid
    if models:
        token = getpass.getpass("Sketchfab API token (Settings, Password & API; not shown, not saved): ").strip()
        for name, uid in models.items():
            base = name.split("/")[-1].split("_")[0]
            info = next((c for c in cands["models"].get(base, []) if c["uid"] == uid), None)
            d = details(uid)
            if licence_of(d) not in LICENCES:
                say("%s: %s is not CC0 or CC BY any more: left out" % (name, uid))
                continue
            try:
                path, n = download_model(uid, name, token)
            except Exception as err:
                say("%s: download failed: %s" % (name, err))
                continue
            user = d.get("user") or {}
            say("%s: %s (%.1f MB)" % (name, os.path.relpath(path, OUT), n / 1e6))
            credits.append("- %s: \"%s\" by %s, %s, %s" % (name, d.get("name", ""),
                           user.get("displayName") or user.get("username", ""), LICENCES[licence_of(d)],
                           d.get("viewerUrl", (info or {}).get("page", ""))))
    if picks.get("sounds"):
        by_id = {}
        for cat, items in cands.get("sounds", {}).items():
            for s in items:
                by_id[(cat, s["id"])] = s
        for cat, ids in picks["sounds"].items():
            for sid in ids:
                s = by_id.get((cat, sid))
                if not s or not s.get("preview"):
                    continue
                path = os.path.join(OUT, "sounds", cat, "%d.mp3" % sid)
                try:
                    n = save_file(s["preview"], path)
                except Exception as err:
                    say("sound %s %d: failed: %s" % (cat, sid, err))
                    continue
                say("sound %s: %s (%d KB)" % (cat, s["name"], n // 1024))
                credits.append("- sound %s: \"%s\" by %s, CC0, %s" % (cat, s["name"], s["author"], s["page"]))
    libs()
    if mocap():
        credits.append("- motion capture: CMU Graphics Lab Motion Capture Database, mocap.cs.cmu.edu (created with "
                       "funding from NSF EIA-0196217; free to use), as BVH files from github.com/%s" % MOCAP_REPO)
    credits.append("- three.js r147, MIT licence (libs/three/LICENSE)")
    with open(os.path.join(OUT, "CREDITS.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(credits) + "\n")
    say("=== done: %s" % OUT)
    say("Zip the characters folder (without review.html) and send it, or link your computer to the chat.")


# ------------------------------------------------------------ more
# what the first download did not bring: a realistic cat, and other dogs to
# compare with the Shiba Inu (which only sits, stands and plays); each kept
# with the names of its clips
MORE_MODELS = {
    "cat": (["realistic cat", "cat walk cycle", "cat rigged animated", "cat run", "kitten animated"],
            ("cat", "kitten")),
    "dog": (["realistic dog", "dog walk run", "labrador animated", "german shepherd animated",
             "golden retriever animated", "husky animated", "dog trot gallop"],
            ("dog", "labrador", "shepherd", "retriever", "husky", "puppy", "hound", "terrier", "collie")),
}
NOT_REALISTIC = ("toon", "cartoon", "cute", "chibi", "low poly", "lowpoly", "low-poly", "stylized", "stylised",
                 "meme", "kitty", "bipedal", "furry", "monk", "maxwell", "oiia", "minecraft", "pixel", "ps1",
                 "voxel", "robot", "zombie", "monster", "skeleton", "halloween", "scene")
MORE_EACH = 5
MORE_MB = 60
MORE_SOUNDS = {
    "steps_barefoot": (["barefoot footsteps", "bare feet walking floor", "barefoot steps tile"], 6),
    "steps_paws_dog": (["dog walking claws floor", "dog nails on floor", "dog paws wood floor"], 8),
}
MORE_SOUNDS_EACH = 4


def clip_names(path):
    """The names of the animations in a .glb, or in the .gltf of a zip."""
    try:
        if path.endswith(".glb"):
            with open(path, "rb") as f:
                head = f.read(20)
                size = int.from_bytes(head[12:16], "little")
                doc = json.loads(f.read(size).decode("utf-8"))
        else:
            with zipfile.ZipFile(path) as z:
                name = next(n for n in z.namelist() if n.endswith(".gltf"))
                doc = json.loads(z.read(name).decode("utf-8"))
        return [a.get("name", "") for a in doc.get("animations", [])]
    except Exception as err:
        return ["(not read: %s)" % err]


def more_models(token, have):
    report, credits = {}, []
    for kind, (queries, words) in MORE_MODELS.items():
        say("models: %s" % kind)
        seen, keep = set(have), []
        for q in queries:
            for m in search_models(q):
                uid, name = m.get("uid"), (m.get("name") or "").lower()
                if not uid or uid in seen:
                    continue
                seen.add(uid)
                if not any(w in name for w in words) or any(w in name for w in NOT_REALISTIC):
                    continue
                if licence_of(m) and licence_of(m) not in LICENCES:
                    continue
                keep.append(m)
        keep.sort(key=lambda m: -(m.get("likeCount") or 0))
        got = []
        for m in keep:
            if len(got) >= MORE_EACH:
                break
            try:
                d = details(m["uid"])
            except Exception as err:
                say("  %s: no details (%s)" % (m.get("name"), err))
                continue
            arch = d.get("archives") or {}
            size = max([(a or {}).get("size") or 0 for a in arch.values()] or [0]) / 1e6
            if licence_of(d) not in LICENCES or not d.get("isDownloadable"):
                continue
            if (d.get("faceCount") or 0) > MOST_FACES or size > MORE_MB:
                continue
            label = "more/%s_%d" % (kind, len(got) + 1)
            try:
                path, n = download_model(d["uid"], label, token)
            except Exception as err:
                say("  %s: download failed: %s" % (d.get("name"), err))
                continue
            clips = clip_names(path)
            user = d.get("user") or {}
            say("  %s: %s by %s, %d faces, %.1f MB, clips: %s" % (label, d.get("name"), user.get("displayName", ""),
                d.get("faceCount") or 0, n / 1e6, ", ".join(clips) or "none"))
            got.append({"folder": label, "uid": d["uid"], "name": d.get("name", ""), "clips": clips,
                        "faces": d.get("faceCount") or 0, "page": d.get("viewerUrl", "")})
            credits.append("- %s: \"%s\" by %s, %s, %s" % (label, d.get("name", ""),
                           user.get("displayName") or user.get("username", ""), LICENCES[licence_of(d)],
                           d.get("viewerUrl", "")))
            time.sleep(0.3)
        report[kind] = got
    return report, credits


def more_sounds(key):
    credits, saved = [], {}
    for cat, (queries, longest) in MORE_SOUNDS.items():
        found = find_sounds(key, {cat: (queries, longest)}).get(cat, [])[:MORE_SOUNDS_EACH]
        saved[cat] = []
        for s in found:
            path = os.path.join(OUT, "sounds", cat, "%d.mp3" % s["id"])
            try:
                n = save_file(s["preview"], path)
            except Exception as err:
                say("sound %s %d: failed: %s" % (cat, s["id"], err))
                continue
            say("sound %s: %s (%d KB)" % (cat, s["name"], n // 1024))
            saved[cat].append(s["id"])
            credits.append("- sound %s: \"%s\" by %s, CC0, %s" % (cat, s["name"], s["author"], s["page"]))
    return saved, credits


def more():
    have = []
    picks = find_picks()
    if picks:
        p = json.load(open(picks, encoding="utf-8"))
        have = list((p.get("models") or {}).values()) + list((p.get("extra_models") or {}).values())
    token = getpass.getpass("Sketchfab API token (Settings, Password & API; not shown, not saved): ").strip()
    report, credits = more_models(token, have) if token else ({}, [])
    key = getpass.getpass("Freesound API key for 2 more kinds of steps (Enter to skip; not shown, not saved): ").strip()
    sounds, sound_credits = more_sounds(key) if key else ({}, [])
    n = mocap()
    if n:
        credits.append("- motion capture: CMU Graphics Lab Motion Capture Database, mocap.cs.cmu.edu (created with "
                       "funding from NSF EIA-0196217; free to use), as BVH files from github.com/%s" % MOCAP_REPO)
    with open(os.path.join(OUT, "more.json"), "w", encoding="utf-8") as f:
        json.dump({"models": report, "sounds": sounds, "mocap_files": n}, f, indent=1)
    with open(os.path.join(OUT, "CREDITS_MORE.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(["# Credits of the second download", ""] + credits + sound_credits) + "\n")
    say("=== done: %d cat and dog models, %d sounds, %d motion capture files" % (
        sum(len(v) for v in report.values()), sum(len(v) for v in sounds.values()), n))


def main():
    what = sys.argv[1] if len(sys.argv) > 1 else "search"
    os.makedirs(OUT, exist_ok=True)
    if what == "search":
        models = find_models()
        key = getpass.getpass("Freesound API key for the sounds (Enter to skip; not shown, not saved): ").strip()
        sounds = find_sounds(key) if key else {}
        with open(os.path.join(OUT, "candidates.json"), "w", encoding="utf-8") as f:
            json.dump({"models": models, "sounds": sounds}, f, indent=1)
        with open(os.path.join(OUT, "review.html"), "w", encoding="utf-8") as f:
            f.write(page(models, sounds))
        say("=== %d models, %d sounds to look at: open %s" % (sum(len(v) for v in models.values()),
            sum(len(v) for v in sounds.values()), os.path.join(OUT, "review.html")))
    elif what == "more":
        more()
    elif what == "mocap":
        if mocap():
            credit_mocap()
    elif what == "download":
        place = find_picks()
        if not place:
            say("No picks.json: open characters\\review.html, pick, press Save my picks.")
            return
        download(json.load(open(place, encoding="utf-8")))
    else:
        say(__doc__)


if __name__ == "__main__":
    main()
