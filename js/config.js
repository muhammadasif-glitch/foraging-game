/* Settings to games: puts a game's settings together (game, then its
 * condition, then the link, then the maze the player chose), checks them,
 * picks its layout, and gives the numbers the rules need, together with the
 * same game written as the settings of a model run. */
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
  var FOOD_ROOM_KEYS = ["room", "worth", "start_level", "food"];
  // the foods the game can draw (js/world.js)
  var FOODS = ["cheese", "bread"];

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
          var old = base[key][name] || {room: "random", worth: null, start_level: 1.0, food: null};
          Object.keys(room).forEach(function (k) {
            plainKey(k, place + "." + name + "." + k);
            if (FOOD_ROOM_KEYS.indexOf(k) < 0) {
              throw new SettingsError("unknown setting '" + place + "." + name + "." + k +
                "'. Known here: " + FOOD_ROOM_KEYS.join(", "));
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

  /* A start room: any room of the maze, as for the model's agents. */
  function startRoom(text, maze, place) {
    return roomOf(text, maze, place);
  }

  function roomOf(text, maze, place) {
    var room = Array.isArray(text) ? [text[0], text[1]] : R.roomFromName(text);
    if (!room || !maze.isRoom(room)) {
      throw new SettingsError(place + " must be a room of " + maze.name + " such as s00, got " + text);
    }
    return room;
  }

  /* What an environment file of the model gave its maze (check/export_mazes.py),
   * or null for the mazes that come with the model. */
  function environment(name) {
    return (FG.MAZES[name] && FG.MAZES[name].environment) || null;
  }

  /* The food a food room shows: its own setting, or cheese for the room
   * worth the most and bread for the others. */
  function foodOf(s, name) {
    var f = s.food_rooms[name];
    if (f.food) {
      return f.food;
    }
    var top = Math.max.apply(null, Object.keys(s.food_rooms).map(function (n) { return s.food_rooms[n].worth; }));
    return f.worth >= top ? "cheese" : "bread";
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

  /* The settings of 1 game: game, then the condition, then the link, then
   * the maze the player chose (null: the maze of the settings). */
  function gameSettings(all, conditionName, maze, link) {
    var s = copy(all.game);
    if (conditionName !== null) {
      if (!all.conditions || !Object.prototype.hasOwnProperty.call(all.conditions, conditionName)) {
        throw new SettingsError("no condition '" + conditionName + "'. The conditions are: " +
          Object.keys(all.conditions || {}).join(", "));
      }
      merge(s, all.conditions[conditionName], "conditions." + conditionName, true);
    }
    merge(s, link || {}, "link", true);
    if (maze) {
      s.maze = maze;
    }
    return check(s);
  }

  function check(s) {
    if (!FG.MAZES[s.maze]) {
      throw new SettingsError("maze must be one of " + Object.keys(FG.MAZES).join(", ") + ", got " + s.maze);
    }
    if (s.steps !== "environment" &&
        (typeof s.steps !== "number" || s.steps < 1 || s.steps !== Math.floor(s.steps))) {
      throw new SettingsError("steps must be a whole number of at least 1, or environment, got " + s.steps);
    }
    oneOf(s.count_steps, ["moves", "all"], "count_steps");
    number(s.track_ms, "track_ms", 0, 60000);
    flag(s.first_step_stay, "first_step_stay");
    flag(s.sound, "sound");
    number(s.idle_stay_ms, "idle_stay_ms", 200, 60000);
    oneOf(s.stomach.when_full, ["stop", "keep"], "stomach.when_full");
    var maze = R.maze(s.maze);
    var env = environment(s.maze);
    if (s.start_rooms === "environment") {
      if (!env || !env.start_rooms.length) {
        throw new SettingsError("start_rooms: environment needs a maze whose environment file gives start rooms");
      }
    } else if (s.start_rooms !== "random") {
      startRoom(s.start_rooms, maze, "start_rooms");
    }
    if (s.start_area !== null) {
      number(s.start_area, "start_area", 1, 1e6);
    }
    if (s.steps === "environment") {
      if (!env || !env.steps) {
        throw new SettingsError("steps: environment needs a maze whose environment file gives steps");
      }
      s.steps = env.steps;
    }
    var names = Object.keys(s.food_rooms);
    if (!names.length) {
      throw new SettingsError("food_rooms must name at least 1 food room");
    }
    names.forEach(function (n) {
      var f = s.food_rooms[n];
      if (!/^[a-z][a-z0-9_]*$/.test(n)) {
        throw new SettingsError("food_rooms: the name " + n + " must be small letters, digits and _");
      }
      if (f.room === "environment") {
        if (!env || !env.food_rooms[n]) {
          throw new SettingsError("food_rooms." + n + ".room: environment needs a maze whose environment " +
            "file gives a food room called " + n);
        }
      } else if (f.room !== "random") {
        roomOf(f.room, maze, "food_rooms." + n + ".room");
      }
      if (f.food !== null && f.food !== undefined) {
        oneOf(f.food, FOODS, "food_rooms." + n + ".food");
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
    oneOf(s.show.level, ["exact", "bin"], "show.level");
    flag(s.show.food_gained, "show.food_gained");
    flag(s.show.steps_left, "show.steps_left");
    return s;
  }

  /* The speeds the world gets. */
  function speeds(food) {
    var eat = food.half_empty_in !== null ? R.halfLifeSpeed(food.rule, food.half_empty_in) : food.eat_per_step;
    var refill = food.refill_speed === "same" ? eat : food.refill_speed;
    return {eat: eat, refill: refill};
  }

  /* The layout of 1 game: start room and food rooms. fixed: a layout
   * ({start_room, food_rooms: {name: room}}), or null to pick at random with
   * rand. */
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
    } else if (s.start_rooms === "environment") {
      out.start_room = startRoom(rand.pick(environment(s.maze).start_rooms), maze, "start_rooms");
    } else if (s.start_rooms !== "random") {
      out.start_room = startRoom(s.start_rooms, maze, "start_rooms");
    } else {
      var area = s.start_area === null ? rooms :
        rooms.filter(function (r) { return r[0] < s.start_area && r[1] < s.start_area; });
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
      var spec = s.food_rooms[n].room;
      var r = given[n] || (spec === "environment" ? environment(s.maze).food_rooms[n].room :
        spec !== "random" ? spec : null);
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

  /* Checks the whole settings file, with the link's settings, before anyone
   * plays: every condition in every maze of the menu, with 20 layouts each. */
  function checkAll(all, link) {
    if (!all || !all.game || !all.menu) {
      throw new SettingsError("settings.js must have game and menu");
    }
    if (!all.datapipe || typeof all.datapipe.experiment_id !== "string") {
      throw new SettingsError("datapipe.experiment_id must be the ID of the DataPipe experiment");
    }
    oneOf(all.datapipe.if_no_condition, ["random", "stop"], "datapipe.if_no_condition");
    if (!Array.isArray(all.menu.mazes) || !all.menu.mazes.length) {
      throw new SettingsError("menu.mazes must list at least 1 maze");
    }
    all.menu.mazes.forEach(function (m) {
      if (!FG.MAZES[m]) {
        throw new SettingsError("menu.mazes: no maze " + m + "; the mazes are " + Object.keys(FG.MAZES).join(", "));
      }
    });
    if (!Array.isArray(all.menu.views) || !all.menu.views.length) {
      throw new SettingsError("menu.views must list 2d, 3d or both");
    }
    all.menu.views.forEach(function (v) { oneOf(v, ["2d", "3d"], "menu.views"); });
    var names = Object.keys(all.conditions || {});
    (names.length ? names : [null]).forEach(function (c) {
      all.menu.mazes.forEach(function (m) {
        var where = m + (c ? " with the condition " + c : "");
        try {
          var s = gameSettings(all, c, m, link);
          for (var k = 0; k < 20; k++) {
            layout(s, null, FG.random.make(k + 1));
          }
        } catch (err) {
          throw new SettingsError(where + ": " + err.message);
        }
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
    environment: environment,
    foodOf: foodOf,
    FOODS: FOODS,
    gameSettings: gameSettings,
    speeds: speeds,
    layout: layout,
    modelSettings: modelSettings,
    checkAll: checkAll
  };
})(typeof window !== "undefined" ? window : globalThis);
