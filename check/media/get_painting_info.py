"""Collects what the info card of each painting shows, from Wikidata and
Wikipedia, and writes it to a JSON file.

    python paintings_info.py PATH/TO/js/paintings.js OUT.json

How a painting is found (never by its title alone):
  1. image: the Wikidata item whose image (P18) is the painting's own
     Wikimedia Commons file;
  2. creator: otherwise, among the works whose creator (P170) is the
     painter, the one whose title matches (similarity >= 0.88) and whose
     year, when both are known, is within 5 years.
A painting found neither way gets only its painter's information.
Wikipedia text is taken only from the article linked to that item, so an
article about something else with the same name is never used.
"""
import difflib
import json
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request

UA = "FoodRoomsGame/2.8 (research game; imuhammadasif@hotmail.com) python-urllib"
SPARQL = "https://query.wikidata.org/sparql"
WD_API = "https://www.wikidata.org/w/api.php"
WIKI = "https://en.wikipedia.org/api/rest_v1/page/summary/"
PAUSE = 1.0


def get(url, data=None, accept="application/json", tries=6, soft=False):
    for k in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers={"User-Agent": UA, "Accept": accept})
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if e.code in (429, 500, 502, 503, 504):
                time.sleep(5 * (k + 1))
                continue
            raise
        except Exception:
            time.sleep(5 * (k + 1))
    if soft:
        return None
    raise RuntimeError("failed: " + url)


def sparql(q):
    time.sleep(PAUSE)
    d = get(SPARQL, data=urllib.parse.urlencode({"query": q}).encode(), accept="application/sparql-results+json")
    return [{k: v["value"] for k, v in b.items()} for b in d["results"]["bindings"]]


def qid(uri):
    return uri.rsplit("/", 1)[-1]


def year_of(s):
    m = re.match(r"^(-?\d{1,4})-", s or "")
    return int(m.group(1)) if m else None


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\(.*?\)", " ", s)
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    s = re.sub(r"\b(the|a|an|le|la|les|de|der|die|das)\b", " ", s)
    return " ".join(s.split())


def read_paintings(path):
    text = open(path, encoding="utf-8").read()
    start = text.index("FG.PAINTINGS = [") + len("FG.PAINTINGS = ")
    depth, i = 0, start
    while True:
        c = text[i]
        depth += c == "["
        depth -= c == "]"
        i += 1
        if depth == 0:
            break
    return json.loads(text[start:i])


def file_uri(page):
    name = urllib.parse.unquote(page.split("/File:", 1)[1]).replace("_", " ")
    return "<http://commons.wikimedia.org/wiki/Special:FilePath/%s>" % urllib.parse.quote(name)


ITEM_FIELDS = """
  OPTIONAL { ?item wdt:P170 ?creator }
  OPTIONAL { ?item wdt:P571 ?inception }
  OPTIONAL { ?item wdt:P135 ?movement }
  OPTIONAL { ?item wdt:P136 ?genre }
  OPTIONAL { ?item wdt:P195 ?collection }
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr,de,nl,it,es,fi,sv,ru". }
"""
ITEM_SELECT = "?item ?itemLabel ?creator ?creatorLabel ?inception ?movementLabel ?genreLabel ?collectionLabel ?article"


def collect(rows, key):
    out = {}
    for r in rows:
        k = r[key]
        o = out.setdefault(k, {"item": qid(r["item"]), "label": r.get("itemLabel"), "creators": set(),
                               "creator_labels": set(), "years": set(), "movements": set(), "genres": set(),
                               "collections": set(), "article": None})
        if r.get("creator"):
            o["creators"].add(qid(r["creator"]))
            o["creator_labels"].add(r.get("creatorLabel"))
        if year_of(r.get("inception")) is not None:
            o["years"].add(year_of(r["inception"]))
        for f, s in (("movementLabel", "movements"), ("genreLabel", "genres"), ("collectionLabel", "collections")):
            if r.get(f) and not re.match(r"^Q\d+$", r[f]):
                o[s].add(r[f])
        if r.get("article"):
            o["article"] = urllib.parse.unquote(r["article"].rsplit("/wiki/", 1)[1])
    return out


def by_image(paintings):
    def key(u):
        return urllib.parse.unquote(u.strip("<>").rsplit("/", 1)[1]).replace("_", " ")

    found = {}
    uris = {file_uri(p["page"]): p["id"] for p in paintings}
    ids = {key(u): pid for u, pid in uris.items()}
    keys = list(uris)
    for i in range(0, len(keys), 60):
        part = keys[i:i + 60]
        q = ("SELECT ?file %s WHERE { VALUES ?file { %s } ?item wdt:P18 ?file . %s }"
             % (ITEM_SELECT, " ".join(part), ITEM_FIELDS))
        rows = sparql(q)
        # 2 items may show the same file: keep 1 item a file, the one with an article
        by_file = {}
        for r in rows:
            by_file.setdefault(r["file"], []).append(r)
        for f, rs in by_file.items():
            pid = ids.get(key(f))
            if not pid:
                continue
            items = collect(rs, "item")
            o = sorted(items.values(), key=lambda x: (x["article"] is None, x["item"]))[0]
            o["how"] = "image"
            found[pid] = o
        print("image: %d/%d, found %d" % (min(i + 60, len(keys)), len(keys), len(found)), flush=True)
    return found


