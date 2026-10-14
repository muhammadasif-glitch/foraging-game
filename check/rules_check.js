/* The Node half of check/rules_check.py: runs the cases it made through
 * js/rules.js and reports every number that is not the same float.
 *
 *   node check/rules_check.js cases.json
 */
"use strict";
var fs = require("fs");
var path = require("path");
require(path.join(__dirname, "..", "js", "mazes.js"));
require(path.join(__dirname, "..", "js", "rules.js"));
var R = globalThis.FG.rules;

var data = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
var bad = [];
var counts = {values: 0, steps: 0};

function same(a, b) {
  return a === b || (a !== a && b !== b);
}

function check(what, got, want) {
  counts.values += 1;
  if (!same(got, want)) {
    bad.push(what + ": game " + got + ", model " + want);
  }
}

// Python's round(x, 9)
data.round.forEach(function (c, i) {
  check("round #" + i + " (" + c.x + ")", R.pyRound(c.x, 9), c.py);
});

// half-life speeds
var speedDiff = 0;
data.speeds.forEach(function (c) {
  var got = R.halfLifeSpeed(c.rule, c.h);
  counts.values += 1;
  if (!same(got, c.py)) {
    speedDiff += 1;
    bad.push("speed " + c.rule + " h=" + c.h + ": game " + got + ", model " + c.py);
  }
});

// open moves and where each move leads
data.mazes.forEach(function (c) {
  var m = R.maze(c.maze);
  check(c.maze + " " + c.room + " legal", m.legal(c.room).join(" "), c.legal.join(" "));
  Object.keys(c.next).forEach(function (move) {
    check(c.maze + " " + c.room + " " + move, m.next(c.room, move).join(","), c.next[move].join(","));
  });
});

// whole runs
data.cases.forEach(function (c, k) {
  var maze = R.maze(c.maze);
  var i = 0;
  var world = new R.World({food_rooms: c.food_rooms, eat: c.eat, refill: c.refill, rule: c.rule,
    random_draw: c.random_draw, draw_rate: c.draw_rate, start_room: c.start},
  function () { return c.draws[i++]; });
  var stomach = new R.Stomach(c.stomach);
  var room = c.start;
  if (c.half_empty_in !== null) {
    check("case " + k + " eat speed", R.halfLifeSpeed(c.rule, c.half_empty_in), c.eat);
  }
  for (var t = 0; t < c.path.length; t++) {
    var next = maze.next(room, c.path[t]);
    world.advance(next);
    var paid = world.paid();
    var e = stomach.step(!R.sameRoom(next, room), paid);
    room = next;
    var want = c.rows[t];
    counts.steps += 1;
    check("case " + k + " step " + (t + 1) + " room", room.join(","), want.room.join(","));
    check("case " + k + " step " + (t + 1) + " paid", paid, want.paid);
    check("case " + k + " step " + (t + 1) + " energy", e.energy, want.energy);
    Object.keys(want.level).forEach(function (n) {
      check("case " + k + " step " + (t + 1) + " " + n, world.level[n], want.level[n]);
    });
  }
});

console.log("compared " + counts.values + " values (" + data.cases.length + " runs, " +
  counts.steps + " steps, " + data.round.length + " roundings, " + data.speeds.length +
  " speeds, " + data.mazes.length + " rooms): " + bad.length + " differ");
bad.slice(0, 30).forEach(function (b) { console.log("  " + b); });
process.exit(bad.length ? 1 : 0);
