"""Download the music for the music room of Food Rooms from Wikimedia Commons.

    python get_music.py

Finds a real recording (not a MIDI file) of each famous piece below on
Wikimedia Commons that is free to use (public domain, CC0, CC BY or
CC BY-SA), between 1 and 15 minutes long, and downloads it as MP3 (the copy
Wikimedia makes; the original Ogg file if there is none):

    music/<id>.mp3
    music.json     what each recording is, who plays it, its licence (goes into the game)
    log.txt        every recording looked at, and why one was left out

It stops after 8 pieces (the last 2 on the list are spares). Run it again at
any time: it goes on where it stopped. It needs only Python 3 and the
internet, and takes about 5 minutes. Please listen to the files before they
go into the game.
"""
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
USER_AGENT = "FoodRoomsMusic/1.0 (research game; https://github.com/muhammadasif-glitch/foraging-game)"
PAUSE = float(os.environ.get("FOODROOMS_PAUSE", "0.4"))
WANTED = 8
SHORTEST, LONGEST = 60, 900          # seconds
OK_LICENCE = re.compile(r"public\s*domain|^pd\b|\bpd-|cc0|cc-pd|cc-zero|cc[ -]by", re.I)

# id, composer, piece, words that must be in the file's name or description
# (each group: at least 1 of them), searches, files known to be good recordings
PIECES = [
    ("clair_de_lune", "Claude Debussy", "Clair de lune (Suite bergamasque)", [["clair"], ["lune"]],
     ["Debussy Clair de lune", "Suite bergamasque Clair de lune"], []),
    ("moonlight", "Ludwig van Beethoven", "Piano Sonata No. 14 \"Moonlight\", 1st movement",
     [["moonlight", "27"]], ["Beethoven Moonlight Sonata adagio sostenuto", "Beethoven sonata 14 moonlight"],
     ["File:Ludwig van Beethoven - sonata no. 14 in c sharp minor 'moonlight', op. 27 no. 2 - i. adagio sostenuto.ogg"]),
    ("gymnopedie", "Erik Satie", "Gymnopédie No. 1", [["gymnopedie", "gymnopedies"]],
     ["Satie Gymnopedie 1", "Satie gymnopedies lent et douloureux"],
     ["File:Erik Satie - gymnopedies - la 1 ere. lent et douloureux.ogg"]),
    ("cello_suite", "Johann Sebastian Bach", "Cello Suite No. 1, Prelude", [["prelude", "praeludium"], ["1007", "suite"]],
     ["Bach Cello Suite 1 Prelude", "BWV 1007 Prelude"],
     ["File:JOHN MICHEL CELLO-J S BACH CELLO SUITE 1 in G Prelude.ogg"]),
    ("nachtmusik", "Wolfgang Amadeus Mozart", "Eine kleine Nachtmusik, 1st movement", [["nachtmusik", "525"]],
     ["Eine kleine Nachtmusik Allegro", "Mozart K 525 Allegro", "Mozart Serenade 13"], []),
    ("spring", "Antonio Vivaldi", "The Four Seasons, Spring, 1st movement", [["spring", "primavera"]],
     ["Vivaldi Spring Allegro", "Vivaldi Four Seasons Spring", "Vivaldi La primavera"], []),
    ("nocturne", "Frédéric Chopin", "Nocturne in E-flat major, Op. 9 No. 2", [["nocturne"], ["9"]],
     ["Chopin Nocturne op 9 no 2", "Chopin Nocturne E flat major op 9"], []),
    ("canon", "Johann Pachelbel", "Canon in D", [["canon", "kanon"]], ["Pachelbel Canon in D", "Pachelbel Canon"], []),
    ("morning", "Edvard Grieg", "Peer Gynt, Morning Mood", [["morning", "morgenstemning"]],
     ["Grieg Morning Mood", "Peer Gynt Morning"], []),
    ("air", "Johann Sebastian Bach", "Air on the G String", [["air", "aria"]],
     ["Bach Air on the G String", "Bach Air BWV 1068"], []),
]

paths = {name: os.path.join(HERE, name) for name in ("music.json", "log.txt", "music_state.json")}
OUT = os.path.join(HERE, "music")


def say(*parts):
    line = " ".join(str(p) for p in parts)
    print(line)
    with open(paths["log.txt"], "a", encoding="utf8") as f:
        f.write(line + "\n")


def clean(text):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", text or ""))).strip()


def plain(text):
    text = unicodedata.normalize("NFKD", clean(text))
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def fetch(url, tries=5):
    wait = 5
    for k in range(tries):
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
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
    r = api(action="query", list="search", srnamespace="6", srlimit="10", srsearch=query + " filetype:audio")
    return [x["title"] for x in r.get("query", {}).get("search", [])]


