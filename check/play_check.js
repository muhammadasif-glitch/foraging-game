/* Plays the game in a real browser (Playwright with Chromium), in the 2D and
 * the 3D view, and checks every file the game sends. DataPipe is stood in
 * for: the requests are caught in the browser and answered here, nothing
 * leaves this machine. The stand-in validates as DataPipe does with the
 * required fields trial_type, player and session_id: a file without them at
 * its top is refused with INVALID_DATA. The game files are written to a
 * folder for check/data_check.py.
 *
 *   node check/play_check.js <out folder> [--playwright <path to playwright>]
 *
 * Scenarios: 3 games in a row (2D 4 x 4, 3D 6 x 6, 2D two 4 x 4) with the
 * condition from DataPipe; a 3D game played to its last step with turns;
 * running out of energy; keys pressed while the view moves; DataPipe that
 * cannot hand out a condition; DataPipe down, then the file sent on the next
 * visit; a tab closed in the middle of a game, then the partial game sent;
 * the page opened from a file.
 */
"use strict";
var fs = require("fs");
var path = require("path");
var http = require("http");

var ROOT = path.join(__dirname, "..");
var args = process.argv.slice(2);
var OUT = args[0];
var pwPath = args.indexOf("--playwright") >= 0 ? args[args.indexOf("--playwright") + 1] : "playwright";
var chromium = require(pwPath).chromium;

globalThis.window = globalThis;
require(path.join(ROOT, "js", "mazes.js"));
require(path.join(ROOT, "js", "rules.js"));
require(path.join(ROOT, "settings.js"));
var R = globalThis.FG.rules;
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
      await page.keyboard.press(k);
      keys += 1;
      inGame += 1;
      if (opts.fast && rnd() < 0.3) {
        // while the view still moves: these keys must be ignored as busy
        await sleep(10);
        await page.keyboard.press(gp.view === "3d" ? "ArrowUp" : "ArrowRight");
        keys += 1;
      }
      var moving = k !== " " && k !== "x";
      await sleep(gp.view === "3d" ? (moving ? 1050 : 260) + Math.floor(rnd() * 120) :
        (moving ? 330 : 120) + Math.floor(rnd() * 80));
    }
    games += 1;
    await sleep(550);
    await page.keyboard.press("Enter");
    await sleep(200);
  }
  return {keys: keys, games: games};
}

function roomOf(text) {
  return [Number(text[1]), Number(text[2])];
}

/* A game file: the header, the steps against the rules and the map rule,
 * the moves against the keys and the view. */
function checkGameFile(name, f) {
  var where = name;
  var g = f.game;
  expect(f.format === "foraging-game" && f.format_version === 2, where + ": format");
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
  if (!partial) {
    expect(steps.length === g.ended.step + 1, where + ": steps " + steps.length + " vs ended at " + g.ended.step);
    expect(g.ended.how === "finished" ? g.ended.step === s.steps : g.ended.how === "starved", where + ": end " + g.ended.how);
  }
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
    expect(maze.legal(room).indexOf(st.move) >= 0, where + " step " + t + ": move " + st.move + " not open");
    expect(st.legal.join() === maze.legal(room).join(), where + " step " + t + ": legal");
    if (g.view === "3d") {
      // the up arrow moves the way the player faces, Space stays; turns in between
      expect(st.key === "Space" ? st.move === "STAY" : st.key === "ArrowUp" && st.move === st.facing_before,
        where + " step " + t + ": 3D key " + st.key + " facing " + st.facing_before + " gave " + st.move);
      var turned = g.turns.filter(function (tr) { return tr.step === t - 1; });
      expect(turned.length === st.turns_before, where + " step " + t + ": turns " + turned.length + " vs " + st.turns_before);
      var f2 = facing;
      turned.forEach(function (tr) {
        expect(tr.from === f2, where + " step " + t + ": a turn from " + tr.from + ", facing " + f2);
        f2 = tr.to;
      });
      expect(st.facing_before === f2 && st.facing === f2, where + " step " + t + ": facing " + st.facing_before + " vs " + f2);
      facing = st.facing;
    } else {
      var byKey = {ArrowLeft: "LEFT", ArrowRight: "RIGHT", ArrowUp: "UP", ArrowDown: "DOWN", Space: "STAY"};
      expect(byKey[st.key] === st.move, where + " step " + t + ": 2D key " + st.key + " gave " + st.move);
    }
    var to = maze.next(room, st.move);
    world.advance(to);
    var paid = world.paid();
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
    if (t < steps.length - 1 || !partial) {
      expect(typeof st.arrived_at === "number" && st.arrived_at >= st.key_at, where + " step " + t + ": arrived_at");
    }
  }
  expect(g.draws.length === steps.length - 1, where + ": draws " + g.draws.length);
  expect(g.result && g.result.rows.length === steps.length, where + ": result rows");
  var downs = f.keys.filter(function (k) { return k.type === "down" && k.phase === "game " + g.number; });
  var moves = downs.filter(function (k) { return k.outcome === "move" || k.outcome === "stay"; });
  expect(moves.length === steps.length - 1, where + ": " + moves.length + " move keys for " + (steps.length - 1) + " steps");
  var turnKeys = downs.filter(function (k) { return k.outcome === "turn"; });
  expect(turnKeys.length === (g.turns || []).length, where + ": " + turnKeys.length + " turn keys, " + (g.turns || []).length + " turns");
  expect(downs.every(function (k) { return k.outcome !== null; }), where + ": every game key has an outcome");
  return g;
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

