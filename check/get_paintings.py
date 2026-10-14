"""Fetch public-domain paintings for the walls of the 3D view, and write
js/paintings.js and img/paintings/CREDITS.md from them.

    python check/get_paintings.py              # fetch, then pack
    python check/get_paintings.py --pack       # only pack what is in img/paintings/
    python check/get_paintings.py --count 60   # how many to keep (48)

The paintings come from the Art Institute of Chicago, which publishes the
images of its public-domain works under CC0
(https://www.artic.edu/open-access/open-access-images). The script asks the
museum's API for public-domain paintings of landscapes, leaves out still
lifes, food, portraits and violent scenes, and keeps the first --count of
them, 400 pixels wide, as img/paintings/aic_<id>.jpg. It waits 1 second
between requests, as the museum asks, so a full run takes about a minute.

Packing writes every image of img/paintings/ into js/paintings.js as data
the page reads, so that the paintings also show when the game is opened
from a file (a browser keeps a page opened from a file from reading the
pixels of separate image files). Only the standard library is needed.
"""
import argparse
import base64
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
IMG = os.path.join(ROOT, "img", "paintings")
OUT = os.path.join(ROOT, "js", "paintings.js")
API = "https://api.artic.edu/api/v1"
FIELDS = ("id,title,image_id,artist_title,artist_display,date_display,artwork_type_title,"
          "classification_titles,subject_titles,term_titles,is_public_domain")
SEARCHES = ("landscape", "river landscape", "coast", "mountains", "harbor", "snow landscape")
# words that keep a work out: food (the game is about food), and what does
# not belong on the walls of a study
LEAVE_OUT = ("still life", "still-life", "fruit", "food", "flower", "vegetable", "fish", "game piece",
             "bread", "cheese", "kitchen", "market", "dinner", "breakfast", "meal", "feast", "table",
             "portrait", "nude", "battle", "war", "crucifixion", "martyr", "death", "dead", "blood",
             "hunt", "execution", "shipwreck", "fire", "religious", "saint", "christ", "madonna")
LANDSCAPE = ("landscape", "view", "river", "lake", "sea", "coast", "mountain", "valley", "field",
             "forest", "wood", "harbor", "bay", "hill", "meadow", "village", "sunset", "sunrise", "snow",
             "winter", "morning", "evening", "pond", "shore", "beach", "cliff", "trees", "countryside")


def words(item):
    parts = [item.get("title") or ""]
    for k in ("classification_titles", "subject_titles", "term_titles"):
        parts += item.get(k) or []
    return " ".join(parts).lower()


def has(text, ws):
    """Whether text holds 1 of the words ws, as a whole word (or its plural)."""
    return any(re.search(r"\b%s(s|es)?\b" % re.escape(w), text) for w in ws)


def suitable(item):
    """A public-domain painting of a landscape, with no food and nothing violent."""
    if not item.get("is_public_domain") or not item.get("image_id"):
        return False
    if (item.get("artwork_type_title") or "").lower() != "painting":
        return False
    text = words(item)
    if has(text, LEAVE_OUT):
        return False
    return has(text, LANDSCAPE)


def get(url, contact, want_json=True):
    req = urllib.request.Request(url, headers={"AIC-User-Agent": "foraging-game (%s)" % contact,
                                               "User-Agent": "foraging-game/2.1"})
    with urllib.request.urlopen(req, timeout=40) as r:
        data = r.read()
    return json.loads(data.decode("utf-8")) if want_json else data


def search(api, query, page, contact):
    params = [("q", query), ("query[term][is_public_domain]", "true"), ("fields", FIELDS),
              ("limit", "100"), ("page", str(page))]
    return get(api + "/artworks/search?" + urllib.parse.urlencode(params), contact)


