"""The shortlist of paintings for the game, from ArtEmis: famous painters who
died in 1955 or before (so their works are in the public domain), no food,
nudity or violence in the title, an even mix of the 8 emotions of the
original ArtEmis (each painting's most named emotion, named by at least half
of its annotators; anger, which is rare, by 40%).

    python make_shortlist.py <artemis_dataset_release_v0.csv> <Contrastive.csv> artemis_shortlist.json [state.json]

With the state.json of an earlier run of get_paintings.py, the paintings it
found stay on the list. Writes artemis_shortlist.json, which holds ArtEmis
data and so stays with the team (not in the game's public repository)."""
import csv, collections, hashlib, json, re, sys

V0 = sys.argv[1]
CON = sys.argv[2]
OUT = sys.argv[3]

# painter (ArtEmis name) -> (name, year of death); only painters who died in 1955 or before
PAINTERS = {
 "vincent-van-gogh": ("Vincent van Gogh", 1890), "nicholas-roerich": ("Nicholas Roerich", 1947),
 "pierre-auguste-renoir": ("Pierre-Auguste Renoir", 1919), "claude-monet": ("Claude Monet", 1926),
 "camille-pissarro": ("Camille Pissarro", 1903), "albrecht-durer": ("Albrecht Dürer", 1528),
 "john-singer-sargent": ("John Singer Sargent", 1925), "rembrandt": ("Rembrandt", 1669),
 "boris-kustodiev": ("Boris Kustodiev", 1927), "edgar-degas": ("Edgar Degas", 1917),
 "paul-cezanne": ("Paul Cézanne", 1906), "ivan-aivazovsky": ("Ivan Aivazovsky", 1900),
 "eugene-boudin": ("Eugène Boudin", 1898), "childe-hassam": ("Childe Hassam", 1935),
 "ilya-repin": ("Ilya Repin", 1930), "ivan-shishkin": ("Ivan Shishkin", 1898),
 "henri-matisse": ("Henri Matisse", 1954), "camille-corot": ("Camille Corot", 1875),
 "alfred-sisley": ("Alfred Sisley", 1899), "odilon-redon": ("Odilon Redon", 1916),
 "isaac-levitan": ("Isaac Levitan", 1900), "james-tissot": ("James Tissot", 1902),
 "paul-gauguin": ("Paul Gauguin", 1903), "maurice-prendergast": ("Maurice Prendergast", 1924),
 "peter-paul-rubens": ("Peter Paul Rubens", 1640),
 "william-merritt-chase": ("William Merritt Chase", 1916), "ernst-ludwig-kirchner": ("Ernst Ludwig Kirchner", 1938),
 "henri-de-toulouse-lautrec": ("Henri de Toulouse-Lautrec", 1901), "konstantin-makovsky": ("Konstantin Makovsky", 1915),
 "utagawa-kuniyoshi": ("Utagawa Kuniyoshi", 1861), "konstantin-korovin": ("Konstantin Korovin", 1939),
 "thomas-eakins": ("Thomas Eakins", 1916), "mary-cassatt": ("Mary Cassatt", 1926),
 "henri-fantin-latour": ("Henri Fantin-Latour", 1904), "gustave-courbet": ("Gustave Courbet", 1877),
 "vasily-surikov": ("Vasily Surikov", 1916), "gustave-loiseau": ("Gustave Loiseau", 1935),
 "titian": ("Titian", 1576), "katsushika-hokusai": ("Katsushika Hokusai", 1849),
 "ferdinand-hodler": ("Ferdinand Hodler", 1918), "vasily-polenov": ("Vasily Polenov", 1927),
 "berthe-morisot": ("Berthe Morisot", 1895), "giovanni-boldini": ("Giovanni Boldini", 1931),
 "aleksey-savrasov": ("Alexei Savrasov", 1897), "john-henry-twachtman": ("John Henry Twachtman", 1902),
 "kuzma-petrov-vodkin": ("Kuzma Petrov-Vodkin", 1939), "tintoretto": ("Tintoretto", 1594),
 "edouard-manet": ("Édouard Manet", 1883), "william-turner": ("J. M. W. Turner", 1851),
 "jan-matejko": ("Jan Matejko", 1893), "lucas-cranach-the-elder": ("Lucas Cranach the Elder", 1553),
 "valentin-serov": ("Valentin Serov", 1911), "joshua-reynolds": ("Joshua Reynolds", 1792),
 "gustave-caillebotte": ("Gustave Caillebotte", 1894), "leonardo-da-vinci": ("Leonardo da Vinci", 1519),
 "sir-lawrence-alma-tadema": ("Lawrence Alma-Tadema", 1912), "dante-gabriel-rossetti": ("Dante Gabriel Rossetti", 1882),
 "viktor-vasnetsov": ("Viktor Vasnetsov", 1926), "felix-vallotton": ("Félix Vallotton", 1925),
 "raphael": ("Raphael", 1520), "vasily-perov": ("Vasily Perov", 1882), "paolo-veronese": ("Paolo Veronese", 1588),
 "hieronymus-bosch": ("Hieronymus Bosch", 1516), "edvard-munch": ("Edvard Munch", 1944),
 "arkhip-kuindzhi": ("Arkhip Kuindzhi", 1910), "bartolome-esteban-murillo": ("Bartolomé Esteban Murillo", 1682),
 "frans-hals": ("Frans Hals", 1666), "pietro-perugino": ("Pietro Perugino", 1523), "michelangelo": ("Michelangelo", 1564),
 "edward-burne-jones": ("Edward Burne-Jones", 1898), "thomas-gainsborough": ("Thomas Gainsborough", 1788),
 "canaletto": ("Canaletto", 1768), "anthony-van-dyck": ("Anthony van Dyck", 1641), "karl-bryullov": ("Karl Bryullov", 1852),
 "mikhail-vrubel": ("Mikhail Vrubel", 1910), "georges-seurat": ("Georges Seurat", 1891), "fra-angelico": ("Fra Angelico", 1455),
 "gustave-moreau": ("Gustave Moreau", 1898), "el-greco": ("El Greco", 1614), "pierre-bonnard": ("Pierre Bonnard", 1947),
 "ivan-kramskoy": ("Ivan Kramskoi", 1887), "hans-memling": ("Hans Memling", 1494), "eugene-delacroix": ("Eugène Delacroix", 1863),
 "james-mcneill-whistler": ("James McNeill Whistler", 1903), "gustav-klimt": ("Gustav Klimt", 1918),
 "jacob-jordaens": ("Jacob Jordaens", 1678), "hans-holbein-the-younger": ("Hans Holbein the Younger", 1543),
 "andrea-mantegna": ("Andrea Mantegna", 1506), "alphonse-mucha": ("Alphonse Mucha", 1939), "thomas-cole": ("Thomas Cole", 1848),
 "theodore-rousseau": ("Théodore Rousseau", 1867), "john-atkinson-grimshaw": ("John Atkinson Grimshaw", 1893),
 "joseph-wright": ("Joseph Wright of Derby", 1797), "william-hogarth": ("William Hogarth", 1764),
 "guido-reni": ("Guido Reni", 1642), "diego-velazquez": ("Diego Velázquez", 1660), "sandro-botticelli": ("Sandro Botticelli", 1510),
 "jan-steen": ("Jan Steen", 1679), "giovanni-battista-tiepolo": ("Giovanni Battista Tiepolo", 1770),
 "caspar-david-friedrich": ("Caspar David Friedrich", 1840), "jean-francois-millet": ("Jean-François Millet", 1875),
 "henri-rousseau": ("Henri Rousseau", 1910), "carl-larsson": ("Carl Larsson", 1919), "winslow-homer": ("Winslow Homer", 1910),
 "franz-marc": ("Franz Marc", 1916), "john-constable": ("John Constable", 1837), "theodore-gericault": ("Théodore Géricault", 1824),
 "john-william-waterhouse": ("John William Waterhouse", 1917), "john-everett-millais": ("John Everett Millais", 1896),
 "domenico-ghirlandaio": ("Domenico Ghirlandaio", 1494), "jan-van-eyck": ("Jan van Eyck", 1441),
 "johannes-vermeer": ("Johannes Vermeer", 1675), "pieter-bruegel-the-elder": ("Pieter Bruegel the Elder", 1569),
 "wassily-kandinsky": ("Wassily Kandinsky", 1944), "piet-mondrian": ("Piet Mondrian", 1944),
 "william-blake": ("William Blake", 1827), "vasily-vereshchagin": ("Vasily Vereshchagin", 1904),
 # more painters, for 560 paintings and more anger and disgust
 "keisai-eisen": ("Keisai Eisen", 1848), "george-frederick-watts": ("George Frederic Watts", 1904),
 "charles-francois-daubigny": ("Charles-François Daubigny", 1878), "william-adolphe-bouguereau": ("William-Adolphe Bouguereau", 1905),
 "august-macke": ("August Macke", 1914), "luca-signorelli": ("Luca Signorelli", 1523),
 "francisco-de-zurbaran": ("Francisco de Zurbarán", 1664), "adriaen-van-ostade": ("Adriaen van Ostade", 1685),
 "carlo-crivelli": ("Carlo Crivelli", 1495), "rogier-van-der-weyden": ("Rogier van der Weyden", 1464),
 "paul-signac": ("Paul Signac", 1935), "hiroshige": ("Hiroshige", 1858), "piero-della-francesca": ("Piero della Francesca", 1492),
 "giovanni-bellini": ("Giovanni Bellini", 1516), "alexey-venetsianov": ("Alexei Venetsianov", 1847),
 "andre-derain": ("André Derain", 1954), "bernardo-bellotto": ("Bernardo Bellotto", 1780), "stefan-luchian": ("Ștefan Luchian", 1916),
 "george-morland": ("George Morland", 1804), "agnolo-bronzino": ("Agnolo Bronzino", 1572), "rudolf-von-alt": ("Rudolf von Alt", 1905),
 "william-james-glackens": ("William Glackens", 1938), "johan-hendrik-weissenbruch": ("Johan Hendrik Weissenbruch", 1903),
 "albrecht-altdorfer": ("Albrecht Altdorfer", 1538), "taras-shevchenko": ("Taras Shevchenko", 1861), "franz-stuck": ("Franz Stuck", 1928),
 "gerrit-dou": ("Gerrit Dou", 1675), "theodor-severin-kittelsen": ("Theodor Kittelsen", 1914), "max-pechstein": ("Max Pechstein", 1955),
 "t.-c.-steele": ("T. C. Steele", 1926), "caravaggio": ("Caravaggio", 1610), "annibale-carracci": ("Annibale Carracci", 1609),
 "antoine-watteau": ("Antoine Watteau", 1721), "richard-gerstl": ("Richard Gerstl", 1908), "utagawa-kunisada": ("Utagawa Kunisada", 1865),
 "george-stubbs": ("George Stubbs", 1806), "francesco-hayez": ("Francesco Hayez", 1882),
 "david-teniers-the-younger": ("David Teniers the Younger", 1690), "giorgio-vasari": ("Giorgio Vasari", 1574),
 "fyodor-bronnikov": ("Fyodor Bronnikov", 1902), "louise-elisabeth-vigee-le-brun": ("Élisabeth Vigée Le Brun", 1842),
 "pierre-puvis-de-chavannes": ("Pierre Puvis de Chavannes", 1898), "pietro-longhi": ("Pietro Longhi", 1785),
 "cornelis-springer": ("Cornelis Springer", 1891), "max-liebermann": ("Max Liebermann", 1935), "paolo-uccello": ("Paolo Uccello", 1475),
 "francois-boucher": ("François Boucher", 1770), "antoine-pesne": ("Antoine Pesne", 1757), "harry-clarke": ("Harry Clarke", 1931),
 "jean-honore-fragonard": ("Jean-Honoré Fragonard", 1806), "francesco-guardi": ("Francesco Guardi", 1793),
 "victor-borisov-musatov": ("Victor Borisov-Musatov", 1905), "julius-leblanc-stewart": ("Julius LeBlanc Stewart", 1919),
 "maurice-denis": ("Maurice Denis", 1943), "chaim-soutine": ("Chaïm Soutine", 1943),
 "maerten-van-heemskerck": ("Maarten van Heemskerck", 1574), "benjamin-west": ("Benjamin West", 1820),
 "henry-herbert-la-thangue": ("Henry Herbert La Thangue", 1929), "martin-schongauer": ("Martin Schongauer", 1491),
 "walter-sickert": ("Walter Sickert", 1942), "theo-van-doesburg": ("Theo van Doesburg", 1931),
 "amadeo-de-souza-cardoso": ("Amadeo de Souza Cardoso", 1918), "serge-sudeikin": ("Sergey Sudeykin", 1946),
 "andrei-ryabushkin": ("Andrei Ryabushkin", 1904), "julian-alden-weir": ("J. Alden Weir", 1919),
 "giovanni-domenico-tiepolo": ("Giovanni Domenico Tiepolo", 1804), "correggio": ("Correggio", 1534),
 "armand-guillaumin": ("Armand Guillaumin", 1927), "n.c.-wyeth": ("N. C. Wyeth", 1945), "peder-severin-kroyer": ("Peder Severin Krøyer", 1909),
 "henry-raeburn": ("Henry Raeburn", 1823), "andrea-del-sarto": ("Andrea del Sarto", 1530), "mabuse": ("Jan Gossaert", 1532),
 "max-beckmann": ("Max Beckmann", 1950), "lev-lagorio": ("Lev Lagorio", 1905), "john-crome": ("John Crome", 1821),
 "edouard-vuillard": ("Édouard Vuillard", 1940), "esaias-van-de-velde": ("Esaias van de Velde", 1630),
 "william-shayer": ("William Shayer", 1879), "gerard-david": ("Gerard David", 1523), "edwin-henry-landseer": ("Edwin Landseer", 1873),
 "nikolaos-gyzis": ("Nikolaos Gyzis", 1901), "george-luks": ("George Luks", 1933), "pieter-de-hooch": ("Pieter de Hooch", 1684),
 "vittore-carpaccio": ("Vittore Carpaccio", 1525), "john-hoppner": ("John Hoppner", 1810), "agostino-carracci": ("Agostino Carracci", 1602),
 "frits-thaulow": ("Frits Thaulow", 1906), "frederic-bazille": ("Frédéric Bazille", 1870), "helene-schjerfbeck": ("Helene Schjerfbeck", 1946),
 "william-holman-hunt": ("William Holman Hunt", 1910), "giorgione": ("Giorgione", 1510), "gabriel-metsu": ("Gabriël Metsu", 1667),
 "suzanne-valadon": ("Suzanne Valadon", 1938), "ford-madox-brown": ("Ford Madox Brown", 1893), "gerard-terborch": ("Gerard ter Borch", 1681),
 "nicolae-grigorescu": ("Nicolae Grigorescu", 1907), "laszlo-mednyanszky": ("László Mednyánszky", 1919), "parmigianino": ("Parmigianino", 1540),
 "dirk-bouts": ("Dirk Bouts", 1475), "gwen-john": ("Gwen John", 1939), "tivadar-kosztka-csontvary": ("Tivadar Csontváry Kosztka", 1919),
 "albert-marquet": ("Albert Marquet", 1947), "alexey-bogolyubov": ("Alexey Bogolyubov", 1896), "frederic-remington": ("Frederic Remington", 1909),
 "allan-ramsay": ("Allan Ramsay", 1784), "adriaen-brouwer": ("Adriaen Brouwer", 1638), "pavel-fedotov": ("Pavel Fedotov", 1852),
 "richard-parkes-bonington": ("Richard Parkes Bonington", 1828), "antonello-da-messina": ("Antonello da Messina", 1479),
 "bernardo-strozzi": ("Bernardo Strozzi", 1644), "umberto-boccioni": ("Umberto Boccioni", 1916), "albert-bierstadt": ("Albert Bierstadt", 1902),
 "hans-von-aachen": ("Hans von Aachen", 1615), "kathe-kollwitz": ("Käthe Kollwitz", 1945), "akseli-gallen-kallela": ("Akseli Gallen-Kallela", 1931),
 "dosso-dossi": ("Dosso Dossi", 1542), "andrea-del-castagno": ("Andrea del Castagno", 1457), "jacopo-bellini": ("Jacopo Bellini", 1470),
 "adolphe-joseph-thomas-monticelli": ("Adolphe Monticelli", 1886), "mykola-pymonenko": ("Mykola Pymonenko", 1912),
 "arthur-hughes": ("Arthur Hughes", 1915), "thomas-moran": ("Thomas Moran", 1926), "jan-toorop": ("Jan Toorop", 1928),
 "federico-zandomeneghi": ("Federico Zandomeneghi", 1917), "david-wilkie": ("David Wilkie", 1841), "ito-jakuchu": ("Itō Jakuchū", 1800),
 "adriaen-van-de-velde": ("Adriaen van de Velde", 1672), "giovanni-fattori": ("Giovanni Fattori", 1908), "fernand-khnopff": ("Fernand Khnopff", 1921),
 "efim-volkov": ("Efim Volkov", 1920), "filipp-malyavin": ("Filipp Malyavin", 1940), "hugo-van-der-goes": ("Hugo van der Goes", 1482),
 "max-slevogt": ("Max Slevogt", 1932), "mihaly-munkacsy": ("Mihály Munkácsy", 1900), "john-collier": ("John Collier", 1934),
 "fyodor-rokotov": ("Fyodor Rokotov", 1808), "ferdynand-ruszczyc": ("Ferdynand Ruszczyc", 1936), "albert-gleizes": ("Albert Gleizes", 1953),
 "ilya-mashkov": ("Ilya Mashkov", 1944), "john-french-sloan": ("John French Sloan", 1951), "edmund-dulac": ("Edmund Dulac", 1953),
 "heorhiy-narbut": ("Heorhiy Narbut", 1920), "moise-kisling": ("Moïse Kisling", 1953), "konstantin-bogaevsky": ("Konstantin Bogaevsky", 1943),
 "sergey-solomko": ("Sergey Solomko", 1928), "wilhelm-kotarbinski": ("Wilhelm Kotarbiński", 1921), "fyodor-vasilyev": ("Fyodor Vasilyev", 1873),
 "james-ensor": ("James Ensor", 1949), "arnold-b\u00e3\u00b6cklin": ("Arnold Böcklin", 1901),
 "ferdinand-georg-waldm\u00e3\u00bcller": ("Ferdinand Georg Waldmüller", 1865), "eug\u00e3\u00a8ne-grasset": ("Eugène Grasset", 1917),
 "joaqu\u00e3\u00adn-sorolla": ("Joaquín Sorolla", 1923),
}