(async function main() {
  fs.mkdirSync(OUT, {recursive: true});
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

  // 2. a 3D game to its last step, with turns; energy stays at 0
  var b = await session("full_3d", "?condition=exponential_slow&set.stomach.at_zero=continue", [
    {view: "3d", maze: "grid_two_4x4"}
  ], {seed: 12, stay: 0.4});
  var bn = gameFiles(b.files);
  expect(bn.length === 1, "full_3d: 1 file");
  bn.forEach(function (n) {
    var g = checkGameFile(n, b.files[n]);
    expect(g.ended.how === "finished" && g.steps.length === g.settings.steps + 1, "full_3d: all " + g.settings.steps + " steps");
    expect(g.turns.length > 10, "full_3d: turns recorded (" + g.turns.length + ")");
  });
  save("full_3d", b.files);
  await b.context.close();

  // 3. running out of energy, 2D, keys while the view moves
  var c = await session("starve_fast", "?condition=linear_fast&set.stomach.start=4", [
    {view: "2d", maze: "grid_6x6"}, {view: "3d", maze: "grid_4x4"}
  ], {seed: 13, stay: 0.05, fast: true});
  var cn = gameFiles(c.files);
  expect(cn.length === 2, "starve_fast: 2 files");
  cn.forEach(function (n) {
    var g = checkGameFile(n, c.files[n]);
    expect(g.ended.how === "starved", "starve_fast: " + n + " ended " + g.ended.how);
    var busy = c.files[n].keys.filter(function (k) { return k.type === "down" && k.outcome === "ignored: busy"; });
    expect(busy.length > 0, "starve_fast: " + n + " keys while moving were ignored (" + busy.length + ")");
  });
  save("starve_fast", c.files);
  await c.context.close();

  // 4. DataPipe hands out no condition: one is picked at random
  var d = await session("no_condition", "?set.steps=5", [{view: "2d", maze: "grid_4x4"}], {seed: 14, mode: "no condition"});
  var dn = gameFiles(d.files);
  expect(dn.length === 1 && d.files[dn[0]].condition.how === "random", "no_condition: a random condition");
  dn.forEach(function (n) { checkGameFile(n, d.files[n]); });
  await d.context.close();

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

  // 6. the tab closed in the middle of a game: the partial game arrives
  var ff = {};
  var f = await session("closed", "?condition=linear_fast&set.stomach.at_zero=continue", [
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

  await browser.close();
  server.close();
  report.forEach(function (r) { console.log(r); });
  console.log(problems.length ? problems.length + " problems:" : "no problems");
  problems.slice(0, 40).forEach(function (p) { console.log("  " + p); });
  process.exit(problems.length ? 1 : 0);
})().catch(function (err) {
  console.error(err);
  process.exit(2);
});
