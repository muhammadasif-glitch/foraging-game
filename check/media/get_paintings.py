"""Download the paintings for the walls of Food Rooms from Wikimedia Commons.

    python get_paintings.py

Reads artemis_shortlist.json (next to this file): paintings chosen from
ArtEmis, by painters who died in 1955 or before, an even mix of the 8
emotions. For each painting it looks for the same painting on Wikimedia
Commons, keeps it only if Commons marks it as public domain (or CC0) and the
painter and the title match, and downloads 1 copy:

    paintings/<id>_large.jpg   1920 pixels wide (or the original, if smaller)

(the game's smaller copies are made from it later). It stops for an emotion
once it has 95 good paintings of it (anger and disgust, which are rare, as
many as it finds). Paintings found by an earlier run (state.json) are kept
and not downloaded again; only the rest of the shortlist is tried.

A painting counts as doubtful, and is left out of the game (its file stays),
when its picture is also the picture of another ArtEmis painting, when its
ArtEmis year and the year on Wikimedia are more than 5 years apart (another
version), or when it is a later entry of a series in ArtEmis (a name ending
in -1, -2 ... or (1)) whose year does not confirm it. New paintings are only taken
when none of this applies. Then it writes:

    paintings.json         what each painting is and where it is from (goes into the game)
    artemis_emotions.csv   the ArtEmis emotions of the chosen paintings (stays with the team)
    review.html            all chosen paintings on 1 page, to check by eye
    log.txt                every painting tried, and why one was left out

Run it again at any time: it goes on where it stopped and does not download
anything twice. It needs only Python 3 (no packages) and the internet. The
first run takes about 30 to 45 minutes; a later run only tries the paintings
not tried before. Wikimedia asks for requests 1 at a time, so it does not
hurry.
"""
import csv
import hashlib
import html
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
API = os.environ.get("FOODROOMS_API", "https://commons.wikimedia.org/w/api.php")
USER_AGENT = "FoodRoomsPaintings/1.0 (research game; https://github.com/muhammadasif-glitch/foraging-game)"
PAUSE = float(os.environ.get("FOODROOMS_PAUSE", "0.4"))     # seconds between requests
LARGE = 1920                                                 # a width Wikimedia keeps ready
LARGE_ELSE = (1280, 2560)                                    # if it refuses that one
MIN_WIDTH = 800                                              # the original must be at least this wide
PER_EMOTION = 95                                             # good paintings wanted per emotion
STOP = {"the", "a", "an", "of", "in", "on", "at", "and", "with", "de", "la", "le", "les", "du", "des", "von",
        "van", "der", "den", "to", "for", "from", "by", "di", "da", "del", "el", "il", "et", "au", "aux", "s"}
# words in a file name that show it is not the painting itself
NOT_IT = {"detail", "details", "frame", "framed", "photograph", "photo", "museum", "hall", "room", "exhibition",
          "xray", "infrared", "reverse", "verso", "stamp", "postage", "coin", "banknote", "installation",
          "restoration", "crop", "cropped", "fragment", "engraving", "copy", "replica", "sketch", "study"}
OK_LICENCE = re.compile(r"public\s*domain|^pd\b|\bpd-|cc0|cc-pd|cc-zero", re.I)

paths = {name: os.path.join(HERE, name) for name in
         ("artemis_shortlist.json", "paintings.json", "artemis_emotions.csv", "review.html", "log.txt", "state.json")}
OUT = os.path.join(HERE, "paintings")


def say(*parts):
    line = " ".join(str(p) for p in parts)
    print(line)
    with open(paths["log.txt"], "a", encoding="utf8") as f:
        f.write(line + "\n")


def plain(text):
    """Text without HTML, accents and punctuation, in small letters."""
    text = html.unescape(re.sub(r"<[^>]+>", " ", text or ""))
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def clean(text):
    """Text without HTML, as it reads."""
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", text or ""))).strip()


def words(text):
    return [w for w in plain(text).split() if w not in STOP]


def fetch(url, tries=5):
    """The bytes at url, waiting and trying again when Wikimedia is busy."""
    wait = 5
    for k in range(tries):
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            time.sleep(PAUSE)
            return data
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and k < tries - 1:
                pause = int(e.headers.get("Retry-After") or wait)
                say("    busy (" + str(e.code) + "), waiting", pause, "s")
                time.sleep(pause)
                wait *= 2
                continue
            raise
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            if k < tries - 1:
                say("    no answer (" + str(e) + "), trying again in", wait, "s")
                time.sleep(wait)
                wait *= 2
                continue
            raise


