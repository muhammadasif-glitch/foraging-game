/* Plays the game in a real browser (Playwright with Chromium), in the 2D and
 * the 3D view, and checks every file the game sends. DataPipe is stood in
 * for: the requests are caught in the browser and answered here, nothing
 * leaves this machine. The stand-in validates as DataPipe does with the
 * required fields trial_type, player and session_id: a file without them at
 * its top is refused with INVALID_DATA. The game files are written to a
 * folder for check/data_check.py.
 *
 *   node check/play_check.js <out folder> [--playwright <path to playwright>] [--only name,name]
 *
 * Scenarios: 3 games in a row (2D 4 x 4, 3D 6 x 6, 2D two 4 x 4) with the
 * condition from DataPipe; a 3D game played to its last move with turns;
 * running out of energy; keys pressed during a stay; keys held down
 * (walking on from room to room, steering while walking, stays repeated) in
 * both views; the environments of the model, with their start and food
 * rooms; every step counted as in the model (count_steps all); the sound
 * switched with M and with the button; DataPipe that cannot
 * hand out a condition; DataPipe down, then the file sent on the next visit;
 * a tab closed in the middle of a game, then the partial game sent; the page
 * opened from a file.
 */
"use strict";
var fs = require("fs");
var path = require("path");
var http = require("http");

var ROOT = path.join(__dirname, "..");
var args = process.argv.slice(2);
var OUT = args[0];
var pwPath = args.indexOf("--playwright") >= 0 ? args[args.indexOf("--playwright") + 1] : "playwright";
// --only three_games,hold: only these scenarios (the names are those below)
var only = args.indexOf("--only") >= 0 ? args[args.indexOf("--only") + 1].split(",") : null;
function want(name) {
  return !only || only.indexOf(name) >= 0;
}
// --files <folder>: only check the game files saved there before (no browser)
var filesOnly = args.indexOf("--files") >= 0 ? args[args.indexOf("--files") + 1] : null;
var chromium = filesOnly ? null : require(pwPath).chromium;

globalThis.window = globalThis;
require(path.join(ROOT, "js", "mazes.js"));
require(path.join(ROOT, "js", "rules.js"));
require(path.join(ROOT, "js", "world.js"));
require(path.join(ROOT, "settings.js"));
require(path.join(ROOT, "js", "random.js"));
require(path.join(ROOT, "js", "config.js"));
var R = globalThis.FG.rules;
var Wd = globalThis.FG.world;
var SETTINGS = globalThis.FG.SETTINGS;
var FACING = ["RIGHT", "DOWN", "LEFT", "UP"];

var problems = [];
function expect(ok, what) {
  if (!ok) {
    problems.push(what);
  }
  return ok;
}

