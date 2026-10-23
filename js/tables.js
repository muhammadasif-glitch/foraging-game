/* The game files as tables for the research (analysis.html): one row for
 * each observation and one table for each kind of observation, every
 * column described in the data dictionary (TABLES). The tables are made
 * from the files alone, as they were saved, so files of every version since
 * format 9 read the same way; nothing in a file is changed.
 *
 *   games       1 row a game: who, which condition, maze and view, how it
 *               ended, food, energy, exploring, paintings, music, browser
 *   steps       1 row a step of the world (step 0 is the start)
 *   food        1 row a step and food room: its true level, what happened
 *   visits      1 row a visit to a food room: from the step that entered it
 *               to the step that left it
 *   navigation  1 row a move from room to room
 *   track       1 row every 100 ms: where the player was and looked
 *   keys        1 row a key pressed or let go
 *   turns       1 row a turn (3D)
 *   looks       1 row a painting seen (3D)
 *   likes       1 row a like or un-like (3D)
 *   clicks      1 row a click on the view
 *   music       1 row a record played
 *   page        1 row the window losing or getting back the keyboard, or
 *               the sound switched off or on
 *
 * Times are seconds from the start of the game (started_at), so a key on
 * the first page before the game has a time below 0. Yes and no are 1 and
 * 0; an empty cell has no value. Works in the browser and in node (the
 * checks). */