def api(**params):
    params.update(format="json", formatversion="2")
    return json.loads(fetch(API + "?" + urllib.parse.urlencode(params)).decode("utf8"))


def search(query):
    r = api(action="query", list="search", srnamespace="6", srlimit="10", srsearch=query + " filetype:bitmap")
    return [x["title"] for x in r.get("query", {}).get("search", [])]


def info(titles, width):
    r = api(action="query", titles="|".join(titles), prop="imageinfo", iiprop="url|size|mime|extmetadata",
            iiurlwidth=str(width),
            iiextmetadatafilter="Artist|ObjectName|DateTimeOriginal|LicenseShortName|License|Credit|Categories")
    out = {}
    for page in r.get("query", {}).get("pages", []):
        if page.get("imageinfo"):
            out[page["title"]] = page["imageinfo"][0]
    return out


def meta(ii, key):
    return (ii.get("extmetadata", {}).get(key) or {}).get("value", "") or ""


def years(text):
    return [int(y) for y in re.findall(r"\b(1[2-9]\d\d)\b", text or "")]


def year_agrees(year, text):
    """'same', 'different' (more than 5 years apart) or 'unknown'."""
    ys = years(text)
    if not year or not ys:
        return "unknown"
    return "same" if any(abs(y - year) <= 5 for y in ys) else "different"


def series(slug):
    """A later entry of a series in ArtEmis: a name ending in -1, -2 ... or (1)."""
    return re.search(r"-\d{1,2}$|\(\d+\)$", slug) is not None


def art_year(p):
    """The ArtEmis year of a painting, also when it is only in its name."""
    if p.get("year"):
        return p["year"]
    ys = years(p["artemis"].split("_", 1)[-1].replace("-", " "))
    return ys[0] if ys else None


def mark_doubtful(state):
    """Moves the doubtful paintings of earlier runs out of the chosen ones."""
    doubt = state.setdefault("doubtful", {})
    chosen = state["chosen"]
    by_file = {}
    for slug, c in chosen.items():
        by_file.setdefault(c["commons_file"], []).append(slug)
    for file, slugs in by_file.items():
        if len(slugs) > 1:
            sure = [x for x in slugs if not series(x) and
                    year_agrees(art_year(chosen[x]), file + " " + (chosen[x].get("object_name") or "")) == "same"]
            for x in slugs:
                if not (len(sure) == 1 and x == sure[0]):
                    doubt[x] = dict(chosen[x], doubt="the same picture as another ArtEmis painting")
    for slug, c in chosen.items():
        if slug in doubt:
            continue
        agree = year_agrees(art_year(c), c["commons_file"] + " " + (c.get("object_name") or ""))
        if agree == "different":
            doubt[slug] = dict(c, doubt="the year differs from Wikimedia")
        elif series(slug) and agree != "same":
            doubt[slug] = dict(c, doubt="a later entry of a series, not confirmed")
    for slug in doubt:
        chosen.pop(slug, None)
    return len(doubt)


def painter_words(name):
    return {w for w in words(name) if len(w) >= 4 and w not in ("elder", "younger", "saint", "jean", "john", "paul",
                                                                  "pierre", "auguste", "henri", "ivan", "vasily")}


def score(p, title, ii, used=()):
    """How well the file matches the painting, or a reason to leave it out."""
    if title in used:
        return None, "the picture of another painting already chosen"
    if ii.get("mime") not in ("image/jpeg", "image/png"):
        return None, "not a jpg or png (" + str(ii.get("mime")) + ")"
    if (ii.get("width") or 0) < MIN_WIDTH:
        return None, "too small (" + str(ii.get("width")) + " px)"
    licence = meta(ii, "LicenseShortName") + " " + meta(ii, "License")
    if not OK_LICENCE.search(licence.strip()):
        return None, "licence: " + plain(licence)[:40]
    name = plain(title)
    year = art_year(p)
    want = set(words(p["title"])) - {str(year)}
    have = set(words(title + " " + meta(ii, "ObjectName")))
    bad = (set(name.split()) & NOT_IT) - want
    if bad:
        return None, "not the painting itself (" + ", ".join(sorted(bad)) + ")"
    by = plain(title + " " + meta(ii, "Artist") + " " + meta(ii, "Credit") + " " + meta(ii, "Categories"))
    if not painter_words(p["painter"]) & set(by.split()):
        return None, "another painter"
    if not want:
        return None, "no title to match"
    match = len(want & have) / len(want)
    agree = year_agrees(year, title + " " + meta(ii, "ObjectName") + " " + meta(ii, "DateTimeOriginal"))
    if agree == "different":
        return None, "the year differs (another version)"
    if series(p["artemis"]) and agree != "same":
        return None, "a later entry of a series, not confirmed"
    year_ok = agree == "same"
    if match < 0.6 and not (match >= 0.5 and year_ok):
        return None, "title does not match (%.0f%%)" % (100 * match)
    pixels = (ii.get("width") or 0) * (ii.get("height") or 0)
    return match + (0.15 if year_ok else 0) + min(0.1, pixels / 4e8), None


