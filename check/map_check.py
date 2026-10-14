"""What the game shows of the food rooms against what the model's agent knows.

The game's map (show.near) follows this rule: before the player's move at
step t, it shows the food of the start room, of every room the player has
been in, and of every room next to (through an open side) a room the player
was in at steps 1 to t-1. This runs the version 3 agent (forage.v3.agent,
stepped as forage.v3.run does) in each maze and checks before every decision
that the rooms in its map (pose_mapping) are exactly those, and that among
them the food rooms, and only they, carry a preference: worth x level_worth.

    PYTHONPATH=<checkout>/src:<checkout>/third_party/high_level_nav_planning \\
        python check/map_check.py [steps]

Takes a few minutes. Exit code 0 when every decision matches.
"""
import contextlib
import copy
import io
import os
import sys
import time

import numpy as np


def setup():
    os.environ.setdefault("MPLBACKEND", "Agg")
    cwd = os.getcwd()
    from forage.base import agent  # noqa: F401
    os.chdir(cwd)
    import minigrid_navigation as MN
    from forage.v3 import settings as S
    from forage.v3 import agent as A
    from forage.v3.memory import FoodMemory
    from forage.v3.world import FoodWorld, bin_of
    from forage.v2.agent import NF
    return MN, S, A, FoodMemory, FoodWorld, bin_of, NF


def neighbours(env, room):
    return {tuple(int(v) for v in env.hypo_step(a, room)[1])
            for a in env.get_next_possible_motions(room, no_stay=True)}


def game_rule(env, path):
    """The rooms the game shows, before the move after path[-1]."""
    out = set(path)
    for room in path[1:]:
        out |= neighbours(env, room)
    return out


def walk(settings, seed, steps, tools):
    """1 run of the agent; returns (steps, problems)."""
    MN, S, A, FoodMemory, FoodWorld, bin_of, NF = tools
    edges = tuple(settings["world"]["bin_edges"])
    start = tuple(settings["run"]["start_room"])
    env, model = A.build(settings, seed)
    world = FoodWorld(settings, seed)
    memory = FoodMemory(settings)
    model.levels_for_B = memory
    if world.room_name(start) is not None:
        memory.look(start, world.level_of(start))
    model.refresh_food_part()
    model.write_preference()
    worth = settings["agent"]["level_worth"]
    room = start
    observation = [env.get_ob_given_p(room)]
    next_moves = env.get_next_possible_motions(room, no_stay=False)
    stay = env.possible_actions["STAY"]
    path, bad = [start], []
    for t in range(1, steps + 1):
        rooms = [tuple(int(v) for v in r) for r in model.pose_mapping]
        want = game_rule(env, path)
        if set(rooms) != want:
            bad.append("step %d: agent's map has %s more, %s fewer than the game's"
                       % (t, sorted(set(rooms) - want), sorted(want - set(rooms))))
        C = np.asarray(model.C[2], dtype=float)
        for i, r in enumerate(rooms):
            value = model.food_rooms.get(r)
            got = [float(C[i * NF + k]) if i * NF + k < C.size else 0.0 for k in range(len(worth))]
            expected = [value * w if value is not None else 0.0 for w in worth]
            if got != expected:
                bad.append("step %d: preference of %s is %s, not %s" % (t, r, got, expected))
        offered = [stay] if (t == 1 and settings["run"]["stay_first"]) else next_moves
        move, _ = MN.ours_action_decision(model, next_possible_actions=offered)
        MN.ours_infer_position(model, observation, move, next_moves)
        previous = room
        (colour, room), _, _, _ = env.step(move, room)
        room = tuple(room)
        observation = [colour]
        next_moves = env.get_next_possible_motions(room, no_stay=False)
        world.advance(room)
        seen = world.level_of(room) if world.room_name(room) is not None else None
        memory.after_step(previous, room, seen)
        model.fill_ob = bin_of(world.level_of(room), edges)
        MN.ours_update_agent(model, move, observation, next_moves)
        model.refresh_food_part()
        model.write_preference()
        path.append(room)
    return len(path) - 1, len(set(path)), bad


CASES = [
    # maze, start, food rooms (patch, small), seed, stay_first
    ("grid_4x4", (0, 0), ((3, 3), (3, 0)), 3, False),
    ("grid_4x4", (2, 1), ((0, 3), (1, 1)), 5, True),
    ("grid_6x6", (1, 2), ((4, 5), (0, 0)), 4, False),
    ("grid_two_4x4", (3, 3), ((1, 6), (2, 1)), 6, False),
]


def main(argv):
    steps = int(argv[0]) if argv else 40
    tools = setup()
    S = tools[1]
    base = S.load(None)
    problems = 0
    for maze, start, (patch, small), seed, stay_first in CASES:
        s = copy.deepcopy(base)
        s["run"]["maze"] = maze
        s["run"]["start_room"] = list(start)
        s["run"]["stay_first"] = stay_first
        s["world"]["food_rooms"]["patch"]["room"] = list(patch)
        s["world"]["food_rooms"]["small"]["room"] = list(small)
        S.check(s)
        t0 = time.time()
        with contextlib.redirect_stdout(io.StringIO()):     # the upstream code prints every step
            n, visited, bad = walk(s, seed, steps, tools)
        problems += len(bad)
        print("%-13s start %s seed %d%s: %d decisions, %d rooms visited, %d differ (%.0f s)"
              % (maze, start, seed, ", first step stay" if stay_first else "", n, visited,
                 len(bad), time.time() - t0), flush=True)
        for b in bad[:10]:
            print("   " + b)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