function sleep(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

function seeded(seed) {
  return function () {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}

function serve() {
  return new Promise(function (resolve) {
    var server = http.createServer(function (req, res) {
      var p = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
      if (p.endsWith(path.sep) || p === ROOT) {
        p = path.join(p, "index.html");
      }
      fs.readFile(p, function (err, data) {
        if (err) {
          res.writeHead(404);
          res.end();
          return;
        }
        var type = p.endsWith(".js") ? "text/javascript" : p.endsWith(".css") ? "text/css" : "text/html";
        res.writeHead(200, {"Content-Type": type});
        res.end(data);
      });
    });
    server.listen(0, function () { resolve(server); });
  });
}

/* DataPipe as the test wants it: mode "ok", "down", "no condition",
 * "metadata" (answers METADATA_ERROR, as with Psych-DS metadata on, and
 * keeps the file) or "refuse" (refuses every file with INVALID_DATA). */
function pipe(page, store, mode, condition, log) {
  return page.route("https://pipe.jspsych.org/**", function (route) {
    var req = route.request();
    var body = null;
    try {
      body = JSON.parse(req.postData() || "null");
    } catch (err) {
      body = null;
    }
    if (req.url().indexOf("/api/condition/") >= 0) {
      if (mode.value === "no condition") {
        return route.fulfill({status: 400, contentType: "application/json",
          body: JSON.stringify({error: "CONDITION_ASSIGNMENT_NOT_ACTIVE", message: "off"})});
      }
      if (mode.value === "down") {
        return route.abort();
      }
      return route.fulfill({status: 200, contentType: "application/json",
        body: JSON.stringify({message: "Success", condition: condition})});
    }
    if (mode.value === "down") {
      return route.fulfill({status: 500, contentType: "application/json",
        body: JSON.stringify({error: "UPLOAD_ERROR", message: "down"})});
    }
    expect(body && body.experimentID && body.filename && typeof body.data === "string",
      "a request to DataPipe without experimentID, filename and data");
    var data = null;
    try {
      data = JSON.parse(body.data);
    } catch (err) {
      data = null;
    }
    // DataPipe's validation: valid JSON, and for a single object the
    // required fields must be keys at its top
    var valid = data && typeof data === "object" && !Array.isArray(data) &&
      ["trial_type", "player", "session_id"].every(function (k) { return Object.prototype.hasOwnProperty.call(data, k); });
    if (log) {
      log.push(body.filename + (valid ? "" : " INVALID"));
    }
    if (mode.value === "refuse") {
      return route.fulfill({status: 400, contentType: "application/json",
        body: JSON.stringify({error: "INVALID_DATA", message: "The data are not valid"})});
    }
    if (!valid) {
      expect(false, "DataPipe would refuse " + body.filename + " (INVALID_DATA)");
      return route.fulfill({status: 400, contentType: "application/json",
        body: JSON.stringify({error: "INVALID_DATA", message: "The data are not valid"})});
    }
    if (store[body.filename]) {
      return route.fulfill({status: 400, contentType: "application/json",
        body: JSON.stringify({error: "FILE_EXISTS", message: "exists"})});
    }
    store[body.filename] = data;
    if (mode.value === "metadata") {
      return route.fulfill({status: 400, contentType: "application/json",
        body: JSON.stringify({error: "METADATA_ERROR", message: "Data must be an array of trials"})});
    }
    return route.fulfill({status: 201, contentType: "application/json", body: JSON.stringify({message: "Success"})});
  });
}

function ui(page) {
  return page.evaluate(function () {
    function vis(id) {
      var e = document.getElementById(id);
      return !!e && !e.hidden;
    }
    function on(id) {
      var kids = Array.prototype.slice.call(document.getElementById(id).children);
      return kids.findIndex(function (c) { return c.classList.contains("on"); });
    }
    return {
      menu: vis("menu"), end: vis("end"), message: vis("message"), hud: vis("hud"),
      ready: !document.getElementById("play").disabled,
      view: on("views"), maze: on("mazes"),
      row: document.getElementById("viewLabel").classList.contains("active") ? 0 : 1,
      here: vis("hereItem"),
      status: (document.getElementById("endStatus") || {}).textContent || "",
      msg: (document.getElementById("msgBody") || {}).textContent || "",
      phase: window.FG && window.FG.recorder ? window.FG.recorder.phase : ""
    };
  });
}

/* Chooses view and maze on the first page and presses Enter. */
async function choose(page, view, maze) {
  var views = SETTINGS.menu.views, mazes = SETTINGS.menu.mazes;
  await sleep(450);
  var s = await ui(page);
  for (var w = 0; !s.ready && w < 60; w++) {
    await sleep(200);
    s = await ui(page);
  }
  if (s.row !== 0) {
    await page.keyboard.press("ArrowUp");
    await sleep(60);
  }
  for (var k = 0; k < 4 && (await ui(page)).view !== views.indexOf(view); k++) {
    await page.keyboard.press("ArrowRight");
    await sleep(60);
  }
  await page.keyboard.press(String(mazes.indexOf(maze) + 1));
  await sleep(60);
  s = await ui(page);
  expect(s.view === views.indexOf(view) && s.maze === mazes.indexOf(maze), "menu: chose " + view + " " + maze);
  await page.keyboard.press("Enter");
}

/* Plays the games of plan in turn: [{view, maze, stopAfter}] (stopAfter:
 * leave the game after this many keys). rnd: a seeded random function. */
async function play(page, rnd, plan, opts) {
  opts = opts || {};
  var keys = 0, games = 0;
  for (var gi = 0; gi < plan.length; gi++) {
    var gp = plan[gi];
    var s = await ui(page);
    for (var w = 0; !s.menu && w < 100; w++) {
      await sleep(100);
      s = await ui(page);
    }
    if (!expect(s.menu, "game " + (gi + 1) + ": the first page is shown")) {
      return {keys: keys, games: games};
    }
    await choose(page, gp.view, gp.maze);
    var inGame = 0;
    for (var guard = 0; guard < 4000; guard++) {
      s = await ui(page);
      if (s.end) {
        break;
      }
      if (gp.stopAfter && inGame >= gp.stopAfter) {
        return {keys: keys, games: games, stopped: true};
      }
      if (!/^game /.test(s.phase)) {
        await sleep(50);
        continue;
      }
      if (opts.fast && inGame === 0) {
        // standing still in the start room: a stay with no key held, then
        // Space and a walking key straight after it (a stay never holds the player up)
        await sleep(1300);
        await page.keyboard.press(" ");
        await sleep(30);
        await page.keyboard.press(gp.view === "3d" ? "ArrowUp" : "ArrowRight");
        await sleep(300);
        keys += 2;
        inGame += 1;
        continue;
      }
      var k;
      if (gp.view === "3d") {
        var pick = rnd();
        k = s.here && pick < (opts.stay || 0.6) ? " " : pick < 0.62 ? "ArrowUp" : pick < 0.78 ? "ArrowLeft" :
          pick < 0.92 ? "ArrowRight" : pick < 0.96 ? "ArrowDown" : " ";
      } else {
        var dirs = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
        k = s.here && rnd() < (opts.stay || 0.6) ? " " : rnd() < 0.08 ? " " : dirs[Math.floor(rnd() * 4)];
      }
      if (rnd() < 0.03) {
        k = "x";
      }
      if (rnd() < (s.here ? 0.45 : 0.18)) {
        // stands still: a stay every second with no key held
        await sleep(1100 + Math.floor(rnd() * 2400));
        inGame += 1;
        continue;
      }
      var walking = k === "ArrowUp" || (gp.view === "3d" && k === "ArrowDown") ||
        (gp.view === "2d" && k !== " " && k !== "x");
      if (gp.view === "3d" && (k === "ArrowLeft" || k === "ArrowRight") && rnd() < 0.75) {
        // held, as a person turns to a door beside them (a tap turns a few degrees)
        await page.keyboard.down(k);
        await sleep(450 + Math.floor(rnd() * 350));
        await page.keyboard.up(k);
      } else if (walking) {
        // the player walks while the key is down: mostly a room or 2, now and
        // then a short way only, now and then on the slant (2D) or steering (3D)
        var r2 = rnd(), far = gp.view === "3d" ? 1900 : 1000;
        await page.keyboard.down(k);
        if (r2 < 0.12) {
          await sleep(far * 0.2);
        } else if (r2 < 0.3) {
          await sleep(far * 0.4);
          var side = gp.view === "3d" ? (rnd() < 0.5 ? "ArrowLeft" : "ArrowRight") :
            (k === "ArrowLeft" || k === "ArrowRight" ? (rnd() < 0.5 ? "ArrowUp" : "ArrowDown") :
              (rnd() < 0.5 ? "ArrowLeft" : "ArrowRight"));
          await page.keyboard.down(side);
          await sleep(far * 0.3);
          await page.keyboard.up(side);
          await sleep(far * 0.4);
        } else {
          await sleep(far + Math.floor(rnd() * far * 0.4));
        }
        await page.keyboard.up(k);
      } else {
        await page.keyboard.press(k);
      }
      keys += 1;
      inGame += 1;
      if (opts.fast && (k === " " || rnd() < 0.3)) {
        // a stay, and a key during it: that key must be ignored as busy
        if (k !== " ") {
          await sleep(gp.view === "3d" ? 700 : 400);
          await page.keyboard.press(" ");
          keys += 1;
        }
        await sleep(30);
        await page.keyboard.press(gp.view === "3d" ? "ArrowUp" : "ArrowRight");
        keys += 1;
      }
      await sleep(gp.view === "3d" ? (walking ? 650 : 480) + Math.floor(rnd() * 120) :
        (walking ? 380 : 300) + Math.floor(rnd() * 80));
    }
    games += 1;
    await sleep(550);
    await page.keyboard.press("Enter");
    await sleep(200);
  }
  return {keys: keys, games: games};
}

function roomOf(text) {
  return R.roomFromName(text);
}

/* A game file: the header, the steps against the rules and the map rule,
 * the moves against the keys and the view. */
function checkGameFile(name, f) {
  var where = name;
  var g = f.game;
  expect(f.format === "foraging-game" && f.format_version === 4, where + ": format");
  expect(f.trial_type === "foraging-game", where + ": trial_type");
  expect(/^[0-9a-f]{8}$/.test(f.player), where + ": player code " + f.player);
  expect(/^[0-9a-f]{12}$/.test(f.session_id), where + ": session id");
  expect(f.condition && typeof f.condition.how === "string", where + ": condition");
  expect(f.browser && f.browser.user_agent && f.browser.refresh_hz > 0, where + ": browser");
  expect(f.menu && f.menu.view === g.view && f.menu.maze === g.maze && g.layout.maze === g.maze, where + ": menu choice");
  var s = g.settings;
  var steps = g.steps;
  var partial = /partial/.test(name);
  expect(g.ended && typeof g.ended.how === "string", where + ": ended " + JSON.stringify(g.ended));
  // with count_steps "moves" only the moves use up the steps
  var countAll = s.count_steps === "all";
  if (!partial) {
    expect(steps.length === g.ended.step + 1, where + ": steps " + steps.length + " vs ended at " + g.ended.step);
    var usedUp = countAll ? g.ended.step : g.ended.moves;
    expect(g.ended.how === "finished" ? usedUp === s.steps : g.ended.how === "starved",
      where + ": end " + g.ended.how + " with " + usedUp + " of " + s.steps + " used");
  }
  var counted = {moves: 0, idle_stays: 0, space_stays: 0};
  steps.slice(1).forEach(function (st) {
    counted[st.move !== "STAY" ? "moves" : st.by === "idle" ? "idle_stays" : "space_stays"] += 1;
  });
  expect(g.ended.moves === counted.moves && g.ended.idle_stays === counted.idle_stays &&
    g.ended.space_stays === counted.space_stays, where + ": moves and stays at the end " + JSON.stringify(g.ended));
  expect(steps[0].moves === 0 && steps[0].steps_left === s.steps, where + ": step 0 moves and steps left");
  var movesSoFar = 0;
  var maze = R.maze(g.layout.maze);
  var foodRooms = {};
  Object.keys(g.layout.food_rooms).forEach(function (n) {
    foodRooms[n] = {room: roomOf(g.layout.food_rooms[n]), value: s.food_rooms[n].worth, start: s.food_rooms[n].start_level};
  });
  var i = 0;
  var world = new R.World({food_rooms: foodRooms, eat: g.speeds.eat, refill: g.speeds.refill, rule: s.food.rule,
    random_draw: s.food.random_refill, draw_rate: s.food.refill_chance, start_room: roomOf(g.layout.start_room)},
  function () { return g.draws[i++]; });
  var stomach = new R.Stomach(s.stomach);
  var room = roomOf(g.layout.start_room);
  expect(steps[0].room === g.layout.start_room && steps[0].step === 0, where + ": step 0");
  var known = {}, eaten = 0;
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
      if (!known[r.join()]) {
        known[r.join()] = true;
        out.rooms.push(R.roomName(r));
        if (world.nameAt(r) !== null) {
          out.food.push(world.nameAt(r));
        }
      }
    });
    return out;
  }
  function expectKnown(st, want, t) {
    expect(JSON.stringify(st.known_new) === JSON.stringify(want.rooms),
      where + " step " + t + ": known rooms " + JSON.stringify(st.known_new) + " vs " + JSON.stringify(want.rooms));
    expect(JSON.stringify(st.known_food_new) === JSON.stringify(want.food), where + " step " + t + ": known food rooms");
  }
  expectKnown(steps[0], learn(false), 0);
  var facing = steps[0].facing;
  for (var t = 1; t < steps.length; t++) {
    var st = steps[t];
    expect(st.step === t, where + ": step number " + t);
    movesSoFar += st.move !== "STAY" ? 1 : 0;
    expect(st.moves === movesSoFar && st.steps_left === s.steps - (countAll ? t : movesSoFar),
      where + " step " + t + ": moves " + st.moves + ", steps left " + st.steps_left);
    if (t < steps.length - 1) {
      expect(st.steps_left > 0, where + " step " + t + ": the game went on with no steps left");
    }
    expect(maze.legal(room).indexOf(st.move) >= 0, where + " step " + t + ": move " + st.move + " not open");
    expect(st.legal.join() === maze.legal(room).join(), where + " step " + t + ": legal");
    // a stay by Space or by standing with no key; a move was walked with a key that walks
    var walkKeys = g.view === "3d" ? ["ArrowUp", "ArrowDown"] : ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
    expect(st.move === "STAY" ? (st.by === "idle" ? st.key === null : st.key === "Space" && st.by === "Space") :
      walkKeys.indexOf(st.key) >= 0 && st.by === "walk", where + " step " + t + ": key " + st.key + " by " + st.by +
      " gave " + st.move);
    if (st.by === "idle" && t > 1) {
      // no key held since the step before, for idle_stay_ms
      var prevStep = steps[t - 1];
      expect(st.entered_at - prevStep.entered_at >= s.idle_stay_ms - 40 || prevStep.move !== "STAY",
        where + " step " + t + ": an idle stay " + Math.round(st.entered_at - prevStep.entered_at) + " ms after the step before");
      var keyBetween = f.keys.some(function (k) {
        return k.t > st.entered_at - s.idle_stay_ms + 40 && k.t < st.entered_at - 5;
      });
      expect(!keyBetween, where + " step " + t + ": no key in the second before an idle stay");
    }
    if (g.view === "3d") {
      // the turns since the step before, the one going on cut at the step;
      // the walk began facing its door, and the turns lead to the facing at the step
      var turned = g.turns.filter(function (tr) { return tr.step === t - 1; });
      expect(turned.length === st.turns_before, where + " step " + t + ": turns " + turned.length + " vs " + st.turns_before);
      var f2 = facing;
      turned.forEach(function (tr) {
        expect(tr.from === f2, where + " step " + t + ": a turn from " + tr.from + ", facing " + f2);
        f2 = tr.to;
      });
      expect(st.facing === f2, where + " step " + t + ": facing " + st.facing + " vs " + f2);
      facing = st.facing;
    }
    var to = maze.next(room, st.move);
    var kept = Object.keys(st.change || {}).filter(function (n) { return st.change[n] === "kept (full)"; })[0] || null;
    expect(kept === (st.kept || null), where + " step " + t + ": the room kept when full");
    world.advance(to, kept);
    var paid = st.full ? 0 : world.paid();
    if (st.full) {
      expect(st.paid === 0 && world.nameAt(to) !== null, where + " step " + t + ": full in a food room, nothing paid");
    }
    var e = stomach.step(!R.sameRoom(to, room), paid);
    eaten += paid;
    room = to;
    expect(st.room === R.roomName(room) && st.room_to === st.room, where + " step " + t + ": room");
    expect(st.paid === paid, where + " step " + t + ": paid " + st.paid + " vs " + paid);
    expect(st.energy === e.energy, where + " step " + t + ": energy " + st.energy + " vs " + e.energy);
    expect(Math.abs(st.eaten - eaten) < 1e-9, where + " step " + t + ": eaten");
    Object.keys(world.level).forEach(function (n) {
      expect(st.levels[n] === world.level[n], where + " step " + t + ": level " + n);
    });
    expect(st.in_food_room === world.nameAt(room), where + " step " + t + ": in food room");
    expectKnown(st, learn(true), t);
    expect(typeof st.decision_ms === "number" && st.decision_ms >= 0, where + " step " + t + ": decision " + st.decision_ms);
    expect(st.key_at >= st.shown_at, where + " step " + t + ": key before shown");
    expect(typeof st.held === "boolean", where + " step " + t + ": held");
    // a move is taken when the next room is entered, a stay when Space is pressed
    expect(typeof st.entered_at === "number" && st.entered_at >= st.key_at,
      where + " step " + t + ": entered " + st.entered_at + " after the walk began " + st.key_at);
    if (st.move === "STAY") {
      expect(st.entered_at - st.key_at < 50, where + " step " + t + ": a stay is taken at its key");
    }
    if (st.held) {
      // a key held on from before: the walk (or the stay) began without a press
      expect(st.press_at <= st.key_at && (st.released_at === null || st.released_at === undefined ||
        st.released_at >= st.key_at), where + " step " + t + ": held step press and release");
      var pressedThen = f.keys.some(function (k) {
        return k.type === "down" && k.t === st.press_at && (k.key === st.key || (st.key === "Space" && k.key === " "));
      });
      expect(pressedThen, where + " step " + t + ": the press of a held step is in the keys");
    } else {
      // a stay at its press (or with no key at all); a walk sets off at its press or later
      // (pressed facing a wall, then turned)
      expect(st.move === "STAY" ? (st.by === "idle" ? st.press_at === null : st.press_at === st.key_at) :
        st.key_at >= st.press_at && st.press_at >= st.shown_at, where + " step " + t + ": a pressed step begins at its press");
    }
    if (st.move === "STAY" && (t < steps.length - 1 || !partial)) {
      expect(typeof st.arrived_at === "number" && st.arrived_at >= st.entered_at, where + " step " + t +
        ": a stay is over (arrived_at)");
    }
    if (st.move !== "STAY") {
      expect(typeof st.left_at === "number" && st.left_at <= st.entered_at && st.walked_tiles > 0,
        where + " step " + t + ": left the room before at " + st.left_at + ", walked " + st.walked_tiles);
    }
  }
  expect(g.draws.length === steps.length - 1, where + ": draws " + g.draws.length);
  checkTrack(where, g);
  expect(g.result && g.result.rows.length === steps.length, where + ": result rows");
  var downs = f.keys.filter(function (k) { return k.type === "down" && k.phase === "game " + g.number; });
  var stayKeys = downs.filter(function (k) { return k.outcome === "stay"; });
  var pressedStays = steps.slice(1).filter(function (st) { return st.move === "STAY" && !st.held && st.by === "Space"; }).length;
  expect(stayKeys.length === pressedStays, where + ": " + stayKeys.length + " stay keys for " + pressedStays + " stays pressed");
  steps.slice(1).forEach(function (st) {
    if (st.move !== "STAY" && !st.held) {
      var k0 = downs.filter(function (k) { return k.t === st.press_at; })[0];
      expect(k0 && (k0.outcome === "walk" || k0.outcome === "back"), where + " step " + st.step +
        ": the walk began with a key that walks (" + (k0 && k0.outcome) + ")");
    }
  });
  (g.walks_back || []).forEach(function (wb, i) {
    expect(wb.furthest > 0 && wb.furthest <= 1 && wb.back_at >= wb.left_at, where + ": walk back " + i);
  });
  var turnKeys = downs.filter(function (k) { return k.outcome === "turn"; });
  var ownTurns = (g.turns || []).filter(function (tr) { return !tr.continued; });
  expect(turnKeys.length === ownTurns.length, where + ": " + turnKeys.length + " turn keys, " + ownTurns.length + " turns");
  expect(downs.every(function (k) { return k.outcome !== null; }), where + ": every game key has an outcome");
  expect(f.keys.every(function (k) { return !k.repeat; }), where + ": repeats are counted, not recorded 1 by 1");
  // the way the player went, and the rooms known at the end
  expect(JSON.stringify(g.path) === JSON.stringify(steps.map(function (st) { return st.room; })), where + ": path");
  var knownAll = {};
  steps.forEach(function (st) { st.known_new.forEach(function (n) { knownAll[n] = true; }); });
  if (!partial) {
    expect(JSON.stringify(g.known_rooms) === JSON.stringify(Object.keys(knownAll).sort()), where + ": known rooms");
  }
  expect(g.sound && typeof g.sound.on_at_start === "boolean" && Array.isArray(g.sound.toggles), where + ": sound");
  expect(g.food_kinds && Object.keys(g.food_kinds).every(function (n) { return ["cheese", "bread"].indexOf(g.food_kinds[n]) >= 0; }),
    where + ": food kinds");
  if (g.view === "3d") {
    (g.turns || []).forEach(function (tr, i) {
      expect(tr.to !== null && typeof tr.from_angle === "number" && typeof tr.to_angle === "number",
        where + ": turn " + i + " has its angles");
    });
  }
  return g;
}