(function (root) {
  "use strict";
  var FG = root.FG = root.FG || {};

  var ID = [
    ["file", "the game file"],
    ["player", "the player code (8 hex digits, kept in the player's browser)"],
    ["session", "the visit of the page the game was played in"],
    ["game", "which game of the visit (1, 2, ...)"]
  ];

  /* Each table: name, what a row is, and its columns [name, meaning]; a
   * name with {food} is 1 column for each food room of the files (patch,
   * small). */
  var TABLES = [
    {name: "games", row: "a game", columns: ID.concat([
      ["partial", "1: the page was closed during the game, so the file holds the game up to then"],
      ["test", "1: a test game (the file name starts with TEST_)"],
      ["version", "the version of the game"],
      ["started", "when the game began (UTC, ISO 8601)"],
      ["condition", "the condition (the food rule and its speed)"],
      ["condition_how", "how the condition was chosen: link, datapipe, random or no conditions"],
      ["food_rule", "how food runs down and grows back: linear or exponential"],
      ["eat_speed", "how much of a food room one step of eating takes"],
      ["refill_speed", "how much a food room grows back in a step"],
      ["maze", "the maze"],
      ["view", "2d (from above) or 3d (from inside)"],
      ["camera", "3D: eyes (through the player's eyes) or behind (from behind the player); empty in 2D"],
      ["character", "who the player was: man, woman, dog, mouse, robot, knight or arrow"],
      ["character_how", "chosen on the characters page, settings, or no choice"],
      ["same_speed", "1: every character had the mouse's speed (game.same_speed)"],
      ["start_room", "the room the player started in (s<row><column>, s00 top left)"],
      ["steps_allowed", "how many steps the game had (settings.steps)"],
      ["count_steps", "which steps used up the steps: moves, or all (stays too)"],
      ["first_step_stay", "1: the first step was a stay"],
      ["idle_stay_ms", "with no key held, a stay every this many ms"],
      ["stomach_size", "the energy of a full bar"],
      ["stomach_start", "the energy at the start"],
      ["move_cost", "the energy a move costs"],
      ["stay_cost", "the energy a stay costs"],
      ["at_zero", "what energy 0 did: end (the game ended) or continue"],
      ["when_full", "a full bar in a food room: stop (eating stops until the player walks out) or keep"],
      ["show_level", "how the food level was shown"],
      ["ended_how", "finished (all steps taken), starved, or page closed"],
      ["duration_s", "seconds from the start to the end of the game"],
      ["steps", "steps of the world taken (moves and stays)"],
      ["moves", "moves from room to room"],
      ["idle_stays", "stays standing still with no key held"],
      ["space_stays", "stays by Space"],
      ["food_eaten", "food eaten (paid) in the game"],
      ["food_lost", "food that did not fit into a full stomach"],
      ["energy_end", "the energy at the end"],
      ["energy_min", "the lowest energy after a step"],
      ["energy_mean", "the energy after the steps, on average"],
      ["full_steps", "steps nothing was paid on because the bar was full"],
      ["decision_ms_median", "the median time from being able to act to setting off, over the moves"],
      ["rooms_in_maze", "rooms of the maze"],
      ["rooms_entered", "different rooms the player was in"],
      ["rooms_known", "rooms the player was shown (entered, or next to a room entered)"],
      ["explored_half_step", "the step by which the player had been in half of the rooms of the maze"],
      ["explored_all_step", "the step by which the player had been in every room (empty if not)"],
      ["revisits", "moves into a room the player had been in before"],
      ["backtracks", "moves straight back into the room the player had just come from"],
      ["walks_back", "times the player went out into a door or corridor and back into the same room"],
      ["walked_tiles", "tiles walked (a room is 4 tiles, a corridor 3), from the steps"],
      ["track_tiles", "tiles walked, from the track (the place every 100 ms)"],
      ["turns", "3D: turns"],
      ["food_rooms_found", "food rooms the player entered"],
      ["visits", "visits to food rooms"],
      ["{food}_room", "the room of the {food} food room"],
      ["{food}_food", "the food the {food} food room showed (cheese or bread)"],
      ["{food}_worth", "the food a full {food} food room gives in a step"],
      ["{food}_found_step", "the step the {food} food room was first entered (empty if never)"],
      ["{food}_visits", "visits to the {food} food room"],
      ["{food}_stays", "stays in the {food} food room"],
      ["{food}_eaten", "food eaten in the {food} food room"],
      ["paintings_seen", "3D: paintings seen"],
      ["paintings_looked_at", "3D: paintings that were in the middle of the view"],
      ["look_s", "3D: seconds a painting was in the middle of the view, all paintings"],
      ["likes", "3D: likes (un-likes not counted)"],
      ["unlikes", "3D: likes taken back"],
      ["clicks", "clicks on the view"],
      ["music_room", "3D: the music room"],
      ["music_plays", "records played"],
      ["music_s", "seconds records played"],
      ["sound_switches", "times the sound was switched off or on during the game"],
      ["focus_lost", "times the window or tab lost the keyboard, from the end of the game before to the end of this one"],
      ["browser", "the browser (its user agent)"],
      ["screen_width", "the screen, CSS pixels"],
      ["screen_height", "the screen, CSS pixels"],
      ["window_width", "the window, CSS pixels"],
      ["window_height", "the window, CSS pixels"],
      ["pixel_ratio", "device pixels a CSS pixel"],
      ["time_zone", "the time zone of the computer"],
      ["refresh_hz", "screen frames a second"],
      ["renderer", "3D: what drew the view: webgl, webgl2, or canvas (ray casting)"],
      ["gpu", "3D: the graphics card (as the browser names it)"],
      ["draw_ms_median", "3D: the median time to draw the view, ms"]
    ])},
    {name: "steps", row: "a step of the world (step 0 is the start)", columns: ID.concat([
      ["step", "0 for the start, then 1, 2, ..."],
      ["move", "UP, DOWN, LEFT, RIGHT or STAY"],
      ["by", "how the step came: walk (a room entered), Space, or idle (a second with no key held)"],
      ["key", "the key: ArrowUp, ... or Space"],
      ["held", "1: the walk began with a key held on from before the step before"],
      ["room_from", "the room the choice was made in"],
      ["room_to", "the room the move led to"],
      ["room", "the room after the step"],
      ["in_food_room", "the food room the player is in after the step (patch, small), empty if none"],
      ["legal", "the moves open from the room the choice was made in"],
      ["facing", "the way the player faced at the step (RIGHT, DOWN, LEFT, UP; in 2D the way walked)"],
      ["angle_deg", "3D: the way the player looked at the step, degrees (0 east, 90 south)"],
      ["decision_ms", "time from being able to act (shown_s) to setting off (key_s)"],
      ["hold_ms", "how long the key was held after the step"],
      ["stops", "times the player stood still since the step before"],
      ["walked_tiles", "tiles walked since the step before"],
      ["turns_before", "3D: turns while choosing"],
      ["walls_before", "keys toward a wall pressed while choosing"],
      ["other_keys_before", "other keys pressed while choosing"],
      ["shown_s", "when the player could act: the room before entered, or the stay before over"],
      ["key_s", "when the walk to this room began, or Space was pressed"],
      ["entered_s", "when the step was taken: the floor of the room entered (a stay: at once)"],
      ["paid", "food eaten on the step"],
      ["cost", "the energy the step cost"],
      ["food_lost", "food lost to a full stomach on the step"],
      ["energy", "the energy after the step"],
      ["energy_shown", "the energy the bar showed"],
      ["eaten", "food eaten so far"],
      ["moves", "moves so far, this step included"],
      ["steps_left", "steps left, as shown"],
      ["full", "1: nothing was paid because the bar was full"],
      ["kept", "the food room not eaten from because the player was full there"],
      ["seen", "the level of the food room the player is in (0 to 1)"],
      ["shown", "what the player was shown of it (74%, or part full)"],
      ["found", "the food room entered for the first time on this step"],
      ["known_new", "rooms shown from this step on (the room entered and the rooms next to it)"],
      ["known_food_new", "food rooms among them"],
      ["corner", "1: a room crossed at its corner, taken together with the move after it"],
      ["events", "what happened: known, found, empty, full again, refill skipped, food lost, full"],
      ["draw", "the step's random draw (0 to 1; refills with random_refill)"],
      ["level_{food}", "the true level of the {food} food room after the step (0 to 1)"]
    ])},
    {name: "food", row: "a step and a food room", columns: ID.concat([
      ["step", "the step"],
      ["food_room", "patch or small"],
      ["room", "its room"],
      ["level", "its true level after the step (0 to 1)"],
      ["change", "what happened to it: eaten, refilled, skipped (random refill) or kept (full)"],
      ["player_in", "1: the player was in it after the step"],
      ["known", "1: the player had been shown it by then"]
    ])},
    {name: "visits", row: "a visit to a food room, from the step that entered it to the last step in it", columns: ID.concat([
      ["visit", "the visit's number in the game (1, 2, ...)"],
      ["food_room", "patch or small"],
      ["room", "its room"],
      ["first", "1: the first visit to this food room"],
      ["enter_step", "the step that entered it"],
      ["last_step", "the last step in it"],
      ["leave_step", "the step that left it (empty if the game ended there)"],
      ["stays", "stays during the visit"],
      ["duration_s", "seconds from entering to leaving (or to the end of the game)"],
      ["level_before", "its true level on the step before entering (0 to 1)"],
      ["level_end", "its true level on the last step in it: the level the player left"],
      ["shown_end", "what the player was shown of it on the last step"],
      ["eaten", "food eaten during the visit (entering pays the level)"],
      ["energy_before", "the energy before entering"],
      ["energy_end", "the energy on the last step in it"],
      ["full", "1: the bar was full at some step of the visit"],
      ["ended_in", "1: the game ended during the visit"],
      ["travel_steps", "steps since the last food-room visit ended (since the start, for the first)"],
      ["travel_moves", "moves in that time"],
      ["travel_s", "seconds in that time"],
      ["since_last_steps", "steps since the visit before to this same food room ended (empty for the first)"]
    ])},
    {name: "navigation", row: "a move from room to room", columns: ID.concat([
      ["move_number", "the move's number in the game (1, 2, ...)"],
      ["step", "its step"],
      ["from_room", "the room left"],
      ["to_room", "the room entered"],
      ["direction", "UP, DOWN, LEFT or RIGHT"],
      ["new_room", "1: the first time in this room"],
      ["times_in", "times the player had been in this room, this one included"],
      ["backtrack", "1: straight back into the room the player had just come from"],
      ["corner", "1: a room crossed at its corner"],
      ["rooms_entered", "different rooms the player had been in, this one included"],
      ["rooms_known", "rooms the player had been shown by then"],
      ["food_room", "the food room entered (patch, small), empty if none"],
      ["from_start", "the shortest way from the start room to this room, in moves"],
      ["to_nearest_food", "the shortest way from this room to the nearest food room, in moves"],
      ["decision_ms", "time from being able to act to setting off"],
      ["walk_s", "seconds from setting off to entering"],
      ["walked_tiles", "tiles walked"],
      ["stops", "times the player stood still on the way"],
      ["entered_s", "when the room was entered"]
    ])},
    {name: "track", row: "the player's place and view, every 100 ms during the game", columns: ID.concat([
      ["t_s", "the time"],
      ["x", "the place across, tiles from the left of the maze"],
      ["y", "the place down, tiles from the top"],
      ["angle_deg", "3D: the way the player looked (0 east, 90 south)"],
      ["step", "steps taken by then"],
      ["look", "3D: the painting place in the middle of the view (empty if none)"],
      ["look_d", "3D: how far it was, tiles"],
      ["look_share", "3D: the share of the view it took"],
      ["music", "the record playing (empty if none)"],
      ["tilt", "3D: how far the view looked up at a near painting"],
      ["back", "1: walking backwards"]
    ])},
    {name: "keys", row: "a key pressed or let go, from the end of the game before to the end of this one", columns: ID.concat([
      ["t_s", "the time"],
      ["type", "down or up"],
      ["key", "the key as the browser names it (Space is a space)"],
      ["code", "the key's place on the keyboard"],
      ["repeat", "1: repeated by the browser while held"],
      ["phase", "where: characters, menu, game n, end n"],
      ["outcome", "what the key did"]
    ])},
    {name: "turns", row: "a turn in 3D", columns: ID.concat([
      ["t_s", "when the turn began"],
      ["step", "steps taken before it"],
      ["key", "ArrowLeft or ArrowRight"],
      ["from", "the door faced before (RIGHT, DOWN, LEFT, UP)"],
      ["to", "the door faced after"],
      ["from_angle", "the angle before, degrees (0 east, 90 south)"],
      ["to_angle", "the angle after"],
      ["ms", "how long the turn took"],
      ["held_ms", "how long the key was held"]
    ])},
    {name: "looks", row: "a painting seen (3D)", columns: ID.concat([
      ["place", "the painting's place (0, 1, ... over the walls)"],
      ["painting", "the painting (its id in js/paintings.js)"],
      ["painter", "who painted it"],
      ["title", "its title"],
      ["year", "its year"],
      ["room", "the room it hangs in"],
      ["side", "the wall: east, south, west or north"],
      ["look_ms", "how long it was in the middle of the view"],
      ["looks", "times it came into the middle of the view"],
      ["seen_ms", "how long it was in the view at all"],
      ["first_seen_s", "when it was first in the view"],
      ["first_look_s", "when it was first in the middle of the view"],
      ["nearest", "the nearest the player came while looking, tiles"],
      ["liked", "1: liked at the end"],
      ["likes", "likes and un-likes of it"]
    ])},
    {name: "likes", row: "a like or un-like (3D)", columns: ID.concat([
      ["t_s", "the time"],
      ["step", "steps taken before it"],
      ["place", "the painting's place"],
      ["painting", "the painting"],
      ["room", "its room"],
      ["side", "its wall"],
      ["liked", "1: a like, 0: a like taken back"],
      ["by", "L (the painting in the middle of the view) or click (on its plaque)"],
      ["distance", "how far the player was, tiles"]
    ])},
    {name: "clicks", row: "a click on the view", columns: ID.concat([
      ["t_s", "the time"],
      ["step", "steps taken before it"],
      ["x", "CSS pixels from the left of the view"],
      ["y", "CSS pixels from the top of the view"],
      ["on", "what was clicked: plaque, gramophone or nothing"],
      ["place", "the painting place of a plaque"],
      ["outcome", "like, unlike, music on, music off, ignored, nothing"]
    ])},
    {name: "music", row: "a record played", columns: ID.concat([
      ["piece", "the record"],
      ["started_s", "when it began"],
      ["step", "steps taken by then"],
      ["by", "P or click"],
      ["stopped_s", "when it stopped"],
      ["stopped_by", "P, click, ended, game over, or failed"],
      ["played_s", "seconds it played"]
    ])},
    {name: "page", row: "the window losing or getting back the keyboard, or the sound switched", columns: ID.concat([
      ["t_s", "the time"],
      ["what", "focus (the keyboard) or sound"],
      ["type", "focus: the browser's event (blur, focus, hidden, visible); sound: off or on"],
      ["by", "sound: M or the button"],
      ["phase", "where: characters, menu, game n, end n"]
    ])}
  ];

  // ------------------------------------------------------------ helpers
  function num(v, nd) {
    if (v === null || v === undefined || v === "" || typeof v !== "number" || !isFinite(v)) {
      return null;
    }
    if (nd === undefined) {
      return v;
    }
    var k = Math.pow(10, nd);
    return Math.round(v * k) / k;
  }

  function yes(v) {
    return v === null || v === undefined ? null : v ? 1 : 0;
  }

  function text(v) {
    if (v === null || v === undefined) {
      return null;
    }
    if (Array.isArray(v)) {
      return v.length ? v.join(" ") : null;
    }
    return String(v);
  }

  function median(xs) {
    var a = xs.filter(function (x) { return typeof x === "number" && isFinite(x); }).sort(function (p, q) { return p - q; });
    if (!a.length) {
      return null;
    }
    var m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  function roomName(r, c) {
    return r < 10 && c < 10 ? "s" + r + c : "s" + r + "_" + c;
  }

  /* The maze of a game: its rooms and the shortest way between them (every
   * room next to another is open to it, as in js/rules.js). */
  function Maze(grid) {
    this.grid = grid;
    this.names = [];
    for (var r = 0; r < grid.length; r++) {
      for (var c = 0; c < grid[r].length; c++) {
        if (grid[r][c] >= 0) {
          this.names.push(roomName(r, c));
        }
      }
    }
    this.cache = {};
  }

  Maze.prototype.at = function (name) {
    var m = /^s(\d)(\d)$/.exec(name) || /^s(\d+)_(\d+)$/.exec(name);
    return m ? [Number(m[1]), Number(m[2])] : null;
  };

  /* {room name: moves} from a room. */
  Maze.prototype.from = function (name) {
    if (this.cache[name]) {
      return this.cache[name];
    }
    var g = this.grid, out = {}, start = this.at(name), queue = [];
    if (start) {
      out[name] = 0;
      queue.push(start);
    }
    while (queue.length) {
      var p = queue.shift(), d = out[roomName(p[0], p[1])];
      [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (s) {
        var r = p[0] + s[0], c = p[1] + s[1];
        if (r >= 0 && c >= 0 && r < g.length && c < g[r].length && g[r][c] >= 0 && out[roomName(r, c)] === undefined) {
          out[roomName(r, c)] = d + 1;
          queue.push([r, c]);
        }
      });
    }
    this.cache[name] = out;
    return out;
  };

  /* The food rooms of the files (patch, small, then any others). */
  function foodNames(files) {
    var seen = {};
    files.forEach(function (f) {
      Object.keys((f.game.layout && f.game.layout.food_rooms) || {}).forEach(function (k) { seen[k] = true; });
    });
    var order = ["patch", "small"];
    return order.filter(function (k) { return seen[k]; }).concat(Object.keys(seen).filter(function (k) {
      return order.indexOf(k) < 0;
    }).sort());
  }

  /* The columns of a table, with {food} spread over the food rooms. */
  function columnsOf(table, foods) {
    var out = [];
    table.columns.forEach(function (c) {
      if (c[0].indexOf("{food}") >= 0) {
        foods.forEach(function (k) {
          out.push([c[0].replace("{food}", k), c[1].replace(/\{food\}/g, k)]);
        });
      } else {
        out.push(c);
      }
    });
    return out;
  }

  function isGameFile(f) {
    return !!(f && f.format === "foraging-game" && f.game && Array.isArray(f.game.steps));
  }

  // ------------------------------------------------------------ 1 game
  /* The rows of every table for 1 game file: {table: [row objects]}. */
  function rowsOf(name, f, foods) {
    var g = f.game, s = g.settings || {}, steps = g.steps, t0 = g.started_at || 0;
    var id = {file: name, player: f.player || null, session: f.session_id || null, game: g.number || null};
    var maze = new Maze((g.maze_def && g.maze_def.rooms) || (FG.MAZES && FG.MAZES[g.maze] && FG.MAZES[g.maze].rooms) || [[]]);
    var foodRooms = (g.layout && g.layout.food_rooms) || {};
    var roomFood = {};
    Object.keys(foodRooms).forEach(function (k) { roomFood[foodRooms[k]] = k; });
    function sec(t) {
      return typeof t === "number" ? num((t - t0) / 1000, 3) : null;
    }
    function row(extra) {
      var r = {file: id.file, player: id.player, session: id.session, game: id.game};
      Object.keys(extra).forEach(function (k) { r[k] = extra[k]; });
      return r;
    }
    var out = {games: [], steps: [], food: [], visits: [], navigation: [], track: [], keys: [], turns: [],
      looks: [], likes: [], clicks: [], music: [], page: []};

    // steps and food levels
    var known = {};
    steps.forEach(function (st) {
      (st.known_new || []).forEach(function (n) { known[n] = true; });
      var r = row({
        step: st.step, move: st.move || null, by: st.by || null, key: st.key || null, held: yes(st.held),
        room_from: st.room_from || null, room_to: st.room_to || null, room: st.room || null,
        in_food_room: st.in_food_room || null, legal: text(st.legal), facing: st.facing || null,
        angle_deg: num(st.angle, 1), decision_ms: num(st.decision_ms, 1), hold_ms: num(st.hold_ms, 1),
        stops: num(st.stops), walked_tiles: num(st.walked_tiles, 2), turns_before: num(st.turns_before),
        walls_before: num(st.walls_before), other_keys_before: num(st.other_keys_before),
        shown_s: sec(st.shown_at), key_s: sec(st.key_at), entered_s: sec(st.entered_at),
        paid: num(st.paid, 6), cost: num(st.cost, 6), food_lost: num(st.food_lost, 6), energy: num(st.energy, 6),
        energy_shown: num(st.energy_shown), eaten: num(st.eaten, 6), moves: num(st.moves), steps_left: num(st.steps_left),
        full: yes(st.full), kept: st.kept || null, seen: num(st.seen, 6), shown: st.shown === null || st.shown === undefined ? null : String(st.shown),
        found: st.found || null, known_new: text(st.known_new), known_food_new: text(st.known_food_new),
        corner: yes(st.corner), events: (st.events || []).map(function (e) {
          return e.type + (e.room ? " " + e.room : "") + (e.amount !== undefined ? " " + num(e.amount, 3) : "");
        }).join("; ") || null,
        draw: num(st.draw, 6)
      });
      foods.forEach(function (k) {
        r["level_" + k] = st.levels && st.levels[k] !== undefined ? num(st.levels[k], 6) : null;
      });
      out.steps.push(r);
      Object.keys(foodRooms).forEach(function (k) {
        out.food.push(row({
          step: st.step, food_room: k, room: foodRooms[k],
          level: st.levels && st.levels[k] !== undefined ? num(st.levels[k], 6) : null,
          change: st.change && st.change[k] ? st.change[k] : null,
          player_in: st.room === foodRooms[k] ? 1 : 0, known: known[foodRooms[k]] ? 1 : 0
        }));
      });
    });

    // visits: a run of steps in a food room
    var visits = [], cur = null, lastEnd = 0, lastEndAt = t0, lastEndMoves = 0, lastOf = {};
    steps.forEach(function (st, i) {
      var k = st.room && roomFood[st.room] ? roomFood[st.room] : null;
      if (cur && k !== cur.food_room) {
        cur.leave_step = st.step;
        cur.duration_s = num((st.entered_at - cur.at) / 1000, 3);
        lastEnd = cur.last_step;
        lastEndAt = st.entered_at;
        lastEndMoves = steps[i - 1].moves || 0;
        lastOf[cur.food_room] = cur.last_step;
        cur = null;
      }
      if (k && !cur) {
        var before = i > 0 ? steps[i - 1] : st;
        cur = {visit: visits.length + 1, food_room: k, room: st.room, first: lastOf[k] === undefined ? 1 : 0,
          enter_step: st.step, last_step: st.step, leave_step: null, stays: 0, duration_s: null,
          level_before: before.levels ? num(before.levels[k], 6) : null, level_end: null, shown_end: null,
          eaten: 0, energy_before: num(before.energy, 6), energy_end: null, full: 0, ended_in: 0,
          travel_steps: st.step - lastEnd, travel_moves: (st.moves || 0) - lastEndMoves,
          travel_s: num(((st.entered_at || 0) - lastEndAt) / 1000, 3),
          since_last_steps: lastOf[k] === undefined ? null : st.step - lastOf[k], at: st.entered_at || t0};
        visits.push(cur);
      }
      if (cur) {
        cur.last_step = st.step;
        if (st.step !== cur.enter_step && st.move === "STAY") {
          cur.stays += 1;
        }
        cur.eaten += st.paid || 0;
        cur.level_end = st.levels ? num(st.levels[k], 6) : null;
        cur.shown_end = st.shown === null || st.shown === undefined ? null : String(st.shown);
        cur.energy_end = num(st.energy, 6);
        if (st.full || (st.events || []).some(function (e) { return e.type === "full"; })) {
          cur.full = 1;
        }
      }
    });
    if (cur) {
      cur.ended_in = 1;
      var endAt = g.ended && typeof g.ended.at === "number" ? g.ended.at : steps[steps.length - 1].entered_at;
      cur.duration_s = num((endAt - cur.at) / 1000, 3);
    }
    visits.forEach(function (v) {
      v.eaten = num(v.eaten, 6);
      delete v.at;
      out.visits.push(row(v));
    });

    // navigation: the moves from room to room
    var times = {}, entered = {}, nEntered = 0, prevRoom = null, known2 = {}, nKnown = 0, nMoves = 0;
    var start = g.layout && g.layout.start_room, fromStart = start ? maze.from(start) : {};
    var foodList = Object.keys(foodRooms).map(function (k) { return foodRooms[k]; });
    steps.forEach(function (st, i) {
      (st.known_new || []).forEach(function (n) {
        if (!known2[n]) {
          known2[n] = true;
          nKnown += 1;
        }
      });
      if (i === 0) {
        if (st.room) {
          times[st.room] = 1;
          entered[st.room] = true;
          nEntered = 1;
        }
        return;
      }
      if (!st.move || st.move === "STAY" || st.room_to === st.room_from) {
        return;
      }
      nMoves += 1;
      var to = st.room_to, from = st.room_from;
      times[to] = (times[to] || 0) + 1;
      var isNew = !entered[to];
      if (isNew) {
        entered[to] = true;
        nEntered += 1;
      }
      var near = null;
      foodList.forEach(function (fr) {
        var d = maze.from(to)[fr];
        if (d !== undefined && (near === null || d < near)) {
          near = d;
        }
      });
      out.navigation.push(row({
        move_number: nMoves, step: st.step, from_room: from, to_room: to, direction: st.move,
        new_room: isNew ? 1 : 0, times_in: times[to], backtrack: prevRoom !== null && to === prevRoom ? 1 : 0,
        corner: yes(st.corner), rooms_entered: nEntered, rooms_known: nKnown, food_room: roomFood[to] || null,
        from_start: fromStart[to] === undefined ? null : fromStart[to], to_nearest_food: near,
        decision_ms: num(st.decision_ms, 1),
        walk_s: typeof st.entered_at === "number" && typeof st.key_at === "number" ? num((st.entered_at - st.key_at) / 1000, 3) : null,
        walked_tiles: num(st.walked_tiles, 2), stops: num(st.stops), entered_s: sec(st.entered_at)
      }));
      prevRoom = from;
    });

    // the track
    var trackTiles = null;
    if (g.track && g.track.rows) {
      var fi = {};
      g.track.fields.forEach(function (n, i) { fi[n] = i; });
      var get = function (r, n) { return fi[n] === undefined ? null : r[fi[n]]; };
      trackTiles = 0;
      g.track.rows.forEach(function (r, i) {
        if (i > 0) {
          var p = g.track.rows[i - 1];
          trackTiles += Math.hypot(get(r, "x") - get(p, "x"), get(r, "y") - get(p, "y"));
        }
        out.track.push(row({
          t_s: sec(get(r, "t")), x: num(get(r, "x"), 3), y: num(get(r, "y"), 3), angle_deg: num(get(r, "angle"), 1),
          step: get(r, "step"), look: get(r, "look"), look_d: num(get(r, "look_d"), 3), look_share: num(get(r, "look_share"), 4),
          music: get(r, "music"), tilt: num(get(r, "tilt"), 4), back: yes(get(r, "back"))
        }));
      });
    }

    (f.keys || []).forEach(function (k) {
      out.keys.push(row({t_s: sec(k.t), type: k.type, key: k.key, code: k.code || null, repeat: yes(k.repeat),
        phase: k.phase || null, outcome: k.outcome || null}));
    });
    (g.turns || []).forEach(function (u) {
      out.turns.push(row({t_s: sec(u.t), step: u.step, key: u.key || null, from: u.from || null, to: u.to || null,
        from_angle: num(u.from_angle, 1), to_angle: num(u.to_angle, 1), ms: num(u.ms, 1), held_ms: num(u.held_ms, 1)}));
    });
    var byId = {};
    (FG.PAINTINGS || []).forEach(function (p) { byId[p.id] = p; });
    (g.looks || []).forEach(function (o) {
      var p = byId[o.painting] || {};
      out.looks.push(row({place: o.place, painting: o.painting, painter: p.painter || null, title: p.title || null,
        year: p.year || null, room: o.room, side: o.side, look_ms: num(o.look_ms, 1), looks: o.looks,
        seen_ms: num(o.seen_ms, 1), first_seen_s: sec(o.first_seen_at), first_look_s: sec(o.first_look_at),
        nearest: num(o.nearest, 2), liked: yes(o.liked), likes: o.likes}));
    });
    (g.likes || []).forEach(function (o) {
      out.likes.push(row({t_s: sec(o.t), step: o.step, place: o.place, painting: o.painting, room: o.room, side: o.side,
        liked: yes(o.liked), by: o.by || null, distance: num(o.d, 2)}));
    });
    (g.clicks || []).forEach(function (o) {
      out.clicks.push(row({t_s: sec(o.t), step: o.step, x: num(o.x, 1), y: num(o.y, 1), on: o.on || "nothing",
        place: o.place === undefined ? null : o.place, outcome: o.outcome || null}));
    });
    var plays = (g.music && g.music.plays) || [];
    plays.forEach(function (o) {
      out.music.push(row({piece: o.piece, started_s: sec(o.started_at), step: o.step, by: o.by || null,
        stopped_s: sec(o.stopped_at), stopped_by: o.stopped_by || null, played_s: num(o.played_s, 1)}));
    });
    (f.attention || []).forEach(function (a) {
      out.page.push(row({t_s: sec(a.t), what: "focus", type: a.type || null, by: null, phase: a.phase || null}));
    });
    (f.sound_log || []).forEach(function (a) {
      out.page.push(row({t_s: sec(a.t), what: "sound", type: a.on ? "on" : "off", by: a.by || null, phase: a.phase || null}));
    });
    out.page.sort(function (a, b) { return (a.t_s || 0) - (b.t_s || 0); });

    // the game
    var last = steps[steps.length - 1] || {};
    var after = steps.slice(1);
    var energies = after.map(function (st) { return st.energy; }).filter(function (e) { return typeof e === "number"; });
    var total = maze.names.length, firstIn = {}, half = null, all = null;
    steps.forEach(function (st) {
      if (st.room && firstIn[st.room] === undefined) {
        firstIn[st.room] = st.step;
        var n = Object.keys(firstIn).length;
        if (half === null && n * 2 >= total) {
          half = st.step;
        }
        if (all === null && n >= total) {
          all = st.step;
        }
      }
    });
    var revisits = out.navigation.filter(function (n) { return !n.new_room; }).length;
    var backtracks = out.navigation.filter(function (n) { return n.backtrack; }).length;
    var b = f.browser || {}, rd = g.render || {}, ch = f.character || {}, cond = f.condition || {};
    var stomach = s.stomach || {}, food = s.food || {};
    var looks = g.looks || [], likes = g.likes || [];
    var focus = (f.attention || []).filter(function (a) { return /blur|hidden/.test(a.type || ""); }).length;
    var game = {
      partial: /partial/.test(name) || /partial/.test(f.file || "") ? 1 : 0,
      test: yes(f.test), version: f.game_version || null, started: g.started || null,
      condition: cond.name || null, condition_how: cond.how || null, food_rule: food.rule || null,
      eat_speed: num(g.speeds && g.speeds.eat, 6), refill_speed: num(g.speeds && g.speeds.refill, 6),
      maze: g.maze || null, view: g.view || null, camera: g.camera || null,
      character: ch.name || s.player || null, character_how: ch.how || null, same_speed: yes(s.same_speed),
      start_room: start || null, steps_allowed: num(s.steps), count_steps: s.count_steps || null,
      first_step_stay: yes(s.first_step_stay), idle_stay_ms: num(s.idle_stay_ms),
      stomach_size: num(stomach.size), stomach_start: num(stomach.start), move_cost: num(stomach.move_cost),
      stay_cost: num(stomach.stay_cost), at_zero: stomach.at_zero || null, when_full: stomach.when_full || null,
      show_level: s.show ? s.show.level || null : null,
      ended_how: g.ended ? g.ended.how : null,
      duration_s: g.ended && typeof g.ended.at === "number" ? num((g.ended.at - t0) / 1000, 3) : null,
      steps: g.ended ? g.ended.step : last.step, moves: g.ended ? g.ended.moves : last.moves,
      idle_stays: g.ended ? g.ended.idle_stays : null, space_stays: g.ended ? g.ended.space_stays : null,
      food_eaten: num(last.eaten, 6), food_lost: num(after.reduce(function (a, st) { return a + (st.food_lost || 0); }, 0), 6),
      energy_end: num(last.energy, 6),
      energy_min: energies.length ? num(Math.min.apply(null, energies), 6) : null,
      energy_mean: energies.length ? num(energies.reduce(function (a, e) { return a + e; }, 0) / energies.length, 6) : null,
      full_steps: after.filter(function (st) { return st.full; }).length,
      decision_ms_median: num(median(out.navigation.map(function (n) { return n.decision_ms; })), 1),
      rooms_in_maze: total, rooms_entered: Object.keys(firstIn).length,
      rooms_known: (g.known_rooms || Object.keys(known)).length,
      explored_half_step: half, explored_all_step: all, revisits: revisits, backtracks: backtracks,
      walks_back: (g.walks_back || []).length,
      walked_tiles: num(after.reduce(function (a, st) { return a + (st.walked_tiles || 0); }, 0), 2),
      track_tiles: trackTiles === null ? null : num(trackTiles, 2),
      turns: (g.turns || []).length,
      food_rooms_found: Object.keys(foodRooms).filter(function (k) {
        return visits.some(function (v) { return v.food_room === k; });
      }).length,
      visits: visits.length
    };
    foods.forEach(function (k) {
      var vs = visits.filter(function (v) { return v.food_room === k; });
      var fr = s.food_rooms && s.food_rooms[k];
      game[k + "_room"] = foodRooms[k] || null;
      game[k + "_food"] = g.food_kinds && g.food_kinds[k] ? g.food_kinds[k] : null;
      game[k + "_worth"] = fr ? num(fr.worth) : null;
      game[k + "_found_step"] = vs.length ? vs[0].enter_step : null;
      game[k + "_visits"] = foodRooms[k] ? vs.length : null;
      game[k + "_stays"] = foodRooms[k] ? vs.reduce(function (a, v) { return a + v.stays; }, 0) : null;
      game[k + "_eaten"] = foodRooms[k] ? num(vs.reduce(function (a, v) { return a + v.eaten; }, 0), 6) : null;
    });
    var rest = {
      paintings_seen: g.looks ? looks.length : null,
      paintings_looked_at: g.looks ? looks.filter(function (o) { return o.looks > 0; }).length : null,
      look_s: g.looks ? num(looks.reduce(function (a, o) { return a + (o.look_ms || 0); }, 0) / 1000, 3) : null,
      likes: g.likes ? likes.filter(function (o) { return o.liked; }).length : null,
      unlikes: g.likes ? likes.filter(function (o) { return !o.liked; }).length : null,
      clicks: (g.clicks || []).length,
      music_room: g.music ? g.music.room || null : null,
      music_plays: plays.length,
      music_s: num(plays.reduce(function (a, o) { return a + (o.played_s || 0); }, 0), 1),
      sound_switches: g.sound && g.sound.toggles ? g.sound.toggles.length : null,
      focus_lost: focus,
      browser: b.user_agent || null,
      screen_width: b.screen ? b.screen.width : null, screen_height: b.screen ? b.screen.height : null,
      window_width: b.window ? b.window.width : null, window_height: b.window ? b.window.height : null,
      pixel_ratio: num(b.pixel_ratio), time_zone: b.time_zone || null, refresh_hz: num(b.refresh_hz),
      renderer: rd.renderer || null, gpu: rd.gpu || null,
      draw_ms_median: rd.draw_ms ? num(rd.draw_ms.median) : null
    };
    Object.keys(rest).forEach(function (k) { game[k] = rest[k]; });
    out.games.push(row(game));
    return out;
  }

  // ------------------------------------------------------------ many games
  /* Tables of many files [{name, data}]: {tables: [{name, row, columns,
   * rows (arrays in the columns' order)}], games: [{name, data}], skipped:
   * [{name, why}]}. */
  function build(files) {
    var games = [], skipped = [];
    files.forEach(function (f) {
      if (isGameFile(f.data)) {
        games.push(f);
      } else {
        skipped.push({name: f.name, why: f.error || "not a game file"});
      }
    });
    games.sort(function (a, b) {
      var A = a.data, B = b.data;
      return String(A.game.started || "").localeCompare(String(B.game.started || "")) ||
        String(a.name).localeCompare(String(b.name));
    });
    var foods = foodNames(games.map(function (f) { return f.data; }));
    var all = {};
    TABLES.forEach(function (t) { all[t.name] = []; });
    games.forEach(function (f) {
      var rows;
      try {
        rows = rowsOf(f.name, f.data, foods);
      } catch (err) {
        skipped.push({name: f.name, why: "could not be read: " + err.message});
        return;
      }
      TABLES.forEach(function (t) { all[t.name] = all[t.name].concat(rows[t.name]); });
    });
    var tables = TABLES.map(function (t) {
      var cols = columnsOf(t, foods);
      return {name: t.name, row: t.row, columns: cols, rows: all[t.name].map(function (r) {
        return cols.map(function (c) { return r[c[0]] === undefined ? null : r[c[0]]; });
      })};
    });
    return {tables: tables, games: games.filter(function (f) {
      return !skipped.some(function (s) { return s.name === f.name; });
    }), skipped: skipped, foods: foods};
  }

  /* The data dictionary: 1 row a column of a table. */
  function dictionary(built) {
    var rows = [];
    built.tables.forEach(function (t) {
      t.columns.forEach(function (c) {
        rows.push([t.name, c[0], c[1]]);
      });
    });
    return {name: "dictionary", row: "a column of a table", columns: [["table", "the table"], ["column", "the column"],
      ["meaning", "what it holds"]], rows: rows};
  }

  // ------------------------------------------------------------ CSV
  function csvCell(v) {
    if (v === null || v === undefined) {
      return "";
    }
    var s = typeof v === "number" ? String(v) : String(v);
    return /[",\r\n;]/.test(s) || /^\s|\s$/.test(s) ? "\"" + s.replace(/"/g, "\"\"") + "\"" : s;
  }

  /* A table as CSV (comma, a header row, CRLF line ends; numbers with a
   * point, as SPSS and R read them). */
  function csv(table) {
    var lines = [table.columns.map(function (c) { return c[0]; }).join(",")];
    table.rows.forEach(function (r) { lines.push(r.map(csvCell).join(",")); });
    return lines.join("\r\n") + "\r\n";
  }

  FG.tables = {TABLES: TABLES, build: build, dictionary: dictionary, csv: csv, isGameFile: isGameFile,
    Maze: Maze, rowsOf: rowsOf};
})(typeof window !== "undefined" ? window : globalThis);