def words(s):
    return re.findall(r"[a-z]+", s.lower())

# words in a title that keep a painting out
FOOD = {"fruit", "fruits", "apple", "apples", "pear", "pears", "grape", "grapes", "peach", "peaches", "lemon", "lemons",
        "orange", "oranges", "cherries", "cherry", "melon", "bread", "cheese", "wine", "fish", "fishes", "oyster", "oysters",
        "lobster", "meat", "ham", "kitchen", "breakfast", "lunch", "luncheon", "dinner", "supper", "feast", "banquet",
        "meal", "vegetables", "pumpkin", "onions", "potatoes", "potato", "market", "food", "cake", "pie", "eggs", "egg",
        "herring", "game", "dish", "bottle", "glass", "absinthe", "tea", "coffee", "plums", "strawberries", "basket",
        "eel", "eels", "mullet", "salmon", "trout", "carp", "pike", "crab", "shrimp", "butcher", "slaughtered", "ox",
        "carcass", "pheasant", "hare", "duck", "poultry", "chicken", "turkey", "peasant", "drinkers", "drinking", "tavern",
        "bloaters", "garlic", "herrings", "mackerel", "sardines", "nuts", "jug", "jar", "pot", "vase"}
NUDITY = {"nude", "nudes", "naked", "bather", "bathers", "bath", "bathing", "venus", "odalisque", "leda", "danae",
          "susanna", "toilette", "toilet", "model", "nymph", "nymphs", "satyr", "bacchus", "eve", "adam", "harem", "erotic",
          "bathsheba", "diana", "callisto", "andromeda", "lovers", "kiss", "embrace", "origin", "bacchanale",
          "bacchanal", "bacchanalia", "orgy", "brothel", "prostitute", "prostitutes", "salon", "undressing", "bed",
          "ignudo", "ignudi", "crouching", "reclining", "seated", "torso", "figure", "figures"}