def painter_items(names, known):
    """{painter name: qid}: from the items already found, else a person
    whose English name (label or other name) it is and whose occupation is
    painter or the like (P106); the one with the most works if several."""
    out = dict(known)
    rest = [n for n in names if n not in out]
    for i in range(0, len(rest), 25):
        part = rest[i:i + 25]
        vals = " ".join(json.dumps(n) + "@en" for n in part)
        q = ("SELECT ?name ?p (COUNT(?w) AS ?n) WHERE { VALUES ?name { %s } "
             "{ ?p rdfs:label ?name } UNION { ?p skos:altLabel ?name } "
             "?p wdt:P31 wd:Q5 ; wdt:P106 ?o . "
             "VALUES ?o { wd:Q1028181 wd:Q3391743 wd:Q1281618 wd:Q15296811 wd:Q644687 wd:Q42973 wd:Q10862983 } "
             "OPTIONAL { ?w wdt:P170 ?p } } GROUP BY ?name ?p" % vals)
        best = {}
        for r in sparql(q):
            n = int(r.get("n", 0))
            if r["name"] not in best or n > best[r["name"]][1]:
                best[r["name"]] = (qid(r["p"]), n)
        for name, (pq, _) in best.items():
            out[name] = pq
        print("painters: %d/%d" % (min(i + 25, len(rest)), len(rest)), flush=True)
    return out


def by_creator(paintings, painters):
    found = {}
    groups = {}
    for p in paintings:
        if p["painter"] in painters:
            groups.setdefault(painters[p["painter"]], []).append(p)
    from concurrent.futures import ThreadPoolExecutor

    def one(item):
        pq, ps = item
        out = {}
        q = ("SELECT %s ?alt WHERE { ?item wdt:P170 wd:%s ; wdt:P31 wd:Q3305213 . "
             "OPTIONAL { ?item rdfs:label ?alt . FILTER(LANG(?alt) IN (\"en\", \"fr\", \"de\", \"nl\", \"it\", \"es\")) } %s }"
             % (ITEM_SELECT, pq, ITEM_FIELDS))
        rows = sparql(q)
        items = collect(rows, "item")
        names = {}
        for r in rows:
            names.setdefault(r["item"], set()).update(x for x in (r.get("alt"), r.get("itemLabel")) if x)
        for p in ps:
            want = [norm(p["title"]), norm(p.get("name") or ""), norm(p["artemis"].split("_", 1)[-1].replace("-", " ").rstrip(" 0123456789"))]
            want = [w for w in want if w]
            best, score = None, 0.0
            for uri, labels in names.items():
                s = max(difflib.SequenceMatcher(None, w, norm(l)).ratio() for w in want for l in labels)
                if s > score:
                    best, score = uri, s
            if best is None or score < 0.88:
                continue
            o = items[best]
            y = p.get("year")
            if y and o["years"] and min(abs(y - x) for x in o["years"]) > 5:
                continue
            o["how"] = "creator, title %.2f" % score
            out[p["id"]] = o

        return out
    with ThreadPoolExecutor(4) as ex:
        for n, res in enumerate(ex.map(one, list(groups.items()))):
            found.update(res)
            print("creator: %d/%d painters" % (n + 1, len(groups)), flush=True)
    return found


def painter_details(qids):
    out = {}
    keys = list(qids)
    for i in range(0, len(keys), 80):
        q = ("SELECT ?p ?pLabel ?birth ?death ?movementLabel ?article WHERE { VALUES ?p { %s } "
             "OPTIONAL { ?p wdt:P569 ?birth } OPTIONAL { ?p wdt:P570 ?death } OPTIONAL { ?p wdt:P135 ?movement } "
             "OPTIONAL { ?article schema:about ?p ; schema:isPartOf <https://en.wikipedia.org/> } "
             "SERVICE wikibase:label { bd:serviceParam wikibase:language \"en\". } }" % " ".join("wd:" + k for k in keys[i:i + 80]))
        for r in sparql(q):
            o = out.setdefault(qid(r["p"]), {"name": r.get("pLabel"), "born": None, "died": None, "movements": set(), "article": None})
            o["born"] = o["born"] or year_of(r.get("birth"))
            o["died"] = o["died"] or year_of(r.get("death"))
            if r.get("movementLabel") and not re.match(r"^Q\d+$", r["movementLabel"]):
                o["movements"].add(r["movementLabel"])
            if r.get("article"):
                o["article"] = urllib.parse.unquote(r["article"].rsplit("/wiki/", 1)[1])
    return out