/* The place and the view of the player every track_ms: never in a wall, the
 * angle in 3D only, the steps taken by then, and about track_ms apart. */
function checkTrack(where, g) {
  var s = g.settings, steps = g.steps;
  if (!s.track_ms) {
    expect(g.track === null, where + ": no track when track_ms is 0");
    return;
  }
  var tr = g.track;
  if (!expect(tr && tr.every_ms === s.track_ms && tr.fields.join() === "t,x,y,angle,step" && tr.rows.length > 1,
    where + ": track")) {
    return;
  }
  var M = Wd.build(g.layout.maze);
  var start = Wd.centre(M, R.roomFromName(g.layout.start_room));
  var first = tr.rows[0];
  expect(Math.abs(first[1] - start[0]) < 0.5 && Math.abs(first[2] - start[1]) < 0.5 && first[4] === 0,
    where + ": the track starts in the middle of the start room " + JSON.stringify(first));
  expect(first[0] >= steps[0].shown_at - 0.05, where + ": the track starts when the game is shown");
  var gaps = [], k = 0;
  tr.rows.forEach(function (p, i) {
    expect(M.kind[Math.floor(p[2]) * M.W + Math.floor(p[1])] !== Wd.WALL, where + ": track " + i + " in a wall");
    expect(g.view === "3d" ? typeof p[3] === "number" && p[3] >= 0 && p[3] < 360 : p[3] === null,
      where + ": track " + i + " angle " + p[3]);
    // the steps taken by then (t is rounded to 0.1 ms)
    while (k + 1 < steps.length && steps[k + 1].entered_at <= p[0] + 0.051) {
      k += 1;
    }
    expect(p[4] === k, where + ": track " + i + " at step " + p[4] + ", the steps say " + k);
    if (i) {
      gaps.push(p[0] - tr.rows[i - 1][0]);
    }
  });
  expect(gaps.every(function (d) { return d > 0; }), where + ": track times go up");
  var usual = gaps.filter(function (d) { return d < 3 * s.track_ms; });
  var mean = usual.reduce(function (a, b) { return a + b; }, 0) / Math.max(1, usual.length);
  expect(usual.length >= 0.95 * gaps.length && Math.abs(mean - s.track_ms) < 0.15 * s.track_ms,
    where + ": track every " + mean.toFixed(1) + " ms (" + (gaps.length - usual.length) + " long gaps of " + gaps.length + ")");
}

