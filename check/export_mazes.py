"""Write js/mazes.js from the mazes of the model, so that the game and the
model have exactly the same rooms and colours.

Run from a checkout of active-inference-foraging (with its upstream code in
third_party/), from this folder or anywhere:

    PYTHONPATH=<checkout>/src:<checkout>/third_party/high_level_nav_planning \\
        python check/export_mazes.py            # writes js/mazes.js
    ... python check/export_mazes.py --check    # only says whether it is current

A maze added to the model (forage.base.extra_mazes.ROOMS) appears in the game
once this is run again.
"""
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "js", "mazes.js")


def mazes():
    os.environ.setdefault("MPLBACKEND", "Agg")
    cwd = os.getcwd()
    from forage.base import agent  # noqa: F401  puts the upstream code on the path
    os.chdir(cwd)
    import envs.minigrid as minigrid
    from forage.base import extra_mazes
    from forage.v3 import settings as S
    from matplotlib import colors
    extra_mazes.install(minigrid)
    out = {}
    for name in S.MAZES:
        rooms, cmap = minigrid.setup_grid(name)
        rooms = [[int(v) for v in row] for row in rooms.tolist()]
        n = max(v for row in rooms for v in row) + 1
        out[name] = {"rooms": rooms, "colours": [colors.to_hex(cmap(i)) for i in range(n)]}
    return out


def text(data):
    lines = ["/* The mazes of the model (forage.v3.settings.MAZES), written by",
             " * check/export_mazes.py: each number is a room and its colour, -1 no room.",
             " * Run that script again rather than changing this file. */",
             "(function (root) {",
             "  var FG = root.FG = root.FG || {};",
             "  FG.MAZES = {"]
    names = list(data)
    for i, name in enumerate(names):
        m = data[name]
        lines.append("    %s: {" % json.dumps(name))
        lines.append("      rooms: [")
        rows = [json.dumps(row) for row in m["rooms"]]
        lines += ["        %s%s" % (r, "," if j < len(rows) - 1 else "") for j, r in enumerate(rows)]
        lines.append("      ],")
        colours = [json.dumps(c) for c in m["colours"]]
        lines.append("      colours: [")
        for j in range(0, len(colours), 6):
            chunk = ", ".join(colours[j:j + 6])
            lines.append("        %s%s" % (chunk, "," if j + 6 < len(colours) else ""))
        lines.append("      ]")
        lines.append("    }%s" % ("," if i < len(names) - 1 else ""))
    lines += ["  };", "})(typeof window !== \"undefined\" ? window : globalThis);", ""]
    return "\n".join(lines)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--check", action="store_true", help="only check that js/mazes.js is current")
    a = ap.parse_args(argv)
    new = text(mazes())
    old = open(OUT).read() if os.path.exists(OUT) else None
    if a.check:
        print("js/mazes.js is current" if new == old else "js/mazes.js differs from the model")
        return 0 if new == old else 1
    with open(OUT, "w", newline="\n") as fh:
        fh.write(new)
    print("wrote %s" % os.path.normpath(OUT))
    return 0


if __name__ == "__main__":
    sys.exit(main())
