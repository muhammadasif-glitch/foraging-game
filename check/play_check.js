/* Plays whole sessions in a real browser (Playwright with Chromium) and
 * checks every file the game sends. DataPipe is stood in for: the requests
 * are caught in the browser and answered here, so nothing leaves this
 * machine. The game files are written to a folder for check/data_check.py.
 *
 *   node check/play_check.js <out folder> [--playwright <path to playwright>]
 *
 * Scenarios: a full session with the condition from DataPipe; one where
 * energy stays at 0, so that every game runs all its steps; one with
 * random refill on a 6 x 6 maze, set in the link; a player who runs out of
 * energy; DataPipe that cannot hand out a condition; DataPipe down, then the
 * files sent on the next visit; a tab closed in the middle of a game, then
 * the partial game sent; the page opened from a file (file://); a player who
 * says no to the consent.
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

require(path.join(ROOT, "js", "mazes.js"));
require(path.join(ROOT, "js", "rules.js"));
var R = globalThis.FG.rules;

var problems = [];
function expect(ok, what) {
  if (!ok) {
    problems.push(what);
  }
  return ok;
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

/* DataPipe as the test wants it: mode "ok", "down" or "no condition". */
function pipe(page, store, mode, condition) {
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
    if (store[body.filename]) {
      return route.fulfill({status: 400, contentType: "application/json",
        body: JSON.stringify({error: "FILE_EXISTS", message: "exists"})});
    }
    store[body.filename] = JSON.parse(body.data);
    return route.fulfill({status: 201, contentType: "application/json", body: JSON.stringify({message: "Success"})});
  });
}

function ui(page) {
  return page.evaluate(function () {
    function vis(id) {
      var e = document.getElementById(id);
      return !!e && !e.hidden;
    }
    return {
      text: vis("text-screen"), game: vis("game-screen"), message: vis("game-message"),
      input: vis("text-input"), prompt: (document.getElementById("game-prompt") || {}).textContent || "",
      textPrompt: (document.getElementById("text-prompt") || {}).textContent || "",
      body: (document.getElementById("text-body") || {}).textContent || "",
      status: (document.getElementById("text-status") || {}).textContent || "",
      food: vis("food-block"),
      phase: window.FG && window.FG.recorder ? window.FG.recorder.phase : ""
    };
  });
}