function gameFiles(files) {
  return Object.keys(files).filter(function (n) { return /_\d+\.json$/.test(n); }).sort(function (a, b) {
    return Number(/_(\d+)\.json$/.exec(a)[1]) - Number(/_(\d+)\.json$/.exec(b)[1]);
  });
}

function save(label, files) {
  var dir = path.join(OUT, label);
  fs.mkdirSync(dir, {recursive: true});
  Object.keys(files).forEach(function (n) {
    fs.writeFileSync(path.join(dir, n), JSON.stringify(files[n]));
  });
}

/* The settings that take rooms and steps from a maze's environment file. */
function checkEnvironmentSettings() {
  var C = globalThis.FG.config, MZ = globalThis.FG.MAZES;
  var envLink = {start_rooms: "environment", steps: "environment",
    food_rooms: {patch: {room: "environment"}, small: {room: "environment"}}};
  Object.keys(MZ).filter(function (m) { return MZ[m].environment; }).forEach(function (m) {
    var e = MZ[m].environment;
    var st = C.gameSettings(SETTINGS, null, m, envLink);
    for (var k = 0; k < 5; k++) {
      var lay = C.layout(st, null, globalThis.FG.random.make(k));
      expect(e.start_rooms.some(function (r) { return r.join() === lay.start_room.join(); }), m + ": an environment start room");
      expect(lay.food_rooms.patch.join() === e.food_rooms.patch.room.join() &&
        lay.food_rooms.small.join() === e.food_rooms.small.room.join(), m + ": the environment's food rooms");
    }
    expect(st.steps === e.steps, m + ": the environment's steps");
  });
  var refused = 0;
  try {
    C.gameSettings(SETTINGS, null, "grid_4x4", {start_rooms: "environment"});
  } catch (err) {
    refused += /environment file/.test(err.message) ? 1 : 0;
  }
  try {
    C.gameSettings(SETTINGS, null, "holes_6x6", {start_rooms: "s66"});
  } catch (err) {
    refused += /must be a room of holes_6x6/.test(err.message) ? 1 : 0;
  }
  expect(refused === 2, "environment settings: a maze without a file, and a room not in the maze, are refused");
  var far = C.gameSettings(SETTINGS, null, "corridors_7x7", {start_rooms: "s66"});
  expect(C.layout(far, null, globalThis.FG.random.make(1)).start_room.join() === "6,6", "a start in row 6");
}

