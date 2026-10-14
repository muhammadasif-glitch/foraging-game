/* 1 game, in the 2D or the 3D view. The world follows js/rules.js, which
 * gives the numbers of the model; every step and every key is recorded.
 *
 * The moves are the model's: LEFT, RIGHT, UP, DOWN and STAY, 1 room a step.
 *   2D  the arrow keys move in their direction, Space stays.
 *   3D  the up arrow walks through the door the player faces (the door
 *       within 45 degrees of where the player looks), the left and right
 *       arrows turn (a tap about 10 degrees, held they keep turning), the
 *       down arrow turns around, Space stays. A turn is not a step: it costs
 *       nothing and the world does not change; it is recorded.
 * A move towards a wall is not a step either: nothing changes, the view
 * shakes, and the key is recorded.
 *
 * Walking. The player walks only while the key is held: a tap goes a little
 * way, and letting go stops the player where they are, in the corridor too.
 * The way between 2 rooms can be walked back (in 3D by turning around, in 2D
 * with the opposite arrow) as long as the next room has not been entered.
 *
 * Steps. A move is a step when the player enters the next room: the world
 * changes then, as in the model. A walk that goes back to the room it came
 * from is no step (it is recorded in walks_back). A key held on walks on
 * through the next door, room after room. A stay is a step when Space is
 * pressed; held, it stays again after each stay.
 *
 * What the player is shown is what the model's agent knows: the rooms it has
 * been in and, from the first step on, the rooms next to the room it is in;
 * a food room among them shows its food and worth; the level only in the
 * room the player is in (check/map_check.py). New rooms come into light as
 * the player walks into the room they are next to.
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
  // how the player moves; written into every game file
  var CONTROLS = {
    "2d": {walk_tiles_per_s: 12, speed_up_tiles_per_s2: 90, slow_down_tiles_per_s2: 200, stay_ms: 240},
    "3d": {walk_tiles_per_s: 6, speed_up_tiles_per_s2: 20, slow_down_tiles_per_s2: 40, stay_ms: 420,
      turn_tap_degrees: 10, turn_tap_ms: 90, turn_degrees_per_s: 150, turn_around_ms: 380}
  };
  var OPPOSITE = {LEFT: "RIGHT", RIGHT: "LEFT", UP: "DOWN", DOWN: "UP"};
  var BOB = 0.011, BOB_TILES = 3.6;          // the head bob: its height and its length
  var GROW_MS = 700, BITE_MS = 320;
  var LIGHT_MS = 450, HERE_MS = 400;         // new rooms coming into light, the food coming into view
  var QUARTER = Math.PI / 2;

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

  /* The facing (0 to 3) nearest to an angle: the door within 45 degrees. */
  function quarterOf(angle) {
    return ((Math.round(angle / QUARTER) % 4) + 4) % 4;
  }

  function degrees(angle) {
    var d = angle * 180 / Math.PI % 360;
    return round(d < 0 ? d + 360 : d, 1);
  }

  function smooth(k) {
    k = Math.max(0, Math.min(1, k));
    return k * k * (3 - 2 * k);
  }

  function easeOut(k) {
    k = Math.max(0, Math.min(1, k));
    return 1 - (1 - k) * (1 - k);
  }

  /* g: {number, view ("2d" or "3d"), renderer (draw(scene)), settings,
   * layout, seed, layout_seed, onChange(record)}. Resolves to the record. */
  function play(g) {
    var s = g.settings;
    var three = g.view === "3d";
    var C = CONTROLS[g.view];
    var maze = R.maze(g.layout.maze);
    var M = Wd.build(g.layout.maze);
    var sp = FG.config.speeds(s.food);
    var names = Object.keys(s.food_rooms);
    var foodRooms = {}, kinds = {};
    names.forEach(function (n) {
      foodRooms[n] = {room: g.layout.food_rooms[n], value: s.food_rooms[n].worth, start: s.food_rooms[n].start_level};
      kinds[n] = FG.config.foodOf(s, n);
    });
    var rand = FG.random.make(g.seed);
    var draws = [];
    var world = new R.World({food_rooms: foodRooms, eat: sp.eat, refill: sp.refill, rule: s.food.rule,
      random_draw: s.food.random_refill, draw_rate: s.food.refill_chance, start_room: g.layout.start_room},
    function () { var d = rand(); draws.push(d); return d; });
    var stomach = new R.Stomach(s.stomach);
    var edges = [s.food.empty_below, s.food.full_above];
    var SND = FG.sound;

    var room = g.layout.start_room.slice();
    var t = 0;
    var visited = {}, known = {}, found = {};
    var foodAt = {};
    names.forEach(function (n) { foodAt[Wd.key(g.layout.food_rooms[n])] = n; });
    // the 3D view starts facing a door
    var facing0 = three ? facingOf(maze.legal(room).filter(function (m) { return m !== "STAY"; })[0]) : 0;
    var start = Wd.centre(M, room);
    var scene = {maze: M, x: start[0], y: start[1], angle: facing0 * QUARTER, facing: facing0,
      lit: null, light: new Float32Array(M.W * M.H), food: [], here: null, crumbs: [], bob: 0};
    var eaten = 0;
    var steps = [], turns = [], back = [];
    var over = false;
    var shownAt = null;           // when the player could last act: entering a room, the end of a stay
    var walls = 0, others = 0, turnsBefore = 0;
    var holding = {};             // key code -> the rows its press made
    var down = {};                // key code -> {key, code, t, order, stale, used}
    var order = 0;
    var track = null;             // the way to the next room while the player is on it
    var stay = null, turning = null, spin = null, ending = null;
    var speed = 0, heading = 1, bobPhase = 0;
    var carry = null;             // the move of a way just walked to its end at speed, to walk on
    var fade = null;              // {from, to, t0}: new rooms coming into light
    var shown = {};               // food room -> {level, from, to, t0, ms}: the level drawn
    var left = {};                // food room -> its level when the player last left it
    var hereName = null, hereFade = 1, hereT0 = null;
    var lastFrame = null, dirty = true;
    var soundToggles = [];
    var record = {
      number: g.number, view: g.view, maze: g.layout.maze, seed: g.seed, layout_seed: g.layout_seed,
      layout: layoutNames(g.layout), settings: s, speeds: sp, controls: copy(C), food_kinds: copy(kinds),
      started: new Date().toISOString(), started_at: REC.now(), ended: null, steps: steps, turns: turns,
      walks_back: back, draws: draws, sound: {on_at_start: SND ? SND.on : null, toggles: soundToggles},
      path: null, known_rooms: null, result: null
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

    /* What the player knows changed: the new rooms come into light over
     * the next moment (at once at the start), the food signs with them. */
    function knowledgeChanged(now) {
      scene.lit = Wd.lit(M, known, visited);
      var to = new Float32Array(scene.lit.length);
      for (var i = 0; i < to.length; i++) {
        to[i] = scene.lit[i];
      }
      if (now) {
        scene.light = to;
        fade = null;
      } else {
        fade = {from: scene.light.slice(), to: to, t0: performance.now()};
      }
      scene.food = names.filter(function (n) { return known[Wd.key(g.layout.food_rooms[n])]; })
        .map(function (n) { return {room: g.layout.food_rooms[n], worth: s.food_rooms[n].worth, kind: kinds[n]}; });
    }

    function updateLight(now) {
      if (!fade) {
        return;
      }
      var k = Math.min(1, (now - fade.t0) / LIGHT_MS), f = smooth(k), a = fade.from, b = fade.to, out = scene.light;
      for (var i = 0; i < out.length; i++) {
        out[i] = a[i] + (b[i] - a[i]) * f;
      }
      if (k >= 1) {
        fade = null;
      }
      dirty = true;
    }

    /* The level drawn for a food room moves to its level over ms. */
    function showLevel(n, from, to, ms) {
      shown[n] = {level: from, from: from, to: to, t0: performance.now(), ms: ms};
      dirty = true;
    }

    function setHere(n, fadeIn) {
      hereName = n;
      hereFade = fadeIn ? 0 : 1;
      hereT0 = fadeIn ? performance.now() : null;
      if (n !== null && !shown[n]) {
        showLevel(n, world.level[n], world.level[n], 0);
      }
    }

    function sceneHere() {
      scene.here = hereName === null ? null :
        {room: g.layout.food_rooms[hereName], level: shown[hereName].level, fade: hereFade, kind: kinds[hereName]};
    }

    function crumbs(n, count) {
      var c = Wd.centre(M, g.layout.food_rooms[n]);
      for (var i = 0; i < count; i++) {
        var a = (i * 2.4 + t * 0.7) % (2 * Math.PI), r = 0.05 + 0.04 * (i % 3);
        scene.crumbs.push({x: c[0] + Math.cos(a) * r, y: c[1] + Math.sin(a) * r, z: 0.16 + 0.02 * (i % 4),
          vx: Math.cos(a) * (0.5 + 0.15 * (i % 3)), vy: Math.sin(a) * (0.5 + 0.15 * (i % 3)), vz: 0.4 + 0.1 * (i % 2),
          kind: kinds[n], n: i, rest: 0});
      }
      dirty = true;
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
        $("worth").textContent = kinds[n] + ", worth " + s.food_rooms[n].worth;
      }
    }

    function draw() {
      sceneHere();
      g.renderer.draw(scene);
      dirty = false;
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

    // ---------------------------------------------------------- keys held
    function release(code, at, how) {
      var rows = holding[code];
      if (rows) {
        rows.forEach(function (r) {
          r.released_at = at;
          r.hold_ms = round(at - r.key_at, 3);
          if (how) {
            r.released_by = how;
          }
        });
        delete holding[code];
        changed();
      }
      if (turning && turning.code === code && turning.held) {
        turning.held = false;
        turning.releasedAt = performance.now();
        turning.rec.held_ms = round(at - turning.rec.t, 3);
      }
      delete down[code];
    }

    /* The key held down that moves the player: of the up arrow and Space
     * (3D) or the arrows and Space (2D), the one pressed last. The turning
     * keys can be held at the same time, to steer. */
    function heldKey() {
      var best = null;
      Object.keys(down).forEach(function (code) {
        var d = down[code], key = KEY_MOVE[d.key];
        if (three && key !== "UP" && key !== "STAY") {
          return;
        }
        if (d.wall && (d.wall.facing !== quarterOf(scene.angle) || d.wall.room !== Wd.key(room))) {
          // held against a wall, then turned to another door: it walks again,
          // as a key held on (the walk begins now, not at the press)
          d.stale = false;
          d.wall = null;
          d.used = true;
        }
        if (!d.stale && (!best || d.order > best.order)) {
          best = d;
        }
      });
      return best;
    }

    /* How a key starts a step: pressed (the step is taken at the press) or
     * held on from before (taken now). */
    function how(d) {
      var now = REC.now();
      var pressed = !d.used && d.t >= shownAt;
      d.used = true;
      return {key: d.key, code: d.code, at: pressed ? d.t : now, press: d.t, held: !pressed};
    }

    // ---------------------------------------------------------- turning (3D)
    function startTurn(dir, e, entry) {
      var rec = {t: entry.t, step: t, key: e.key, from: FACING[quarterOf(scene.angle)], to: null,
        from_angle: degrees(scene.angle), to_angle: null, ms: null, held_ms: null};
      turns.push(rec);
      turnsBefore += 1;
      turning = {dir: dir, code: e.code || e.key, t0: performance.now(), a0: scene.angle, held: true,
        releasedAt: null, rec: rec};
      changed();
    }

    /* How far a turn has gone: a tap turns turn_tap_degrees, a key held
     * longer goes on turning until it is let go. */
    function turnOffset(tr, now) {
      var tap = C.turn_tap_degrees * Math.PI / 180, ms = C.turn_tap_ms;
      var e = now - tr.t0;
      if (!tr.held) {
        e = tr.releasedAt - tr.t0 >= ms ? tr.releasedAt - tr.t0 : Math.min(e, ms);
      }
      if (e <= ms) {
        return tap * easeOut(e / ms);
      }
      return tap + C.turn_degrees_per_s * Math.PI / 180 * (e - ms) / 1000;
    }

    function endTurn() {
      var rec = turning.rec;
      rec.to = FACING[quarterOf(scene.angle)];
      rec.to_angle = degrees(scene.angle);
      rec.ms = round(REC.now() - rec.t, 3);
      turning = null;
      changed();
    }

    function updateTurn(now) {
      if (turning) {
        scene.angle = turning.a0 + turning.dir * turnOffset(turning, now);
        scene.facing = quarterOf(scene.angle);
        dirty = true;
        if (!turning.held && now - turning.t0 >= Math.max(C.turn_tap_ms, turning.releasedAt - turning.t0)) {
          endTurn();
        }
      }
      if (spin) {
        var k = Math.min(1, (now - spin.t0) / C.turn_around_ms);
        scene.angle = spin.a0 + Math.PI * (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
        scene.facing = quarterOf(scene.angle);
        dirty = true;
        if (k >= 1) {
          scene.angle = spin.a0 + Math.PI;
          scene.facing = quarterOf(scene.angle);
          spin.rec.to = FACING[scene.facing];
          spin.rec.to_angle = degrees(scene.angle);
          spin.rec.ms = round(REC.now() - spin.rec.t, 3);
          spin = null;
          changed();
        }
      }
    }

    /* A step taken while a turn goes on: the turn so far ends at the step
     * (endAtStep, before it), and the rest is a turn of its own before the
     * next step (goOn, after it). */
    function endAtStep() {
      var tr = turning || spin;
      if (!tr) {
        return;
      }
      var old = tr.rec;
      old.to = FACING[quarterOf(scene.angle)];
      old.to_angle = degrees(scene.angle);
      old.ms = round(REC.now() - old.t, 3);
      old.split = true;
    }

    function goOn() {
      var tr = turning || spin;
      if (!tr) {
        return;
      }
      var old = tr.rec;
      var rec = {t: REC.now(), step: t, key: old.key, from: old.to, to: null, from_angle: old.to_angle,
        to_angle: null, ms: null, held_ms: null, continued: true};
      turns.push(rec);
      turnsBefore += 1;
      tr.rec = rec;
    }

    return new Promise(function (resolve) {
      REC.setPhase("game " + g.number);
      var first = learn(false);
      knowledgeChanged(true);
      steps.push(row({shown_at: null, key_at: null, decision_ms: null, entered_at: null, arrived_at: null,
        released_at: null, hold_ms: null, key: null, move: null, held: false, press_at: null, stops: 0,
        room_from: null, room_to: R.roomName(room), legal: allowed(),
        facing_before: null, angle_before: null, turns_before: 0, walls_before: 0, other_keys_before: 0,
        paid: 0, cost: 0, food_lost: 0, change: null, draw: null,
        found: null, known_new: first.rooms, known_food_new: first.food,
        events: first.food.map(function (n) { return {type: "known", room: n}; })}));
      if (world.nameAt(room) !== null) {
        found[Wd.key(room)] = true;
        steps[0].found = world.nameAt(room);
        steps[0].events.push({type: "found", room: world.nameAt(room)});
        setHere(world.nameAt(room), false);
        if (three) {
          // stand before the food, facing it
          var p = Wd.standPoint(M, room, Wd.DIRS[FACING[facing0]]);
          scene.x = p[0];
          scene.y = p[1];
        }
      }
      $("gain").textContent = "";
      hud();
      draw();
      changed();
      var stopSound = SND ? SND.listen(function (entry) {
        soundToggles.push({t: entry.t, step: t, on: entry.on, by: entry.by});
        changed();
      }) : function () {};
      REC.shown().then(function (at) {
        shownAt = at;
        steps[0].shown_at = at;
        steps[0].arrived_at = at;
      });
      requestAnimationFrame(frame);

      function finish(how) {
        over = true;
        if (turning) {
          endTurn();
        }
        if (spin) {
          spin.rec.to = FACING[quarterOf(scene.angle)];
          spin.rec.to_angle = degrees(scene.angle);
          spin.rec.ms = round(REC.now() - spin.rec.t, 3);
          spin = null;
        }
        REC.listen(null);
        stopSound();
        root.removeEventListener("blur", onBlur);
        Object.keys(holding).forEach(function (code) { delete holding[code]; });
        record.ended = {how: how, step: t, at: REC.now()};
        wayFields(record);
        record.result = modelResult(record);
        if (SND) {
          SND.end();
        }
        changed();
        resolve(record);
      }

      function bump() {
        nudge($("stage"), "shake");
        if (SND) {
          SND.bump();
        }
      }

      /* What a key pressed now does, for its outcome; the walking itself
       * is done frame by frame while it is held. */
      function pressOutcome(key) {
        if (stay || ending) {
          return "ignored: busy";
        }
        if (key === "STAY") {
          if (track) {
            return "ignored: between rooms";
          }
          return null;                      // a stay, taken in the next frame
        }
        var move = three ? FACING[quarterOf(scene.angle)] : key;
        if (track && !track.entered && !three) {
          return move === track.move ? "walk" : move === OPPOSITE[track.move] ? "walk back" : "ignored: between rooms";
        }
        if (track && (three || move === track.move)) {
          return "walk";
        }
        if (allowed().indexOf(move) < 0) {
          walls += 1;
          bump();
          return t === 0 && s.first_step_stay ? "not allowed" : "wall";
        }
        return "walk";
      }

      REC.listen(function (e, entry) {
        var code = e.code || e.key;
        if (e.type === "keyup") {
          release(code, entry.t);
          return undefined;
        }
        if (e.repeat) {
          return "ignored: repeat";
        }
        if (modified(e)) {
          return "ignored: with Ctrl, Alt or Meta";
        }
        if ((e.key === "m" || e.key === "M") && SND) {
          return SND.toggle("M") ? "sound on" : "sound off";
        }
        var key = KEY_MOVE[e.key];
        if (!key) {
          others += 1;
          return "ignored: key";
        }
        down[code] = {key: e.key, code: code, t: entry.t, order: ++order, stale: false, used: false};
        if (over || shownAt === null) {
          down[code].stale = true;
          return "ignored: busy";
        }
        if (t === 0 && entry.t - shownAt < TOO_SOON_MS) {
          down[code].stale = true;
          return "ignored: too soon";
        }
        if (three && (key === "LEFT" || key === "RIGHT")) {
          if (spin) {
            return "ignored: turning";
          }
          if (turning) {
            endTurn();
          }
          startTurn(key === "LEFT" ? -1 : 1, e, entry);
          return "turn";
        }
        if (three && key === "DOWN") {
          if (turning || spin) {
            return "ignored: turning";
          }
          if (stay || ending) {
            return "ignored: busy";
          }
          var rec = {t: entry.t, step: t, key: e.key, from: FACING[quarterOf(scene.angle)], to: null,
            from_angle: degrees(scene.angle), to_angle: null, ms: null, held_ms: null};
          turns.push(rec);
          turnsBefore += 1;
          spin = {t0: performance.now(), a0: scene.angle, rec: rec};
          changed();
          return "turn";
        }
        var out = pressOutcome(key);
        if (out === "wall" || out === "not allowed" || out === "ignored: between rooms" || out === "ignored: busy") {
          down[code].stale = out !== "ignored: busy";
          if (three && out === "wall") {
            down[code].wall = {facing: quarterOf(scene.angle), room: Wd.key(room)};
          }
          return out;
        }
        if (key === "STAY") {
          stayStep(how(down[code]));
          return "stay";
        }
        return out;
      });

      root.addEventListener("blur", onBlur);
      function onBlur() {
        // keys let go while the page had no keyboard are never heard
        Object.keys(down).forEach(function (code) { release(code, REC.now(), "blur"); });
      }

      /* A step: the world changes now, as in the model. Returns its row. */
      function takeStep(move, h, extra) {
        endAtStep();
        var legal = allowed();
        t += 1;
        var from = room;
        var to = maze.next(room, move);
        var leftName = world.nameAt(from);
        var what = world.advance(to);
        var paid = world.paid();
        var en = stomach.step(!R.sameRoom(to, from), paid);
        eaten += paid;
        room = to;
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
        var now = REC.now();
        var r = row({
          shown_at: shownAt, key_at: h.at, decision_ms: round(h.at - shownAt, 3), entered_at: now, arrived_at: null,
          released_at: null, hold_ms: null, key: h.key === " " || h.key === "Spacebar" ? "Space" : h.key,
          move: move, held: h.held, press_at: h.press, stops: extra.stops || 0,
          room_from: R.roomName(from), room_to: R.roomName(to),
          legal: legal, facing_before: extra.facing, angle_before: extra.angle, turns_before: turnsBefore,
          walls_before: walls, other_keys_before: others,
          paid: paid, cost: en.cost, food_lost: en.lost, change: what.rooms, draw: what.draw,
          found: newFound, known_new: learned.rooms, known_food_new: learned.food, events: events
        });
        walls = 0;
        others = 0;
        turnsBefore = 0;
        goOn();
        steps.push(r);
        if (down[h.code]) {
          (holding[h.code] = holding[h.code] || []).push(r);
        } else {
          r.released_at = REC.now();
          r.hold_ms = round(r.released_at - r.key_at, 3);
        }
        shownAt = now;
        knowledgeChanged(false);
        hud();
        if (paid > 0 && s.show.food_gained) {
          $("gain").textContent = "+" + round(paid, 1).toFixed(1);
          nudge($("gain"), "pop");
        } else {
          $("gain").textContent = "";
        }
        if (move !== "STAY" && leftName !== null) {
          left[leftName] = world.level[leftName];
        }
        if (gameOver()) {
          ending = {how: stomach.energy <= 0 && s.stomach.at_zero === "end" ? "starved" : "finished", row: r};
        }
        changed();
        dirty = true;
        return {row: r, paid: paid, food: n};
      }

      function gameOver() {
        return t >= s.steps || (stomach.energy <= 0 && s.stomach.at_zero === "end");
      }

      function stayStep(h) {
        var st = takeStep("STAY", h, {facing: FACING[scene.facing], angle: three ? degrees(scene.angle) : null});
        stay = {t0: performance.now(), row: st.row};
        if (st.food !== null) {
          setHere(st.food, false);
          var shownNow = shown[st.food] ? shown[st.food].level : world.level[st.food];
          if (world.level[st.food] < shownNow - 1e-9) {
            showLevel(st.food, shownNow, world.level[st.food], BITE_MS);
            crumbs(st.food, 7);
          } else {
            showLevel(st.food, shownNow, world.level[st.food], 200);
          }
        }
        if (st.paid > 0 && SND) {
          SND.crunch(st.paid);
        }
      }

      /* Sets off towards the next room in direction move, from where the
       * player stands. */
      function setOff(move, d) {
        var dir = Wd.DIRS[move], to = maze.next(room, move);
        var food = world.nameAt(to);
        var q = three && food !== null ? Wd.standPoint(M, to, dir) : Wd.centre(M, to);
        var pts = Wd.walkPath(M, [scene.x, scene.y], room, dir, q);
        track = {pts: pts, total: Wd.pathLength(pts), s: 0, move: move, to: to,
          enterS: Wd.pathLength(pts.slice(0, 6)) + 0.5, entered: false, row: null, stops: 0, still: false,
          h: how(d), facing: FACING[scene.facing], angle: three ? degrees(scene.angle) : null, furthest: 0};
        heading = 1;
      }

      /* The direction of the way at the player, for the way the player faces. */
      function wayAt() {
        var a = Wd.along(track.pts, Math.max(0, track.s - 0.05) / track.total);
        var b = Wd.along(track.pts, Math.min(track.total, track.s + 0.05) / track.total);
        var dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
        if (l < 1e-6) {
          var dd = Wd.DIRS[track.move];
          return [dd[1], dd[0]];
        }
        return [dx / l, dy / l];
      }

      /* Where the held keys send the player: +1 on along the way, -1 back,
       * 0 nowhere. Starts a way, or a stay, when the player stands in a room. */
      function intent() {
        if (ending) {
          return ending.walkOn ? 1 : 0;
        }
        var d = heldKey();
        if (!d || stay) {
          return 0;
        }
        var key = KEY_MOVE[d.key];
        if (key === "STAY") {
          if (!track && speed === 0) {
            stayStep(how(d));
          }
          return 0;
        }
        var move = three ? FACING[quarterOf(scene.angle)] : key;
        if (track) {
          if (three) {
            // on or back by the way the player faces, against the door ahead
            var dd = Wd.DIRS[track.move], dot = dd[1] * Math.cos(scene.angle) + dd[0] * Math.sin(scene.angle);
            if (!track.entered) {
              return dot >= 0 ? 1 : -1;
            }
            if (dot >= -0.2) {
              return 1;
            }
          } else {
            if (move === track.move) {
              return 1;
            }
            if (!track.entered) {
              return move === OPPOSITE[track.move] ? -1 : 0;
            }
          }
          if (speed > 0) {
            return 0;                       // slows down first, then stands in the room
          }
          stand();
        }
        if (speed > 0 && move !== carry) {
          return 0;
        }
        carry = null;
        if (allowed().indexOf(move) < 0) {
          walls += 1;
          bump();
          d.stale = true;
          if (three) {
            d.wall = {facing: quarterOf(scene.angle), room: Wd.key(room)};
          }
          speed = 0;
          return 0;
        }
        setOff(move, d);
        return 1;
      }

      /* Stops on the way after the room was entered: the player stands
       * there, in the room. */
      function stand() {
        if (track && track.row && track.row.arrived_at === null) {
          track.row.stopped_at = REC.now();
        }
        track = null;
        speed = 0;
      }

      function enter() {
        track.entered = true;
        var st = takeStep(track.move, track.h, {facing: track.facing, angle: track.angle, stops: track.stops});
        track.row = st.row;
        if (st.food !== null) {
          setHere(st.food, true);
          var from = left[st.food] === undefined ? world.level[st.food] : left[st.food];
          showLevel(st.food, from, world.level[st.food], GROW_MS);
          if (world.level[st.food] > from + 1e-9 && SND) {
            SND.grown();
          }
          if (st.paid > 0) {
            crumbs(st.food, 5);
            if (SND) {
              SND.crunch(st.paid);
            }
          }
        } else {
          setHere(null, false);
        }
        if (!three && SND) {
          SND.step(true);
        }
        if (ending) {
          ending.walkOn = true;               // the last room: walk on into it, then the end
        }
      }

      function updateWalk(dt) {
        var dir = intent();
        if (!track) {
          speed = 0;
          carry = null;
          return;
        }
        var V = C.walk_tiles_per_s, A = C.speed_up_tiles_per_s2, D = C.slow_down_tiles_per_s2;
        if (dir !== 0 && (dir === heading || speed === 0)) {
          heading = dir;
          speed = Math.min(V, speed + A * dt);
          if (heading > 0) {
            // slow down to stop at the end, unless the player walks on from there
            var rem = track.total - track.s;
            var on = !ending && wouldGoOn();
            if (!on) {
              speed = Math.min(speed, Math.max(Math.sqrt(2 * D * rem), V * 0.1));
            }
          }
        } else {
          speed = Math.max(0, speed - D * dt);
        }
        var ds = heading * speed * dt;
        track.s = Math.max(0, Math.min(track.total, track.s + ds));
        track.furthest = Math.max(track.furthest, track.s);
        var p = Wd.along(track.pts, track.total ? track.s / track.total : 1);
        scene.x = p[0];
        scene.y = p[1];
        if (speed > 0) {
          track.still = false;
        } else if (!track.still && !track.entered && track.s > 0) {
          track.still = true;
          track.stops += 1;
        }
        if (three) {
          if (speed > 0 && !turning && !spin) {
            var w = wayAt(), want = Math.atan2(w[1] * heading, w[0] * heading);
            var diff = Math.atan2(Math.sin(want - scene.angle), Math.cos(want - scene.angle));
            if (Math.abs(diff) < 0.75) {
              scene.angle += diff * Math.min(1, dt * 6);
            }
          }
          var phase = bobPhase + speed * dt * 2 * Math.PI / BOB_TILES;
          if (Math.floor(phase / Math.PI) !== Math.floor(bobPhase / Math.PI) && SND) {
            SND.step(false);
          }
          bobPhase = phase;
          scene.bob = Math.sin(bobPhase) * BOB * Math.min(1, speed / V);
        } else if (speed > 0) {
          scene.facing = facingOf(heading > 0 ? track.move : OPPOSITE[track.move]);
        }
        dirty = true;
        if (!track.entered && track.s >= track.enterS) {
          enter();
        }
        if (track.s >= track.total - 1e-6 && heading > 0) {
          track.row.arrived_at = REC.now();
          var goes = wouldGoOnNow();
          carry = goes ? (three ? FACING[quarterOf(scene.angle)] : track.move) : null;
          track = null;
          speed = goes ? speed : 0;
          if (ending) {
            var e = ending;
            ending = null;
            REC.shown().then(function (at) { e.row.arrived_at = at; finish(e.how); });
          }
          return;
        }
        if (track.s <= 1e-6 && heading < 0 && !track.entered) {
          // back where the walk began, in the same room: no step
          back.push({started_at: track.h.at, back_at: REC.now(), step: t, room: R.roomName(room),
            toward: R.roomName(track.to), move: track.move,
            furthest: round(track.furthest / track.enterS, 3), held: track.h.held});
          track = null;
          speed = 0;
          changed();
          return;
        }
        if (track.entered && speed === 0 && dir === 0) {
          stand();
        }
      }

      /* Whether the player walks on from the end of the way, into the next
       * room, with the keys held now. */
      function wouldGoOn() {
        var d = heldKey();
        if (!d || KEY_MOVE[d.key] === "STAY") {
          return false;
        }
        var move = three ? FACING[quarterOf(scene.angle)] : KEY_MOVE[d.key];
        var at = track.entered ? room : track.to;
        if (!three && move !== track.move) {
          return false;
        }
        return maze.legal(at).indexOf(move) >= 0 && t + (track.entered ? 0 : 1) < s.steps;
      }

      function wouldGoOnNow() {
        var d = heldKey();
        if (!d || KEY_MOVE[d.key] === "STAY") {
          return false;
        }
        var move = three ? FACING[quarterOf(scene.angle)] : KEY_MOVE[d.key];
        return allowed().indexOf(move) >= 0;
      }

      function updateFood(now, dt) {
        Object.keys(shown).forEach(function (n) {
          var a = shown[n];
          if (a.level !== a.to) {
            var k = a.ms > 0 ? Math.min(1, (now - a.t0) / a.ms) : 1;
            a.level = a.from + (a.to - a.from) * smooth(k);
            if (k >= 1) {
              a.level = a.to;
            }
            dirty = true;
          }
        });
        if (hereT0 !== null) {
          hereFade = Math.min(1, (now - hereT0) / HERE_MS);
          if (hereFade >= 1) {
            hereT0 = null;
          }
          dirty = true;
        }
        if (scene.crumbs.length) {
          scene.crumbs = scene.crumbs.filter(function (c) {
            if (c.z > 0) {
              c.x += c.vx * dt * 0.6;
              c.y += c.vy * dt * 0.6;
              c.vz -= 2.2 * dt;
              c.z = Math.max(0, c.z + c.vz * dt);
            } else {
              c.rest += dt;
            }
            return c.rest < 0.9;
          });
          dirty = true;
        }
        if ((!track || speed === 0) && three && scene.bob !== 0) {
          scene.bob *= Math.max(0, 1 - dt * 10);
          if (Math.abs(scene.bob) < 1e-4) {
            scene.bob = 0;
          }
          dirty = true;
        }
      }

      function frame(ts) {
        if (over) {
          return;
        }
        var dt = lastFrame === null ? 0 : Math.min(0.05, (ts - lastFrame) / 1000);
        lastFrame = ts;
        var now = performance.now();
        if (three) {
          updateTurn(now);
        }
        updateLight(now);
        updateFood(now, dt);
        if (stay) {
          if (now - stay.t0 >= C.stay_ms) {
            stay.row.arrived_at = REC.now();
            shownAt = stay.row.arrived_at;
            stay = null;
            if (ending) {
              var e = ending;
              ending = null;
              REC.shown().then(function (at) { e.row.arrived_at = at; finish(e.how); });
              return;
            }
            changed();
          }
        } else if (shownAt !== null) {
          updateWalk(dt);
        }
        if (dirty && !over) {
          draw();
        }
        requestAnimationFrame(frame);
      }
    });
  }

  /* The way the player went and the rooms known at the end, from the steps
   * (also for a game cut short). */
  function wayFields(rec) {
    rec.path = rec.steps.map(function (st) { return st.room; });
    var known = {};
    rec.steps.forEach(function (st) { (st.known_new || []).forEach(function (n) { known[n] = true; }); });
    rec.known_rooms = Object.keys(known).sort();
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
      return {step: st.step, room: R.roomFromName(st.room), move: st.move, paid: st.paid,
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
    out.steps_short = {fields: ["step", "move", "room", "held", "shown_at", "key_at", "entered_at", "released_at"],
      rows: rec.steps.map(function (st) {
        return [st.step, st.move, st.room, !!st.held, st.shown_at, st.key_at, st.entered_at, st.released_at];
      })};
    return copy(out);
  }

  FG.game = {play: play, modelResult: modelResult, shortForm: shortForm, wayFields: wayFields, FACING: FACING,
    CONTROLS: CONTROLS,
    quarterOf: quarterOf};
})(typeof window !== "undefined" ? window : globalThis);