def fetch(count, api, contact, pause):
    os.makedirs(IMG, exist_ok=True)
    credits = read_credits()
    have = {c["file"] for c in credits}
    chosen, seen = [], set()
    for query in SEARCHES:
        for page in (1, 2):
            if len(chosen) >= count:
                break
            got = search(api, query, page, contact)
            time.sleep(pause)
            iiif = (got.get("config") or {}).get("iiif_url") or "https://www.artic.edu/iiif/2"
            for item in got.get("data") or []:
                if len(chosen) >= count or item.get("id") in seen or not suitable(item):
                    continue
                seen.add(item["id"])
                chosen.append((item, iiif))
    print("found %d paintings" % len(chosen))
    for k, (item, iiif) in enumerate(chosen):
        name = "aic_%d.jpg" % item["id"]
        path = os.path.join(IMG, name)
        if not os.path.exists(path):
            data = get("%s/%s/full/400,/0/default.jpg" % (iiif, item["image_id"]), contact, want_json=False)
            if not data.startswith(b"\xff\xd8"):
                print("  %s: not a JPEG, left out" % name)
                continue
            with open(path, "wb") as fh:
                fh.write(data)
            time.sleep(pause)
        if name not in have:
            credits.append({"file": name, "title": item.get("title"), "artist": item.get("artist_title") or
                            (item.get("artist_display") or "").split("\n")[0],
                            "date": item.get("date_display"),
                            "source": "https://www.artic.edu/artworks/%d" % item["id"],
                            "licence": "CC0 (Art Institute of Chicago, public domain)"})
            have.add(name)
        print("  %2d %s  %s" % (k + 1, name, item.get("title")))
    write_credits(credits)


def read_credits():
    path = os.path.join(IMG, "credits.json")
    if os.path.exists(path):
        with open(path) as fh:
            return json.load(fh)
    return []


def write_credits(credits):
    credits = sorted(credits, key=lambda c: c["file"])
    with open(os.path.join(IMG, "credits.json"), "w", newline="\n") as fh:
        json.dump(credits, fh, indent=1)
        fh.write("\n")
    lines = ["# The paintings on the walls", "",
             "Public-domain paintings from the Art Institute of Chicago, whose images of",
             "public-domain works are released under CC0. Fetched and packed into",
             "js/paintings.js by check/get_paintings.py. Each room colour of the maze has",
             "its own painting, so a painting tells the player no more than the colour.", "",
             "| file | title | artist | date | source |", "| --- | --- | --- | --- | --- |"]
    for c in credits:
        cells = [c["file"], c.get("title") or "", c.get("artist") or "", c.get("date") or "", c.get("source") or ""]
        lines.append("| " + " | ".join(str(x).replace("|", "/") for x in cells) + " |")
    with open(os.path.join(IMG, "CREDITS.md"), "w", newline="\n") as fh:
        fh.write("\n".join(lines) + "\n")


def pack():
    credits = {c["file"]: c for c in read_credits()}
    files = sorted(f for f in os.listdir(IMG) if f.lower().endswith((".jpg", ".jpeg"))) if os.path.isdir(IMG) else []
    entries, total = [], 0
    for f in files:
        with open(os.path.join(IMG, f), "rb") as fh:
            data = fh.read()
        total += len(data)
        c = credits.get(f, {})
        entries.append({"file": f, "title": c.get("title"), "artist": c.get("artist"), "date": c.get("date"),
                        "source": c.get("source"),
                        "data": "data:image/jpeg;base64," + base64.b64encode(data).decode("ascii")})
    lines = ["/* The public-domain paintings for the walls of the 3D view, written by",
             " * check/get_paintings.py from img/paintings/ (see img/paintings/CREDITS.md).",
             " * While the list is empty the game paints its own landscapes (js/art.js).",
             " * Run that script rather than changing this file. */",
             "(function (root) {",
             "  var FG = root.FG = root.FG || {};"]
    if entries:
        lines.append("  FG.PAINTINGS = [")
        for i, e in enumerate(entries):
            lines.append("    %s%s" % (json.dumps(e, sort_keys=True), "," if i < len(entries) - 1 else ""))
        lines.append("  ];")
    else:
        lines.append("  FG.PAINTINGS = [];")
    lines += ["})(typeof window !== \"undefined\" ? window : globalThis);", ""]
    with open(OUT, "w", newline="\n") as fh:
        fh.write("\n".join(lines))
    print("wrote %s: %d paintings, %.0f kB of images" % (os.path.normpath(OUT), len(entries), total / 1024))
    return len(entries)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--pack", action="store_true", help="only pack the images already in img/paintings/")
    ap.add_argument("--count", type=int, default=48, help="how many paintings to keep (48)")
    ap.add_argument("--contact", default="research use", help="who is asking, for the museum's logs")
    ap.add_argument("--api", default=API, help=argparse.SUPPRESS)
    ap.add_argument("--pause", type=float, default=1.0, help=argparse.SUPPRESS)
    a = ap.parse_args(argv)
    if not a.pack:
        try:
            fetch(a.count, a.api, a.contact, a.pause)
        except OSError as e:
            print("could not reach the museum (%s); packing what is there" % e)
    return 0 if pack() or a.pack else 1


if __name__ == "__main__":
    sys.exit(main())
