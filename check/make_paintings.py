"""Put the paintings and the music into the game.

    python check/make_paintings.py <media folder> [--music <music folder>]

The media folder is what check/media/get_paintings.py made, with the game's
copies of each painting next to it (made from the downloaded copies):

    paintings.json     the paintings and where they come from (Wikimedia Commons)
    large/<id>.jpg     at most 1600 pixels on the longest side
    small/<id>.jpg     at most 512 pixels on the longest side

The music folder is what check/media/get_music.py made (music.json and
music/<id>.mp3). This writes:

    img/paintings/large/<id>.jpg, img/paintings/small/<id>.jpg
    js/paintings.js         the list of the paintings, with a small picture of
                            each in 1 image (for paintings far away, and for the
                            game opened from a file)
    img/paintings/CREDITS.md
    audio/music/<id>.mp3, js/music.js, audio/music/CREDITS.md

It needs Python 3 and Pillow. The ArtEmis emotions of the paintings stay
with the team: nothing of them is written here.
"""
import argparse
import base64
import io
import json
import os
import re
import shutil
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
IMG = os.path.join(ROOT, "img", "paintings")
AUDIO = os.path.join(ROOT, "audio", "music")
CELL = 48                    # the small pictures of the atlas: at most this many pixels a side
COLUMNS = 32

# what the files on Wikimedia Commons do not say right: the piece of a
# recording (the Mozart is the Romanze, not the Allegro) and who plays it
MUSIC_FIXES = {
    "clair_de_lune": {"performer": "Laurens Goedhart (piano)"},
    "moonlight": {"performer": "a Musopen recording"},
    "gymnopedie": {"performer": "Robin Alciatore (piano), Musopen"},
    "cello_suite": {"performer": "John Michel (cello)"},
    "nachtmusik": {"piece": "Eine kleine Nachtmusik, 2nd movement (Romanze)",
                   "performer": "a Musopen recording"},
    "spring": {"piece": "The Four Seasons, Spring, 1st movement (Allegro)", "performer": "John Harrison (violin)"},
    "nocturne": {"performer": "Peter Johnston (piano), Musopen"},
    "canon": {"performer": "not named on Wikimedia Commons"},
}


def name_of(text):
    """The name of a painting as Wikimedia gives it, without the Wikidata
    statements some files carry after it."""
    text = re.split(r"\s(?:label|title)\s+QS:|\sQS:|\s+Alternative title", text or "")[0]
    return re.sub(r"\s+", " ", text).strip(" .")


def js_string(s):
    return json.dumps(s, ensure_ascii=False)