def download(title, widths, path_base, first=None):
    """Downloads the file at the first of widths that Wikimedia gives (the
    original if it is smaller); returns (file name, width, bytes)."""
    for k, w in enumerate(widths):
        ii = first if (k == 0 and first) else info([title], w).get(title)
        if not ii:
            continue
        url = ii.get("thumburl") or ii.get("url")
        ext = os.path.splitext(urllib.parse.urlparse(url).path)[1].lower()
        name = path_base + (".png" if ext == ".png" else ".jpg")
        try:
            data = fetch(url, tries=3)
        except urllib.error.HTTPError as e:
            say("    width", w, "refused (" + str(e.code) + "), trying another")
            continue
        with open(name, "wb") as f:
            f.write(data)
        return os.path.basename(name), ii.get("thumbwidth") or ii.get("width"), len(data)
    return None, None, 0


def main():
    if not os.path.exists(paths["artemis_shortlist.json"]):
        sys.exit("artemis_shortlist.json is not next to this file")
    short = json.load(open(paths["artemis_shortlist.json"], encoding="utf8"))
    os.makedirs(OUT, exist_ok=True)
    state = {"chosen": {}, "left_out": {}}
    if os.path.exists(paths["state.json"]):
        state = json.load(open(paths["state.json"], encoding="utf8"))
    doubtful = mark_doubtful(state)
    json.dump(state, open(paths["state.json"], "w", encoding="utf8"), ensure_ascii=False, indent=1)
    say("=== " + time.strftime("%Y-%m-%d %H:%M") + ": " + str(len(short["paintings"])) + " paintings on the shortlist; " +
        str(len(state["chosen"])) + " found before, " + str(doubtful) + " of the earlier ones left out as doubtful")
    per = max(short.get("per_emotion", 0), PER_EMOTION)
    total = len(short["paintings"])
    for n, p in enumerate(short["paintings"], 1):
        slug, emo = p["artemis"], p["emotion"]
        have = sum(1 for c in state["chosen"].values() if c["emotion"] == emo)
        if slug in state["chosen"] or slug in state["left_out"] or slug in state["doubtful"] or have >= per:
            continue
        head = "[%d/%d] %s %d/%d  %s: %s" % (n, total, emo, have, per, p["painter"], p["title"])
        try:
            found = search(p["painter"] + " " + p["title"])
            if not found and p.get("year"):
                found = search(p["painter"] + " " + p["title"] + " " + str(p["year"]))
            best, why = None, "not on Wikimedia Commons"
            if found:
                infos = info(found, LARGE)
                used = {c["commons_file"] for part in ("chosen", "doubtful") for c in state[part].values()}
                ranked = []
                for t, ii in infos.items():
                    s, reason = score(p, t, ii, used)
                    if s is None:
                        why = reason
                    else:
                        ranked.append((s, t, ii))
                if ranked:
                    ranked.sort(key=lambda x: -x[0])
                    best = ranked[0]
            if not best:
                state["left_out"][slug] = why
                say(head, " -- left out:", why)
            else:
                s, title, ii = best
                pid = "p" + hashlib.sha1(slug.encode("utf8")).hexdigest()[:8]
                lf, lw, lb = download(title, (LARGE,) + LARGE_ELSE, os.path.join(OUT, pid + "_large"), first=ii)
                if not lf:
                    state["left_out"][slug] = "download refused"
                    say(head, " -- left out: download refused")
                else:
                    state["chosen"][slug] = {
                        "id": pid, "artemis": slug, "emotion": emo, "painter": p["painter"],
                        "painter_died": p["painter_died"], "title": p["title"], "year": p.get("year"),
                        "style": p.get("style"), "commons_file": title,
                        "commons_page": ii.get("descriptionurl") or ("https://commons.wikimedia.org/wiki/" +
                                                                    urllib.parse.quote(title.replace(" ", "_"))),
                        "licence": clean(meta(ii, "LicenseShortName")) or "Public domain",
                        "credit": clean(meta(ii, "Artist"))[:200], "object_name": clean(meta(ii, "ObjectName"))[:200],
                        "original": [ii.get("width"), ii.get("height")],
                        "large": {"file": lf, "width": lw, "bytes": lb}, "small": None,
                        "match": round(s, 3)}
                    say(head, " -- ok:", title, "(%s px, %d KB)" % (ii.get("width"), lb // 1024))
        except Exception as e:                     # a painting that fails is tried again on the next run
            say(head, " -- error, will try again next run:", repr(e)[:200])
        json.dump(state, open(paths["state.json"], "w", encoding="utf8"), ensure_ascii=False, indent=1)
    write_outputs(short, state)


def write_outputs(short, state):
    chosen = sorted(state["chosen"].values(), key=lambda c: (short["emotions"].index(c["emotion"]), c["painter"]))
    public = [{k: v for k, v in c.items() if k not in ("emotion", "match")} for c in chosen]
    json.dump({"source": "Wikimedia Commons, public domain", "paintings": public},
              open(paths["paintings.json"], "w", encoding="utf8"), ensure_ascii=False, indent=1)
    by_slug = {p["artemis"]: p for p in short["paintings"]}
    emotions = short["emotions"] + ["something else"]
    with open(paths["artemis_emotions.csv"], "w", newline="", encoding="utf8") as f:
        w = csv.writer(f)
        w.writerow(["id", "artemis", "emotion", "share", "annotations"] + ["artemis_" + e for e in emotions] +
                   ["contrastive_" + e for e in emotions])
        for c in chosen:
            p = by_slug.get(c["artemis"], {})
            a, b = p.get("emotions_artemis", {}), p.get("emotions_contrastive", {})
            w.writerow([c["id"], c["artemis"], c["emotion"], p.get("share"), p.get("annotations")] +
                       [a.get(e, 0) for e in emotions] + [b.get(e, 0) for e in emotions])
    cards = []
    for i, c in enumerate(chosen, 1):
        cards.append(
            '<label class="card"><img loading="lazy" src="paintings/%s"><span class="n">%d</span>'
            '<input type="checkbox" value="%s"> wrong or unsuitable<b>%s</b><i>%s%s</i><small>%s<br>'
            '<a href="%s" target="_blank">%s</a></small></label>' % (
                html.escape((c.get("small") or c["large"])["file"]), i, c["id"], html.escape(c["painter"]), html.escape(c["title"]),
                (", " + str(c["year"])) if c.get("year") else "", html.escape(c["emotion"]),
                html.escape(c["commons_page"]), html.escape(c["commons_file"])))
    count = {}
    for c in chosen:
        count[c["emotion"]] = count.get(c["emotion"], 0) + 1
    page = """<!doctype html><meta charset="utf-8"><title>Paintings to check</title>
<style>body{font:14px system-ui,sans-serif;margin:20px;background:#f4f4f2;color:#222}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px}
.card{background:#fff;border:1px solid #ddd;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:4px;position:relative}
.card img{width:100%;height:200px;object-fit:contain;background:#eee}.card b{font-size:14px}.card small{color:#666;word-break:break-all}
.n{position:absolute;top:12px;left:12px;background:#000a;color:#fff;border-radius:4px;padding:1px 6px}
textarea{width:100%;height:60px}</style>
<h1>Paintings to check (""" + str(len(chosen)) + """)</h1>
<p>Per emotion: """ + html.escape(", ".join("%s %d" % (e, count.get(e, 0)) for e in short["emotions"])) + """.
Tick every painting that is the wrong picture (not the painting named under it) or not suitable for the study,
then copy the list below and send it.</p>
<textarea id="out" readonly placeholder="the ticked paintings appear here"></textarea>
<div class="grid">""" + "\n".join(cards) + """</div>
<script>document.addEventListener("change",function(){var v=[];document.querySelectorAll("input:checked").forEach(function(c){v.push(c.value)});
document.getElementById("out").value=v.join(" ")});</script>"""
    open(paths["review.html"], "w", encoding="utf8").write(page)
    say("=== done: %d good paintings (%s); %d not found or not usable, %d doubtful (left out of the game). "
        "Open review.html to check them." % (
        len(chosen), ", ".join("%s %d" % (e, count.get(e, 0)) for e in short["emotions"]), len(state["left_out"]),
        len(state.get("doubtful", {}))))


if __name__ == "__main__":
    main()
