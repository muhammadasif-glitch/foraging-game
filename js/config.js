/* Settings to games: puts a game's settings together (game, then its
 * condition, then its game plan, then the link), checks them, picks its
 * layout, and gives the numbers the rules need, together with the same game
 * written as the settings of a model run. */
(function (root) {
  "use strict";
  var FG = root.FG = root.FG || {};
  var R = FG.rules;

  function SettingsError(message) {
    this.name = "SettingsError";
    this.message = message;
  }
  SettingsError.prototype = Object.create(Error.prototype);

  function copy(x) {
    return JSON.parse(JSON.stringify(x));
  }

  function isGroup(x) {
    return x !== null && typeof x === "object" && !Array.isArray(x);
  }

  var BAD_KEYS = ["__proto__", "constructor", "prototype"];

  function plainKey(key, place) {
    if (BAD_KEYS.indexOf(key) >= 0) {
      throw new SettingsError("'" + place + "' is not a setting");
    }
  }

  /* extra on top of base, level by level. At the top of a game's settings
   * (top true), food_rooms adds or changes food rooms: a room given in extra
   * changes that room's keys, a new name adds a room. */
  function merge(base, extra, where, top) {
    Object.keys(extra || {}).forEach(function (key) {
      var place = where ? where + "." + key : key;
      plainKey(key, place);
      if (top && key === "food_rooms") {
        if (!isGroup(extra[key])) {
          throw new SettingsError(place + " must be a group of food rooms");
        }
        Object.keys(extra[key]).forEach(function (name) {
          plainKey(name, place + "." + name);
          var room = extra[key][name];
          if (!isGroup(room)) {
            throw new SettingsError(place + "." + name + " must be a group: room, worth, start_level");
          }
          var old = base[key][name] || {room: "random", worth: null, start_level: 1.0};
          Object.keys(room).forEach(function (k) {
            plainKey(k, place + "." + name + "." + k);
            if (["room", "worth", "start_level"].indexOf(k) < 0) {
              throw new SettingsError("unknown setting '" + place + "." + name + "." + k +
                "'. Known here: room, worth, start_level");
            }
          });
          base[key][name] = Object.assign({}, old, copy(room));
        });
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(base, key)) {
        throw new SettingsError("unknown setting '" + place + "'. Known here: " + Object.keys(base).join(", "));
      }
      if (isGroup(base[key]) && isGroup(extra[key])) {
        merge(base[key], extra[key], place, false);
      } else if (isGroup(base[key])) {
        throw new SettingsError("'" + place + "' is a group of settings, got " + JSON.stringify(extra[key]));
      } else {
        base[key] = copy(extra[key]);
      }
    });
    return base;
  }

  /* ?set.food.rule=exponential&set.steps=30 -> {food: {rule: ...}, steps: 30} */
  function fromLink(params) {
    var out = {};
    params.forEach(function (value, key) {
      if (key.indexOf("set.") !== 0) {
        return;
      }
      var parts = key.slice(4).split(".");
      parts.forEach(function (p) { plainKey(p, key); });
      var node = out;
      for (var i = 0; i < parts.length - 1; i++) {
        node = node[parts[i]] = node[parts[i]] || {};
      }
      var v;
      try {
        v = JSON.parse(value);
      } catch (err) {
        v = value;
      }
      node[parts[parts.length - 1]] = v;
    });
    return out;
  }

  /* A start room: the model's agents can only start in rows 0 to 3 and
   * columns 0 to 3 (forage.v3.settings), so the game keeps to them too. */
  function startRoom(text, maze, place) {
    var room = roomOf(text, maze, place);
    if (!(room[0] < 4 && room[1] < 4)) {
      throw new SettingsError(place + " must be in rows 0 to 3 and columns 0 to 3, where the model's " +
        "agents can start, got " + text);
    }
    return room;
  }

  function roomOf(text, maze, place) {
    var m = /^[sS](\d)(\d)$/.exec(String(text));
    var room = m ? [Number(m[1]), Number(m[2])] : null;
    if (!room || !maze.isRoom(room)) {
      throw new SettingsError(place + " must be a room of " + maze.name + " such as s00, got " + text);
    }
    return room;
  }

  function number(v, place, low, high) {
    if (typeof v !== "number" || !isFinite(v) || v < low || v > high) {
      throw new SettingsError(place + " must be a number from " + low + " to " + high + ", got " + JSON.stringify(v));
    }
    return v;
  }

  function oneOf(v, options, place) {
    if (options.indexOf(v) < 0) {
      throw new SettingsError(place + " must be " + options.join(" or ") + ", got " + JSON.stringify(v));
    }
    return v;
  }

  function flag(v, place) {
    if (typeof v !== "boolean") {
      throw new SettingsError(place + " must be true or false, got " + JSON.stringify(v));
    }
    return v;
  }

  /* The settings of 1 game: game, then the condition, then the plan's own
   * keys, then the link. */
  function gameSettings(all, conditionName, plan, link) {
    var s = copy(all.game);
    if (conditionName !== null) {
      if (!all.conditions || !(conditionName in all.conditions)) {
        throw new SettingsError("no condition '" + conditionName + "'. The conditions are: " +
          Object.keys(all.conditions || {}).join(", "));
      }
      merge(s, all.conditions[conditionName], "conditions." + conditionName, true);
    }
    var own = {};
    Object.keys(plan).forEach(function (k) {
      if (["kind", "of", "seed", "layout"].indexOf(k) < 0) {
        own[k] = plan[k];
      }
    });
    merge(s, own, "session", true);
    merge(s, link || {}, "link", true);
    return check(s);
  }

  function check(s) {
    if (!FG.MAZES[s.maze]) {
      throw new SettingsError("maze must be one of " + Object.keys(FG.MAZES).join(", ") + ", got " + s.maze);
    }
    if (typeof s.steps !== "number" || s.steps < 1 || s.steps !== Math.floor(s.steps)) {
      throw new SettingsError("steps must be a whole number of at least 1, got " + s.steps);
    }
    flag(s.first_step_stay, "first_step_stay");
    var maze = R.maze(s.maze);
    if (s.start_rooms !== "random") {
      startRoom(s.start_rooms, maze, "start_rooms");
    }
    number(s.start_area, "start_area", 1, 4);
    var names = Object.keys(s.food_rooms);
    if (!names.length) {
      throw new SettingsError("food_rooms must name at least 1 food room");
    }
    names.forEach(function (n) {
      var f = s.food_rooms[n];
      if (!/^[a-z][a-z0-9_]*$/.test(n)) {
        throw new SettingsError("food_rooms: the name " + n + " must be small letters, digits and _");
      }
      if (f.room !== "random") {
        roomOf(f.room, maze, "food_rooms." + n + ".room");
      }
      number(f.worth, "food_rooms." + n + ".worth", 0, 1e6);
      number(f.start_level, "food_rooms." + n + ".start_level", 0, 1);
    });
    var food = s.food;
    oneOf(food.rule, ["linear", "exponential"], "food.rule");
    if (food.half_empty_in !== null) {
      number(food.half_empty_in, "food.half_empty_in", 1e-9, 1e9);
    } else {
      number(food.eat_per_step, "food.eat_per_step", 0, 1);
    }
    if (food.refill_speed !== "same") {
      number(food.refill_speed, "food.refill_speed", 0, 1);
    }
    flag(food.random_refill, "food.random_refill");
    number(food.refill_chance, "food.refill_chance", 0, 1);
    number(food.empty_below, "food.empty_below", 0, 1);
    number(food.full_above, "food.full_above", 0, 1);
    if (!(0 < food.empty_below && food.empty_below < food.full_above && food.full_above < 1)) {
      throw new SettingsError("food.empty_below and food.full_above must be 0 < empty_below < full_above < 1");
    }
    var sp = speeds(food);
    if (!(sp.eat >= 0 && sp.eat <= 1)) {
      throw new SettingsError("food: the eating speed must be from 0 to 1, as in the model; half_empty_in " +
        food.half_empty_in + " gives " + sp.eat);
    }
    var st = s.stomach;
    number(st.size, "stomach.size", 1e-9, 1e9);
    number(st.start, "stomach.start", 0, st.size);
    number(st.move_cost, "stomach.move_cost", 0, 1e9);
    number(st.stay_cost, "stomach.stay_cost", 0, 1e9);
    oneOf(st.at_zero, ["end", "continue"], "stomach.at_zero");
    oneOf(s.show.map, ["found", "full"], "show.map");
    oneOf(s.show.level, ["exact", "bin"], "show.level");
    flag(s.show.food_gained, "show.food_gained");
    flag(s.show.steps_left, "show.steps_left");
    flag(s.show.near, "show.near");
    flag(s.show.worth, "show.worth");
    flag(s.memory_test, "memory_test");
    return s;
  }

  /* The speeds the world gets. */
  function speeds(food) {
    var eat = food.half_empty_in !== null ? R.halfLifeSpeed(food.rule, food.half_empty_in) : food.eat_per_step;
    var refill = food.refill_speed === "same" ? eat : food.refill_speed;
    return {eat: eat, refill: refill};
  }

  /* The layout of 1 game: start room and food rooms. fixed: the plan's
   * layout ({start_room, food_rooms: {name: room}}), or null to pick at
   * random with rand. */
  function layout(s, fixed, rand) {
    var maze = R.maze(s.maze);
    var names = Object.keys(s.food_rooms);
    var out = {maze: s.maze, start_room: null, food_rooms: {}};
    fixed = fixed || {};
    var rooms = maze.rooms();
    var taken = [];
    var free = function (room) {
      return !taken.some(function (t) { return R.sameRoom(t, room); });
    };
    if (fixed.start_room) {
      out.start_room = startRoom(fixed.start_room, maze, "layout.start_room");
    } else if (s.start_rooms !== "random") {
      out.start_room = startRoom(s.start_rooms, maze, "start_rooms");
    } else {
      var area = rooms.filter(function (r) { return r[0] < s.start_area && r[1] < s.start_area; });
      out.start_room = rand.pick(area);
    }
    taken.push(out.start_room);
    var given = fixed.food_rooms || {};
    Object.keys(given).forEach(function (n) {
      if (names.indexOf(n) < 0) {
        throw new SettingsError("layout: no food room called " + n + " (the food rooms are " + names.join(", ") + ")");
      }
    });
    names.forEach(function (n) {
      var r = given[n] || (s.food_rooms[n].room !== "random" ? s.food_rooms[n].room : null);
      if (r) {
        var room = roomOf(r, maze, "food room " + n);
        Object.keys(out.food_rooms).forEach(function (other) {
          if (R.sameRoom(out.food_rooms[other], room)) {
            throw new SettingsError("food rooms " + other + " and " + n + " are both in " + r);
          }
        });
        out.food_rooms[n] = room;
        taken.push(room);
      }
    });
    names.forEach(function (n) {
      if (!out.food_rooms[n]) {
        var left = rooms.filter(free);
        if (!left.length) {
          throw new SettingsError("the maze has no room left for food room " + n);
        }
        out.food_rooms[n] = rand.pick(left);
        taken.push(out.food_rooms[n]);
      }
    });
    return out;
  }

  /* The same game as the settings of a model run (forage.v3.settings), so
   * that forage.lab.measures can score it and the model can replay it. */
  function modelSettings(s, lay) {
    var sp = speeds(s.food);
    var rooms = {};
    Object.keys(s.food_rooms).forEach(function (n) {
      rooms[n] = {room: lay.food_rooms[n], value: s.food_rooms[n].worth, start: s.food_rooms[n].start_level};
    });
    return {
      world: {food_rooms: rooms, rule: s.food.rule, eat_per_step: sp.eat, refill_speed: sp.refill,
        random_draw: s.food.random_refill, draw_rate: s.food.refill_chance,
        bin_edges: [s.food.empty_below, s.food.full_above]},
      run: {maze: s.maze, steps: s.steps, start_room: lay.start_room, stay_first: s.first_step_stay},
      satiety: {on: true, start: s.stomach.start, stomach: s.stomach.size,
        move_cost: s.stomach.move_cost, stay_cost: s.stomach.stay_cost}
    };
  }

  /* The fixed seed of a practice or shared game's layout, when the plan
   * gives no layout: the same layout for every player. */
  function fixedLayoutSeed(plan, number) {
    return plan.seed !== undefined ? (plan.seed >>> 0) ^ 0x5bd1e995 : 7919 * number;
  }

  /* Checks the whole settings file, with the link's settings, before anyone
   * plays: every condition with every game, and the layouts. */
  function checkAll(all, link) {
    if (!all || !all.game || !all.session || !all.session.length) {
      throw new SettingsError("settings.js must have game and session");
    }
    if (!all.datapipe || typeof all.datapipe.experiment_id !== "string") {
      throw new SettingsError("datapipe.experiment_id must be the ID of the DataPipe experiment");
    }
    oneOf(all.datapipe.if_no_condition, ["random", "stop"], "datapipe.if_no_condition");
    var names = Object.keys(all.conditions || {});
    (names.length ? names : [null]).forEach(function (c) {
      var made = [];
      all.session.forEach(function (plan, i) {
        var where = "session[" + (i + 1) + "]" + (c ? " with the condition " + c : "");
        oneOf(plan.kind, ["practice", "shared", "new", "repeat"], where + ".kind");
        if (plan.kind === "repeat" && !(plan.of >= 1 && plan.of <= i && all.session[plan.of - 1])) {
          throw new SettingsError(where + ": repeat needs of: the number of an earlier game");
        }
        if ((plan.kind === "new" || plan.kind === "repeat") && plan.layout) {
          throw new SettingsError(where + ": a " + plan.kind + " game takes no layout (practice and shared games do)");
        }
        if (plan.kind === "shared" && plan.seed === undefined) {
          throw new SettingsError(where + ": a shared game needs a seed, the same for every player");
        }
        var s;
        try {
          s = gameSettings(all, c, plan, link);
        } catch (err) {
          throw new SettingsError(where + ": " + err.message);
        }
        if (plan.kind === "repeat") {
          var o = made[plan.of - 1];
          if (o.maze !== s.maze || Object.keys(o.food_rooms).join() !== Object.keys(s.food_rooms).join()) {
            throw new SettingsError(where + " repeats game " + plan.of + ", which has another maze or other food rooms");
          }
        } else {
          try {
            if (plan.kind === "new") {
              for (var k = 0; k < 20; k++) {
                layout(s, null, FG.random.make(k + 1));
              }
            } else {
              layout(s, plan.layout, FG.random.make(fixedLayoutSeed(plan, i + 1)));
            }
          } catch (err) {
            throw new SettingsError(where + ": " + err.message);
          }
        }
        made.push(s);
      });
    });
    return true;
  }

  FG.config = {
    SettingsError: SettingsError,
    copy: copy,
    merge: merge,
    fromLink: fromLink,
    roomOf: roomOf,
    fixedLayoutSeed: fixedLayoutSeed,
    gameSettings: gameSettings,
    speeds: speeds,
    layout: layout,
    modelSettings: modelSettings,
    checkAll: checkAll
  };
})(typeof window !== "undefined" ? window : globalThis);