function sleep(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

/* Plays until the thank-you page (or until stopAfterSteps steps of game
 * stopGame, to close the tab there). rnd: a seeded random function. */
async function playSession(page, rnd, opts) {
  opts = opts || {};
  var steps = 0, games = 0, inGame = 0, lastOver = "";
  var keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", " ", " "];
  for (var guard = 0; guard < 20000; guard++) {
    var s = await ui(page);
    if (opts.stopAt === "end question" && s.text && s.input && /how did you play/i.test(s.textPrompt)) {
      return {steps: steps, games: games, done: false};
    }
    if (opts.stopAt === s.phase && s.game && /Where were/.test(s.prompt)) {
      return {steps: steps, games: games, done: false};
    }
    if (opts.stopAt === "game over " + s.phase.replace("game ", "") && /^game /.test(s.phase) && s.game && s.message) {
      await sleep(500);
      return {steps: steps, games: games, done: false};
    }
    if (s.text && /Thank you/.test(s.body)) {
      return {steps: steps, games: games, done: true};
    }
    if (s.text && /consent|agree/i.test(s.textPrompt)) {
      await page.keyboard.press(opts.decline ? "n" : "y");
      if (opts.decline) {
        await sleep(200);
        return {declined: true};
      }
    } else if (s.text && s.input && /player code/.test(s.textPrompt)) {
      opts.typed = opts.code || "P" + Math.floor(rnd() * 1000);
      await page.keyboard.type(opts.typed);
      await page.keyboard.press("Enter");
    } else if (s.text && /Page \d+ of \d+/.test(s.textPrompt)) {
      var last = /start the practice/.test(s.textPrompt);
      if (last) {
        await page.keyboard.press(" ");
      } else {
        await page.keyboard.press(rnd() < 0.2 && !/Page 1 /.test(s.textPrompt) ? "ArrowLeft" : "ArrowRight");
      }
    } else if (s.text && /is over/.test(s.body)) {
      await sleep(1100 + Math.floor(rnd() * 300));
      await page.keyboard.press(" ");
    } else if (s.text && s.input && /how did you play/i.test(s.textPrompt)) {
      await sleep(600);
      await page.keyboard.type("I went to the big room and stayed, test " + Math.floor(rnd() * 100));
      await page.keyboard.press("Backspace");
      await page.keyboard.press("Enter");
    } else if (s.game && s.message) {
      if (s.phase !== lastOver) {
        games += 1;
        lastOver = s.phase;
      }
      inGame = 0;
      await sleep(450);
      await page.keyboard.press(" ");
    } else if (s.game && /Where were/.test(s.prompt)) {
      await sleep(700);
      var n = Math.floor(rnd() * 8);
      for (var i = 0; i < n; i++) {
        var k = rnd() < 0.3 ? "Enter" : keys[Math.floor(rnd() * 4)];
        await page.keyboard.press(k);
        await sleep(10);
      }
      await sleep(1000);
      await page.keyboard.press(" ");
    } else if (s.game && /How full/.test(s.prompt)) {
      await sleep(350);
      await page.keyboard.press(String(Math.floor(rnd() * 10)));
    } else if (s.game) {
      if (opts.stopGame && s.phase === "game " + opts.stopGame && inGame >= opts.stopAfterSteps) {
        return {steps: steps, games: games, done: false};
      }
      var key = rnd() < 0.03 ? "x" : keys[Math.floor(rnd() * keys.length)];
      if (opts.towards && rnd() < 0.7) {
        key = opts.towards[Math.floor(rnd() * opts.towards.length)];
      } else if (s.food && rnd() < (opts.stay || 0.85)) {
        key = " ";
      }
      await page.keyboard.press(key);
      steps += 1;
      inGame += 1;
      // sometimes faster than a frame, to meet the "busy" case
      await sleep(rnd() < 0.1 ? 0 : 18 + Math.floor(rnd() * 25));
      continue;
    }
    await sleep(40);
  }
  return {steps: steps, games: games, done: false};
}

function seeded(seed) {
  return function () {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}

function roomOf(text) {
  return [Number(text[1]), Number(text[2])];
}

/* Every game file: the steps against the rules, the layout, the keys. */
function checkGameFile(name, f, expectSessionLength) {
  var g = f.game;
  var where = name;
  expect(f.format === "foraging-game" && f.format_version === 1, where + ": format");
  expect(typeof f.player === "string" && f.player.length > 0, where + ": player");
  expect(/^[0-9a-f]{12}$/.test(f.session_id), where + ": session id");
  expect(f.condition && typeof f.condition.how === "string", where + ": condition");
  expect(f.browser && f.browser.user_agent && f.browser.refresh_hz > 0, where + ": browser");
  var s = g.settings;
  var steps = g.steps;
  var partial = /partial/.test(name);
  expect(g.ended && typeof g.ended.how === "string", where + ": ended " + JSON.stringify(g.ended));
  if (!partial) {
    expect(g.ended && steps.length === g.ended.step + 1, where + ": steps " + steps.length + " vs ended at " + (g.ended && g.ended.step));
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
  var found = {};
  for (var t = 1; t < steps.length; t++) {
    var st = steps[t];
    expect(st.step === t, where + ": step number " + t);
    expect(maze.legal(room).indexOf(st.move) >= 0, where + " step " + t + ": move " + st.move + " not open");
    expect(st.legal.join() === maze.legal(room).join(), where + " step " + t + ": legal");
    var to = maze.next(room, st.move);
    world.advance(to);
    var paid = world.paid();
    var e = stomach.step(!R.sameRoom(to, room), paid);
    room = to;
    expect(st.room === R.roomName(room) && st.room_to === st.room, where + " step " + t + ": room");
    expect(st.paid === paid, where + " step " + t + ": paid " + st.paid + " vs " + paid);
    expect(st.energy === e.energy, where + " step " + t + ": energy " + st.energy + " vs " + e.energy);
    Object.keys(world.level).forEach(function (n) {
      expect(st.levels[n] === world.level[n], where + " step " + t + ": level " + n);
    });
    var n = world.nameAt(room);
    expect(st.in_food_room === n, where + " step " + t + ": in food room");
    expect((n === null) === (st.seen === null), where + " step " + t + ": seen");
    if (n !== null && !found[n]) {
      found[n] = true;
      expect(st.found === n, where + " step " + t + ": found " + n);
    } else {
      expect(st.found === null, where + " step " + t + ": found twice");
    }
    expect(typeof st.decision_ms === "number" && st.decision_ms >= 0 && st.decision_ms < 600000,
      where + " step " + t + ": decision " + st.decision_ms);
    expect(st.key_at >= st.shown_at, where + " step " + t + ": key before shown");
  }
  expect(g.draws.length === steps.length - 1, where + ": draws " + g.draws.length);
  // the model's form of the game
  expect(g.result || partial, where + ": result");
  if (g.result) {
    expect(g.result.rows.length === steps.length, where + ": result rows");
    expect(g.result.settings.world.eat_per_step === g.speeds.eat, where + ": result speeds");
  }
  // keys of this game
  var downs = f.keys.filter(function (k) { return k.type === "down" && k.phase === "game " + g.number; });
  var moves = downs.filter(function (k) { return k.outcome === "move" || k.outcome === "stay"; });
  expect(moves.length === steps.length - 1, where + ": " + moves.length + " move keys for " + (steps.length - 1) + " steps");
  expect(f.keys.every(function (k) { return typeof k.t === "number"; }), where + ": key times");
  if (!partial && s.memory_test) {
    expect(g.memory_test && g.memory_test.truth && Array.isArray(g.memory_test.marked), where + ": memory test");
    expect(g.memory_test.levels.length === g.memory_test.marked.length &&
      g.memory_test.levels.every(function (a) { return a.answer >= 0 && a.answer <= 9; }), where + ": memory answers");
  }
  return g;
}

function checkSession(label, files, settingsSession) {
  var names = Object.keys(files).sort();
  var games = names.filter(function (n) { return /_\d+-[a-z]+\.json$/.test(n); });
  names.filter(function (n) { return /partial\.json$/.test(n) && !/end\.partial/.test(n); }).forEach(function (n) {
    checkGameFile(label + " " + n, files[n]);
  });
  var end = names.filter(function (n) { return /_end\.json$/.test(n); });
  expect(games.length === settingsSession.length, label + ": " + games.length + " game files");
  expect(end.length === 1, label + ": end file");
  var byNumber = {};
  games.forEach(function (n) {
    var g = checkGameFile(label + " " + n, files[n]);
    byNumber[g.number] = g;
  });
  settingsSession.forEach(function (plan, i) {
    var g = byNumber[i + 1];
    if (!g) {
      return;
    }
    expect(g.kind === plan.kind, label + " game " + (i + 1) + ": kind");
    if (plan.layout) {
      expect(g.layout.start_room === plan.layout.start_room, label + " game " + (i + 1) + ": fixed start");
      Object.keys(plan.layout.food_rooms).forEach(function (n) {
        expect(g.layout.food_rooms[n] === plan.layout.food_rooms[n], label + " game " + (i + 1) + ": fixed " + n);
      });
    }
    if (plan.kind === "repeat") {
      var o = byNumber[plan.of];
      expect(JSON.stringify(o.layout) === JSON.stringify(g.layout) && o.seed === g.seed,
        label + " game " + (i + 1) + ": repeats game " + plan.of);
    }
    if (plan.kind === "shared") {
      expect(g.seed === plan.seed, label + " game " + (i + 1) + ": shared seed");
    }
    if (plan.kind === "new") {
      var fr = Object.values(g.layout.food_rooms);
      expect(fr.indexOf(g.layout.start_room) < 0 && new Set(fr).size === fr.length,
        label + " game " + (i + 1) + ": random layout");
      var st = roomOf(g.layout.start_room);
      expect(st[0] < 4 && st[1] < 4, label + " game " + (i + 1) + ": start area");
    }
  });
  if (end.length) {
    var e = files[end[0]];
    expect(e.session && e.session.end_question && typeof e.session.end_question.text === "string", label + ": end question");
    expect(e.session.consent.agreed === true, label + ": consent");
    expect(e.session.instructions.length >= FG_SETTINGS_PAGES(), label + ": instruction visits");
    expect(e.session.games.length === settingsSession.length, label + ": games listed");
    var phases = e.keys.map(function (k) { return k.phase; });
    expect(phases.every(function (p) { return !/^(game|memory) /.test(p); }), label + ": end keys hold no game keys");
  }
  return names;
}

var SETTINGS = null;
function FG_SETTINGS_PAGES() {
  return SETTINGS.texts.instructions.length;
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
  require(path.join(ROOT, "settings.js"));
  SETTINGS = globalThis.FG.SETTINGS;
  var server = await serve();
  var base = "http://localhost:" + server.address().port + "/index.html";
  var browser = await chromium.launch(fs.existsSync("/opt/pw-browsers/chromium") ? {executablePath: "/opt/pw-browsers/chromium"} : {});
  var report = [];

  async function session(label, query, opts) {
    var context = await browser.newContext({viewport: {width: 1200, height: 800}});
    var page = await context.newPage();
    var errors = [];
    page.on("pageerror", function (e) { errors.push(String(e)); });
    page.on("console", function (m) {
      if (m.type() === "error" && !/Failed to load resource/.test(m.text())) {
        errors.push(m.text());
      }
    });
    var files = {};
    var mode = {value: opts.mode || "ok"};
    if (opts.init) {
      await page.addInitScript(opts.init);
    }
    await pipe(page, files, mode, opts.condition || 0);
    await page.goto(base + query);
    var t0 = Date.now();
    var r = await playSession(page, seeded(opts.seed || 1), opts);
    var status = (await ui(page)).status;
    for (var w = 0; r.done && /aving/.test(status) && w < 120; w++) {
      await sleep(500);
      status = (await ui(page)).status;
    }
    report.push(label + ": " + (r.steps || 0) + " keys in game, " + (r.games || 0) + " games, " +
      Object.keys(files).length + " files, " + Math.round((Date.now() - t0) / 1000) + " s" + (status ? " (" + status + ")" : ""));
    expect(errors.length === 0, label + ": page errors " + JSON.stringify(errors));
    return {context: context, page: page, files: files, mode: mode, result: r, status: status};
  }

  // 1. a full session; DataPipe hands out condition 1
  var aOpts = {seed: 11, condition: 1};
  var a = await session("full", "?test=1", aOpts);
  checkSession("full", a.files, SETTINGS.session);
  Object.keys(a.files).forEach(function (k) {
    expect(a.files[k].player === aOpts.typed, "full: player code " + a.files[k].player + " is what was typed, " + aOpts.typed);
  });
  var endText = a.files[Object.keys(a.files).filter(function (k) { return /_end\.json$/.test(k); })[0]].session.end_question.text;
  expect(/^I went to the big room/.test(endText), "full: end answer as typed: " + JSON.stringify(endText));
  var first = a.files[Object.keys(a.files)[0]];
  expect(first.condition.name === Object.keys(SETTINGS.conditions)[1] && first.condition.how === "datapipe", "full: condition 1 from DataPipe");
  expect(Object.keys(a.files).every(function (n) { return n.indexOf("TEST_") === 0; }), "full: TEST_ names");
  expect(/saved/.test(a.status), "full: saved message");
  save("full", a.files);
  await a.context.close();

  // 1b. energy stays at 0, so that every game runs its full steps
  var a2 = await session("full_length", "?condition=linear_fast&set.stomach.at_zero=continue", {seed: 12});
  checkSession("full_length", a2.files, SETTINGS.session);
  Object.keys(a2.files).filter(function (k) { return /_\d+-[a-z]+\.json$/.test(k); }).forEach(function (k) {
    var g = a2.files[k].game;
    expect(g.ended.how === "finished" && g.steps.length === g.settings.steps + 1, "full_length: " + k + " ran all its steps");
  });
  save("full_length", a2.files);
  await a2.context.close();

  // 2. random refill on 6 x 6, set in the link
  var b = await session("refill_6x6", "?condition=linear_fast&set.maze=grid_6x6&set.food.random_refill=true&set.food.refill_chance=0.4",
    {seed: 22});
  checkSession("refill_6x6", b.files, SETTINGS.session);
  var g6 = b.files[Object.keys(b.files).filter(function (n) { return /3-new/.test(n); })[0]].game;
  expect(g6.layout.maze === "grid_6x6" && g6.settings.food.random_refill === true, "refill_6x6: settings from the link");
  expect(g6.steps.some(function (s) { return s.events.some(function (e) { return e.type === "refill skipped"; }); }), "refill_6x6: skipped refills");
  save("refill_6x6", b.files);
  await b.context.close();

  // 3. running out of energy
  var c = await session("starve", "?condition=linear_fast&set.stomach.start=3&set.stomach.move_cost=1",
    {seed: 33, towards: ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]});
  var cg = Object.keys(c.files).filter(function (n) { return /_\d+-[a-z]+\.json$/.test(n); }).map(function (n) { return c.files[n].game; });
  expect(cg.some(function (g) { return g.ended.how === "starved"; }), "starve: a game ended starved");
  checkSession("starve", c.files, SETTINGS.session);
  save("starve", c.files);
  await c.context.close();

  // 4. DataPipe cannot hand out a condition
  var d = await session("no_condition", "", {seed: 44, mode: "no condition"});
  var dfirst = d.files[Object.keys(d.files)[0]];
  expect(dfirst.condition.how === "random" && /CONDITION_ASSIGNMENT_NOT_ACTIVE/.test(dfirst.condition.error), "no_condition: random, error kept");
  checkSession("no_condition", d.files, SETTINGS.session);
  await d.context.close();

  // 5. DataPipe down for the whole session, then the next visit sends it all
  var e = await session("down", "?condition=exponential_slow", {seed: 55, mode: "down"});
  expect(Object.keys(e.files).length === 0, "down: nothing arrived");
  expect(/could not be sent/.test(e.status), "down: not-saved message");
  var kept = await e.page.evaluate(function () {
    var k = Object.keys(localStorage).filter(function (x) { return /:queue$/.test(x); })[0];
    return k ? Object.keys(JSON.parse(localStorage.getItem(k))).length : 0;
  });
  expect(kept === SETTINGS.session.length + 1, "down: " + kept + " files kept in the browser");
  e.mode.value = "ok";
  await e.page.goto(base + "?condition=exponential_slow");
  await sleep(1500);
  expect(Object.keys(e.files).length === SETTINGS.session.length + 1, "down: " + Object.keys(e.files).length + " files sent on the next visit");
  checkSession("down", e.files, SETTINGS.session);
  await e.context.close();

  // 6. the tab closed in game 3, after 25 steps; the next visit sends the partial game
  var f = await session("closed", "?condition=linear_fast&set.stomach.at_zero=continue", {seed: 66, stopGame: 3, stopAfterSteps: 25});
  var context = f.context;
  await f.page.close({runBeforeUnload: true});
  await sleep(500);
  var page2 = await context.newPage();
  await pipe(page2, f.files, f.mode, 0);
  await sleep(600);
  await page2.goto(base + "?condition=linear_fast");
  await sleep(1500);
  var partial = Object.keys(f.files).filter(function (n) { return /3-new\.partial\.json$/.test(n); });
  expect(partial.length === 1, "closed: " + partial.length + " partial files of game 3");
  expect(Object.keys(f.files).some(function (n) { return /end\.partial\.json$/.test(n); }), "closed: the session so far (end.partial)");
  if (partial.length) {
    var pg = checkGameFile("closed " + partial[0], f.files[partial[0]]);
    expect(pg.number === 3 && pg.steps.length > 5, "closed: partial game 3 with its steps (" + pg.steps.length + ")");
    expect(pg.ended.how === "page closed", "closed: ended " + JSON.stringify(pg.ended));
    save("closed", f.files);
  }
  report.push("closed: " + Object.keys(f.files).length + " files after the next visit");
  await context.close();

  // 6b. closed during the memory test of game 2: the finished game arrives
  var m = await session("closed_memory", "?condition=linear_fast&set.stomach.at_zero=continue&set.steps=8",
    {seed: 67, stopAt: "memory 2"});
  await m.page.close({runBeforeUnload: true});
  await sleep(500);
  var mp = await m.context.newPage();
  await pipe(mp, m.files, m.mode, 0);
  await mp.goto(base + "?condition=linear_fast");
  await sleep(1500);
  var mpart = Object.keys(m.files).filter(function (n) { return /2-shared\.partial\.json$/.test(n); });
  expect(mpart.length === 1, "closed_memory: the game of the memory test arrived (" + Object.keys(m.files).join(" ") + ")");
  if (mpart.length) {
    var mg = m.files[mpart[0]].game;
    expect(mg.ended.how === "finished" && mg.steps.length === 9, "closed_memory: the whole game, " + JSON.stringify(mg.ended));
  }
  await m.context.close();

  // 6c. closed during the end question: the session arrives as end.partial
  var q = await session("closed_end", "?condition=linear_fast&set.steps=4&set.stomach.at_zero=continue",
    {seed: 68, stopAt: "end question"});
  await q.page.close({runBeforeUnload: true});
  await sleep(500);
  var qp = await q.context.newPage();
  await pipe(qp, q.files, q.mode, 0);
  await qp.goto(base + "?condition=linear_fast");
  await sleep(1500);
  var qend = Object.keys(q.files).filter(function (n) { return /end\.partial\.json$/.test(n); });
  expect(qend.length === 1 && q.files[qend[0]].session.games.length === SETTINGS.session.length,
    "closed_end: the session so far arrived with its " + SETTINGS.session.length + " games");
  await q.context.close();

  // 6d. Space tapped fast for 5 s after a game: the memory test is not skipped
  var r = await session("fast_space", "?condition=linear_fast&set.steps=5&set.stomach.at_zero=continue",
    {seed: 69, stopAt: "game over 2"});
  for (var tap = 0; tap < 40; tap++) {
    await r.page.keyboard.press(" ");
    await sleep(120);
  }
  var rs = await ui(r.page);
  expect(r.page && /Where were/.test(rs.prompt), "fast_space: the memory test is still there after 5 s of quick taps (" + rs.prompt + ")");
  await r.context.close();

  // 6e. the browser's storage full and DataPipe down: the player is asked to keep the page open
  var u = await session("storage_full", "?condition=linear_fast&set.steps=3", {seed: 70, mode: "down",
    init: function () {
      Storage.prototype.setItem = function () { throw new DOMException("full", "QuotaExceededError"); };
    }});
  expect(/keep this page open/.test(u.status), "storage_full: " + u.status);
  await u.context.close();

  // 7. opened from a file, nothing sent
  var ctx = await browser.newContext();
  var fp = await ctx.newPage();
  var ferr = [];
  fp.on("pageerror", function (err) { ferr.push(String(err)); });
  await fp.goto("file://" + path.join(ROOT, "index.html") + "?send=0");
  await sleep(500);
  var fs1 = await ui(fp);
  expect(/agree/i.test(fs1.textPrompt) && ferr.length === 0, "file://: the consent page, no errors " + JSON.stringify(ferr));
  await ctx.close();

  // 8. no consent: nothing recorded or sent
  var h = await session("declined", "", {decline: true});
  expect(Object.keys(h.files).length === 0, "declined: nothing sent");
  await h.context.close();

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
