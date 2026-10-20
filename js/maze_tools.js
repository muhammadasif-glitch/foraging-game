/* The team's own mazes: drawn in the maze editor (open the game with
 * ?edit=1), saved into js/my_mazes.js on GitHub, and shown on the first page
 * after the mazes of settings.js.
 *
 * A saved maze is kept as its drawing, 1 line per row of rooms:
 *
 *     ". . # ."      .  a room
 *     "S . . C"      #  no room
 *     ". # B ."      S  the start room, C the cheese room, B the bread room
 *
 * with moves (the length of a game in it), saved_by and saved_at. As in the
 * model's tools/make_environment.py, 2 rooms side by side are joined by a
 * door, and every room gets its own colour, numbered in reading order, so a
 * room's colour and painting tell the player nothing beyond the room. A
 * start, cheese or bread room left out is placed at random each game, as in
 * the mazes of settings.js.
 *
 * A maze in js/my_mazes.js that does not pass check() is left out (the
 * editor's first page lists why), so a bad entry never stops the game. */
(function (root) {
  "use strict";
  var FG = root.FG = root.FG || {};

  var MIN_SIDE = 2, MAX_SIDE = 12, MAX_MOVES = 1000;
  var NAME = /^[a-z][a-z0-9_]{0,39}$/;
  var MARKS = {S: "start", C: "cheese", B: "bread"};
  var DRAFT = "__draft__";            // the maze being drawn, while it is tried

  function maxRooms() {
    return (FG.FILM_PALETTE || []).length || 140;
  }

  function roomName(r, c) {
    return FG.rules ? FG.rules.roomName([r, c]) : "s" + r + (r >= 10 || c >= 10 ? "_" : "") + c;
  }

  /* The cells of a drawing: rows of ".", "#", "S", "C" or "B". */
  function cellsOf(shape) {
    if (!Array.isArray(shape)) {
      return null;
    }
    return shape.map(function (line) {
      return typeof line === "string" ? line.replace(/\s+/g, "").split("") : null;
    });
  }

  /* The drawing of cells. */
  function shapeOf(cells) {
    return cells.map(function (row) { return row.join(" "); });
  }

  /* What a drawing holds: rooms (colour numbers in reading order, -1 for no
   * room), the start, cheese and bread rooms (or null), and problems, each a
   * sentence a person can act on. */
  function read(shape) {
    var out = {rooms: null, start: null, cheese: null, bread: null, count: 0, problems: []};
    var cells = cellsOf(shape);
    if (!cells || cells.some(function (row) { return row === null; })) {
      out.problems.push("The drawing must be rows of . # S C B.");
      return out;
    }
    var R = cells.length, C = R ? cells[0].length : 0;
    if (R < MIN_SIDE || R > MAX_SIDE || C < MIN_SIDE || C > MAX_SIDE) {
      out.problems.push("A maze has " + MIN_SIDE + " to " + MAX_SIDE + " rows and " + MIN_SIDE + " to " +
        MAX_SIDE + " columns.");
      return out;
    }
    if (cells.some(function (row) { return row.length !== C; })) {
      out.problems.push("Every row must be as long as the first.");
      return out;
    }
    var n = 0, seen = {S: 0, C: 0, B: 0};
    out.rooms = cells.map(function (row, r) {
      return row.map(function (ch, c) {
        if (ch === "#") {
          return -1;
        }
        if (ch !== "." && !MARKS[ch]) {
          out.problems.push("Row " + (r + 1) + " has '" + ch + "'; use . # S C B.");
          return -1;
        }
        if (MARKS[ch]) {
          seen[ch] += 1;
          out[MARKS[ch]] = [r, c];
        }
        return n++;
      });
    });
    out.count = n;
    Object.keys(seen).forEach(function (k) {
      if (seen[k] > 1) {
        out.problems.push("There can be only 1 " + MARKS[k] + " room (" + k + ").");
      }
    });
    if (n < 2) {
      out.problems.push("A maze needs at least 2 rooms.");
    } else if (n > maxRooms()) {
      out.problems.push("A maze can have at most " + maxRooms() + " rooms (the game has " + maxRooms() +
        " room colours); this one has " + n + ".");
    } else {
      var cut = unreachable(out.rooms);
      if (cut.length) {
        var names = cut.slice(0, 4).map(function (rc) { return roomName(rc[0], rc[1]); });
        out.problems.push((cut.length === 1 ? "Room " + names[0] + " is" : "Rooms " + names.join(", ") +
          (cut.length > 4 ? " and " + (cut.length - 4) + " more are" : " are")) +
          " cut off from the other rooms: every room must be reachable from every other.");
      }
    }
    return out;
  }

  /* The rooms outside the largest group of rooms joined by doors. */
  function unreachable(rooms) {
    var R = rooms.length, C = rooms[0].length, group = {}, sizes = [];
    rooms.forEach(function (row, i) {
      row.forEach(function (v, j) {
        if (v < 0 || group[i + "," + j] !== undefined) {
          return;
        }
        var k = sizes.length, queue = [[i, j]], n = 0;
        group[i + "," + j] = k;
        while (queue.length) {
          var at = queue.shift();
          n += 1;
          [[0, 1], [1, 0], [0, -1], [-1, 0]].forEach(function (d) {
            var a = at[0] + d[0], b = at[1] + d[1];
            if (a >= 0 && b >= 0 && a < R && b < C && rooms[a][b] >= 0 && group[a + "," + b] === undefined) {
              group[a + "," + b] = k;
              queue.push([a, b]);
            }
          });
        }
        sizes.push(n);
      });
    });
    var main = sizes.indexOf(Math.max.apply(null, sizes));
    var out = [];
    rooms.forEach(function (row, i) {
      row.forEach(function (v, j) {
        if (v >= 0 && group[i + "," + j] !== main) {
          out.push([i, j]);
        }
      });
    });
    return out;
  }

  /* Every problem of a saved maze: its name, drawing, moves and who saved it. */
  function check(name, def) {
    var problems = [];
    if (typeof name !== "string" || !NAME.test(name)) {
      problems.push("The name must start with a small letter and have only small letters, digits and _ " +
        "(at most 40).");
    }
    if (!def || typeof def !== "object") {
      return {problems: problems.concat(["The maze is empty."]), info: null};
    }
    var info = read(def.shape);
    problems = problems.concat(info.problems);
    if (typeof def.moves !== "number" || def.moves !== Math.floor(def.moves) || def.moves < 1 ||
        def.moves > MAX_MOVES) {
      problems.push("The moves must be a whole number from 1 to " + MAX_MOVES + ".");
    }
    if (def.saved_by !== undefined && (typeof def.saved_by !== "string" || def.saved_by.length > 40)) {
      problems.push("saved_by must be a name of at most 40 letters.");
    }
    return {problems: problems, info: info};
  }

  /* The colour of colour number i, as the game draws it: "#rrggbb". */
  function colour(i) {
    var c = (FG.FILM_PALETTE || [])[i] || [128, 128, 128];
    return "#" + c.map(function (v) { return ("0" + Math.round(v).toString(16)).slice(-2); }).join("");
  }

  /* The entry of FG.MAZES for a maze that passed check(). */
  function entry(def, info) {
    var colours = [];
    for (var i = 0; i < info.count; i++) {
      colours.push(colour(i));
    }
    var env = {start_rooms: info.start ? [info.start] : [], food_rooms: {}, steps: def.moves};
    return {
      rooms: info.rooms,
      colours: colours,
      environment: env,
      team: {shape: def.shape.slice(), start: info.start, food: {cheese: info.cheese, bread: info.bread},
        moves: def.moves, saved_by: def.saved_by || null, saved_at: def.saved_at || null}
    };
  }

  var problemsFound = [];

  /* Puts the mazes of js/my_mazes.js (FG.TEAM_MAZES) into FG.MAZES. Returns
   * the names taken in, in the order they were saved; the others are listed
   * by problems(). */
  function register() {
    var team = FG.TEAM_MAZES || {};
    var names = [];
    problemsFound = [];
    if (!team || typeof team !== "object" || Array.isArray(team)) {
      problemsFound.push({name: null, problem: "js/my_mazes.js does not hold a group of mazes."});
      return names;
    }
    Object.keys(team).forEach(function (name) {
      if (FG.MAZES[name] && !FG.MAZES[name].team) {
        problemsFound.push({name: name, problem: "A maze of the game is already called " + name + "."});
        return;
      }
      var c = check(name, team[name]);
      if (c.problems.length) {
        problemsFound.push({name: name, problem: c.problems.join(" ")});
        return;
      }
      FG.MAZES[name] = entry(team[name], c.info);
      names.push(name);
    });
    return names;
  }

  /* A maze taken out after register(), for example because the settings do
   * not fit it. */
  function leaveOut(name, why) {
    delete FG.MAZES[name];
    problemsFound.push({name: name, problem: why});
  }

  function problems() {
    return problemsFound.slice();
  }

  // ------------------------------------------------------------ the file
  var HEAD = [
    "/* The team's own mazes, drawn in the game's maze editor (open the game with",
    " * ?edit=1) and saved here by its \"Save to game\" button. Each maze is drawn as",
    " * rows of rooms: . a room, # no room, S the start, C the cheese room, B the",
    " * bread room. A saved maze is not changed afterwards; an edited one is saved",
    " * under a new name. See js/maze_tools.js. */",
    "(function (root) {",
    "  var FG = root.FG = root.FG || {};",
    "  FG.TEAM_MAZES = "
  ].join("\n");
  var TAIL = ";\n})(typeof window !== \"undefined\" ? window : globalThis);\n";

  /* js/my_mazes.js holding mazes. */
  function fileText(mazes) {
    return HEAD + JSON.stringify(mazes, null, 2).replace(/\n/g, "\n  ") + TAIL;
  }

  /* The mazes of a js/my_mazes.js. */
  function parseFile(text) {
    var a = text.indexOf("FG.TEAM_MAZES = ");
    var b = text.lastIndexOf(";\n})(");
    if (a < 0 || b < a) {
      throw new Error("js/my_mazes.js is not as the editor writes it");
    }
    var mazes = JSON.parse(text.slice(a + "FG.TEAM_MAZES = ".length, b));
    if (!mazes || typeof mazes !== "object" || Array.isArray(mazes)) {
      throw new Error("js/my_mazes.js does not hold a group of mazes");
    }
    return mazes;
  }

  FG.mazeTools = {
    MIN_SIDE: MIN_SIDE, MAX_SIDE: MAX_SIDE, MAX_MOVES: MAX_MOVES, NAME: NAME, DRAFT: DRAFT,
    maxRooms: maxRooms, colour: colour, cellsOf: cellsOf, shapeOf: shapeOf, read: read, unreachable: unreachable,
    check: check, entry: entry,
    register: register, leaveOut: leaveOut, problems: problems, fileText: fileText, parseFile: parseFile
  };
})(typeof window !== "undefined" ? window : globalThis);