def details(titles):
    r = api(action="query", titles="|".join(titles), prop="videoinfo",
            viprop="url|size|mime|metadata|derivatives|extmetadata",
            viextmetadatafilter="Artist|ObjectName|LicenseShortName|License|Credit|ImageDescription|Categories")
    out = {}
    for page in r.get("query", {}).get("pages", []):
        if page.get("videoinfo"):
            out[page["title"]] = page["videoinfo"][0]
    return out


def meta(vi, key):
    return (vi.get("extmetadata", {}).get(key) or {}).get("value", "") or ""


def seconds(vi):
    if vi.get("duration"):
        return float(vi["duration"])
    for m in vi.get("metadata") or []:
        if m.get("name") in ("length", "playtime_seconds", "duration"):
            try:
                return float(m.get("value"))
            except (TypeError, ValueError):
                pass
    return None


def score(piece, title, vi):
    pid, composer, name, groups, queries, known = piece
    mime = vi.get("mime") or ""
    if not mime.startswith(("audio/", "application/ogg")) or "midi" in mime:
        return None, "not a recording (" + mime + ")"
    licence = meta(vi, "LicenseShortName") + " " + meta(vi, "License")
    if not OK_LICENCE.search(licence.strip()):
        return None, "licence: " + plain(licence)[:40]
    length = seconds(vi)
    if length is not None and not SHORTEST <= length <= LONGEST:
        return None, "%d s long" % length
    text = set(plain(title + " " + meta(vi, "ObjectName") + " " + meta(vi, "ImageDescription") + " " +
                     meta(vi, "Categories")).split())
    if plain(composer).split()[-1] not in text:
        return None, "another composer"
    for group in groups:
        if not set(group) & text:
            return None, "another piece"
    musopen = "musopen" in plain(meta(vi, "Artist") + " " + meta(vi, "Credit") + " " + title)
    return 1 + (0.2 if musopen else 0) + (0.1 if title in known else 0) + (0.05 if length else 0), None


def main():
    os.makedirs(OUT, exist_ok=True)
    state = {"chosen": {}, "left_out": {}}
    if os.path.exists(paths["music_state.json"]):
        state = json.load(open(paths["music_state.json"], encoding="utf8"))
    say("=== " + time.strftime("%Y-%m-%d %H:%M") + ": music")
    for piece in PIECES:
        pid, composer, name, groups, queries, known = piece
        if len(state["chosen"]) >= WANTED:
            break
        if pid in state["chosen"] or pid in state["left_out"]:
            continue
        head = "%s: %s" % (composer, name)
        try:
            titles = list(known)
            for q in queries:
                titles += [t for t in search(q) if t not in titles]
            ranked, why = [], "not on Wikimedia Commons"
            for i in range(0, len(titles), 10):
                for t, vi in details(titles[i:i + 10]).items():
                    s, reason = score(piece, t, vi)
                    if s is None:
                        say("    ", t, "--", reason)
                        why = reason
                    else:
                        ranked.append((s, t, vi))
            if not ranked:
                state["left_out"][pid] = why
                say(head, "-- left out:", why)
            else:
                ranked.sort(key=lambda x: -x[0])
                s, title, vi = ranked[0]
                mp3 = [d for d in vi.get("derivatives") or [] if (d.get("type") or "").startswith("audio/mpeg")]
                url = mp3[0]["src"] if mp3 else vi["url"]
                ext = ".mp3" if mp3 else os.path.splitext(urllib.parse.urlparse(vi["url"]).path)[1].lower()
                data = fetch(url)
                file = pid + ext
                with open(os.path.join(OUT, file), "wb") as f:
                    f.write(data)
                state["chosen"][pid] = {
                    "id": pid, "composer": composer, "piece": name, "performer": clean(meta(vi, "Artist"))[:200],
                    "licence": clean(meta(vi, "LicenseShortName")), "credit": clean(meta(vi, "Credit"))[:200],
                    "commons_file": title, "commons_page": vi.get("descriptionurl") or "",
                    "seconds": seconds(vi), "file": file, "bytes": len(data), "mp3": bool(mp3)}
                say(head, "-- ok:", title, "(%s, %d KB%s)" % (clean(meta(vi, "LicenseShortName")), len(data) // 1024,
                                                           "" if mp3 else ", no MP3 copy: Ogg file"))
        except Exception as e:
            say(head, "-- error, will try again next run:", repr(e)[:200])
        json.dump(state, open(paths["music_state.json"], "w", encoding="utf8"), ensure_ascii=False, indent=1)
    chosen = [state["chosen"][p[0]] for p in PIECES if p[0] in state["chosen"]]
    json.dump({"source": "Wikimedia Commons", "music": chosen}, open(paths["music.json"], "w", encoding="utf8"),
              ensure_ascii=False, indent=1)
    say("=== done: %d pieces in music/. Please listen to them." % len(chosen))


if __name__ == "__main__":
    main()
