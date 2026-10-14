"""Draw the way a player went from a game file, as the game shows it at the
end of the game (js/route.js), and print it step by step.

    python check/draw_route.py GAME.json                 # writes GAME.route.png
    python check/draw_route.py GAME.json -o route.png
    python check/draw_route.py GAME.json --all-rooms     # every room, not only the known ones

Only the rooms the player knew at the end are drawn, as on the game's end
page. The line runs from blue at the first step to red at the last, with an
arrow on each move and parallel lanes when a corridor was used again; a
ring marks a room the player stayed in (thicker for more stays), S the start
and E the end; a food room shows its food and what was eaten there. Needs
matplotlib; the mazes and colours are read from js/mazes.js.
"""
import argparse
import json
import math
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
MAZES_JS = os.path.join(HERE, "..", "js", "mazes.js")
RAMP = [(59, 76, 192), (47, 181, 212), (166, 217, 106), (253, 174, 97), (215, 48, 31)]


def room_of(name):
    m = re.match(r"^[sS](\d)(\d)$", name) or re.match(r"^[sS](\d+)_(\d+)$", name)
    return (int(m.group(1)), int(m.group(2)))


def maze_of(name):
    """The rooms of a maze and the films' palette, from js/mazes.js."""
    with open(MAZES_JS) as fh:
        text = fh.read()
    pal = json.loads(re.search(r"FG\.FILM_PALETTE = (\[.*?\]);", text, re.S).group(1))
    block = re.search(r'"%s": \{\s*rooms: (\[.*?\]),\s*colours' % re.escape(name), text, re.S)
    if not block:
        raise SystemExit("no maze %s in js/mazes.js" % name)
    return json.loads(block.group(1)), pal


def ramp(k):
    k = max(0.0, min(1.0, k)) * (len(RAMP) - 1)
    i = min(len(RAMP) - 2, int(k))
    f = k - i
    a, b = RAMP[i], RAMP[i + 1]
    return tuple((a[j] + (b[j] - a[j]) * f) / 255.0 for j in range(3))


def summary(g):
    steps = g["steps"]
    known = set(g.get("known_rooms") or [n for st in steps for n in st.get("known_new") or []])
    path = [room_of(st["room"]) for st in steps]
    stays, eaten = {}, {}
    for i, st in enumerate(steps):
        if i and st["move"] == "STAY":
            stays[st["room"]] = stays.get(st["room"], 0) + 1
        if st["paid"] > 0:
            eaten[st["room"]] = eaten.get(st["room"], 0.0) + st["paid"]
    food = []
    for n, r in g["layout"]["food_rooms"].items():
        food.append({"name": n, "room": r, "kind": (g.get("food_kinds") or {}).get(n),
                     "worth": g["settings"]["food_rooms"][n]["worth"], "eaten": eaten.get(r, 0.0)})
    return known, path, stays, food