VIOLENCE = {"battle", "war", "massacre", "execution", "executed", "murder", "killing", "killed", "death", "dead", "corpse",
            "martyrdom", "crucifixion", "crucified", "beheading", "judith", "holofernes", "saturn", "hell", "inferno",
            "wounded", "blood", "suicide", "skull", "skeleton", "plague", "torture", "slaughter", "hunt", "hunting",
            "lamentation", "entombment", "pieta", "deposition", "cross", "fight", "attack", "duel", "slain", "dying",
            "grave", "funeral", "coffin", "gun", "shooting", "rape", "abduction", "disasters", "caprichos", "witches",
            "sabbath", "devil", "demon", "horror", "drowned", "shipwreck", "storm", "tarquin", "lucretia", "cain",
            "abel", "medusa", "salome", "baptist", "samson", "goliath", "prometheus", "flaying", "marsyas",
            "anatomical", "anatomy", "limbs", "severed", "lesson", "operation", "surgery", "sick", "madhouse", "asylum"}
NOT_PAINTING = {"sketch", "study", "studies", "drawing", "etching", "engraving", "illustration", "lithograph", "poster",
                "design", "costume", "cover", "postcard", "untitled", "copy", "detail", "fragment", "sheet", "page",
                "letter", "map", "plan", "ornament", "decoration", "fresco", "panel", "triptych", "altarpiece",
                "identified", "detected", "unknown", "unfinished", "version", "variant", "replica"}
