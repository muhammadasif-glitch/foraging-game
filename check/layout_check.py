"""The maze the game draws against the maze of the model's films.

js/world.js lays the rooms out as forage/base/renderer.py does: rooms of 4 x
4 tiles, a door, a corridor tile and a door between neighbours, the doors at
the renderer's places, the renderer's colours. This asks node for the game's
layout of every maze and compares it, tile by tile, with the renderer's.

    PYTHONPATH=<checkout>/src:<checkout>/third_party/high_level_nav_planning \\
        python check/layout_check.py

Needs node. Exit code 0 when every maze is the same.
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)

NODE = r"""
globalThis.window = globalThis;
require(process.argv[1] + "/js/mazes.js");
require(process.argv[1] + "/js/world.js");
var W = globalThis.FG.world, out = {};
Object.keys(globalThis.FG.MAZES).forEach(function (name) {
  var M = W.build(name), doors = [];
  for (var i = 0; i < M.R; i++) {
    for (var j = 0; j < M.C; j++) {
      [[0, 1], [1, 0], [0, -1], [-1, 0]].forEach(function (d) {
        if (W.isRoom(M, i, j) && W.isRoom(M, i + d[0], j + d[1])) {
          doors.push([i, j, i + d[0], j + d[1], W.doorAndCorridor(i, j, i + d[0], j + d[1], M.rs, M.cs)]);
        }
      });
    }
  }
  out[name] = {H: M.H, W: M.W, rs: M.rs, cs: M.cs, kind: Array.from(M.kind),
    colours: M.list.map(function (r) { return [r.i, r.j, r.rgb]; }), doors: doors};
});
process.stdout.write(JSON.stringify(out));
"""


def main():
    os.environ.setdefault("MPLBACKEND", "Agg")
    cwd = os.getcwd()
    from forage.v2 import film
    os.chdir(cwd)
    R = film.R
    from forage.base import agent as upstream
    game = json.loads(subprocess.check_output(["node", "-e", NODE, GAME]))
    bad = []
    for name in sorted(game):
        g = game[name]
        rooms = upstream.GridWorldEnv(name, upstream.POSSIBLE_ACTIONS, max_steps=False, goal=-1).rooms
        nr, nc = rooms.shape
        rs, cs, H, W = R.build_layout(nr, nc)
        if [H, W, list(rs), list(cs)] != [g["H"], g["W"], g["rs"], g["cs"]]:
            bad.append("%s: size or room places differ" % name)
            continue
        grid = R.build_grid(rooms, rs, cs, H, W)
        kinds = {"wall": 0, "floor": 1, "door": 2}
        for y in range(H):
            for x in range(W):
                obj = grid.get(x, y)
                kind = type(obj).__name__.lower()
                want = kinds[kind]
                if kind == "floor" and getattr(obj, "color", None) == "grey":
                    want = 3                               # the corridor tile
                if g["kind"][y * W + x] != want:
                    bad.append("%s: tile %d,%d is %s in the films, %d in the game" % (name, y, x, kind, g["kind"][y * W + x]))
        for i, j, rgb in g["colours"]:
            film_rgb = list(R.REPO_PALETTE[int(rooms[i, j]) % len(R.REPO_PALETTE)])
            if film_rgb != rgb:
                bad.append("%s: room %d,%d colour %s, films %s" % (name, i, j, rgb, film_rgb))
        for i, j, ni, nj, tiles in g["doors"]:
            want = [list(t) for t in R.door_and_corridor(i, j, ni, nj, rs, cs)]
            if want != tiles:
                bad.append("%s: door %d,%d to %d,%d at %s, films %s" % (name, i, j, ni, nj, tiles, want))
        print("%-13s %d x %d tiles, %d doors: %s" % (name, H, W, len(g["doors"]),
              "the same as the films" if not any(b.startswith(name) for b in bad) else "differs"))
    for b in bad[:20]:
        print("  " + b)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