/* The problems by kind, numbers left out. */
function problemKinds() {
  var kinds = {};
  problems.forEach(function (p) {
    var k = p.replace(/^\S+\.json( step \d+)?: /, "").replace(/[0-9.]+/g, "N");
    kinds[k] = (kinds[k] || 0) + 1;
  });
  Object.keys(kinds).forEach(function (k) { console.log("  " + kinds[k] + " x " + k); });
}

function checkSaved(folder) {
  var n = 0;
  fs.readdirSync(folder).forEach(function (sub) {
    var dir = path.join(folder, sub);
    if (!fs.statSync(dir).isDirectory()) {
      return;
    }
    fs.readdirSync(dir).filter(function (f) { return /\.json$/.test(f) && !/short/.test(f); }).forEach(function (f) {
      checkGameFile(f, JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
      n += 1;
    });
  });
  console.log(n + " files, " + problems.length + " problems");
  problemKinds();
  problems.slice(0, 15).forEach(function (p) { console.log("    " + p); });
  process.exit(problems.length ? 1 : 0);
}

(async function main() {
  if (filesOnly) {
    checkSaved(filesOnly);
    return;
  }
  fs.mkdirSync(OUT, {recursive: true});
  checkEnvironmentSettings();
  var server = await serve();
  var base = "http://localhost:" + server.address().port + "/index.html";
  var browser = await chromium.launch(fs.existsSync("/opt/pw-browsers/chromium") ? {executablePath: "/opt/pw-browsers/chromium"} : {});
  var report = [];

  async function session(label, query, plan, opts) {
    opts = opts || {};
    var context = opts.context || await browser.newContext({viewport: {width: 1200, height: 800}});
    var page = await context.newPage();
    var errors = [];
    page.on("pageerror", function (e) { errors.push(String(e)); });
    page.on("crash", function () { errors.push("the page crashed"); });
    page.on("console", function (m) {
      if (m.type() === "error" && !/Failed to load resource/.test(m.text())) {
        errors.push(m.text());
      }
    });
    var files = opts.files || {};
    var mode = opts.modeRef || {value: opts.mode || "ok"};
    await pipe(page, files, mode, opts.condition || 0, opts.log);
    await page.goto(base + query);
    var t0 = Date.now();
    var r = await play(page, seeded(opts.seed || 1), plan, opts);
    var status = (await ui(page)).status;
    for (var w = 0; !r.stopped && /aving/.test(status) && w < 80; w++) {
      await sleep(500);
      status = (await ui(page)).status;
    }
    report.push(label + ": " + r.keys + " keys, " + r.games + " games, " + Object.keys(files).length + " files, " +
      Math.round((Date.now() - t0) / 1000) + " s" + (status ? " (" + status + ")" : ""));
    expect(errors.length === 0, label + ": page errors " + JSON.stringify(errors));
    return {context: context, page: page, files: files, mode: mode, result: r, status: status};
  }

  if (want("three_games")) {
  // 1. 3 games in a row, 2D and 3D, the condition from DataPipe
  var a = await session("three_games", "?test=1&set.steps=40", [
    {view: "2d", maze: "grid_4x4"}, {view: "3d", maze: "grid_6x6"}, {view: "2d", maze: "grid_two_4x4"}
  ], {seed: 11, condition: 1});
  var an = gameFiles(a.files);
  expect(an.length === 3, "three_games: 3 files, got " + Object.keys(a.files).join(" "));
  an.forEach(function (n) { checkGameFile(n, a.files[n]); });
  expect(an.every(function (n) { return n.indexOf("TEST_") === 0; }), "three_games: TEST_ names");
  expect(an.length === 3 && a.files[an[0]].player === a.files[an[2]].player &&
    a.files[an[0]].session_id === a.files[an[2]].session_id, "three_games: 1 player and 1 session");
  expect(an.length === 3 && a.files[an[1]].game.view === "3d" && a.files[an[2]].game.maze === "grid_two_4x4",
    "three_games: views and mazes as chosen");
  expect(an.length && a.files[an[0]].condition.name === Object.keys(SETTINGS.conditions)[1] &&
    a.files[an[0]].condition.how === "datapipe", "three_games: condition 1 from DataPipe");
  expect(/saved/.test(a.status), "three_games: saved message, got " + a.status);
  // the menu keys of game 2 are in file 2, not in file 1
  if (an.length === 3) {
    expect(a.files[an[0]].keys.every(function (k) { return k.phase === "menu" || k.phase === "game 1"; }),
      "three_games: file 1 holds the menu and game 1 only");
    expect(a.files[an[1]].keys.some(function (k) { return k.phase === "end 1"; }) &&
      a.files[an[1]].keys.every(function (k) { return k.phase !== "game 1"; }), "three_games: file 2 starts after game 1");
  }
  // a second visit keeps the player code
  var a2page = await a.context.newPage();
  await pipe(a2page, {}, {value: "ok"}, 0);
  await a2page.goto(base + "?test=1");
  await sleep(1500);
  var kept = await a2page.evaluate(function () {
    return Object.keys(localStorage).filter(function (k) { return /:player$/.test(k); }).map(function (k) { return localStorage.getItem(k); });
  });
  expect(an.length && kept.length === 1 && kept[0] === a.files[an[0]].player, "three_games: the player code is kept for the next visit");
  save("three_games", a.files);
  await a.context.close();

  }
  if (want("full_3d")) {
  // 2. a 3D game to its last step, with turns; energy stays at 0
  var b = await session("full_3d", "?condition=exponential_slow&set.steps=40&set.stomach.at_zero=continue", [
    {view: "3d", maze: "grid_two_4x4"}
  ], {seed: 12, stay: 0.4});
  var bn = gameFiles(b.files);
  expect(bn.length === 1, "full_3d: 1 file");
  bn.forEach(function (n) {
    var g = checkGameFile(n, b.files[n]);
    expect(g.ended.how === "finished" && g.ended.moves === g.settings.steps, "full_3d: all " + g.settings.steps + " moves");
    expect(g.ended.idle_stays + g.ended.space_stays > 0 && g.steps.length > g.settings.steps + 1,
      "full_3d: stays did not use up moves (" + (g.steps.length - 1) + " steps)");
    expect(g.turns.length > 10, "full_3d: turns recorded (" + g.turns.length + ")");
  });
  save("full_3d", b.files);
  await b.context.close();

  }
  if (want("starve_fast")) {
  // 3. running out of energy, 2D and 3D, keys during stays
  var c = await session("starve_fast", "?condition=linear_fast&set.stomach.start=4", [
    {view: "2d", maze: "grid_6x6"}, {view: "3d", maze: "grid_4x4"}
  ], {seed: 13, stay: 0.05, fast: true});
  var cn = gameFiles(c.files);
  expect(cn.length === 2, "starve_fast: 2 files");
  cn.forEach(function (n) {
    var g = checkGameFile(n, c.files[n]);
    expect(g.ended.how === "starved", "starve_fast: " + n + " ended " + g.ended.how);
    var idle = g.steps.filter(function (st) { return st.by === "idle"; });
    expect(idle.length > 0, "starve_fast: " + n + " stays while no key was held (" + idle.length + ")");
  });
  save("starve_fast", c.files);
  await c.context.close();

  }
  // 3b. keys held down: walking on, steering, stays repeated, in both views
  async function holdGame(view, maze, query) {
    var ctx = await browser.newContext({viewport: {width: 1100, height: 720}});
    var page = await ctx.newPage();
    var errors = [];
    page.on("pageerror", function (e) { errors.push(String(e)); });
    var files = {};
    await pipe(page, files, {value: "ok"}, 0);
    await page.goto(base + query);
    await choose(page, view, maze);
    await sleep(700);
    var up = view === "3d" ? "ArrowUp" : "ArrowRight";
    async function hold(key, ms) {
      await page.keyboard.down(key);
      for (var w = 0; w < ms; w += 100) {
        await sleep(100);
        await page.keyboard.down(key);          // as the browser repeats a key held down
      }
      await page.keyboard.up(key);
    }
    for (var round = 0; round < 6 && !(await ui(page)).end; round++) {
      await hold(up, 2600);
      await sleep(1500);
      if (view === "3d") {
        // steer while walking: the turn key down as well as the up arrow
        await page.keyboard.down("ArrowUp");
        await sleep(300);
        await hold(round % 2 ? "ArrowLeft" : "ArrowRight", 700);
        await sleep(900);
        await page.keyboard.up("ArrowUp");
        await sleep(1500);
        await hold("ArrowLeft", 1300);           // about turned round
        await sleep(400);
      } else {
        await hold(["ArrowDown", "ArrowLeft", "ArrowUp"][round % 3], 1100);
        await sleep(600);
      }
      await hold(" ", 1400);
      await sleep(700);
      if (round === 1) {
        await page.keyboard.press("m");
        await sleep(200);
      }
      if (round === 2) {
        await page.click("#soundBtn");
        await sleep(200);
      }
    }
    // walk on to the last move (stays do not use up moves), with a stay now
    // and then; in 2D between 2 rooms only the arrows along the corridor walk
    var arrows = view === "3d" ? ["ArrowUp"] : ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"];
    for (var w = 0; w < 120 && !(await ui(page)).end; w++) {
      await hold(arrows[Math.floor(w / 2) % arrows.length], view === "3d" ? 1800 : 1500);
      if (view === "3d" && w % 2) {
        await hold("ArrowLeft", 500);
      }
      await sleep(300);
      if (w % 3 === 0) {
        await page.keyboard.press(" ");
        await sleep(300);
      }
    }
    await sleep(800);
    var route = await page.evaluate(function () {
      var c = document.getElementById("route"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      var painted = 0;
      for (var i = 3; i < d.length; i += 4) {
        painted += d[i] > 0 ? 1 : 0;
      }
      return {w: c.width, painted: painted, shown: !document.getElementById("end").hidden};
    });
    await page.keyboard.press("Enter");
    await sleep(1500);
    expect(errors.length === 0, "hold " + view + ": page errors " + JSON.stringify(errors));
    expect(route.shown && route.painted > route.w * 20, "hold " + view + ": the route map is drawn " + JSON.stringify(route));
    var names = gameFiles(files);
    expect(names.length === 1, "hold " + view + ": 1 file");
    names.forEach(function (n) {
      var g = checkGameFile(n, files[n]);
      var held = g.steps.filter(function (st) { return st.held; });
      var heldStays = held.filter(function (st) { return st.move === "STAY"; });
      expect(held.length >= 6 && heldStays.length >= 3, "hold " + view + ": held steps " + held.length + ", held stays " + heldStays.length);
      expect(g.sound.toggles.length === 2 && g.sound.toggles[0].by === "M" && g.sound.toggles[1].by === "button" &&
        g.sound.toggles[0].on === false && g.sound.toggles[1].on === true, "hold " + view + ": sound toggles " + JSON.stringify(g.sound.toggles));
      var reps = files[n].keys.filter(function (k) { return k.type === "down" && k.repeats > 0; });
      expect(reps.length > 0, "hold " + view + ": repeats counted on the presses");
      if (view === "3d") {
        expect(g.turns.some(function (tr) { return tr.continued; }) || g.turns.some(function (tr) { return tr.split; }) ||
          g.turns.length > 3, "hold 3d: turns while walking");
      }
      report.push("hold " + view + " " + maze + ": " + (g.steps.length - 1) + " steps, " + held.length + " held, " +
        g.turns.length + " turns");
    });
    save("hold_" + view, files);
    await ctx.close();
  }
  if (want("hold")) {
  await holdGame("2d", "corridors_7x7", "?test=1&condition=linear_fast&set.steps=20&set.stomach.at_zero=continue");
  await holdGame("3d", "holes_6x6", "?test=1&condition=linear_fast&set.steps=14&set.stomach.at_zero=continue");
  }

  if (want("environments")) {
  // 3c. the environments of the model in both views, starting anywhere
  var env3 = await session("environments_any_start", "?test=1&set.steps=25", [
    {view: "3d", maze: "corridors_7x7"}, {view: "2d", maze: "holes_6x6"}, {view: "3d", maze: "ring_5x5"}
  ], {seed: 23});
  var en3 = gameFiles(env3.files);
  expect(en3.length === 3, "environments_any_start: 3 files");
  en3.forEach(function (n) {
    var g = checkGameFile(n, env3.files[n]);
    var envOf = globalThis.FG.MAZES[g.maze].environment;
    expect(envOf && g.food_kinds.patch === "cheese" && g.food_kinds.small === "bread", n + ": cheese and bread");
  });
  save("environments", env3.files);
  await env3.context.close();

  }
  if (want("no_condition")) {
  // 4. DataPipe hands out no condition: one is picked at random
  var d = await session("no_condition", "?set.steps=5&set.track_ms=0", [{view: "2d", maze: "grid_4x4"}], {seed: 14, mode: "no condition"});
  var dn = gameFiles(d.files);
  expect(dn.length === 1 && d.files[dn[0]].condition.how === "random", "no_condition: a random condition");
  dn.forEach(function (n) { checkGameFile(n, d.files[n]); });
  await d.context.close();

  }
  if (want("count_all")) {
  // 4b. every step uses up the steps, as in the model
  var ca = await session("count_all", "?test=1&condition=linear_fast&set.steps=20&set.count_steps=all",
    [{view: "3d", maze: "grid_4x4"}], {seed: 24, stay: 0.4});
  var can = gameFiles(ca.files);
  expect(can.length === 1, "count_all: 1 file");
  can.forEach(function (n) {
    var g = checkGameFile(n, ca.files[n]);
    expect(g.ended.how === "starved" || (g.ended.step === 20 && g.ended.moves < 20),
      "count_all: ended at step " + g.ended.step + " with " + g.ended.moves + " moves");
  });
  save("count_all", ca.files);
  await ca.context.close();

  }
  if (want("down")) {
  // 5. DataPipe down for a game, then the next visit sends it
  var mode = {value: "down"};
  var ef = {};
  var e = await session("down", "?condition=linear_fast&set.steps=6", [{view: "3d", maze: "grid_4x4"}],
    {seed: 15, modeRef: mode, files: ef});
  expect(Object.keys(ef).length === 0, "down: nothing arrived while down");
  expect(/could not be sent/.test(e.status), "down: not-saved message, got " + e.status);
  mode.value = "ok";
  await e.page.goto(base + "?condition=linear_fast");
  await sleep(2000);
  var en = gameFiles(ef);
  expect(en.length === 1, "down: the game arrived on the next visit (" + Object.keys(ef).join(" ") + ")");
  en.forEach(function (n) { checkGameFile(n, ef[n]); });
  save("down", ef);
  await e.context.close();

  }
  if (want("closed")) {
  // 6. the tab closed in the middle of a game: the partial game arrives
  var ff = {};
  var f = await session("closed", "?condition=linear_fast&set.steps=40&set.stomach.at_zero=continue", [
    {view: "2d", maze: "grid_4x4"}, {view: "3d", maze: "grid_6x6", stopAfter: 25}
  ], {seed: 16, files: ff});
  await f.page.close({runBeforeUnload: true});
  var again = await f.context.newPage();
  await pipe(again, ff, {value: "ok"}, 0);
  await again.goto(base + "?condition=linear_fast");
  await sleep(2500);
  var parts = Object.keys(ff).filter(function (n) { return /_2\.partial\.json$/.test(n); });
  expect(gameFiles(ff).length === 1 && parts.length === 1, "closed: game 1 whole and game 2 partial (" + Object.keys(ff).join(" ") + ")");
  parts.forEach(function (n) {
    var g = checkGameFile(n, ff[n]);
    expect(g.ended.how === "page closed" && g.view === "3d", "closed: " + n + " ended " + g.ended.how);
  });
  gameFiles(ff).forEach(function (n) { checkGameFile(n, ff[n]); });
  save("closed", ff);
  await f.context.close();

  }
  if (want("metadata")) {
  // 7. Psych-DS metadata on: DataPipe answers METADATA_ERROR but keeps the
  // file; the game takes it as kept and does not send it again
  var mlog = [];
  var m = await session("metadata", "?condition=linear_fast&set.steps=5", [{view: "2d", maze: "grid_4x4"}],
    {seed: 17, mode: "metadata", log: mlog});
  await sleep(35000);
  var mn = gameFiles(m.files);
  expect(mn.length === 1 && mlog.filter(function (x) { return x === mn[0]; }).length === 1,
    "metadata: the file sent once (" + JSON.stringify(mlog) + ")");
  expect(/saved/.test(m.status), "metadata: saved message, got " + m.status);
  await m.context.close();

  }
  if (want("refused")) {
  // 8. DataPipe refuses every file: sent once a visit, given up after 3 refusals
  var rlog = [], rfiles = {}, rmode = {value: "refuse"};
  var rf = await session("refused", "?condition=linear_fast&set.steps=5", [{view: "2d", maze: "grid_4x4"}],
    {seed: 18, modeRef: rmode, log: rlog, files: rfiles});
  await sleep(35000);
  var once = rlog.length;
  expect(once === 1, "refused: 1 request on the first visit in 35 s, got " + once + " " + JSON.stringify(rlog));
  for (var visit = 0; visit < 3; visit++) {
    await rf.page.goto(base + "?condition=linear_fast");
    await sleep(1500);
  }
  var left = await rf.page.evaluate(function () {
    var k = Object.keys(localStorage).filter(function (x) { return /:queue$/.test(x); })[0];
    return k ? Object.keys(JSON.parse(localStorage.getItem(k))).length : 0;
  });
  expect(rlog.length === 3 && left === 0, "refused: 3 requests in all, then given up (" + rlog.length + " requests, " + left + " left)");
  await rf.context.close();

  }
  if (want("old_queue")) {
  // 9. a file queued by the first version, without trial_type: sent with it
  var olog = [], ofiles = {};
  var octx = await browser.newContext();
  await octx.addInitScript(function (id) {
    var key = "foraging-game:" + id + ":/:queue";
    if (!localStorage.getItem("old-queued")) {
      var old = {format: "foraging-game", format_version: 1, file: "game", player: "P7", session_id: "0123456789ab",
        game: {steps: []}};
      var q = {};
      q["P7_0123456789ab_1-practice.json"] = {experimentID: id, text: JSON.stringify(old)};
      localStorage.setItem(key, JSON.stringify(q));
      localStorage.setItem("old-queued", "1");
    }
  }, SETTINGS.datapipe.experiment_id);
  var op = await octx.newPage();
  await pipe(op, ofiles, {value: "ok"}, 0, olog);
  await op.goto(base + "?condition=linear_fast");
  await sleep(2500);
  var oldFile = ofiles["P7_0123456789ab_1-practice.json"];
  expect(oldFile && oldFile.trial_type === "foraging-game" && oldFile.player === "P7",
    "old queue: the old file arrived with trial_type (" + JSON.stringify(olog) + ")");
  await octx.close();

  }
  if (want("file")) {
  // 10. opened from a file, nothing sent
  var ctx = await browser.newContext();
  var fp = await ctx.newPage();
  var ferr = [];
  fp.on("pageerror", function (err) { ferr.push(String(err)); });
  await fp.goto("file://" + path.join(ROOT, "index.html") + "?send=0&condition=linear_fast");
  await sleep(1800);
  var fs1 = await ui(fp);
  expect(fs1.menu && fs1.ready && ferr.length === 0, "file://: the first page, ready, no errors " + JSON.stringify(ferr));
  await ctx.close();

  }
  await browser.close();
  server.close();
  report.forEach(function (r) { console.log(r); });
  console.log(problems.length ? problems.length + " problems:" : "no problems");
  problemKinds();
  problems.slice(0, 40).forEach(function (p) { console.log("  " + p); });
  process.exit(problems.length ? 1 : 0);
})().catch(function (err) {
  console.error(err);
  process.exit(2);
});