OUT_WORDS = FOOD | NUDITY | VIOLENCE | NOT_PAINTING
EMOTIONS = ["amusement", "awe", "contentment", "excitement", "anger", "disgust", "fear", "sadness"]

counts = collections.defaultdict(collections.Counter)
style = {}
with open(V0, newline="", encoding="utf8") as f:
    for r in csv.DictReader(f):
        counts[r["painting"]][r["emotion"]] += 1
        style[r["painting"]] = r["art_style"]
con = collections.defaultdict(collections.Counter)
with open(CON, newline="", encoding="utf8") as f:
    for r in csv.DictReader(f):
        con[r["painting"]][r["emotion"]] += 1

by_emotion = collections.defaultdict(list)
skipped = collections.Counter()
for slug, c in counts.items():
    if "_" not in slug:
        continue
    artist, rest = slug.split("_", 1)
    if artist not in PAINTERS:
        skipped["painter"] += 1
        continue
    m = re.search(r"-(\d{4})$", rest)
    year = int(m.group(1)) if m else None
    title_words = words(re.sub(r"-\d{4}$", "", rest))
    if not title_words or len(title_words) < 2 and title_words[0] in ("landscape", "portrait"):
        skipped["title"] += 1
        continue
    if set(title_words) & OUT_WORDS or "still" in title_words and "life" in title_words:
        skipped["title words"] += 1
        continue
    n = sum(c.values())
    emo, k = c.most_common(1)[0]
    if emo not in EMOTIONS or k / n < (0.4 if emo == "anger" else 0.5):
        skipped["no clear emotion"] += 1
        continue
    name, died = PAINTERS[artist]
    title = " ".join(title_words)
    by_emotion[emo].append({
        "artemis": slug, "painter": name, "painter_died": died, "title": title[0].upper() + title[1:],
        "year": year, "style": style[slug], "emotion": emo, "share": round(k / n, 3), "annotations": n,
        "emotions_artemis": dict(c), "emotions_contrastive": dict(con.get(slug, {}))})

