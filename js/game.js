/* 1 game, in the 2D or the 3D view. The world follows js/rules.js, which
 * gives the numbers of the model; every step and every key is recorded.
 *
 * The moves are the model's: LEFT, RIGHT, UP, DOWN and STAY, 1 room a step.
 *   2D  the arrow keys move in their direction, Space stays.
 *   3D  the up arrow walks through the door ahead (the move in the direction
 *       the player faces), the left and right arrows turn, the down arrow
 *       turns around, Space stays. A turn is not a step: it costs nothing
 *       and the world does not change; it is recorded.
 * A move towards a wall is not a step either: nothing changes, the view
 * shakes, and the key is recorded.
 *
 * What the player is shown is what the model's agent knows: the rooms it has
 * been in and, from the first step on, the rooms next to the room it is in;
 * a food room among them shows its worth; the level only in the room the
 * player is in (check/map_check.py).
 *
 * The caller hears of every change (g.onChange(record)), so that the game so
 * far is kept and reaches the researchers even if the page is closed. */
(function (root) {
  "use strict";
  var FG = root.FG = root.FG || {};
  var R = FG.rules, Wd = FG.world, REC = FG.recorder;

  var KEY_MOVE = {ArrowLeft: "LEFT", ArrowRight: "RIGHT", ArrowUp: "UP", ArrowDown: "DOWN", " ": "STAY",
    Left: "LEFT", Right: "RIGHT", Up: "UP", Down: "DOWN", Spacebar: "STAY"};
  var FACING = ["RIGHT", "DOWN", "LEFT", "UP"];          // facing 0 east, 1 south, 2 west, 3 north
  // keys pressed sooner than this after a game starts are taken as left over
  // from the menu
  var TOO_SOON_MS = 300;
  var WALK_MS_2D = 240, WALK_TILES_PER_S_3D = 7.5, TURN_MS = 170;

  function $(id) {
    return document.getElementById(id);
  }

  function round(x, n) {
    var f = Math.pow(10, n);
    return Math.round(x * f) / f;
  }

  function copy(x) {
    return JSON.parse(JSON.stringify(x));
  }

  function levelText(level, show, edges) {
    if (show.level === "bin") {
      return ["empty", "part full", "full"][R.binOf(level, edges)];
    }
    return Math.round(level * 100) + "%";
  }

  function energyColour(share) {
    return share >= 0.5 ? "#34c759" : share >= 0.25 ? "#ffb340" : "#ff5f57";
  }

  function nudge(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  function modified(e) {
    return e.ctrlKey || e.altKey || e.metaKey;
  }

  function facingOf(move) {
    return FACING.indexOf(move);
  }

  /* g: {number, view ("2d" or "3d"), renderer (draw(scene)), settings,
   * layout, seed, layout_seed, onChange(record)}. Resolves to the record. */
  function play(g) {
    var s = g.settings;
    var maze = R.maze(g.layout.maze);
    var M = Wd.build(g.layout.maze);
    var sp = FG.config.speeds(s.food);
    var names = Object.keys(s.food_rooms);
    var foodRooms = {};
    names.forEach(function (n) {
      foodRooms[n] = {room: g.layout.food_rooms[n], value: s.food_rooms[n].worth, start: s.food_rooms[n].start_level};
    });
    var rand = FG.random.make(g.seed);
    var draws = [];
    var world = new R.World({food_rooms: foodRooms, eat: sp.eat, refill: sp.refill, rule: s.food.rule,
      random_draw: s.food.random_refill, draw_rate: s.food.refill_chance, start_room: g.layout.start_room},
    function () { var d = rand(); draws.push(d); return d; });
    var stomach = new R.Stomach(s.stomach);
    var edges = [s.food.empty_below, s.food.full_above];

    var room = g.layout.start_room.slice();
    var t = 0;
    var visited = {}, known = {}, found = {};
    var foodAt = {};
    names.forEach(function (n) { foodAt[Wd.key(g.layout.food_rooms[n])] = n; });
    // the 3D view starts facing a door
    var facing = g.view === "3d" ? facingOf(maze.legal(room).filter(function (m) { return m !== "STAY"; })[0]) : 0;
    var c0 = Wd.centre(M, room);
    var scene = {maze: M, x: c0[0], y: c0[1], angle: facing * Math.PI / 2, facing: facing,
      lit: null, food: [], here: null};
    var eaten = 0;
    var steps = [], turns = [];
    var accepting = false, over = false, busy = false;
    var shownAt = null;
    var walls = 0, others = 0, turnsBefore = 0;
    var holding = {};
    var record = {
      number: g.number, view: g.view, maze: g.layout.maze, seed: g.seed, layout_seed: g.layout_seed,
      layout: layoutNames(g.layout), settings: s, speeds: sp, started: new Date().toISOString(),
      started_at: REC.now(), ended: null, steps: steps, turns: turns, draws: draws, result: null
    };

    function levels() {
      var out = {};
      names.forEach(function (n) { out[n] = world.level[n]; });
      return out;
    }

    function allowed() {
      if (t === 0 && s.first_step_stay) {
        return ["STAY"];
      }
      return maze.legal(room);
    }

    /* The room the player is in, and, after the first step, the rooms next
     * to it through a door, as the model's agent adds them to its map.
     * Returns the rooms new to the player and the food rooms among them. */
    function learn(near) {
      visited[Wd.key(room)] = true;
      var add = [room];
      if (near) {
        maze.legal(room).forEach(function (m) {
          if (m !== "STAY") {
            add.push(maze.next(room, m));
          }
        });
      }
      var out = {rooms: [], food: []};
      add.forEach(function (r) {
        var k = Wd.key(r);
        if (!known[k]) {
          known[k] = true;
          out.rooms.push(R.roomName(r));
          if (foodAt[k] !== undefined) {
            out.food.push(foodAt[k]);
          }
        }
      });
      return out;
    }

    function updateScene() {
      scene.lit = Wd.lit(M, known, visited);
      scene.food = names.filter(function (n) { return known[Wd.key(g.layout.food_rooms[n])]; })
        .map(function (n) { return {room: g.layout.food_rooms[n], worth: s.food_rooms[n].worth}; });
      var n = world.nameAt(room);
      scene.here = n === null ? null : {room: room.slice(), level: world.level[n], worth: s.food_rooms[n].worth};
    }

    function hud() {
      var e = stomach.energy, share = e / stomach.size;
      $("energyBar").style.width = Math.max(0, Math.min(100, share * 100)) + "%";
      $("energyBar").style.background = energyColour(share);
      $("energy").textContent = round(e, 1).toFixed(1) + " / " + round(stomach.size, 1);
      $("eaten").textContent = round(eaten, 1).toFixed(1);
      $("steps").textContent = s.steps - t;
      $("stepsItem").hidden = !s.show.steps_left;
      var n = world.nameAt(room);
      $("hereItem").hidden = n === null;
      if (n !== null) {
        $("here").textContent = levelText(world.level[n], s.show, edges);
        $("worth").textContent = "worth " + s.food_rooms[n].worth;
      }
    }

    function draw() {
      g.renderer.draw(scene);
    }

    function row(extra) {
      var n = world.nameAt(room);
      var base = {
        step: t, room: R.roomName(room), energy: stomach.energy, levels: levels(),
        in_food_room: n, seen: n === null ? null : world.level[n],
        shown: n === null ? null : levelText(world.level[n], s.show, edges),
        energy_shown: round(stomach.energy, 1), eaten: eaten, steps_left: s.steps - t,
        facing: FACING[scene.facing]
      };
      Object.keys(extra || {}).forEach(function (k) { base[k] = extra[k]; });
      return base;
    }

    function changed() {
      if (g.onChange) {
        g.onChange(record);
      }
    }

    function afterShown() {
      return REC.shown().then(function (at) {
        shownAt = at;
        if (!over) {
          accepting = true;
        }
      });
    }

    function release(e, entry) {
      var h = holding[e.code || e.key];
      if (h) {
        h.released_at = entry.t;
        h.hold_ms = round(entry.t - h.key_at, 3);
        delete holding[e.code || e.key];
        changed();
      }
    }

    /* Moves the view over ms milliseconds; fn(share 0 to 1) sets the scene. */
    function animate(ms, fn) {
      return new Promise(function (resolve) {
        var t0 = performance.now();
        function frame(now) {
          var k = ms > 0 ? Math.min(1, (now - t0) / ms) : 1;
          fn(k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
          draw();
          if (k < 1) {
            requestAnimationFrame(frame);
          } else {
            resolve();
          }
        }
        requestAnimationFrame(frame);
      });
    }

    return new Promise(function (resolve) {
      REC.setPhase("game " + g.number);
      var first = learn(false);
      updateScene();
      steps.push(row({shown_at: null, key_at: null, decision_ms: null, released_at: null, hold_ms: null,
        key: null, move: null, room_from: null, room_to: R.roomName(room), legal: allowed(),
        facing_before: null, turns_before: 0, walls_before: 0, other_keys_before: 0,
        paid: 0, cost: 0, food_lost: 0, change: null, draw: null,
        found: null, known_new: first.rooms, known_food_new: first.food,
        events: first.food.map(function (n) { return {type: "known", room: n}; })}));
      if (world.nameAt(room) !== null) {
        found[Wd.key(room)] = true;
        steps[0].found = world.nameAt(room);
        steps[0].events.push({type: "found", room: world.nameAt(room)});
      }
      $("gain").textContent = "";
      hud();
      draw();
      changed();
      afterShown().then(function () { steps[0].shown_at = shownAt; });

      function finish(how) {
        accepting = false;
        over = true;
        REC.listen(null);
        record.ended = {how: how, step: t, at: REC.now()};
        record.result = modelResult(record);
        changed();
        resolve(record);
      }

      function turn(by, e, entry) {
        busy = true;
        var from = scene.facing, a0 = scene.angle;
        scene.facing = (scene.facing + by + 4) % 4;
        turnsBefore += 1;
        turns.push({t: entry.t, step: t, key: e.key, from: FACING[from], to: FACING[scene.facing]});
        changed();
        animate(TURN_MS * Math.abs(by), function (k) { scene.angle = a0 + by * Math.PI / 2 * k; }).then(function () {
          busy = false;
        });
      }

      function bump() {
        nudge($("stage"), "shake");
      }

      REC.listen(function (e, entry) {
        if (e.type === "keyup") {
          release(e, entry);
          return undefined;
        }
        if (!accepting || busy || entry.t < shownAt) {
          return "ignored: busy";
        }
        if (e.repeat) {
          return "ignored: repeat";
        }
        if (modified(e)) {
          return "ignored: with Ctrl, Alt or Meta";
        }
        var key = KEY_MOVE[e.key];
        if (!key) {
          others += 1;
          return "ignored: key";
        }
        if (t === 0 && entry.t - shownAt < TOO_SOON_MS) {
          return "ignored: too soon";
        }
        var move = key;
        if (g.view === "3d" && key !== "STAY") {
          if (key === "LEFT" || key === "RIGHT" || key === "DOWN") {
            turn(key === "LEFT" ? -1 : key === "RIGHT" ? 1 : 2, e, entry);
            return "turn";
          }
          move = FACING[scene.facing];
        }
        if (allowed().indexOf(move) < 0) {
          walls += 1;
          bump();
          return t === 0 && s.first_step_stay && move !== "STAY" ? "not allowed" : "wall";
        }
        step(move, e, entry);
        return move === "STAY" ? "stay" : "move";
      });

      function step(move, e, entry) {
        accepting = false;
        busy = true;
        var legal = allowed();
        var facingBefore = FACING[scene.facing];
        t += 1;
        var from = room;
        var to = maze.next(room, move);
        var what = world.advance(to);
        var paid = world.paid();
        var en = stomach.step(!R.sameRoom(to, from), paid);
        eaten += paid;
        room = to;
        if (g.view === "2d" && move !== "STAY") {
          scene.facing = facingOf(move);
        }
        var n = world.nameAt(room);
        var learned = learn(true);
        var events = learned.food.map(function (f) { return {type: "known", room: f}; });
        var newFound = null;
        if (n !== null && !found[Wd.key(room)]) {
          found[Wd.key(room)] = true;
          newFound = n;
          events.push({type: "found", room: n});
        }
        var before = steps[steps.length - 1].levels;
        names.forEach(function (name) {
          var lv = world.level[name];
          if (lv === 0 && before[name] > 0) {
            events.push({type: "empty", room: name});
          }
          if (lv === 1 && before[name] < 1) {
            events.push({type: "full again", room: name});
          }
          if (what.rooms[name] === "skipped") {
            events.push({type: "refill skipped", room: name});
          }
        });
        if (en.lost > 0) {
          events.push({type: "food lost", amount: en.lost});
        }
        var r = row({
          shown_at: shownAt, key_at: entry.t, decision_ms: round(entry.t - shownAt, 3), arrived_at: null,
          released_at: null, hold_ms: null, key: e.key === " " || e.key === "Spacebar" ? "Space" : e.key,
          move: move, room_from: R.roomName(from), room_to: R.roomName(to), legal: legal,
          facing_before: facingBefore, turns_before: turnsBefore, walls_before: walls, other_keys_before: others,
          paid: paid, cost: en.cost, food_lost: en.lost, change: what.rooms, draw: what.draw,
          found: newFound, known_new: learned.rooms, known_food_new: learned.food, events: events
        });
        walls = 0;
        others = 0;
        turnsBefore = 0;
        steps.push(r);
        holding[e.code || e.key] = r;
        changed();
        var walk;
        if (move === "STAY") {
          walk = Promise.resolve();
        } else {
          var pts = Wd.pathTo(M, from, Wd.DIRS[move]);
          var ms = g.view === "3d" ? Wd.pathLength(pts) / WALK_TILES_PER_S_3D * 1000 : WALK_MS_2D;
          // the food of the room left goes with it; the room entered shows its own on arrival
          scene.here = null;
          walk = animate(ms, function (k) {
            var p = Wd.along(pts, k);
            scene.x = p[0];
            scene.y = p[1];
          });
        }
        walk.then(function () {
          updateScene();
          hud();
          draw();
          if (paid > 0 && s.show.food_gained) {
            $("gain").textContent = "+" + round(paid, 1).toFixed(1);
            nudge($("gain"), "pop");
          } else {
            $("gain").textContent = "";
          }
          busy = false;
          if (stomach.energy <= 0 && s.stomach.at_zero === "end") {
            REC.shown().then(function (at) { r.arrived_at = at; finish("starved"); });
          } else if (t >= s.steps) {
            REC.shown().then(function (at) { r.arrived_at = at; finish("finished"); });
          } else {
            afterShown().then(function () {
              r.arrived_at = shownAt;
              changed();
            });
          }
        });
      }
    });
  }

  function layoutNames(lay) {
    var f = {};
    Object.keys(lay.food_rooms).forEach(function (n) { f[n] = R.roomName(lay.food_rooms[n]); });
    return {maze: lay.maze, start_room: R.roomName(lay.start_room), food_rooms: f};
  }

  /* The game as a model run's result (forage.v3.record rows), so that
   * forage.lab.measures.of_run() can score it. */
  function modelResult(rec) {
    var maze = R.maze(rec.layout.maze);
    var lay = {maze: rec.layout.maze, start_room: FG.config.roomOf(rec.layout.start_room, maze, "start"),
      food_rooms: {}};
    Object.keys(rec.layout.food_rooms).forEach(function (n) {
      lay.food_rooms[n] = FG.config.roomOf(rec.layout.food_rooms[n], maze, n);
    });
    var settings = FG.config.modelSettings(rec.settings, lay);
    var rows = rec.steps.map(function (st) {
      var food = {};
      Object.keys(st.levels).forEach(function (n) { food[n] = {"true": st.levels[n], memory: null}; });
      var rc = /^s(\d)(\d)$/.exec(st.room);
      return {step: st.step, room: [Number(rc[1]), Number(rc[2])], move: st.move, paid: st.paid,
        food: food, energy: st.energy};
    });
    return {settings: settings, rows: rows, summary: {food_not_as_predicted: null}};
  }

  /* A shorter form of a game cut short, for the send on closing when the
   * whole file is too long: only the moves and their times. */
  function shortForm(rec) {
    var out = {};
    Object.keys(rec).forEach(function (k) {
      if (k !== "steps" && k !== "result") {
        out[k] = rec[k];
      }
    });
    out.steps_short = {fields: ["step", "move", "room", "shown_at", "key_at", "released_at"],
      rows: rec.steps.map(function (st) {
        return [st.step, st.move, st.room, st.shown_at, st.key_at, st.released_at];
      })};
    return copy(out);
  }

  FG.game = {play: play, modelResult: modelResult, shortForm: shortForm, FACING: FACING};
})(typeof window !== "undefined" ? window : globalThis);
