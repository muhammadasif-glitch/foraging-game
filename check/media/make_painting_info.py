"""Writes js/painting_info.js, what the info card of each painting shows,
from the file check/media/get_painting_info.py wrote (Wikidata and
Wikipedia):

    python check/media/make_painting_info.py painting_info.json

For each painting (by its id in js/paintings.js): its title (Wikidata's
English name of the painting, else the title of js/paintings.js), the
painter, the painter's years, the year painted, 1 movement, 1 genre, the
collection it is in, and a few sentences: from the Wikipedia article of the
painting itself, or, when it has none, from the article of its painter
(about_of "painter"). Nothing is written that is not in those sources.
"""
import difflib
import json
import os
import re
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(REPO, "js", "painting_info.js")
SENTENCES = 3          # at most this many sentences of the article
CHARS = 520            # and at most about this many characters


def sentences(text, n=SENTENCES, most=CHARS):
    """The first n sentences of text, fewer if they run past most."""
    text = re.sub(r"\s+", " ", plain(text)).strip()
    if not text:
        return None
    # a sentence ends at . ! ? before a space and a capital, not after an initial or a short abbreviation
    parts = re.split(r"(?<=[.!?])\s+(?=[A-ZÀ-Þ\"'(])", text)
    out = []
    for p in parts:
        if out and (len(" ".join(out + [p])) > most or len(out) >= n):
            break
        if out and re.search(r"\b([A-Z]|St|Mr|Mrs|Dr|c|ca|no|vol)\.$", out[-1]):
            out[-1] = out[-1] + " " + p
            continue
        out.append(p)
    return " ".join(out)


def norm(t):
    t = unicodedata.normalize("NFKD", t or "").encode("ascii", "ignore").decode().lower()
    return " ".join(re.sub(r"[^a-z0-9 ]+", " ", t).split())


def like(a, b):
    return difflib.SequenceMatcher(None, norm(a), norm(b)).ratio()


def clean_title(label, fallback):
    """Wikidata's English name when it is close to the game's title (it
    is then better spelled), else the game's title."""
    t = (label or "").strip()
    if not t or re.match(r"^Q\d+$", t) or like(t, fallback) < 0.4:
        return title_case(fallback)
    return t[:1].upper() + t[1:]


SMALL = {"a", "an", "the", "and", "or", "of", "in", "on", "at", "with", "by", "for", "to", "from", "into", "near",
         "de", "la", "le", "les", "van", "von", "da", "del", "della", "der", "di", "du", "y", "en", "et"}


def title_case(t):
    """The titles of js/paintings.js are in sentence case ("The virgin and
    child with st anne"): in title case, as on a museum label."""
    out = []
    for k, w in enumerate(t.split()):
        low = w.lower()
        if re.fullmatch(r"(i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)[.,:;]?", low):
            out.append(w.upper())
        elif k and low in SMALL:
            out.append(low)
        elif low == "st":
            out.append("St")
        elif w[:1].islower():
            out.append(w[:1].upper() + w[1:])
        else:
            out.append(w)
    return " ".join(out)


def same_painting(r):
    """The Wikidata item is this painting: its creator is the painter (an
    image can also illustrate an item about something else: the sitter of a
    portrait, a place, a story)."""
    p, a = r.get("painting") or {}, r.get("artist") or {}
    if a.get("wikidata") and a["wikidata"] in (p.get("creator_ids") or []):
        return True
    words = [w for w in norm(r["painter"]).split() if len(w) >= 4]
    if not any(like(c, r["painter"]) > 0.8 or any(w in norm(c).split() for w in words) for c in p.get("creators") or []):
        return False
    return True


def sure(r):
    """Found by its own image: sure. Found by its painter and title: only
    when the year is known on both sides and agrees within 3 years (a
    painter often made several works of 1 title: a painting and a print of
    it, studies, versions)."""
    if r.get("how") == "image":
        return same_painting(r)
    years = (r.get("painting") or {}).get("years") or []
    return bool(r.get("year") and years and min(abs(r["year"] - y) for y in years) <= 3 and same_painting(r))


def plain(text):
    """Wikipedia's introduction without the pronunciation guides (a bracket
    holding one goes whole: the life dates are on the card already) and the
    empty brackets they leave."""
    t = text or ""
    group = r"\((?:[^()]|\([^()]*\))*\)"
    t = re.sub(r"\s*" + group, lambda m: "" if re.search(r"\[|pronunciation|\bUK:|\bUS:|listen", m.group(0)) else m.group(0), t)
    t = re.sub(r"\(\s*[;,]\s*", "(", t)
    t = re.sub(r"\s*\(\s*\)", "", t)
    t = re.sub(r"\s+([,.;])", r"\1", t)
    return re.sub(r"\s{2,}", " ", t).strip()


def first(xs):
    return xs[0] if xs else None


def main():
    src = json.load(open(sys.argv[1], encoding="utf-8"))
    out = {}
    counts = {"painting": 0, "painter": 0, "none": 0}
    for r in src:
        p, a = r.get("painting") or {}, r.get("artist") or {}
        if p and not sure(r):
            counts["dropped"] = counts.get("dropped", 0) + 1
            p = {}
        name = a.get("name") if a.get("name") and not re.match(r"^Q\d+$", a["name"]) else r["painter"]
        e = {"title": clean_title(p.get("label"), r["title"]), "painter": name}
        if a.get("born"):
            e["born"] = a["born"]
        if a.get("died"):
            e["died"] = a["died"]
        years = p.get("years") or []
        if years:
            e["year"] = min(years)
        mv = first(p.get("movements")) or first(a.get("movements"))
        if mv:
            e["movement"] = mv[:1].upper() + mv[1:]
        if first(p.get("genres")):
            g = first(p["genres"])
            e["genre"] = g[:1].upper() + g[1:]
        cols = [c for c in p.get("collections") or [] if not c.startswith("http")]
        if cols:
            e["collection"] = cols[0]
        pw, aw = p.get("wiki") or {}, a.get("wiki") or {}
        if pw.get("extract"):
            e["about"] = sentences(pw["extract"])
            e["about_of"] = "painting"
            e["wiki_url"] = pw.get("url")
            counts["painting"] += 1
        elif aw.get("extract"):
            e["about"] = sentences(aw["extract"])
            e["about_of"] = "painter"
            e["wiki_url"] = aw.get("url")
            counts["painter"] += 1
        else:
            counts["none"] += 1
        if p and r.get("wikidata"):
            e["wikidata"] = r["wikidata"]
        out[r["id"]] = e
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("/* What the info card of each painting shows (js/painting_card.js), by its id in\n"
                " * js/paintings.js: from Wikidata and Wikipedia (CC BY-SA), written by\n"
                " * check/media/make_painting_info.py. about: a few sentences of the Wikipedia article\n"
                " * of the painting, or of its painter (about_of). Run that script rather than\n"
                " * changing this file. */\n")
        f.write("(function (root) {\n  var FG = root.FG = root.FG || {};\n  FG.PAINTING_INFO = {\n")
        f.write(",\n".join("    %s: %s" % (json.dumps(k), json.dumps(v, ensure_ascii=False)) for k, v in sorted(out.items())))
        f.write("\n  };\n})(typeof window !== \"undefined\" ? window : globalThis);\n")
    print("%d paintings: about the painting %d, about the painter %d, nothing %d; Wikidata items not the painting %d" %
          (len(out), counts["painting"], counts["painter"], counts["none"], counts.get("dropped", 0)))


if __name__ == "__main__":
    main()