PER = 85            # paintings wanted per emotion (anger and disgust: as many as there are)
TRY = 230           # candidates per emotion, for the ones Wikimedia does not have
KEEP = sys.argv[4] if len(sys.argv) > 4 else None   # state.json of an earlier run: its paintings stay on the list
kept = set(json.load(open(KEEP, encoding="utf8"))["chosen"]) if KEEP else set()
out = []
for emo in EMOTIONS:
    # the clearest first; among as clear, a fixed shuffle (not the alphabet)
    lst = sorted(by_emotion[emo], key=lambda p: (p["artemis"] not in kept, -p["share"], -p["annotations"],
                                                 hashlib.sha1(p["artemis"].encode()).hexdigest()))
    per_painter = collections.Counter()
    chosen = []
    for p in lst:
        if per_painter[p["painter"]] >= 8 and p["artemis"] not in kept:
            continue
        per_painter[p["painter"]] += 1
        chosen.append(p)
        if len(chosen) >= TRY:
            break
    print(f"{emo:12s} {len(lst):5d} clear and allowed, {len(chosen)} on the shortlist")
    out.extend(chosen)
print("skipped:", dict(skipped))
json.dump({"made_from": ["ArtEmis release v0", "ArtEmis Contrastive"], "per_emotion": PER, "emotions": EMOTIONS,
           "paintings": out}, open(OUT, "w", encoding="utf8"), ensure_ascii=False, indent=1)
print(len(out), "paintings on the shortlist ->", OUT)
