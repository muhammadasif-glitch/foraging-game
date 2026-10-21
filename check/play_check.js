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
 * rooms; every step counted as in the model (count_steps all); a room
 * crossed at its corner; the maze editor and saving to GitHub (stood in
 * for), and a game in a saved maze; the sound
 * switched with M and with the button; DataPipe that cannot
 * hand out a condition; DataPipe down, then the file sent on the next visit;
 * a tab closed in the middle of a game, then the partial game sent; the page
 * opened from a file; the mouse with the camera behind it and through its
 * eyes (the camera never in or behind a wall), and the old arrow player; the
 * paintings (each game's hanging from its seed, looking, likes by L and by a
 * click on a plaque, L held to stand before a painting without holding up
 * the stays) and the music room (P and a click on the gramophone, in both
 * views, the music fading with the way away). Every game the bot plays
 * presses L and P now and then and clicks the view.
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
require(path.join(ROOT, "js", "mouse.js"));
require(path.join(ROOT, "js", "maze_tools.js"));
require(path.join(ROOT, "settings.js"));
require(path.join(ROOT, "js", "random.js"));
require(path.join(ROOT, "js", "config.js"));
require(path.join(ROOT, "js", "paintings.js"));
require(path.join(ROOT, "js", "art.js"));
require(path.join(ROOT, "js", "music.js"));
require(path.join(ROOT, "js", "gramophone.js"));
var R = globalThis.FG.rules;
var Wd = globalThis.FG.world;
var SETTINGS = globalThis.FG.SETTINGS;
var FACING = ["RIGHT", "DOWN", "LEFT", "UP"];

var problems = [];
var notes = [];                 // things worth knowing, not problems
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
        var type = p.endsWith(".js") ? "text/javascript" : p.endsWith(".css") ? "text/css" :
          p.endsWith(".jpg") ? "image/jpeg" : p.endsWith(".mp3") ? "audio/mpeg" : "text/html";
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

/* A view of the first page in 3D: 3d (through the eyes) or 3d_behind. */
function is3d(view) {
  return view === "3d" || view === "3d_behind";
}

/* The 3D camera of a game: as chosen on the first page (behind the mouse
 * only for the mouse), and behind the mouse never in a wall or with a wall
 * between it and the mouse, at any place of the track. */