def paintings(media):
    listing = json.load(open(os.path.join(media, "paintings.json"), encoding="utf8"))["paintings"]
    listing.sort(key=lambda p: p["id"])
    for sub in ("large", "small"):
        os.makedirs(os.path.join(IMG, sub), exist_ok=True)
    rows = (len(listing) + COLUMNS - 1) // COLUMNS
    atlas = Image.new("RGB", (COLUMNS * CELL, rows * CELL), (128, 120, 104))
    out = []
    for k, p in enumerate(listing):
        big = os.path.join(media, "large", p["id"] + ".jpg")
        small = os.path.join(media, "small", p["id"] + ".jpg")
        if not (os.path.exists(big) and os.path.exists(small)):
            sys.exit("no game copies of " + p["id"] + " in " + media)
        shutil.copyfile(big, os.path.join(IMG, "large", p["id"] + ".jpg"))
        shutil.copyfile(small, os.path.join(IMG, "small", p["id"] + ".jpg"))
        lw, lh = Image.open(big).size
        sw, sh = Image.open(small).size
        im = Image.open(small).convert("RGB")
        im.thumbnail((CELL, CELL), Image.LANCZOS)
        cx, cy = (k % COLUMNS) * CELL, (k // COLUMNS) * CELL
        atlas.paste(im, (cx, cy))
        tiny = im.resize((1, 1), Image.BOX).getpixel((0, 0))
        out.append({
            "id": p["id"], "artemis": p["artemis"], "painter": p["painter"],
            "title": p["title"], "name": name_of(p.get("object_name")), "year": p.get("year"),
            "page": p["commons_page"], "licence": p["licence"],
            "w": lw, "h": lh, "sw": sw, "sh": sh,
            "cell": [cx, cy, im.size[0], im.size[1]], "rgb": list(tiny)})
    buf = io.BytesIO()
    atlas.save(buf, "JPEG", quality=78, optimize=True)
    open(os.path.join(IMG, "atlas.jpg"), "wb").write(buf.getvalue())
    lines = ["/* The paintings on the walls of the 3D view, written by check/make_paintings.py",
             " * (see img/paintings/CREDITS.md): famous paintings in the public domain, from",
             " * Wikimedia Commons, chosen from ArtEmis. Their pictures are in img/paintings/:",
             " * large/<id>.jpg (at most 1600 pixels) and small/<id>.jpg (at most 512); ATLAS",
             " * holds a small picture of each (cell: x, y, width, height in it), for paintings",
             " * far away and for the game opened from a file. Run that script rather than",
             " * changing this file. */",
             "(function (root) {",
             "  var FG = root.FG = root.FG || {};",
             "  FG.PAINTINGS = ["]
    for k, p in enumerate(out):
        lines.append("    " + json.dumps(p, ensure_ascii=False, separators=(",", ":")) +
                     ("," if k < len(out) - 1 else ""))
    lines += ["  ];",
              "  FG.PAINTINGS_ATLAS = " + js_string("data:image/jpeg;base64," +
                                                   base64.b64encode(buf.getvalue()).decode("ascii")) + ";",
              "})(typeof window !== \"undefined\" ? window : globalThis);", ""]
    open(os.path.join(ROOT, "js", "paintings.js"), "w", encoding="utf8", newline="\n").write("\n".join(lines))
    credits = ["# The paintings on the walls", "",
               "%d famous paintings in the public domain (their painters died in 1955 or" % len(out),
               "before), from Wikimedia Commons, which marks each of them as public domain or",
               "CC0. They were chosen from the paintings of ArtEmis (Achlioptas et al., 2021),",
               "mixing the 8 emotions people named for them (anger and disgust are rarer), and",
               "without food, nudity or violence. The emotions stay with the research team.", "",
               "`large/` holds each at most 1600 pixels on its longest side, `small/` at most",
               "512, `atlas.jpg` all of them 48 pixels; `js/paintings.js` lists them. Made by",
               "`check/make_paintings.py`.", "",
               "| id | painter | painting | year | Wikimedia Commons | licence |",
               "|---|---|---|---|---|---|"]
    files = {p["id"]: p["commons_file"] for p in listing}
    for p in sorted(out, key=lambda q: (q["painter"], q["title"])):
        credits.append("| %s | %s | %s | %s | [%s](%s) | %s |" % (
            p["id"], p["painter"].replace("|", "/"), (p["name"] or p["title"]).replace("|", "/"),
            p["year"] or "", files[p["id"]][5:].replace("|", "/").replace("]", ")").replace("[", "("), p["page"],
            p["licence"]))
    open(os.path.join(IMG, "CREDITS.md"), "w", encoding="utf8", newline="\n").write("\n".join(credits) + "\n")
    return len(out), buf.tell()


def music(folder):
    listing = json.load(open(os.path.join(folder, "music.json"), encoding="utf8"))["music"]
    os.makedirs(AUDIO, exist_ok=True)
    out = []
    for m in listing:
        fix = MUSIC_FIXES.get(m["id"], {})
        src = os.path.join(folder, "music", m["file"])
        if not m["file"].endswith(".mp3"):
            sys.exit(m["id"] + ": the game plays MP3 files, got " + m["file"])
        shutil.copyfile(src, os.path.join(AUDIO, m["id"] + ".mp3"))
        out.append({"id": m["id"], "composer": m["composer"], "piece": fix.get("piece", m["piece"]),
                    "performer": fix.get("performer", m["performer"]), "licence": m["licence"],
                    "page": m["commons_page"], "file": m["commons_file"],
                    "seconds": round(m["seconds"] or 0, 1), "src": "audio/music/" + m["id"] + ".mp3"})
    lines = ["/* The records of the gramophone in the music room, written by",
             " * check/make_paintings.py (see audio/music/CREDITS.md): famous pieces of",
             " * classical music, real recordings from Wikimedia Commons under free licences.",
             " * Run that script rather than changing this file. */",
             "(function (root) {",
             "  var FG = root.FG = root.FG || {};",
             "  FG.MUSIC = ["]
    for k, m in enumerate(out):
        lines.append("    " + json.dumps(m, ensure_ascii=False, separators=(",", ":")) +
                     ("," if k < len(out) - 1 else ""))
    lines += ["  ];", "})(typeof window !== \"undefined\" ? window : globalThis);", ""]
    open(os.path.join(ROOT, "js", "music.js"), "w", encoding="utf8", newline="\n").write("\n".join(lines))
    credits = ["# The music of the gramophone", "",
               "Real recordings of famous classical pieces, from Wikimedia Commons, as MP3",
               "(the copy Wikimedia makes of each file). The game names the piece, who plays",
               "it and its licence while it plays. Made by `check/make_paintings.py`.", "",
               "| id | composer | piece | played by | licence | Wikimedia Commons |", "|---|---|---|---|---|---|"]
    for m in out:
        credits.append("| %s | %s | %s | %s | %s | [%s](%s) |" % (
            m["id"], m["composer"], m["piece"], m["performer"], m["licence"], m["file"][5:], m["page"]))
    credits += ["", "CC BY-SA recordings may be shared and changed under the same licence, naming",
                "who made them, as above."]
    open(os.path.join(AUDIO, "CREDITS.md"), "w", encoding="utf8", newline="\n").write("\n".join(credits) + "\n")
    return len(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("media")
    ap.add_argument("--music")
    a = ap.parse_args()
    n, atlas = paintings(a.media)
    print("%d paintings; js/paintings.js written (atlas %d KB)" % (n, atlas // 1024))
    if a.music:
        print("%d pieces of music; js/music.js written" % music(a.music))


if __name__ == "__main__":
    main()
