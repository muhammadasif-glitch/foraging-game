/* The rules of the game world, written to give exactly the numbers of the
 * version 3 model (active-inference-foraging: src/forage/v3/world.py and the
 * stomach in src/forage/v3/run.py). check/rules_check.py and
 * check/rules_check.js test this.
 *
 * Food. Once per step, after the player has moved, every food room is either
 * eaten or refilled:
 *   eaten     if the player was in the room on the previous step
 *   refilled  otherwise; with random refill on, only when that step's draw
 *             is below refill_chance (1 draw per step, shared by all rooms)
 *   linear       eaten: level - eat         refilled: level + refill
 *   exponential  eaten: level - eat x level refilled: level + refill x (1 - level)
 * Levels stay between 0 and 1 and are rounded to 9 decimals after each change,
 * as in the model. So the room is eaten on the step the player leaves it and
 * refills on the step the player enters it. A step spent in a food room pays
 * its worth times its level after this step's change.
 *
 * Energy. Each step takes move_cost for a move (the room changed) or
 * stay_cost for a stay and adds the food paid; it never goes above the
 * stomach size (the food beyond is lost) or below 0.
 *
 * Mazes. A maze is a grid of numbers, each a room and its colour, -1 for no
 * room. A move goes to the next room in its direction, if there is one. The
 * moves open from a room are listed in the model's order.
 */