function checkCamera(where, f) {
  var g = f.game;
  if (g.view !== "3d") {
    expect(g.camera === null, where + ": no camera in 2D, got " + g.camera);
    return;
  }
  var behind = f.menu.view === "3d_behind" && g.settings.player === "mouse";
  expect(g.camera === (behind ? "behind" : "eyes"), where + ": camera " + g.camera);
  if (!behind || !g.track || !globalThis.FG.MAZES[g.maze]) {
    return;
  }
  var M = Wd.build(g.maze), bad = 0, faded = 0;
  g.track.rows.forEach(function (p) {
    var a = p[3] * Math.PI / 180, back = globalThis.FG.mouse.cameraBack(M, p[1], p[2], a);
    var cam = globalThis.FG.mouse.camera(p[1], p[2], a, back);
    for (var d = 0; d <= back + 1e-9; d += 0.02) {
      var tx = Math.floor(p[1] - Math.cos(a) * d), ty = Math.floor(p[2] - Math.sin(a) * d);
      if (tx < 0 || ty < 0 || tx >= M.W || ty >= M.H || M.kind[ty * M.W + tx] === Wd.WALL) {
        bad += 1;
        break;
      }
    }
    faded += cam.back < globalThis.FG.mouse.BACK - 0.5 ? 1 : 0;
  });
  expect(bad === 0, where + ": the camera behind the mouse in or behind a wall at " + bad + " of " +
    g.track.rows.length + " places");
  notes.push(where + ": camera behind the mouse, more than 0.5 tiles closer than usual at " + faded + " of " + g.track.rows.length +
    " places");
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
  // a maze of the team is chosen by the link (?maze=); the others by their number
  var known = mazes.indexOf(maze) >= 0;
  if (known) {
    await page.keyboard.press(String(mazes.indexOf(maze) + 1));
    await sleep(60);
  }
  s = await ui(page);
  var title = await page.evaluate(function () {
    var c = document.querySelector("#mazes .card.on .card-size");
    return c ? c.textContent : "";
  });
  expect(s.view === views.indexOf(view) && (known ? s.maze === mazes.indexOf(maze) :
    title.toLowerCase() === maze.replace(/_/g, " ")), "menu: chose " + view + " " + maze + " (" + title + ")");
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
      if (process.env.PLAY_DEBUG && guard % 40 === 0) {
        console.error("  play " + gp.view + " " + gp.maze + ": " + guard + " rounds, moves left " +
          await page.textContent("#steps") + ", energy " + await page.textContent("#energy") + ", " + s.phase +
          (s.message ? ", message: " + s.msg : ""));
        if (guard % 200 === 0 && guard) {
          await page.screenshot({path: path.join(OUT, "debug_" + gp.view + "_" + guard + ".png")});
        }
        if (s.message) {
          // the game stopped: what it kept of the game, for a look
          var kept = await page.evaluate(function () {
            var out = {};
            Object.keys(localStorage).forEach(function (k) { out[k] = localStorage.getItem(k); });
            return out;
          });
          fs.writeFileSync(path.join(OUT, "debug_kept.json"), JSON.stringify(kept));
          return {keys: keys, games: games, stopped: true};
        }
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
        await page.keyboard.press(is3d(gp.view) ? "ArrowUp" : "ArrowRight");
        await sleep(300);
        keys += 2;
        inGame += 1;
        continue;
      }
      var k;
      if (is3d(gp.view)) {
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
      if (!opts.noExtras) {
        var ex = rnd();
        if (ex < 0.05) {
          // a like (3D), the gramophone, or a click on the view: free, a step never waits for them
          await page.keyboard.press(ex < 0.025 ? "l" : "p");
          await sleep(40);
        } else if (ex < 0.07) {
          var vp = page.viewportSize();
          await page.mouse.click(Math.floor(vp.width * (0.3 + 0.4 * rnd())), Math.floor(vp.height * (0.25 + 0.4 * rnd())));
          await sleep(40);
        }
      }
      if (rnd() < (s.here ? 0.45 : 0.18)) {
        // stands still: a stay every second with no key held
        await sleep(1100 + Math.floor(rnd() * 2400));
        inGame += 1;
        continue;
      }
      var walking = k === "ArrowUp" || (is3d(gp.view) && k === "ArrowDown") ||
        (gp.view === "2d" && k !== " " && k !== "x");
      if (is3d(gp.view) && (k === "ArrowLeft" || k === "ArrowRight") && rnd() < 0.75) {
        // held, as a person turns to a door beside them (a tap turns a few degrees)
        await page.keyboard.down(k);
        await sleep(450 + Math.floor(rnd() * 350));
        await page.keyboard.up(k);
      } else if (walking) {
        // the player walks while the key is down: mostly a room or 2, now and
        // then a short way only, now and then on the slant (2D) or steering (3D)
        var r2 = rnd(), far = is3d(gp.view) ? 1900 : 1000;
        await page.keyboard.down(k);
        if (r2 < 0.12) {
          await sleep(far * 0.2);
        } else if (r2 < 0.3) {
          await sleep(far * 0.4);
          var side = is3d(gp.view) ? (rnd() < 0.5 ? "ArrowLeft" : "ArrowRight") :
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
          await sleep(is3d(gp.view) ? 700 : 400);
          await page.keyboard.press(" ");
          keys += 1;
        }
        await sleep(30);
        await page.keyboard.press(is3d(gp.view) ? "ArrowUp" : "ArrowRight");
        keys += 1;
      }
      await sleep(is3d(gp.view) ? (walking ? 650 : 480) + Math.floor(rnd() * 120) :
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

/* The game going on, as the page keeps it (the slot sent if the page is
 * closed). */
function keptGame(page) {
  return page.evaluate(function () {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k.indexOf(":slot:") >= 0 && /:game$/.test(k)) {
        return JSON.parse(JSON.parse(localStorage.getItem(k)).text).game;
      }
    }
    return null;
  });
}

function movesOf(g) {
  // the game over: its slot is gone
  return g ? g.steps.filter(function (st) { return st.move !== "STAY"; }).length : Infinity;
}

/* The moves from room a to room b (names), the shortest way not through
 * the rooms of avoid (names: food stands in their way). */
function way(mazeName, a, b, avoid) {
  var maze = R.maze(mazeName), from = {}, q = [roomOf(a)];
  from[roomOf(a).join()] = null;
  while (q.length) {
    var r = q.shift();
    if (R.roomName(r) === b) {
      break;
    }
    maze.legal(r).forEach(function (m) {
      var n = maze.next(r, m);
      if (m !== "STAY" && !(n.join() in from) && (avoid || []).indexOf(R.roomName(n)) < 0) {
        from[n.join()] = [r, m];
        q.push(n);
      }
    });
  }
  var out = [];
  for (var k = roomOf(b).join(); from[k]; k = from[k][0].join()) {
    out.unshift(from[k][1]);
  }
  return out;
}

var BACK_MOVE = {LEFT: "RIGHT", RIGHT: "LEFT", UP: "DOWN", DOWN: "UP"};

/* Where the player is now: [x, y, angle] (FG.game.where). */
async function placeNow(page) {
  var w = await page.evaluate(function () { return window.FG.game.where ? window.FG.game.where() : null; });
  return w ? [w.x, w.y, w.angle] : null;
}

/* The middle of the door of the room the player is in, on the way to the
 * next room that way (move). */
function doorOf(g, move) {
  var M = Wd.build(g.layout.maze), room = roomOf(g.steps[g.steps.length - 1].room);
  var d = Wd.DIRS[move];
  var t = Wd.doorAndCorridor(room[0], room[1], room[0] + d[0], room[1] + d[1], M.rs, M.cs);
  return [t[0][1] + 0.5, t[0][0] + 0.5];
}

/* 2D: walks to the next room that way (a move): first in line with its
 * door, then through it. */
async function walk2d(page, move) {
  var KEY = {LEFT: "ArrowLeft", RIGHT: "ArrowRight", UP: "ArrowUp", DOWN: "ArrowDown"};
  var g = await keptGame(page);
  if (!g) {
    return;
  }
  var n0 = movesOf(g), door = doorOf(g, move), across = move === "LEFT" || move === "RIGHT" ? 1 : 0;
  for (var i = 0; i < 40; i++) {
    var at = await placeNow(page);
    if (!at) {
      return;
    }
    var off = door[across] - at[across];
    if (Math.abs(off) < 0.2) {
      break;
    }
    var side = across ? (off > 0 ? "DOWN" : "UP") : (off > 0 ? "RIGHT" : "LEFT");
    await page.keyboard.down(KEY[side]);
    await sleep(Math.min(250, 40 + Math.abs(off) * 90));
    await page.keyboard.up(KEY[side]);
    await sleep(120);
  }
  await page.keyboard.down(KEY[move]);
  for (i = 0; i < 60; i++) {
    await sleep(50);
    if (movesOf(await keptGame(page)) > n0) {
      break;
    }
  }
  await page.keyboard.up(KEY[move]);
  await sleep(150);
}

/* 3D: walks to the next room that way (a move): to its door, then through. */
async function walk3d(page, move) {
  var g = await keptGame(page);
  if (!g) {
    return;
  }
  var n0 = movesOf(g), door = doorOf(g, move);
  for (var leg = 0; leg < 2; leg++) {
    var at = await placeNow(page);
    if (!at) {
      return;
    }
    var far = Math.hypot(door[0] - at[0], door[1] - at[1]);
    if (leg === 0 && far < 0.6) {
      continue;
    }
    // first to the door, then on through it
    await turnTo(page, leg === 0 ? (Math.atan2(door[1] - at[1], door[0] - at[0]) * 180 / Math.PI + 360) % 360 :
      {RIGHT: 0, DOWN: 90, LEFT: 180, UP: 270}[move]);
    await page.keyboard.down("ArrowUp");
    for (var i = 0; i < 70; i++) {
      await sleep(50);
      if (movesOf(await keptGame(page)) > n0) {
        break;
      }
      var now = await placeNow(page);
      if (leg === 0 && now && Math.hypot(door[0] - now[0], door[1] - now[1]) < 0.5) {
        break;
      }
    }
    await page.keyboard.up("ArrowUp");
    await sleep(250);
    if (movesOf(await keptGame(page)) > n0) {
      break;
    }
  }
  await sleep(200);
}

/* 3D: turns to face target (degrees, 0 east, 90 south). */
async function turnTo(page, target) {
  for (var i = 0; i < 60; i++) {
    var at = await placeNow(page);
    if (!at) {
      return;
    }
    var d = ((target - at[2] + 540) % 360) - 180;
    if (Math.abs(d) < 6) {
      break;
    }
    var key = d > 0 ? "ArrowRight" : "ArrowLeft";
    await page.keyboard.down(key);
    await sleep(Math.min(400, Math.max(40, Math.abs(d) * 5)));
    await page.keyboard.up(key);
    await sleep(350);
  }
}

/* Where on the screen the pointer turns to a hand (a plaque, the
 * gramophone), looking over the part of the view given (0 to 1). */
async function findPointer(page, canvasId, x0, x1, y0, y1) {
  var box = await page.locator("#" + canvasId).boundingBox();
  for (var y = y0; y <= y1; y += 0.03) {
    for (var x = x0; x <= x1; x += 0.02) {
      var px = box.x + x * box.width, py = box.y + y * box.height;
      await page.mouse.move(px, py);
      var cur = await page.evaluate(function (id) { return document.getElementById(id).style.cursor; }, canvasId);
      if (cur === "pointer") {
        return {x: px, y: py};
      }
    }
  }
  return null;
}

/* A game file: the header, the steps against the rules and the map rule,
 * the moves against the keys and the view. */
function checkGameFile(name, f) {
  var where = name;
  var g = f.game;
  expect(f.format === "foraging-game" && f.format_version === 7, where + ": format");
  expect(f.trial_type === "foraging-game", where + ": trial_type");
  expect(/^[0-9a-f]{8}$/.test(f.player), where + ": player code " + f.player);
  expect(/^[0-9a-f]{12}$/.test(f.session_id), where + ": session id");
  expect(f.condition && typeof f.condition.how === "string", where + ": condition");
  expect(f.browser && f.browser.user_agent && f.browser.refresh_hz > 0, where + ": browser");
  expect(f.menu && is3d(f.menu.view) === (g.view === "3d") && f.menu.maze === g.maze && g.layout.maze === g.maze,
    where + ": menu choice");
  var s = g.settings;
  checkCamera(where, f);
  var steps = g.steps;
  var partial = /partial/.test(name);
  checkMazeDef(where, f);
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
      // L and P (likes, the music) do not hold up the stays
      var keyBetween = f.keys.some(function (k) {
        return k.t > st.entered_at - s.idle_stay_ms + 40 && k.t < st.entered_at - 5 && !freeKey(k);
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
    // a room crossed at its corner is a move, and the move it led to follows at once
    var afterCorner = t > 1 && steps[t - 1].corner === true;
    if (st.move !== "STAY") {
      expect(typeof st.left_at === "number" && st.left_at <= st.entered_at && (st.walked_tiles > 0 || afterCorner),
        where + " step " + t + ": left the room before at " + st.left_at + ", walked " + st.walked_tiles);
    }
    expect(typeof st.corner === "boolean", where + " step " + t + ": corner");
    if (st.corner && t < steps.length - 1) {
      expect(st.move !== "STAY" && steps[t + 1].move !== "STAY" && steps[t + 1].entered_at - st.entered_at < 5,
        where + " step " + t + ": a corner crossed, then the move it led to");
    }
  }
  expect(g.draws.length === steps.length - 1, where + ": draws " + g.draws.length);
  checkTrack(where, g);
  checkPaintings(where, f);
  checkMusic(where, f);
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

/* The maze a file holds (maze_def): a maze of the game as js/mazes.js has
 * it; a maze of the team as drawn, with its start, cheese and bread rooms and
 * its moves used. A maze of the team is added to the mazes here, so that the
 * rest of the checks know it. */
function checkMazeDef(where, f) {
  var g = f.game, d = g.maze_def, MZ = globalThis.FG.MAZES;
  if (!expect(d && Array.isArray(d.rooms), where + ": maze_def")) {
    return;
  }
  if (!d.team) {
    expect(MZ[g.maze] && JSON.stringify(MZ[g.maze].rooms) === JSON.stringify(d.rooms), where + ": maze_def rooms");
    return;
  }
  var info = globalThis.FG.mazeTools.read(d.team.shape);
  expect(!info.problems.length && JSON.stringify(info.rooms) === JSON.stringify(d.rooms),
    where + ": a maze of the team, its rooms from its drawing");
  if (!MZ[g.maze]) {
    MZ[g.maze] = {rooms: d.rooms, colours: [], team: d.team};
  }
  if (d.team.start && g.settings.start_rooms === "random") {
    expect(g.layout.start_room === R.roomName(d.team.start), where + ": the start room drawn, " + g.layout.start_room);
  }
  Object.keys(g.layout.food_rooms).forEach(function (n) {
    var at = d.team.food[g.food_kinds[n]];
    if (at && g.settings.food_rooms[n].room === "random") {
      expect(g.layout.food_rooms[n] === R.roomName(at), where + ": the " + g.food_kinds[n] + " room drawn");
    }
  });
  var linkSteps = /(^|&)set\.steps=/.test(f.link || "");
  expect(linkSteps || g.settings.steps === d.team.moves, where + ": the moves of the maze, " + g.settings.steps);
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
  if (!expect(tr && tr.every_ms === s.track_ms && tr.fields.join() === "t,x,y,angle,step,look,look_d,look_share,music" &&
    tr.rows.length > 1, where + ": track")) {
    return;
  }
  var nPlaces = Wd.paintingPlaces(Wd.build(g.layout.maze)).list.length;
  tr.rows.forEach(function (p, i) {
    if (g.view !== "3d" || !g.gallery) {
      expect(p[5] === null && p[6] === null && p[7] === null, where + ": track " + i + ": no painting looked at in 2D");
    } else if (p[5] !== null) {
      expect(p[5] >= 0 && p[5] < nPlaces && p[6] >= 0 && p[6] <= globalThis.FG_LOOK_FAR && p[7] >= 0 && p[7] <= 1,
        where + ": track " + i + ": the painting looked at " + JSON.stringify(p.slice(5)));
    } else {
      expect(p[6] === null && p[7] === null, where + ": track " + i + ": nothing looked at");
    }
    expect(p[8] === null || (p[8] >= 0 && p[8] <= 1), where + ": track " + i + ": music " + p[8]);
  });
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

/* L and P: liking a painting and the gramophone; free, they do not hold
 * up the stays. */
function freeKey(k) {
  return typeof k.key === "string" && /^[lLpP]$/.test(k.key);
}

/* The paintings of a 3D game: hung as its seed says (every place another
 * painting), looking and likes as the keys and clicks say; in 2D none. */
globalThis.FG_LOOK_FAR = 6;
function checkPaintings(where, f) {
  var g = f.game, s = g.settings, FGg = globalThis.FG;
  var downs = f.keys.filter(function (k) { return k.type === "down" && k.phase === "game " + g.number; });
  var lKeys = downs.filter(function (k) { return /^[lL]$/.test(k.key); });
  if (g.view !== "3d") {
    expect(g.gallery === null && g.looks === null && g.likes === null && g.render === null,
      where + ": no paintings, likes or sharpness in 2D");
    expect(lKeys.every(function (k) { return k.outcome === "ignored: no likes" || /^ignored/.test(k.outcome); }),
      where + ": L does nothing in 2D");
    return;
  }
  var M = Wd.build(g.layout.maze), places = Wd.paintingPlaces(M);
  var real = s.paintings && FGg.art.count() > 0;
  if (!expect(g.gallery && g.gallery.places.length === places.list.length && typeof g.gallery_seed === "number",
    where + ": the gallery")) {
    return;
  }
  var pics = FGg.art.hang(places.list, FGg.random.make(g.gallery_seed), real);
  var ids = {}, sameAsSeed = 0;
  g.gallery.places.forEach(function (pl, k) {
    var info = FGg.art.info(pics[k]);
    var want = info ? info.id : "landscape_" + (-1 - pics[k]);
    var rm = M.list[places.list[k].room];
    if (pl.painting === want && pl.place === k && pl.room === R.roomName([rm.i, rm.j]) &&
        pl.side === Wd.SIDES[places.list[k].side] && pl.artemis === (info ? info.artemis : null)) {
      sameAsSeed += 1;
    }
    ids[pl.painting] = (ids[pl.painting] || 0) + 1;
  });
  expect(sameAsSeed === places.list.length, where + ": the paintings hung as the seed says (" + sameAsSeed + " of " +
    places.list.length + ")");
  expect(g.gallery.source === (real ? "paintings" : "landscapes") && g.gallery.likes === (real && s.likes),
    where + ": gallery source " + g.gallery.source);
  if (real && places.list.length <= FGg.art.count()) {
    expect(Object.keys(ids).length === places.list.length, where + ": every wall another painting");
  }
  // likes: each a change of its place, by L or a click on its plaque
  var liked = {}, byL = 0, byClick = 0, last = -Infinity;
  (g.likes || []).forEach(function (lk, i) {
    expect(lk.place >= 0 && lk.place < places.list.length && lk.painting === g.gallery.places[lk.place].painting,
      where + ": like " + i + " of place " + lk.place);
    liked[lk.place] = !liked[lk.place];
    expect(lk.liked === liked[lk.place], where + ": like " + i + " liked " + lk.liked);
    expect(lk.t >= last && (lk.by === "L" || lk.by === "click"), where + ": like " + i + " at " + lk.t + " by " + lk.by);
    last = lk.t;
    if (lk.by === "L") {
      byL += 1;
    } else {
      byClick += 1;
    }
  });
  var lOutcomes = lKeys.filter(function (k) { return k.outcome === "like" || k.outcome === "unlike"; }).length;
  expect(lOutcomes === byL, where + ": " + lOutcomes + " L keys that liked, " + byL + " likes by L");
  var clickLikes = (g.clicks || []).filter(function (c) { return c.outcome === "like" || c.outcome === "unlike"; }).length;
  expect(clickLikes === byClick, where + ": " + clickLikes + " clicks that liked, " + byClick + " likes by a click");
  // looking: as long as the track says, roughly
  var looks = g.looks || [];
  var lookMs = 0;
  looks.forEach(function (o, i) {
    expect(o.place >= 0 && o.place < places.list.length && o.painting === g.gallery.places[o.place].painting &&
      o.look_ms >= 0 && o.seen_ms >= 0 && (o.look_ms > 0) === (o.looks > 0) && o.liked === !!liked[o.place],
      where + ": looks " + i + " " + JSON.stringify(o));
    lookMs += o.look_ms;
  });
  var partial = /partial/.test(where);
  if (!partial && g.track && g.track.rows.length > 20) {
    var tracked = g.track.rows.filter(function (r) { return r[5] !== null; }).length * g.track.every_ms;
    expect(Math.abs(lookMs - tracked) <= 0.25 * Math.max(lookMs, tracked) + 2000,
      where + ": looked at paintings " + Math.round(lookMs) + " ms, the track says about " + tracked);
  }
  var rd = g.render;
  expect(rd && rd.levels.length === 6 && rd.level >= 0 && rd.level < 6 && rd.width > 0 && Array.isArray(rd.changes),
    where + ": sharpness " + JSON.stringify(rd && {level: rd.level, width: rd.width}));
}

/* The music room: a room neither the start nor a food room, as the seed
 * says; the records in the order of the game; P and clicks as the plays. */
function checkMusic(where, f) {
  var g = f.game, s = g.settings, FGg = globalThis.FG;
  var downs = f.keys.filter(function (k) { return k.type === "down" && k.phase === "game " + g.number; });
  var pKeys = downs.filter(function (k) { return /^[pP]$/.test(k.key); });
  if (!s.music_room) {
    expect(g.music === null, where + ": no music room");
    return;
  }
  if (!expect(g.music && typeof g.music.room === "string" && Array.isArray(g.music.plays), where + ": the music room")) {
    return;
  }
  var maze = R.maze(g.layout.maze);
  var rand = FGg.random.make(FGg.random.derive(g.gallery_seed, 1));
  var notFree = [g.layout.start_room].concat(Object.keys(g.layout.food_rooms).map(function (n) { return g.layout.food_rooms[n]; }));
  var free = maze.rooms().filter(function (r) { return notFree.indexOf(R.roomName(r)) < 0; });
  expect(g.music.room === R.roomName(rand.pick(free)), where + ": the music room as the seed says, " + g.music.room);
  expect(g.music.pieces.slice().sort().join() === FGg.MUSIC.map(function (m) { return m.id; }).sort().join(),
    where + ": every record once");
  var byP = 0;
  g.music.plays.forEach(function (pl, i) {
    expect(pl.piece === g.music.pieces[i % g.music.pieces.length], where + ": record " + i + " " + pl.piece);
    expect(pl.by === "P" || pl.by === "click", where + ": record " + i + " by " + pl.by);
    var open = i === g.music.plays.length - 1 && pl.stopped_at === null;
    expect(open || (pl.stopped_at >= pl.started_at && pl.played_s >= 0 &&
      /^(P|click|ended|game over|failed: .*)$/.test(pl.stopped_by)), where + ": record " + i + " " + JSON.stringify(pl));
    if (i) {
      expect(pl.started_at >= g.music.plays[i - 1].stopped_at, where + ": 1 record at a time");
    }
    byP += pl.by === "P" ? 1 : 0;
  });
  var on = pKeys.filter(function (k) { return k.outcome === "music on"; }).length;
  expect(on === byP, where + ": " + on + " P keys that played, " + byP + " records by P");
  if (!/partial/.test(where) && g.music.plays.length) {
    var lastPlay = g.music.plays[g.music.plays.length - 1];
    expect(lastPlay.stopped_at !== null, where + ": the music stops at the end of the game");
  }
}

/* GitHub and GitHub Pages stood in for, for the saves of the maze editor:
 * the contents API with versions (sha), refusing a key other than GH_KEY and
 * a write over a version that changed; a file written shows on the game's
 * page PAGES_MS later, as GitHub Pages does. With conflictOnce, someone else
 * saves a maze just before the next write of js/my_mazes.js. */
var GH_KEY = "github_pat_TEST_only";
var PAGES_MS = 4000;
// js/team_key.js before saving is set up (the repository's own file may hold
// the team's real locked key)
var NO_KEY = ["(function (root) {", "  var FG = root.FG = root.FG || {};", "  FG.TEAM_KEY = null;",
  "})(typeof window !== \"undefined\" ? window : globalThis);", ""].join("\n");
function githubStandIn(start) {
  var T = globalThis.FG.mazeTools;
  var st = {files: {}, live: {}, puts: [], n: 0, conflictOnce: false, conflicts: 0};
  ["js/my_mazes.js", "js/team_key.js"].forEach(function (p) {
    var text = start && start[p] !== undefined ? start[p] : fs.readFileSync(path.join(ROOT, p), "utf8");
    st.files[p] = {text: text, sha: "v0" + p.length};
    st.live[p] = text;
  });
  var cors = {"access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type, accept, x-github-api-version",
    "access-control-allow-methods": "GET, PUT"};
  function reply(route, status, body) {
    return route.fulfill({status: status, contentType: "application/json", body: JSON.stringify(body), headers: cors});
  }
  st.api = function (route) {
    var req = route.request();
    if (req.method() === "OPTIONS") {
      return route.fulfill({status: 204, headers: cors});
    }
    if (req.headers().authorization !== "Bearer " + GH_KEY) {
      return reply(route, 401, {message: "Bad credentials"});
    }
    var u = new URL(req.url());
    var m = /^\/repos\/owner\/game(\/contents\/(.+))?$/.exec(u.pathname);
    if (!m) {
      return reply(route, 404, {message: "Not Found"});
    }
    if (!m[2]) {
      return reply(route, 200, {full_name: "owner/game"});
    }
    var p = decodeURIComponent(m[2]), file = st.files[p];
    if (req.method() === "GET") {
      expect(u.searchParams.get("ref") === "main", "github: read from the branch main");
      return file ? reply(route, 200, {content: Buffer.from(file.text, "utf8").toString("base64").replace(/(.{60})/g, "$1\n"),
        sha: file.sha, encoding: "base64"}) : reply(route, 404, {message: "Not Found"});
    }
    if (req.method() === "PUT") {
      var body = JSON.parse(req.postData());
      if (st.conflictOnce && p === "js/my_mazes.js") {
        st.conflictOnce = false;
        st.conflicts += 1;
        var other = T.parseFile(file.text);
        other.someone_else = {shape: ["S . .", ". # .", ". . C"], moves: 20, saved_by: "Someone",
          saved_at: "2026-10-19T08:00:00.000Z"};
        file = st.files[p] = {text: T.fileText(other), sha: "other" + (++st.n)};
        st.live[p] = file.text;
      }
      if (file && body.sha !== file.sha) {
        return reply(route, 409, {message: p + " does not match " + body.sha});
      }
      expect(body.branch === "main", "github: written to the branch main");
      var text = Buffer.from(body.content, "base64").toString("utf8");
      st.files[p] = {text: text, sha: "v" + (++st.n)};
      st.puts.push({path: p, message: body.message});
      setTimeout(function () { st.live[p] = text; }, PAGES_MS);
      return reply(route, file ? 200 : 201, {content: {sha: st.files[p].sha}});
    }
    return reply(route, 405, {message: "Not allowed"});
  };
  st.pages = function (route) {
    var p = new URL(route.request().url()).pathname.replace(/^\//, "");
    return route.fulfill({status: 200, contentType: "application/javascript", body: st.live[p]});
  };
  st.routes = async function (context) {
    await context.route("https://api.github.com/**", st.api);
    // the game's own page only, not the API (which has the same paths)
    await context.route(/^http:\/\/localhost:\d+\/js\/(my_mazes|team_key)\.js(\?.*)?$/, st.pages);
  };
  return st;
}

async function waitReady(page) {
  for (var w = 0; w < 80 && !(await ui(page)).ready; w++) {
    await sleep(200);
  }
}

async function cardTitles(page) {
  return page.$$eval("#mazes .card .card-size", function (cs) { return cs.map(function (c) { return c.textContent; }); });
}

async function edChecks(page) {
  return page.$$eval("#edChecks li", function (ls) { return ls.map(function (l) { return l.className + ": " + l.textContent; }); });
}

/* The centre of square (r, c) of the editor's grid. */
async function edCell(page, r, c) {
  var box = await page.locator("#edGrid").boundingBox();
  var rows = Number(await page.inputValue("#edRows")), cols = Number(await page.inputValue("#edCols"));
  var cell = Math.min(box.width / cols, box.height / rows);
  return {x: box.x + (c + 0.5) * cell, y: box.y + (r + 0.5) * cell};
}

async function edClick(page, r, c) {
  var p = await edCell(page, r, c);
  await page.mouse.click(p.x, p.y);
  await sleep(40);
}

async function waitFor(page, test, ms) {
  for (var w = 0; w < ms / 250; w++) {
    if (await test()) {
      return true;
    }
    await sleep(250);
  }
  return false;
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
        if (process.env.PLAY_DEBUG) {
          console.error("  page: " + m.text());
        }
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
    // and then; in 2D between 2 rooms only the arrows along the corridor walk.
    // The arrows go round in turn; in 2D, after 8 rounds without a move they
    // go round 1 later, as in some rooms the turn always reaches each corner
    // with the arrow that does not lead out of it
    var arrows = view === "3d" ? ["ArrowUp"] : ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"];
    var later = 0, movesLeft = null, since = 0;
    for (var w = 0; w < 120 && !(await ui(page)).end; w++) {
      var left = await page.textContent("#steps");
      if (left !== movesLeft) {
        movesLeft = left;
        since = w;
      } else if (w - since >= 8) {
        later += 1;
        since = w;
      }
      await hold(arrows[(Math.floor(w / 2) + later) % arrows.length], view === "3d" ? 1800 : 1500);
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
  if (want("corner")) {
  // 6b. a room crossed at its corner: in a 4 x 4 maze (a maze of the team,
  // its doors as in grid_4x4), room s00 has its doors to s01 and s10 at the
  // same corner; walking left from s01 and then down on the slant crosses
  // that corner. The crossing is a move into s00 (corner), then the move
  // into s10, and the game goes on
  var cgh = githubStandIn({"js/my_mazes.js": globalThis.FG.mazeTools.fileText({corner_test: {
    shape: [". S . .", ". . . .", ". . . .", ". . . ."], moves: 2, saved_by: "Check", saved_at: "2026-10-19T00:00:00.000Z"}})});
  var cctx = await browser.newContext({viewport: {width: 1100, height: 760}});
  await cgh.routes(cctx);
  var cfiles = {}, cornerSteps = 0, cerr = [];
  for (var ci = 0; ci < 4; ci++) {
    var cp = await cctx.newPage();
    cp.on("pageerror", function (e) { cerr.push(String(e)); });
    await pipe(cp, cfiles, {value: "ok"}, 0);
    await cp.goto(base + "?test=1&condition=linear_fast&view=2d&maze=corner_test");
    await waitReady(cp);
    await sleep(400);
    await cp.keyboard.press("Enter");
    await sleep(900);
    await cp.keyboard.down("ArrowLeft");
    await sleep(900 + ci * 100);
    await cp.keyboard.down("ArrowDown");
    await sleep(900);
    await cp.keyboard.up("ArrowLeft");
    await sleep(700);
    await cp.keyboard.up("ArrowDown");
    // then on to the last move (2 in this maze), now and then on the slant
    for (var cw = 0; cw < 16 && !(await ui(cp)).end && !(await ui(cp)).message; cw++) {
      var ck = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"][cw % 8];
      for (var cq = 0; cq < 15; cq++) {
        await cp.keyboard.down(ck);
        await sleep(100);
      }
      await cp.keyboard.up(ck);
    }
    var cu = await ui(cp);
    expect(!cu.message, "corner: the game goes on (" + ci + ")");
    expect(cu.end, "corner: game " + ci + " played to its end (moves left " + await cp.textContent("#steps") + ")");
    await sleep(1500);
    await cp.close();
  }
  gameFiles(cfiles).forEach(function (n) {
    var g = checkGameFile(n, cfiles[n]);
    cornerSteps += g.steps.filter(function (st) { return st.corner; }).length;
  });
  expect(cerr.length === 0, "corner: page errors " + JSON.stringify(cerr));
  expect(gameFiles(cfiles).length === 4 && cornerSteps >= 1, "corner: " + gameFiles(cfiles).length + " games, " +
    cornerSteps + " rooms crossed at a corner");
  report.push("corner: " + gameFiles(cfiles).length + " games, " + cornerSteps + " rooms crossed at a corner");
  save("corner", cfiles);
  await cctx.close();

  }
  if (want("team_mazes")) {
  // 7. the maze editor: a maze drawn, checked, tried in 3D and 2D, saved into
  // the game (GitHub stood in for) with saving set up on the way, a second
  // save with someone else saving in between, a wrong password and a taken
  // name refused; then a player plays the saved maze
  var T = globalThis.FG.mazeTools;
  var gh = githubStandIn({"js/my_mazes.js": T.fileText({broken_one: {shape: [". # .", "# # #", ". # ."], moves: 10,
    saved_by: "X", saved_at: "2026-10-01T00:00:00.000Z"}}), "js/team_key.js": NO_KEY});
  var tctx = await browser.newContext({viewport: {width: 1280, height: 900}});
  await gh.routes(tctx);
  var ed = await tctx.newPage();
  var edErrors = [];
  ed.on("pageerror", function (e) { edErrors.push(String(e)); });
  var tfiles = {};
  await pipe(ed, tfiles, {value: "ok"}, 0);
  var t0 = Date.now();
  await ed.goto(base + "?edit=1&condition=linear_fast");
  await waitReady(ed);
  var left = await ed.textContent("#menuProblems");
  expect(/broken_one/.test(left) && /cut off/.test(left), "team_mazes: a cut-off maze of the file is left out and listed: " + left);
  expect((await cardTitles(ed)).indexOf("Broken one") < 0, "team_mazes: the cut-off maze is not on the first page");
  await ed.keyboard.press("n");
  await sleep(400);
  expect(await ed.isVisible("#editor"), "team_mazes: N opens the editor");
  await ed.fill("#edRows", "4");
  await ed.dispatchEvent("#edRows", "change");
  await sleep(100);
  for (var hole of [[1, 1], [1, 3]]) {
    await edClick(ed, hole[0], hole[1]);
  }
  await ed.keyboard.press("s");
  await edClick(ed, 0, 0);
  await ed.keyboard.press("c");
  await edClick(ed, 3, 4);
  await ed.keyboard.press("b");
  await edClick(ed, 2, 2);
  await ed.keyboard.press("r");
  // a room cut off, then put back
  await edClick(ed, 0, 1);
  await edClick(ed, 1, 0);
  var ch = await edChecks(ed);
  expect(ch.some(function (l) { return /^bad: Room s00 is cut off/.test(l); }) && await ed.isDisabled("#edTry3d"),
    "team_mazes: a room cut off is found and the try is off: " + JSON.stringify(ch));
  await edClick(ed, 0, 1);
  await edClick(ed, 1, 0);
  await ed.fill("#edName", "Test Loop");
  await ed.fill("#edMoves", "6");
  await sleep(150);
  ch = await edChecks(ed);
  expect(await ed.inputValue("#edName") === "test_loop" && ch[0] === "ok: 18 rooms, all reachable from each other" &&
    ch.indexOf("info: Start: s00") >= 0 && ch.indexOf("info: Cheese room (worth 8): s34") >= 0 &&
    ch.indexOf("info: Bread room (worth 1): s22") >= 0 && ch.indexOf("ok: Name: test_loop") >= 0,
    "team_mazes: the checks of the drawing " + JSON.stringify(ch));
  // a try in 3D, left with Escape
  await ed.click("#edTry3d");
  await sleep(1200);
  var u = await ui(ed);
  expect(u.hud && !(await ed.isVisible("#editor")), "team_mazes: the try in 3D plays");
  await ed.keyboard.down("ArrowUp");
  await sleep(900);
  await ed.keyboard.up("ArrowUp");
  await ed.keyboard.press("Escape");
  await sleep(600);
  expect(await ed.isVisible("#editor") && await ed.inputValue("#edName") === "test_loop" &&
    await ed.inputValue("#edRows") === "4", "team_mazes: Escape goes back to the editor with the drawing kept");
  // a try in 2D, played to its end
  await ed.click("#edTry2d");
  await sleep(900);
  var arrows = ["ArrowRight", "ArrowRight", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowLeft", "ArrowUp", "ArrowUp"];
  for (var w = 0; w < 60 && !(await ui(ed)).end; w++) {
    // held down, with the repeats a browser sends
    for (var q = 0; q < 15; q++) {
      await ed.keyboard.down(arrows[w % arrows.length]);
      await sleep(100);
    }
    await ed.keyboard.up(arrows[w % arrows.length]);
    await sleep(150);
  }
  u = await ui(ed);
  expect(u.end && /nothing is saved/.test(u.status), "team_mazes: the try in 2D ends, nothing saved: " + u.status);
  await sleep(600);
  await ed.keyboard.press("Enter");
  await sleep(500);
  expect(await ed.isVisible("#editor"), "team_mazes: Enter after a try goes back to the editor");
  expect(Object.keys(tfiles).length === 0, "team_mazes: tries send no files");
  // a browser filling in a saved password sends key events without a key
  await ed.evaluate(function () {
    var el = document.getElementById("edToken");
    el.focus();
    el.dispatchEvent(new Event("keydown", {bubbles: true}));
    el.dispatchEvent(new Event("keyup", {bubbles: true}));
  });
  await sleep(300);
  expect(!(await ui(ed)).message && await ed.isVisible("#editor"), "team_mazes: key events without a key (autofill) are ignored");
  // save, setting up saving on the way: a short password refused first
  await ed.fill("#edWho", "Tester Müller");
  await ed.fill("#edToken", GH_KEY);
  await ed.fill("#edRepo", "owner/game");
  await ed.fill("#edPass1", "too short");
  await ed.fill("#edPass2", "too short");
  await ed.click("#edSave");
  await sleep(300);
  expect(/at least 16/.test(await ed.textContent("#edStatus")) && gh.puts.length === 0,
    "team_mazes: a short team password is refused");
  await ed.fill("#edPass1", "correct horse battery staple");
  await ed.fill("#edPass2", "correct horse battery staple");
  await ed.click("#edSave");
  var reloaded = await waitFor(ed, async function () { return /maze=test_loop/.test(ed.url()); }, 60000);
  await sleep(1500);
  await waitReady(ed);
  expect(reloaded, "team_mazes: the page reloads once the game has the maze");
  expect(gh.puts.length === 2 && gh.puts[0].path === "js/team_key.js" && gh.puts[1].path === "js/my_mazes.js" &&
    gh.puts[1].message === "Maze test_loop, saved by Tester Müller in the maze editor",
    "team_mazes: the locked key, then the maze, written: " + JSON.stringify(gh.puts));
  var keyText = gh.files["js/team_key.js"].text;
  expect(keyText.indexOf(GH_KEY) < 0 && /"repo": "owner\/game"/.test(keyText) && /"iterations": 600000/.test(keyText),
    "team_mazes: the key is stored locked");
  var saved = T.parseFile(gh.files["js/my_mazes.js"].text);
  expect(saved.broken_one && saved.test_loop && JSON.stringify(saved.test_loop.shape) ===
    JSON.stringify(["S . . . .", ". # . # .", ". . B . .", ". . . . C"]) && saved.test_loop.moves === 6 &&
    saved.test_loop.saved_by === "Tester Müller", "team_mazes: the maze saved as drawn " + JSON.stringify(saved.test_loop));
  var sel = await ed.$eval("#mazes .card.on .card-size", function (c) { return c.textContent; });
  expect(sel === "Test loop", "team_mazes: the new maze is on the first page, chosen: " + sel);
  // a second maze, with someone else saving in between
  gh.conflictOnce = true;
  await ed.keyboard.press("n");
  await sleep(400);
  await ed.fill("#edName", "second_maze");
  await ed.fill("#edMoves", "9");
  await ed.fill("#edWho", "Tester");
  expect(await ed.isVisible("#edUnlock") && !(await ed.isVisible("#edSetup")), "team_mazes: saving is set up now");
  await ed.fill("#edPass", "correct horse battery staple");
  await ed.click("#edSave");
  reloaded = await waitFor(ed, async function () { return /maze=second_maze/.test(ed.url()); }, 60000);
  await sleep(1500);
  await waitReady(ed);
  saved = T.parseFile(gh.files["js/my_mazes.js"].text);
  expect(reloaded && gh.conflicts === 1 && Object.keys(saved).join() === "broken_one,test_loop,someone_else,second_maze" &&
    saved.someone_else && saved.test_loop && saved.second_maze, "team_mazes: saved again on top of a save in between: " +
    Object.keys(saved).join());
  // a wrong password, and a name that is taken
  var puts = gh.puts.length;
  await ed.keyboard.press("n");
  await sleep(400);
  await ed.fill("#edName", "third_maze");
  await ed.fill("#edWho", "Tester");
  await ed.fill("#edPass", "not the team password");
  await ed.click("#edSave");
  await waitFor(ed, async function () { return /password/.test(await ed.textContent("#edStatus")); }, 8000);
  expect(/Wrong team password/.test(await ed.textContent("#edStatus")) && gh.puts.length === puts,
    "team_mazes: a wrong password saves nothing");
  await ed.fill("#edName", "test_loop");
  await sleep(150);
  ch = await edChecks(ed);
  expect(ch.indexOf("bad: There is already a maze called test_loop. Choose another name.") >= 0 && await ed.isDisabled("#edSave"),
    "team_mazes: a taken name cannot be saved");
  expect(edErrors.length === 0, "team_mazes: page errors " + JSON.stringify(edErrors));
  report.push("team_mazes editor: " + gh.puts.length + " writes, " + gh.conflicts + " conflict, " +
    Math.round((Date.now() - t0) / 1000) + " s");
  await tctx.close();
  // a player plays the saved maze
  var pctx = await browser.newContext({viewport: {width: 1200, height: 800}});
  await gh.routes(pctx);
  var pl = await session("team_player", "?test=1&condition=linear_fast&maze=test_loop", [{view: "2d", maze: "test_loop"}],
    {seed: 25, context: pctx, stay: 0.3});
  var pn = gameFiles(pl.files);
  expect(pn.length === 1, "team_player: 1 file");
  pn.forEach(function (n) {
    var g = checkGameFile(n, pl.files[n]);
    expect(g.maze === "test_loop" && g.maze_def.team && g.maze_def.team.saved_by === "Tester Müller" &&
      g.layout.start_room === "s00" && g.settings.steps === 6, "team_player: the saved maze, as drawn");
  });
  save("team_mazes", pl.files);
  await pctx.close();

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
  if (want("mouse")) {
  // 11. the mouse: the camera behind it and through its eyes; then the old
  // arrow player
  var mo = await session("mouse", "?test=1&condition=linear_fast&set.steps=30", [
    {view: "3d_behind", maze: "grid_4x4"}, {view: "3d", maze: "corridors_7x7"},
    {view: "3d_behind", maze: "corridors_7x7"}, {view: "2d", maze: "holes_6x6"}
  ], {seed: 31});
  var mn = gameFiles(mo.files);
  expect(mn.length === 4, "mouse: 4 files, got " + Object.keys(mo.files).join(" "));
  mn.forEach(function (n) { checkGameFile(n, mo.files[n]); });
  expect(mn.length === 4 && mo.files[mn[0]].game.camera === "behind" && mo.files[mn[1]].game.camera === "eyes" &&
    mo.files[mn[2]].game.camera === "behind" && mo.files[mn[3]].game.camera === null, "mouse: the cameras as chosen");
  save("mouse", mo.files);
  await mo.context.close();
  var ar = await session("mouse_arrow", "?test=1&condition=linear_fast&set.steps=12&set.player=arrow", [
    {view: "2d", maze: "grid_4x4"}, {view: "3d", maze: "grid_6x6"}
  ], {seed: 32});
  var arn = gameFiles(ar.files);
  expect(arn.length === 2 && arn.every(function (n) { return ar.files[n].game.settings.player === "arrow"; }),
    "mouse_arrow: the arrow player, as set by the link");
  arn.forEach(function (n) { checkGameFile(n, ar.files[n]); });
  save("mouse_arrow", ar.files);
  await ar.context.close();

  }
  if (want("paintings")) {
  // 12. the paintings: a painting looked at and liked with L, then L again
  // and again while standing (the stays go on), a plaque clicked
  var pc = await browser.newContext({viewport: {width: 1200, height: 800}});
  var pp = await pc.newPage();
  var perr = [], pfiles = {};
  pp.on("pageerror", function (e) { perr.push(String(e)); });
  await pipe(pp, pfiles, {value: "ok"}, 0);
  await pp.goto(base + "?test=1&condition=linear_fast&set.steps=6");
  await choose(pp, "3d", "grid_4x4");
  await sleep(1200);
  var looked = null;
  for (var ti = 0; ti < 60 && !looked; ti++) {
    await pp.keyboard.down("ArrowRight");
    await sleep(70);
    await pp.keyboard.up("ArrowRight");
    // the turn slows down to a stop, then the painting must stay in the middle
    await sleep(700);
    var w1 = await pp.evaluate(function () { return window.FG.game.where(); });
    await sleep(200);
    var w2 = await pp.evaluate(function () { return window.FG.game.where(); });
    looked = w1 && w2 && w1.look !== null && w1.look === w2.look ? w2 : null;
  }
  expect(looked, "paintings: a painting in the middle of the view");
  await pp.keyboard.press("l");
  await sleep(300);
  var before = (await keptGame(pp)).steps.length;
  for (var li = 0; li < 12; li++) {
    await pp.keyboard.press("l");
    await sleep(260);
  }
  var standing = (await keptGame(pp)).steps.slice(before).filter(function (st) { return st.by === "idle"; }).length;
  expect(standing >= 2, "paintings: L pressed while standing, still " + standing + " idle stays in 3.4 s");
  var plaque = await findPointer(pp, "c3d", 0.05, 0.95, 0.2, 0.7);
  expect(plaque, "paintings: a plaque to click");
  if (plaque) {
    await pp.mouse.click(plaque.x, plaque.y);
    await sleep(300);
  }
  var pg0 = await keptGame(pp);
  var legal0 = pg0.steps[pg0.steps.length - 1].legal.filter(function (m) { return m !== "STAY"; })[0];
  for (var mi = 0; mi < 6 && !(await ui(pp)).end; mi++) {
    await walk3d(pp, mi % 2 ? BACK_MOVE[legal0] : legal0);
  }
  await waitFor(pp, async function () { return (await ui(pp)).end; }, 6000);
  await sleep(1500);
  var pn = gameFiles(pfiles);
  if (expect(pn.length === 1, "paintings: 1 game file, got " + Object.keys(pfiles).join(" "))) {
    var pgf = pfiles[pn[0]].game;
    checkGameFile(pn[0], pfiles[pn[0]]);
    var byKey = pgf.likes.filter(function (l) { return l.by === "L"; }).length;
    var byClick = pgf.likes.filter(function (l) { return l.by === "click"; }).length;
    expect(byKey >= 12 && byClick === 1, "paintings: likes by L " + byKey + ", by a click " + byClick);
    expect(pgf.looks.some(function (o) { return o.look_ms > 1000; }), "paintings: a painting looked at for a second or more");
    notes.push("paintings: " + pgf.looks.length + " paintings seen, " + pgf.likes.length + " likes, sharpness level " +
      pgf.render.level + " (" + pgf.render.width + " x " + pgf.render.height + "), " + pgf.render.changes.length +
      " changes, drawing " + pgf.render.draw_ms.median + " ms");
  }
  expect(perr.length === 0, "paintings: page errors " + JSON.stringify(perr));
  save("paintings", pfiles);
  await pc.close();

  }
  if (want("music")) {
  // 13. the music room, in 2D and in 3D: P plays a record there, not a room
  // away, the music fades on the way out, a click on the gramophone stops it
  for (var vi = 0; vi < 2; vi++) {
    var view = vi ? "3d" : "2d", walk = vi ? walk3d : walk2d, canvasId = vi ? "c3d" : "c2d";
    var mc = await browser.newContext({viewport: {width: 1200, height: 800}});
    var mp = await mc.newPage();
    var merr = [], mfiles = {};
    mp.on("pageerror", function (e) { merr.push(String(e)); });
    await pipe(mp, mfiles, {value: "ok"}, 0);
    // no plaques: only the gramophone can be clicked
    await mp.goto(base + "?test=1&condition=linear_fast&set.steps=40&set.stomach.start=20&set.likes=false");
    await choose(mp, view, "grid_4x4");
    await sleep(1200);
    var mg = await keptGame(mp);
    // not through the food rooms: the food stands in the middle of the way
    var foodNames = Object.keys(mg.layout.food_rooms).map(function (n) { return mg.layout.food_rooms[n]; });
    var route = way("grid_4x4", mg.layout.start_room, mg.music.room, foodNames);
    for (var ri = 0; ri < route.length; ri++) {
      await walk(mp, route[ri]);
      if (process.env.PLAY_DEBUG) {
        var dbg = await keptGame(mp);
        console.error("  music " + view + ": " + route[ri] + " -> " + (dbg ? dbg.steps[dbg.steps.length - 1].room +
          ", energy " + dbg.steps[dbg.steps.length - 1].energy + " at " +
          JSON.stringify(dbg.track.rows.slice(-1)[0]) : "the game is over"));
        await mp.screenshot({path: path.join(OUT, "music_" + view + "_walk" + ri + ".png")});
      }
    }
    if (vi) {
      await mp.keyboard.down("ArrowUp");
      await sleep(200);
      await mp.keyboard.up("ArrowUp");
    }
    await sleep(500);
    var hintShown = await mp.evaluate(function () { return !document.getElementById("gameHint").hidden; });
    if (!expect(hintShown, "music " + view + ": the hint at the gramophone, " + mg.music.room + " by " + route.join(" "))) {
      await mp.screenshot({path: path.join(OUT, "music_" + view + "_nohint.png")});
    }
    await mp.keyboard.press("p");
    await sleep(2500);
    var nowShown = await mp.evaluate(function () { return !document.getElementById("nowPlaying").hidden; });
    expect(nowShown, "music " + view + ": what plays is shown");
    var lastMove = route.length ? route[route.length - 1] : "LEFT";
    await walk(mp, BACK_MOVE[lastMove]);
    await sleep(1200);
    await mp.keyboard.press("p");
    await sleep(200);
    await walk(mp, lastMove);
    await sleep(600);
    if (vi) {
      // face the gramophone
      var at0 = await placeNow(mp);
      var gc = Wd.centre(Wd.build("grid_4x4"), roomOf(mg.music.room));
      await turnTo(mp, (Math.atan2(gc[1] - at0[1], gc[0] - at0[0]) * 180 / Math.PI + 360) % 360);
      await sleep(500);
    }
    var gram = await findPointer(mp, canvasId, vi ? 0.2 : 0, vi ? 0.8 : 1, vi ? 0.3 : 0, vi ? 0.8 : 1);
    if (!gram) {
      await mp.screenshot({path: path.join(OUT, "music_" + view + "_noclick.png")});
    }
    if (expect(gram, "music " + view + ": the gramophone to click")) {
      await mp.mouse.click(gram.x, gram.y);
      await sleep(400);
    }
    var mk = await keptGame(mp);
    if (!expect(mk, "music " + view + ": the game goes on")) {
      await mc.close();
      continue;
    }
    expect(mk.music.plays.length === 1 && mk.music.plays[0].stopped_by === "click" && mk.music.plays[0].played_s > 2,
      "music " + view + ": 1 record played, stopped by a click: " + JSON.stringify(mk.music.plays));
    var mi2 = mk.track.fields.indexOf("music");
    var heard = mk.track.rows.map(function (r) { return r[mi2]; }).filter(function (v) { return v !== null; });
    expect(heard.length > 10 && Math.min.apply(null, heard) < 0.6 && Math.max.apply(null, heard) === 1,
      "music " + view + ": loudest at the gramophone, less a room away (" + Math.min.apply(null, heard) + ")");
    // the end: walking to and fro
    for (var wi = 0; wi < 60 && !(await ui(mp)).end; wi++) {
      await walk(mp, wi % 2 ? lastMove : BACK_MOVE[lastMove]);
    }
    await waitFor(mp, async function () { return (await ui(mp)).end; }, 6000);
    await sleep(1500);
    var mn2 = gameFiles(mfiles);
    if (expect(mn2.length === 1, "music " + view + ": 1 game file")) {
      checkGameFile(mn2[0], mfiles[mn2[0]]);
      var keysP = mfiles[mn2[0]].keys.filter(function (k) { return k.type === "down" && k.key === "p"; });
      expect(keysP.length === 2 && keysP[0].outcome === "music on" && keysP[1].outcome === "ignored: not at the gramophone",
        "music " + view + ": P at the gramophone and a room away " + JSON.stringify(keysP.map(function (k) { return k.outcome; })));
    }
    expect(merr.length === 0, "music " + view + ": page errors " + JSON.stringify(merr));
    save("music_" + view, mfiles);
    await mc.close();
  }

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
  expect(await fp.evaluate(function () { return window.FG.TEAM_MAZES !== undefined && window.FG.TEAM_KEY !== undefined; }),
    "file://: the team's mazes and key are read");
  await ctx.close();

  }
  await browser.close();
  server.close();
  report.forEach(function (r) { console.log(r); });
  notes.forEach(function (r) { console.log("  " + r); });
  console.log(problems.length ? problems.length + " problems:" : "no problems");
  problemKinds();
  problems.slice(0, 40).forEach(function (p) { console.log("  " + p); });
  process.exit(problems.length ? 1 : 0);
})().catch(function (err) {
  console.error(err);
  process.exit(2);
});
