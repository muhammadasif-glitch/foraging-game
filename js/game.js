/* 1 game: the player moves with the arrow keys and stays with Space, the
 * world follows js/rules.js, and every step is recorded. Then, if the
 * settings ask for it, the memory test.
 *
 * The caller hears of every change (g.onChange(record)), so that the game so
 * far is kept and reaches the researchers even if the page is closed in the
 * middle of the game or of its memory test. */
(function (root) {
  "use strict";
  var FG = root.FG = root.FG || {};
  var R = FG.rules, V = FG.view, REC = FG.recorder;

  var KEY_MOVE = {ArrowLeft: "LEFT", ArrowRight: "RIGHT", ArrowUp: "UP", ArrowDown: "DOWN", " ": "STAY",
    Left: "LEFT", Right: "RIGHT", Up: "UP", Down: "DOWN", Spacebar: "STAY"};
  // keys pressed sooner than this after a new screen are taken as left over
  // from the screen before, not as answers to the new one
  var TOO_SOON_MS = 300;
  // the memory test cannot be ended this soon, so that Space tapped on from
  // the game does not skip it
  var MEMORY_MIN_MS = 1500;
  // Space presses that go on from the screen before, less than this apart,
  // do not end a screen (Space held or tapped on and on goes through
  // nothing); a pause this long ends such a run
  var PAUSE_MS = 400;

  function $(id) {
    return document.getElementById(id);
  }

  function round(x, n) {
    var f = Math.pow(10, n);
    return Math.round(x * f) / f;
  }

  function levelText(level, show, edges) {
    if (show.level === "bin") {
      return ["empty", "part full", "full"][R.binOf(level, edges)];
    }
    return Math.round(level * 100) + "%";
  }

  function energyColour(share) {
    return share >= 0.5 ? "#2f8f4e" : share >= 0.25 ? "#c98a0b" : "#c0392b";
  }

  function show(id, on) {
    $(id).hidden = !on;
  }

  function shake() {
    var box = $("maze-box");
    box.classList.remove("shake");
    void box.offsetWidth;
    box.classList.add("shake");
  }

  function gain(text) {
    var g = $("gain");
    g.textContent = text;
    g.classList.remove("pop");
    if (text) {
      void g.offsetWidth;
      g.classList.add("pop");
    }
  }

  function modified(e) {
    return e.ctrlKey || e.altKey || e.metaKey;
  }

  function copy(x) {
    return JSON.parse(JSON.stringify(x));
  }

  /* g: {number, kind, label, settings, layout, seed, layout_seed, repeat_of,
   * onChange(record)}. Resolves to the game's record. */
  function play(g) {
    var s = g.settings;
    var maze = R.maze(g.layout.maze);
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
    var seen = {};
    seen[V.key(room)] = true;
    var found = {};
    // rooms whose food the player has been shown, and the food rooms by key
    var known = {};
    var foodAt = {};
    names.forEach(function (n) { foodAt[V.key(g.layout.food_rooms[n])] = n; });
    var steps = [];
    var accepting = false;
    var over = false;
    var shownAt = null;
    var walls = 0, others = 0;
    var holding = {};
    var record = {
      number: g.number, kind: g.kind, label: g.label, practice: g.kind === "practice",
      repeat_of: g.repeat_of || null, seed: g.seed, layout_seed: g.layout_seed, layout: layoutNames(g.layout),
      settings: s, speeds: sp, started: new Date().toISOString(), started_at: REC.now(),
      ended: null, steps: steps, draws: draws, result: null, memory_test: null
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

    /* The player is shown the food of the room it is in and, with show.near
     * from the first step on, of the rooms next to it through an open side,
     * as the model's agent adds them to its map. Returns the rooms new to
     * the player: {rooms: [names], food: [food room names]}. */
    function learn(near) {
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
        var k = V.key(r);
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

    /* What the map shows: rooms drawn as outlines, and the food signs. */
    function mapState() {
      var outline = {}, food = {};
      if (s.show.near) {
        Object.keys(known).forEach(function (k) {
          if (!seen[k]) {
            outline[k] = true;
          }
        });
      } else {
        allowed().forEach(function (m) {
          var k = V.key(maze.next(room, m));
          if (m !== "STAY" && !seen[k]) {
            outline[k] = true;
          }
        });
      }
      Object.keys(known).forEach(function (k) {
        if (foodAt[k] !== undefined) {
          food[k] = s.show.worth ? Number(s.food_rooms[foodAt[k]].worth) : true;
        }
      });
      return {outline: outline, food: food};
    }

    function render() {
      $("game-label").textContent = g.label;
      $("steps-left").textContent = s.show.steps_left ? "Steps left: " + (s.steps - t) : "";
      var e = stomach.energy, share = e / stomach.size;
      $("energy-fill").style.width = Math.max(0, Math.min(100, share * 100)) + "%";
      $("energy-fill").style.background = energyColour(share);
      $("energy-text").textContent = round(e, 1).toFixed(1) + " / " + round(stomach.size, 1);
      var n = world.nameAt(room);
      show("food-block", n !== null);
      if (n !== null) {
        var lv = world.level[n];
        $("food-fill").style.width = (s.show.level === "bin" ? [8, 50, 100][R.binOf(lv, edges)] : lv * 100) + "%";
        $("food-text").textContent = levelText(lv, s.show, edges);
      }
      $("game-prompt").innerHTML = t === 0 && s.first_step_stay ? FG.text("first_step_stay", {}) : "";
      var m = mapState();
      V.draw($("maze"), {maze: maze, seen: seen, all: s.show.map === "full", at: room,
        legal: allowed(), outline: m.outline, food: m.food});
    }

    function row(extra) {
      var n = world.nameAt(room);
      var base = {
        step: t, room: R.roomName(room), energy: stomach.energy, levels: levels(),
        in_food_room: n, seen: n === null ? null : world.level[n],
        shown: n === null ? null : levelText(world.level[n], s.show, edges),
        energy_shown: round(stomach.energy, 1), steps_left: s.steps - t
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

    return new Promise(function (resolve) {
      REC.setPhase("game " + g.number);
      var first = learn(false);
      steps.push(row({shown_at: null, key_at: null, decision_ms: null, released_at: null, hold_ms: null,
        key: null, move: null, room_from: null, room_to: R.roomName(room), legal: allowed(),
        walls_before: 0, other_keys_before: 0, paid: 0, cost: 0, food_lost: 0, change: null, draw: null,
        found: null, revealed: true, known_new: first.rooms, known_food_new: first.food,
        events: first.food.map(function (n) { return {type: "known", room: n}; })}));
      if (world.nameAt(room) !== null) {
        found[V.key(room)] = true;
        steps[0].found = world.nameAt(room);
        steps[0].events.push({type: "found", room: world.nameAt(room)});
      }
      show("game-message", false);
      show("text-screen", false);
      show("game-screen", true);
      $("panel").classList.remove("dim");
      gain("");
      render();
      changed();
      afterShown().then(function () { steps[0].shown_at = shownAt; });

      function finish(how) {
        accepting = false;
        over = true;
        record.ended = {how: how, step: t, at: REC.now()};
        record.result = modelResult(record);
        changed();
        var m = $("game-message");
        m.innerHTML = (how === "starved" ? "<b>You ran out of energy.</b>" : "<b>The game is over.</b>") +
          "<br>Press <b>Space</b> to go on.";
        show("game-message", true);
        REC.shown().then(function (at) {
          REC.listen(function (e, entry) {
            if (e.type === "keyup") {
              release(e, entry);
              return undefined;
            }
            if (e.key === " " && !e.repeat && entry.t - at >= TOO_SOON_MS * 1.5 &&
                !REC.stillTapping(" ", at, entry.t, PAUSE_MS)) {
              REC.listen(null);
              show("game-message", false);
              resolve(record);
              return "go on";
            }
            return entry.t - at < TOO_SOON_MS * 1.5 ? "ignored: too soon" : "ignored: game over";
          });
        });
      }

      REC.listen(function (e, entry) {
        if (e.type === "keyup") {
          release(e, entry);
          return undefined;
        }
        var move = KEY_MOVE[e.key];
        // a key pressed before the screen of this choice was shown (also one
        // in the same moment, handled just after) is not an answer to it
        if (!accepting || entry.t < shownAt) {
          return "ignored: busy";
        }
        if (e.repeat) {
          return "ignored: repeat";
        }
        if (modified(e)) {
          return "ignored: with Ctrl, Alt or Meta";
        }
        if (!move) {
          others += 1;
          return "ignored: key";
        }
        if (t === 0 && entry.t - shownAt < TOO_SOON_MS) {
          return "ignored: too soon";
        }
        if (allowed().indexOf(move) < 0) {
          walls += 1;
          shake();
          return t === 0 && s.first_step_stay && move !== "STAY" ? "not allowed" : "wall";
        }
        step(move, e, entry);
        return move === "STAY" ? "stay" : "move";
      });

      function step(move, e, entry) {
        accepting = false;
        var legal = allowed();
        t += 1;
        var from = room;
        var to = maze.next(room, move);
        var what = world.advance(to);
        var paid = world.paid();
        var en = stomach.step(!R.sameRoom(to, from), paid);
        room = to;
        var n = world.nameAt(room);
        var learned = learn(s.show.near);
        var events = learned.food.map(function (f) { return {type: "known", room: f}; });
        var newFound = null;
        if (n !== null && !found[V.key(room)]) {
          found[V.key(room)] = true;
          newFound = n;
          events.push({type: "found", room: n});
        }
        var revealed = !seen[V.key(room)];
        seen[V.key(room)] = true;
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
          shown_at: shownAt, key_at: entry.t, decision_ms: round(entry.t - shownAt, 3),
          released_at: null, hold_ms: null, key: e.key === " " || e.key === "Spacebar" ? "Space" : e.key,
          move: move, room_from: R.roomName(from), room_to: R.roomName(to), legal: legal,
          walls_before: walls, other_keys_before: others,
          paid: paid, cost: en.cost, food_lost: en.lost, change: what.rooms, draw: what.draw,
          found: newFound, revealed: revealed, known_new: learned.rooms, known_food_new: learned.food,
          events: events
        });
        walls = 0;
        others = 0;
        steps.push(r);
        holding[e.code || e.key] = r;
        render();
        gain(paid > 0 && s.show.food_gained ? "+" + round(paid, 1).toFixed(1) : "");
        if (stomach.energy <= 0 && s.stomach.at_zero === "end") {
          finish("starved");
        } else if (t >= s.steps) {
          finish("finished");
        } else {
          changed();
          afterShown();
        }
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

  /* After a game: where were the food rooms, and how full are they now.
   * The map shows the rooms the player has been in, and as outlines the
   * other rooms it knew (with show.near), without the food signs.
   * onChange(test) hears of every answer. */
  function memoryTest(g, rec, onChange) {
    var maze = R.maze(rec.layout.maze);
    function keyOf(name) {
      var rc = /^s(\d)(\d)$/.exec(name);
      return rc[1] + "," + rc[2];
    }
    var seen = {}, outline = {}, knownFood = [];
    rec.steps.forEach(function (st) {
      seen[keyOf(st.room)] = true;
    });
    rec.steps.forEach(function (st) {
      (st.known_new || []).forEach(function (name) {
        if (!seen[keyOf(name)]) {
          outline[keyOf(name)] = true;
        }
      });
      knownFood = knownFood.concat(st.known_food_new || []);
    });
    var cursor = FG.config.roomOf(rec.steps[rec.steps.length - 1].room, maze, "room");
    var marked = {}, order = [];
    var test = {shown_at: null, actions: [], marked: [], levels: [], done_at: null,
      truth: {food_rooms: rec.layout.food_rooms, levels_now: rec.steps[rec.steps.length - 1].levels,
        found: rec.steps.filter(function (st) { return st.found; }).map(function (st) { return st.found; }),
        known: knownFood}};
    REC.setPhase("memory " + g.number);

    function draw(asking) {
      V.draw($("maze"), {maze: maze, seen: seen, outline: outline, at: null, legal: [], food: {},
        cursor: asking ? null : cursor, marked: marked, asking: asking || null});
    }

    function moveCursor(dir) {
      var d = {LEFT: [0, -1], RIGHT: [0, 1], UP: [-1, 0], DOWN: [1, 0]}[dir];
      var r = cursor[0] + d[0], c = cursor[1] + d[1];
      while (r >= 0 && c >= 0 && r < maze.rows && c < maze.cols) {
        if (seen[r + "," + c] || outline[r + "," + c]) {
          cursor = [r, c];
          return true;
        }
        r += d[0];
        c += d[1];
      }
      return false;
    }

    function digit(e) {
      var m = /^(?:Digit|Numpad)([0-9])$/.exec(e.code || "");
      if (m) {
        return Number(m[1]);
      }
      return /^[0-9]$/.test(e.key) ? Number(e.key) : null;
    }

    return new Promise(function (resolve) {
      show("text-screen", false);
      show("game-screen", true);
      show("food-block", false);
      show("game-message", false);
      $("game-label").textContent = g.label + ": questions";
      $("steps-left").textContent = "";
      $("panel").classList.add("dim");
      gain("");
      $("game-prompt").innerHTML = FG.text("memory_where", {});
      draw(null);
      onChange(test);
      var stage = "where", question = null, readyAt = Infinity;
      REC.shown().then(function (at) {
        test.shown_at = at;
        readyAt = at + TOO_SOON_MS;
      });

      function ask() {
        if (test.levels.length >= order.length) {
          test.done_at = REC.now();
          REC.listen(null);
          $("panel").classList.remove("dim");
          $("game-prompt").innerHTML = "";
          onChange(test);
          resolve(test);
          return;
        }
        var room = order[test.levels.length];
        question = {room: R.roomName(room), shown_at: null, key_at: null, answer: null, ms: null};
        test.levels.push(question);
        readyAt = Infinity;
        $("game-prompt").innerHTML = FG.text("memory_level", {});
        draw(room);
        var q = question;
        REC.shown().then(function (at) {
          q.shown_at = at;
          if (question === q) {
            readyAt = at + TOO_SOON_MS;
          }
        });
      }

      REC.listen(function (e, entry) {
        if (e.type !== "keydown") {
          return undefined;
        }
        if (e.repeat) {
          return "ignored: repeat";
        }
        if (modified(e)) {
          return "ignored: with Ctrl, Alt or Meta";
        }
        if (entry.t < readyAt) {
          return "ignored: too soon";
        }
        if (stage === "where") {
          var dir = KEY_MOVE[e.key];
          if (dir && dir !== "STAY") {
            var moved = moveCursor(dir);
            test.actions.push({t: entry.t, what: moved ? "cursor" : "cursor blocked", room: R.roomName(cursor)});
            draw(null);
            onChange(test);
            return moved ? "cursor" : "cursor blocked";
          }
          if (e.key === "Enter") {
            var kk = V.key(cursor);
            var what;
            if (marked[kk]) {
              delete marked[kk];
              order = order.filter(function (r) { return V.key(r) !== kk; });
              what = "unmark";
            } else {
              marked[kk] = true;
              order.push(cursor.slice());
              what = "mark";
            }
            test.actions.push({t: entry.t, what: what, room: R.roomName(cursor)});
            draw(null);
            onChange(test);
            return what;
          }
          if (dir === "STAY") {
            if (entry.t - test.shown_at < MEMORY_MIN_MS || REC.stillTapping(e.key, test.shown_at, entry.t, PAUSE_MS)) {
              shake();
              return "ignored: too soon";
            }
            test.actions.push({t: entry.t, what: "done"});
            test.marked = order.map(R.roomName);
            stage = "level";
            ask();
            return "done";
          }
          return "ignored: key";
        }
        var d = digit(e);
        if (d !== null && question) {
          question.key_at = entry.t;
          question.answer = d;
          question.ms = question.shown_at === null ? null : round(entry.t - question.shown_at, 3);
          onChange(test);
          ask();
          return "answer";
        }
        return "ignored: key";
      });
    });
  }

  /* The short form of a game cut short, for sending on closing when the
   * whole file is too long: the moves and their times, and the draws. */
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

  FG.game = {play: play, memoryTest: memoryTest, modelResult: modelResult, shortForm: shortForm};
})(typeof window !== "undefined" ? window : globalThis);