def draw(f, out, all_rooms=False):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.patches import Circle, Rectangle, Polygon
    g = f["game"]
    rooms, pal = maze_of(g["layout"]["maze"])
    known, path, stays, food = summary(g)
    names = {(r, c): v for r, row in enumerate(rooms) for c, v in enumerate(row) if v >= 0}
    show = set(names) if all_rooms else {room_of(n) for n in known}
    rows = [r for r, _ in show]
    cols = [c for _, c in show]
    r0, r1, c0, c1 = min(rows), max(rows), min(cols), max(cols)
    fig, ax = plt.subplots(figsize=(max(4, (c1 - c0 + 1) * 1.1), max(3.5, (r1 - r0 + 1) * 1.1 + 0.8)))
    ax.set_facecolor("#0f151d")
    fig.patch.set_facecolor("#0f151d")

    def at(rc):
        return (rc[1] + 0.5, -(rc[0] + 0.5))
    side = 0.74
    for rc in show:
        for d in ((0, 1), (1, 0)):
            nb = (rc[0] + d[0], rc[1] + d[1])
            if nb in show and nb in names:
                a, b = at(rc), at(nb)
                x0, y0 = min(a[0], b[0]) - 0.07, min(a[1], b[1]) - 0.07
                ax.add_patch(Rectangle((x0, y0), abs(b[0] - a[0]) + 0.14, abs(b[1] - a[1]) + 0.14,
                                       color="#3a4452", zorder=1))
    for rc in show:
        rgb = pal[names[rc] % len(pal)]
        x, y = at(rc)
        ax.add_patch(Rectangle((x - side / 2, y - side / 2), side, side, zorder=2, ec=(0, 0, 0, 0.35),
                               fc=tuple((v * 0.5 + 50) / 255.0 for v in rgb)))
    for fd in food:
        rc = room_of(fd["room"])
        if rc not in show:
            continue
        x, y = at(rc)
        ax.text(x - side * 0.45, y + side * 0.45, "%s %s" % (fd["kind"] or fd["name"], fd["worth"]),
                color="white", fontsize=7, va="top", ha="left", zorder=6, fontweight="bold")
        ax.text(x + side * 0.47, y - side * 0.47, "+%.1f" % fd["eaten"], color="white", fontsize=8,
                va="bottom", ha="right", zorder=6, fontweight="bold")
    moves = []
    total = {}
    for i in range(1, len(path)):
        if path[i] != path[i - 1]:
            k = tuple(sorted((path[i], path[i - 1])))
            total[k] = total.get(k, 0) + 1
            moves.append((path[i - 1], path[i], i, k))
    n = max(1, len(path) - 1)
    uses = {}
    for a, b, i, k in moves:
        uses[k] = uses.get(k, 0) + 1
        lanes = min(total[k], 7)
        off = (((uses[k] - 1) % 7) - (lanes - 1) / 2.0) * 0.07
        p, q = at(a), at(b)
        dx, dy = q[0] - p[0], q[1] - p[1]
        ln = math.hypot(dx, dy) or 1
        nx, ny = -dy / ln * off, dx / ln * off
        col = ramp((i - 1) / max(1, n - 1))
        ax.plot([p[0] + nx, q[0] + nx], [p[1] + ny, q[1] + ny], color=col, lw=2, zorder=4,
                solid_capstyle="round")
        mx, my, ux, uy, s = (p[0] + q[0]) / 2 + nx, (p[1] + q[1]) / 2 + ny, dx / ln, dy / ln, 0.09
        ax.add_patch(Polygon([(mx + ux * s, my + uy * s), (mx - ux * s * 0.6 - uy * s * 0.7, my - uy * s * 0.6 + ux * s * 0.7),
                              (mx - ux * s * 0.6 + uy * s * 0.7, my - uy * s * 0.6 - ux * s * 0.7)],
                             color=col, zorder=5))
    for name, c in stays.items():
        x, y = at(room_of(name))
        ax.add_patch(Circle((x, y), 0.2, fill=False, ec="white", lw=min(5, 1 + math.sqrt(c)), zorder=5))
        if c > 1:
            ax.text(x - side * 0.45, y - side * 0.3, "%d stays" % c, color="white", fontsize=6, zorder=6)
    sx, sy = at(path[0])
    ex, ey = at(path[-1])
    ax.add_patch(Circle((sx, sy), 0.12, fc=ramp(0), ec="white", lw=1.5, zorder=7))
    ax.add_patch(Rectangle((ex - 0.12, ey - 0.12), 0.24, 0.24, fc=ramp(1), ec="white", lw=1.5, zorder=7))
    ax.text(sx, sy, "S", color="white", ha="center", va="center", fontsize=7, fontweight="bold", zorder=8)
    ax.text(ex, ey, "E", color="white", ha="center", va="center", fontsize=7, fontweight="bold", zorder=8)
    ax.set_xlim(c0 - 0.1, c1 + 1.1)
    ax.set_ylim(-(r1 + 1.1), -(r0 - 0.1))
    ax.set_aspect("equal")
    ax.axis("off")
    ax.set_title("game %s, %s, %s: %d steps, %s" % (g.get("number"), g["view"], g["maze"], n, g["ended"]["how"]),
                 color="#cfd8e3", fontsize=9)
    fig.text(0.5, 0.02, "blue: step 1, red: step %d. S start, E end, ring: stayed, +food eaten in the room" % n,
             color="#8b9bb0", ha="center", fontsize=7)
    fig.savefig(out, dpi=150, facecolor=fig.get_facecolor(), bbox_inches="tight")
    plt.close(fig)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("file", help="a game file the game sent (<player>_<session>_<n>.json)")
    ap.add_argument("-o", "--out", help="the picture to write (default: next to the file, .route.png)")
    ap.add_argument("--all-rooms", action="store_true", help="draw every room of the maze")
    a = ap.parse_args(argv)
    with open(a.file) as fh:
        f = json.load(fh)
    g = f["game"]
    known, path, stays, food = summary(g)
    print("%s: %s view, maze %s, %d steps, ended: %s" % (os.path.basename(a.file), g["view"], g["maze"],
                                                       len(path) - 1, g["ended"]["how"]))
    print("rooms known at the end: %d, rooms visited: %d, moves: %d, stays: %d" % (
        len(known), len(set(path)), sum(1 for i in range(1, len(path)) if path[i] != path[i - 1]),
        sum(stays.values())))
    for fd in food:
        print("  %s (%s, worth %s) in %s: %.1f eaten" % (fd["name"], fd["kind"], fd["worth"], fd["room"], fd["eaten"]))
    print("path: " + " ".join(st["room"] + ("" if not st.get("held") else "*") for st in g["steps"]))
    print("(* a step taken with the key held down)")
    out = a.out or os.path.splitext(a.file)[0] + ".route.png"
    draw(f, out, a.all_rooms)
    print("wrote " + out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