def summaries(titles):
    """{title: {extract, url}}: the introductions of English Wikipedia
    articles, 20 to a request (redirects followed; disambiguation pages
    left out)."""
    out = {}
    titles = list(titles)
    for i in range(0, len(titles), 20):
        part = titles[i:i + 20]
        time.sleep(1.5)
        d = get("https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode({
            "action": "query", "format": "json", "formatversion": 2, "prop": "extracts|pageprops|info",
            "exintro": 1, "explaintext": 1, "exlimit": 20, "ppprop": "disambiguation", "inprop": "url",
            "redirects": 1, "titles": "|".join(t.replace("_", " ") for t in part)}), soft=True)
        if not d:
            continue
        q = d.get("query", {})
        back = {}
        for n in q.get("normalized", []):
            back[n["to"]] = n["from"]
        for r in q.get("redirects", []):
            back[r["to"]] = back.get(r["from"], r["from"])
        for pg in q.get("pages", []):
            if pg.get("missing") or "disambiguation" in (pg.get("pageprops") or {}):
                continue
            t = pg["title"]
            orig = back.get(t, t)
            rec = {"extract": pg.get("extract"), "url": pg.get("fullurl")}
            for key in {orig, orig.replace(" ", "_"), t, t.replace(" ", "_")}:
                out[key] = rec
        print("wikipedia: %d/%d" % (min(i + 20, len(titles)), len(titles)), flush=True)
    return out


def main():
    paintings = read_paintings(sys.argv[1])
    out_path = sys.argv[2]
    import os, pickle
    cache = out_path + ".image.pkl"
    if os.path.exists(cache):
        found = pickle.load(open(cache, "rb"))
    else:
        found = by_image(paintings)
        pickle.dump(found, open(cache, "wb"))
    known = {}
    for p in paintings:
        o = found.get(p["id"])
        if o and len(o["creators"]) == 1:
            known.setdefault(p["painter"], next(iter(o["creators"])))
    rest = [p for p in paintings if p["id"] not in found]
    cache2 = out_path + ".creator.pkl"
    if os.path.exists(cache2):
        painters, more = pickle.load(open(cache2, "rb"))
    else:
        painters = painter_items(sorted({p["painter"] for p in paintings}), known)
        more = by_creator(rest, painters)
        pickle.dump((painters, more), open(cache2, "wb"))
    found.update(more)
    details = painter_details(set(painters.values()))
    articles = {}
    result = []
    for p in paintings:
        o = found.get(p["id"])
        pq = painters.get(p["painter"])
        d = details.get(pq) if pq else None
        rec = {"id": p["id"], "painter": p["painter"], "title": p["title"], "year": p.get("year"), "page": p["page"],
               "licence": p["licence"], "wikidata": None, "how": None, "painting": None, "artist": None}
        if o:
            rec["wikidata"] = o["item"]
            rec["how"] = o["how"]
            rec["painting"] = {"label": o["label"], "years": sorted(o["years"]), "movements": sorted(o["movements"]),
                               "genres": sorted(o["genres"]), "collections": sorted(o["collections"]),
                               "article": o["article"], "creators": sorted(o["creator_labels"] - {None}),
                               "creator_ids": sorted(o["creators"])}
        if d:
            rec["artist"] = {"wikidata": pq, "name": d["name"], "born": d["born"], "died": d["died"],
                             "movements": sorted(d["movements"]), "article": d["article"]}
        result.append(rec)
    titles = {r["painting"]["article"] for r in result if r["painting"] and r["painting"]["article"]}
    titles |= {r["artist"]["article"] for r in result if r["artist"] and r["artist"]["article"]}
    articles = summaries(sorted(titles))
    for r in result:
        for k in ("painting", "artist"):
            if r[k] and r[k].get("article"):
                r[k]["wiki"] = articles.get(r[k]["article"])
    json.dump(result, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    n_img = sum(1 for r in result if r["how"] == "image")
    n_cr = sum(1 for r in result if r["how"] and r["how"] != "image")
    n_art = sum(1 for r in result if r["painting"] and r["painting"].get("wiki"))
    n_pa = sum(1 for r in result if r["artist"])
    print("paintings %d: by image %d, by creator+title %d, none %d; with a Wikipedia article %d; painter known %d"
          % (len(result), n_img, n_cr, len(result) - n_img - n_cr, n_art, n_pa))


if __name__ == "__main__":
    main()
