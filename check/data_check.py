"""Game files against the model: replays every recorded game through the
model's own world (forage.v3.world.FoodWorld, with the game's recorded
random draws) and the stomach rule of forage.v3.run, and checks that every
food level, payment and energy in the file is the same float. Checks that
the game's settings are valid settings of a model run
(forage.v3.settings.check). Then scores each game with
forage.lab.measures.of_run(), the measures of the agents' runs, with the
energy score set to the game's own stomach, and checks the food total and,
for games that end at 0 energy, the energy score against the game. Checks
that the rooms the game showed the player at each step (known_new) are the
ones the model's agent adds to its map (see check/map_check.py), with the
open sides taken from the model's maze.

    PYTHONPATH=<checkout>/src:<checkout>/third_party/high_level_nav_planning \\
        python check/data_check.py <folder with game files> ...

Folders are searched for *.json files; files that are not game files, and
the short forms of games cut short, are skipped. Exit code 0 when every game
matches.
"""
import copy
import glob
import json
import math
import os
import re
import sys


def setup():
    os.environ.setdefault("MPLBACKEND", "Agg")
    cwd = os.getcwd()
    from forage.base import agent  # noqa: F401
    os.chdir(cwd)
    from forage.v3 import world as W
    from forage.v3 import settings as S
    from forage.lab import measures as M
    from forage.lab import config as C
    return W, S, M, C, agent


class Draws:
    """Stands in for FoodWorld's generator: hands out the recorded draws.
    The game's seed is the seed of the game's own generator, not numpy's, so
    the draws themselves are what reproduces a game."""

    def __init__(self, draws):
        self.draws = list(draws)
        self.i = 0

    def random(self):
        d = self.draws[self.i]
        self.i += 1
        return d


def room(text):
    m = re.match(r"^[sS](\d)(\d)$", text) or re.match(r"^[sS](\d+)_(\d+)$", text)
    return (int(m.group(1)), int(m.group(2)))


def measures_for(res, C):
    """The lab's measures, with the energy score set to the game's stomach."""
    m = copy.deepcopy(C.DEFAULTS["measures"])
    sat = res["settings"]["satiety"]
    m["energy"] = {"start": sat["start"], "stomach": sat["stomach"],
                   "move_cost": sat["move_cost"], "stay_cost": sat["stay_cost"]}
    return m


def name_of(room):
    return ("s%d%d" if room[0] < 10 and room[1] < 10 else "s%d_%d") % room


def check_known(name, g, H):
    """The rooms shown at each step: at step 0 the start room; after each
    move the room entered and, with show.near, the rooms next to it."""
    bad = []
    env = H.GridWorldEnv(g["layout"]["maze"], H.POSSIBLE_ACTIONS, max_steps=False, goal=-1)
    near = g["settings"]["show"].get("near", True)
    food = {room(r): n for n, r in g["layout"]["food_rooms"].items()}
    known = set()
    for s in g["steps"]:
        here = room(s["room"])
        add = {here}
        if near and s["step"] > 0:
            add |= {tuple(int(v) for v in env.hypo_step(a, here)[1])
                    for a in env.get_next_possible_motions(here, no_stay=True)}
        fresh = add - known
        known |= fresh
        if sorted(s["known_new"]) != sorted(name_of(r) for r in fresh):
            bad.append("%s step %d: known rooms %s, model %s"
                       % (name, s["step"], s["known_new"], sorted(name_of(r) for r in fresh)))
        if sorted(s["known_food_new"]) != sorted(food[r] for r in fresh if r in food):
            bad.append("%s step %d: known food rooms %s" % (name, s["step"], s["known_food_new"]))
    return bad, sum(len(s["known_new"]) for s in g["steps"])


def check_game(name, f, W, S, M, C):
    bad = []
    g = f["game"]
    res = g.get("result")
    if not res:
        return ["%s: no result" % name], 0
    settings = res["settings"]
    full = S.load(None)
    S._merge(full, copy.deepcopy(settings))
    try:
        S.check(full)
    except S.SettingsError as err:
        bad.append("%s: not a valid model run: %s" % (name, err))
    world = W.FoodWorld(settings, 0)
    world._rng = Draws(g["draws"])
    st = settings["satiety"]
    energy = st["start"]
    here = room(g["layout"]["start_room"])
    for s in g["steps"][1:]:
        previous = here
        here = room(s["room"])
        before = dict(world.level)
        world.advance(here)
        # the game's player was full (stomach.when_full "stop"): that room was
        # not eaten from, and nothing was paid
        for n, what in (s.get("change") or {}).items():
            if what == "kept (full)":
                world.level[n] = before[n]
        paid = 0.0 if s.get("full") else world.paid()
        cost = st["stay_cost"] if here == previous else st["move_cost"]
        energy = max(0.0, min(st["stomach"], energy - cost + float(paid)))
        if paid != s["paid"]:
            bad.append("%s step %d: paid %r, model %r" % (name, s["step"], s["paid"], paid))
        if energy != s["energy"]:
            bad.append("%s step %d: energy %r, model %r" % (name, s["step"], s["energy"], energy))
        for n, lv in s["levels"].items():
            if world.level[n] != lv:
                bad.append("%s step %d: level %s %r, model %r" % (name, s["step"], n, lv, world.level[n]))
    row, _windows = M.of_run(res, measures_for(res, C))
    total = sum(s["paid"] for s in g["steps"])
    if not math.isclose(row["food"], total, rel_tol=1e-12, abs_tol=1e-9):
        bad.append("%s: measures food %r, sum of payments %r" % (name, row["food"], total))
    if row["steps_run"] != len(g["steps"]) - 1:
        bad.append("%s: measures steps %r" % (name, row["steps_run"]))
    if g["settings"]["stomach"]["at_zero"] == "end" and g["ended"]["how"] in ("finished", "starved"):
        died = g["ended"]["how"] == "starved"
        if row["energy_died"] != int(died):
            bad.append("%s: energy score died %r, game %s" % (name, row["energy_died"], g["ended"]["how"]))
        elif not died and not math.isclose(row["energy_end"], g["steps"][-1]["energy"], abs_tol=1e-3):
            bad.append("%s: energy score end %r, game %r" % (name, row["energy_end"], g["steps"][-1]["energy"]))
    return bad, len(g["steps"]) - 1


def main(argv):
    W, S, M, C, H = setup()
    files = []
    for folder in argv:
        files += sorted(glob.glob(os.path.join(folder, "**", "*.json"), recursive=True))
    bad, games, steps, partial, shown = [], 0, 0, 0, 0
    for path in files:
        with open(path) as fh:
            f = json.load(fh)
        if f.get("format") != "foraging-game" or "game" not in f or "steps_short" in f["game"]:
            continue
        b, n = check_game(os.path.basename(path), f, W, S, M, C)
        bad += b
        b, k = check_known(os.path.basename(path), f["game"], H)
        bad += b
        for field in ("trial_type", "player", "session_id"):
            if not f.get(field):
                bad.append("%s: no %s at the top of the file (DataPipe's validation needs it)"
                           % (os.path.basename(path), field))
        shown += k
        games += 1
        partial += f["file"] == "partial game"
        steps += n
    print("%d games (%d of them cut short), %d steps replayed through the model's world, "
          "%d rooms shown on the map checked: %d differ" % (games, partial, steps, shown, len(bad)))
    for b in bad[:30]:
        print("  " + b)
    return 1 if bad or not games else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