(function (root) {
  "use strict";
  var FG = root.FG = root.FG || {};

  var MOVES = ["LEFT", "RIGHT", "UP", "DOWN", "STAY"];
  var STEP = {LEFT: [0, -1], RIGHT: [0, 1], UP: [-1, 0], DOWN: [1, 0], STAY: [0, 0]};

  // ------------------------------------------------------------ numbers
  function incrementDigits(digits) {
    var out = digits.split("");
    for (var i = out.length - 1; i >= 0; i--) {
      if (out[i] === "9") {
        out[i] = "0";
      } else {
        out[i] = String.fromCharCode(out[i].charCodeAt(0) + 1);
        return out.join("");
      }
    }
    return "1" + out.join("");
  }

  /* Python's round(x, nd) for x >= 0: the exact decimal value of x rounded
   * half to even at nd decimals, then read back as the nearest float. */
  function pyRound(x, nd) {
    if (x < 0) {
      return -pyRound(-x, nd);
    }
    if (x === 0 || x < Math.pow(10, -nd - 3)) {
      return 0;
    }
    var text;
    try {
      text = x.toFixed(100);      // exact for every x this small rule meets
    } catch (err) {
      text = x.toFixed(20);
    }
    var dot = text.indexOf(".");
    var whole = text.slice(0, dot);
    var frac = text.slice(dot + 1);
    var kept = whole + frac.slice(0, nd);
    var rest = frac.slice(nd);
    var first = rest.charCodeAt(0) - 48;
    var up;
    if (first > 5) {
      up = true;
    } else if (first < 5) {
      up = false;
    } else if (/[1-9]/.test(rest.slice(1))) {
      up = true;
    } else {
      up = (kept.charCodeAt(kept.length - 1) - 48) % 2 === 1;
    }
    if (up) {
      kept = incrementDigits(kept);
    }
    var intDigits = kept.length - nd;
    var str = (intDigits > 0 ? kept.slice(0, intDigits) : "0") + "." +
      (intDigits >= 0 ? kept.slice(intDigits) : new Array(-intDigits + 1).join("0") + kept);
    return Number(str);
  }

  function tidy(level) {
    return pyRound(Math.min(1, Math.max(0, Number(level))), 9);
  }

  function eaten(level, eat, rule) {
    return rule === "linear" ? tidy(level - eat) : tidy(level - eat * level);
  }

  function refilled(level, refill, rule) {
    return rule === "linear" ? tidy(level + refill) : tidy(level + refill * (1 - level));
  }

  /* 0.5 to the power y, correctly rounded. Math.pow can be 1 unit in the last
   * place away from Python's 0.5 ** y, so this works it out with 230-bit
   * integers instead: 2^-y = 2^-floor(y) x exp(-frac(y) ln 2). Python agrees
   * with the correctly rounded value for every half-life up to 270 steps
   * (check/rules_check.py). The game asks for a browser with BigInt (2020 or
   * later); without it this falls back to Math.pow. */
  var BITS = 230;
  var LN2 = null;

  function big(n) {
    return BigInt(n);
  }

  function ln2Fixed() {
    // ln 2 = sum over k >= 1 of 1 / (k 2^k), to BITS + 10 bits
    if (LN2 === null) {
      var one = big(1) << big(BITS + 10);
      var sum = big(0);
      for (var k = 1; k < BITS + 20; k++) {
        sum += one / (big(k) << big(k));
      }
      LN2 = sum >> big(10);
    }
    return LN2;
  }

  function exactHalfPower(y) {
    if (typeof BigInt === "undefined") {
      return Math.pow(0.5, y);
    }
    var whole = Math.floor(y);
    var frac = y - whole;                       // exact for these doubles
    // frac as an exact fraction: m / 2^s
    var s = 0;
    var m = frac;
    while (m !== Math.floor(m)) {
      m *= 2;
      s += 1;
    }
    var one = big(1) << big(BITS);
    // z = frac x ln 2, in units of 2^-BITS
    var z = (big(m) * ln2Fixed()) >> big(s);
    // exp(-z) by its series
    var term = one, sum = one;
    for (var k = 1; k < 200 && term !== big(0); k++) {
      term = (term * z) / (one * big(k));
      sum += (k % 2 === 1 ? -term : term);
    }
    // sum x 2^-BITS x 2^-whole to the nearest double
    var bits = sum.toString(2).length;
    var shift = bits - 53;
    var mant = sum >> big(shift);
    var rest = sum - (mant << big(shift));
    var half = big(1) << big(shift - 1);
    if (rest > half || (rest === half && (mant & big(1)) === big(1))) {
      mant += big(1);
    }
    return Number(mant) * Math.pow(2, shift - BITS - whole);
  }

  /* The speed at which a full room eaten from every step is half empty after
   * h steps. Settings may give eat_per_step directly instead; the game
   * records the number it used either way. */
  function halfLifeSpeed(rule, h) {
    h = Number(h);
    if (!(h > 0)) {
      throw new Error("half_empty_in must be above 0, got " + h);
    }
    if (rule === "linear") {
      return 0.5 / h;
    }
    if (rule === "exponential") {
      return 1 - exactHalfPower(1 / h);
    }
    throw new Error("food.rule must be linear or exponential, got " + rule);
  }

  /* 0 empty, 1 part, 2 full, with the model's edges (empty < 0.25 <= part <
   * 0.75 <= full by default). */
  function binOf(level, edges) {
    if (level < edges[0]) {
      return 0;
    }
    return level < edges[1] ? 1 : 2;
  }

  // ------------------------------------------------------------ mazes
  function sameRoom(a, b) {
    return a[0] === b[0] && a[1] === b[1];
  }

  /* "s33" for row 3, column 3; a room in row or column 10 or more has a _
   * between them, "s10_3", as in the model (forage.lab.config.room_name). */
  function roomName(room) {
    if (room[0] < 10 && room[1] < 10) {
      return "s" + room[0] + room[1];
    }
    return "s" + room[0] + "_" + room[1];
  }

  /* The room a name stands for, [row, column], or null: "s33", "s10_3". */
  function roomFromName(text) {
    var m = /^[sS](\d)(\d)$/.exec(String(text)) || /^[sS](\d+)_(\d+)$/.exec(String(text));
    return m ? [Number(m[1]), Number(m[2])] : null;
  }

  function Maze(name, grid, colours) {
    this.name = name;
    this.grid = grid;
    this.colours = colours || [];
    this.rows = grid.length;
    this.cols = grid[0].length;
  }

  Maze.prototype.isRoom = function (room) {
    var r = room[0], c = room[1];
    return r >= 0 && c >= 0 && r < this.rows && c < this.cols && this.grid[r][c] >= 0;
  };

  Maze.prototype.rooms = function () {
    var out = [];
    for (var r = 0; r < this.rows; r++) {
      for (var c = 0; c < this.cols; c++) {
        if (this.grid[r][c] >= 0) {
          out.push([r, c]);
        }
      }
    }
    return out;
  };

  Maze.prototype.colourOf = function (room) {
    return this.colours[this.grid[room[0]][room[1]]] || "#999999";
  };

  /* The moves open from a room, STAY included, in the model's order. */
  Maze.prototype.legal = function (room) {
    var out = [];
    for (var i = 0; i < MOVES.length; i++) {
      var d = STEP[MOVES[i]];
      if (MOVES[i] === "STAY" || this.isRoom([room[0] + d[0], room[1] + d[1]])) {
        out.push(MOVES[i]);
      }
    }
    return out;
  };

  /* Where a move leads; a move into a wall leaves the player where it is. */
  Maze.prototype.next = function (room, move) {
    var d = STEP[move];
    var to = [room[0] + d[0], room[1] + d[1]];
    return this.isRoom(to) ? to : [room[0], room[1]];
  };

  function maze(name) {
    var m = FG.MAZES && FG.MAZES[name];
    if (!m) {
      throw new Error("unknown maze " + name);
    }
    return new Maze(name, m.rooms, m.colours);
  }

  // ------------------------------------------------------------ the food
  /* spec: {food_rooms: {name: {room: [r, c], value, start}}, eat, refill,
   * rule, random_draw, draw_rate, start_room}; draw: a function giving 1
   * number in [0, 1) per step. */
  function World(spec, draw) {
    this.names = Object.keys(spec.food_rooms);
    this.rooms = {};
    this.level = {};
    for (var i = 0; i < this.names.length; i++) {
      var n = this.names[i], f = spec.food_rooms[n];
      this.rooms[n] = {room: [f.room[0], f.room[1]], value: Number(f.value)};
      this.level[n] = tidy(f.start);
    }
    this.eat = Number(spec.eat);
    this.refill = Number(spec.refill);
    this.rule = spec.rule || "linear";
    this.randomDraw = !!spec.random_draw;
    this.drawRate = Number(spec.draw_rate);
    this.previous = [spec.start_room[0], spec.start_room[1]];
    this.current = [spec.start_room[0], spec.start_room[1]];
    this.draw = draw;
    this.refillsSkipped = 0;
  }

  /* 1 step, right after the player has moved to roomNow. Returns what
   * happened to each food room: "eaten", "refilled" or "skipped", and the
   * draw. */
  World.prototype.advance = function (roomNow) {
    var draw = this.draw();
    var what = {};
    for (var i = 0; i < this.names.length; i++) {
      var n = this.names[i];
      if (sameRoom(this.rooms[n].room, this.previous)) {
        this.level[n] = eaten(this.level[n], this.eat, this.rule);
        what[n] = "eaten";
      } else if (this.randomDraw && draw >= this.drawRate) {
        this.refillsSkipped += 1;
        what[n] = "skipped";
      } else {
        this.level[n] = refilled(this.level[n], this.refill, this.rule);
        what[n] = "refilled";
      }
    }
    this.previous = [roomNow[0], roomNow[1]];
    this.current = [roomNow[0], roomNow[1]];
    return {draw: draw, rooms: what};
  };

  World.prototype.nameAt = function (room) {
    for (var i = 0; i < this.names.length; i++) {
      if (sameRoom(this.rooms[this.names[i]].room, room)) {
        return this.names[i];
      }
    }
    return null;
  };

  World.prototype.levelAt = function (room) {
    var n = this.nameAt(room);
    return n === null ? 0 : this.level[n];
  };

  World.prototype.paid = function () {
    var n = this.nameAt(this.current);
    return n === null ? 0 : this.rooms[n].value * this.level[n];
  };

  // ------------------------------------------------------------ energy
  function Stomach(spec) {
    this.size = Number(spec.size);
    this.moveCost = Number(spec.move_cost);
    this.stayCost = Number(spec.stay_cost);
    this.energy = Number(spec.start);
  }

  /* 1 step: returns {energy, lost} with lost the food beyond a full stomach. */
  Stomach.prototype.step = function (moved, paid) {
    var cost = moved ? this.moveCost : this.stayCost;
    var raw = this.energy - cost + paid;
    var lost = raw > this.size ? raw - this.size : 0;
    this.energy = Math.max(0, Math.min(this.size, raw));
    return {energy: this.energy, lost: lost, cost: cost};
  };

  FG.rules = {
    MOVES: MOVES,
    pyRound: pyRound,
    exactHalfPower: exactHalfPower,
    tidy: tidy,
    eaten: eaten,
    refilled: refilled,
    halfLifeSpeed: halfLifeSpeed,
    binOf: binOf,
    sameRoom: sameRoom,
    roomName: roomName,
    roomFromName: roomFromName,
    Maze: Maze,
    maze: maze,
    World: World,
    Stomach: Stomach
  };
})(typeof window !== "undefined" ? window : globalThis);
