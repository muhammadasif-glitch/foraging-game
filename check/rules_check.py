"""The game's rules (js/rules.js) against the model's (active-inference-foraging).

Makes random cases with the model's own code: a maze, food rooms, a food rule
and its speeds, random refill or not, a start room and a path of open moves.
For each it records what the model's world (forage.v3.world.FoodWorld) and
the stomach of forage.v3.run give after every step: every food level, the
food paid and the energy. check/rules_check.js then runs the same cases
through js/rules.js and every number must be the same float, bit for bit.
It also compares Python's round(x, 9) with the game's, the half-life speeds,
and the open moves of every room of every maze.

    PYTHONPATH=<checkout>/src:<checkout>/third_party/high_level_nav_planning \\
        python check/rules_check.py [--cases 2000]

Needs node on the path. Exit code 0 when everything matches.
"""
import argparse
import json
import os
import random
import subprocess
import sys
import tempfile

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))


def setup():
    os.environ.setdefault("MPLBACKEND", "Agg")
    cwd = os.getcwd()
    from forage.base import agent  # noqa: F401  puts the upstream code on the path
    os.chdir(cwd)
    import envs.minigrid as minigrid
    from forage.base import extra_mazes
    extra_mazes.install(minigrid)
    return minigrid


ACTIONS = {"LEFT": 0, "RIGHT": 1, "UP": 2, "DOWN": 3, "STAY": 4}


def legal_moves(env, room):
    names = {v: k for k, v in env.possible_actions.items()}
    return [names[a] for a in env.get_next_possible_motions(tuple(room), no_stay=False)]


def one_case(rng, minigrid, S, world_mod):
    maze = rng.choice(S.MAZES)
    env = minigrid.GridWorldEnv(maze, ACTIONS)
    cells = sorted(S.maze_rooms(maze))
    start = rng.choice([c for c in cells if c[0] < 4 and c[1] < 4])
    n_food = rng.choice([1, 2, 2, 2, 3])
    food_cells = rng.sample(cells, n_food)
    names = ["patch", "small", "third"][:n_food]
    food_rooms = {n: {"room": list(c), "value": rng.choice([8.0, 1.0, 3.0, 2.5, rng.uniform(0.1, 10)]),
                      "start": rng.choice([1.0, 0.5, 0.0, 0.73, rng.random()])}
                  for n, c in zip(names, food_cells)}
    rule = rng.choice(world_mod.RULES)
    if rng.random() < 0.6:
        h = rng.choice([1, 2, 3, 5, 10, 20, 40, 0.5, 7.5, rng.uniform(0.3, 50)])
        eat = world_mod.half_life_speed(rule, h)
        refill = eat if rng.random() < 0.7 else world_mod.half_life_speed(rule, rng.choice([2, 5, 20]))
    else:
        h = None
        eat = rng.choice([0.1, 0.25, 0.05, 0.5, 1.0, rng.random()])
        refill = rng.choice([0.05, 0.1, 0.5, rng.random(), 0.0])
    random_draw = rng.random() < 0.4
    draw_rate = rng.choice([1.0, 0.5, 0.2, rng.random()])
    seed = rng.randrange(2 ** 31)
    steps = rng.choice([1, 5, 30, 120, 240])
    stomach = {"start": rng.choice([10.0, 20.0, 0.5, 3.0]), "size": rng.choice([20.0, 10.0, 15.5]),
               "move_cost": rng.choice([1.0, 0.0, 0.7]), "stay_cost": rng.choice([0.25, 0.0, 0.1])}
    stomach["start"] = min(stomach["start"], stomach["size"])
    settings = {"world": {"food_rooms": food_rooms, "eat_per_step": eat, "refill_speed": refill,
                          "rule": rule, "random_draw": random_draw, "draw_rate": draw_rate},
                "run": {"start_room": list(start)}}
    world = world_mod.FoodWorld(settings, seed)
    draws_rng = np.random.default_rng(seed)        # the same draws FoodWorld takes
    room = tuple(start)
    energy = stomach["start"]
    path, rows, draws = [], [], []
    for _t in range(steps):
        move = rng.choice(legal_moves(env, room))
        previous = room
        room = tuple(env.next_p_given_a_known_env(room, ACTIONS[move]))
        draws.append(float(draws_rng.random()))
        world.advance(room)
        paid = world.paid()
        # forage.v3.run: the stomach after each step
        cost = stomach["stay_cost"] if room == tuple(previous) else stomach["move_cost"]
        energy = max(0.0, min(stomach["size"], energy - cost + float(paid)))
        path.append(move)
        rows.append({"room": list(room), "paid": paid, "energy": energy,
                     "level": {n: world.level[n] for n in names}})
    return {"maze": maze, "start": list(start), "food_rooms": food_rooms, "rule": rule,
            "half_empty_in": h, "eat": eat, "refill": refill, "random_draw": random_draw,
            "draw_rate": draw_rate, "stomach": stomach, "path": path, "draws": draws, "rows": rows}


def round_cases(rng):
    values = [0.0, 1.0, 0.5, 1 / 1024, 3 / 2048, 0.0009765625, 0.7000000000000001, 0.1 + 0.2,
              0.25, 0.75, 0.9999999995, 0.0000000005, 0.000000001, 0.123456789, 0.1234567895,
              0.12345678950000001, 1 - 2 ** -53, 2 ** -30, 2 ** -40, 1e-12, 5e-10, 4.9999999e-10]
    values += [0.5 ** k for k in range(1, 60)]
    values += [rng.random() for _ in range(20000)]
    values += [round(rng.random(), rng.choice([9, 10, 11, 12])) + rng.choice([0, 5e-10, -5e-10]) for _ in range(5000)]
    values = [v for v in values if v >= 0]
    return [{"x": v, "py": round(v, 9)} for v in values]


def maze_cases(minigrid, S):
    out = []
    for maze in S.MAZES:
        env = minigrid.GridWorldEnv(maze, ACTIONS)
        for room in sorted(S.maze_rooms(maze)):
            out.append({"maze": maze, "room": list(room), "legal": legal_moves(env, room),
                        "next": {m: list(env.next_p_given_a_known_env(room, a)) for m, a in ACTIONS.items()}})
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description="The game's rules against the model's.")
    ap.add_argument("--cases", type=int, default=2000)
    ap.add_argument("--seed", type=int, default=20261010)
    ap.add_argument("--keep", help="also write the cases to this file")
    a = ap.parse_args(argv)
    minigrid = setup()
    from forage.v3 import settings as S
    from forage.v3 import world as W
    rng = random.Random(a.seed)
    data = {"cases": [one_case(rng, minigrid, S, W) for _ in range(a.cases)],
            "round": round_cases(rng),
            "speeds": [{"rule": r, "h": h, "py": W.half_life_speed(r, h)}
                       for r in W.RULES
                       for h in list(range(1, 201)) + [0.5, 1.5, 2.5, 7.5, 12.5, 0.25, 0.1]],
            "mazes": maze_cases(minigrid, S)}
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as fh:
        json.dump(data, fh)
        path = fh.name
    if a.keep:
        with open(a.keep, "w") as fh:
            json.dump(data, fh)
    try:
        return subprocess.call(["node", os.path.join(HERE, "rules_check.js"), path])
    finally:
        os.remove(path)


if __name__ == "__main__":
    sys.exit(main())
