/* The team's data page (analysis.html): the game files saved by DataPipe
 * as the tables of js/tables.js, to look at and to download for Excel,
 * SPSS, R or Python.
 *
 * The page opens with the team password, the one the team saves mazes
 * with: it is right when it unlocks the team's key (js/team_key.js, see
 * js/team_save.js), and it is not kept. The site is public, so the
 * password keeps others away from the page, not from the data: the data
 * are the game files, which only the team has. Files opened here are read
 * in this browser and nothing is sent anywhere. */
(function (root) {
  "use strict";
  var FG = root.FG = root.FG || {};

  var VERSION = "2.6.0";
  var EXCEL_ROWS = 1000000;           // rows of a sheet before a table goes on in the next
  var $ = function (id) { return document.getElementById(id); };

  var state = {files: {}, skipped: [], withTests: false, built: null, sort: {key: "started", up: true}, picked: null};

  function esc(s) {
    return String(s === null || s === undefined ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function fmt(v, nd) {
    if (v === null || v === undefined || v === "") {
      return "";
    }
    if (typeof v === "number") {
      return nd === undefined ? String(v) : v.toFixed(nd);
    }
    return String(v);
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  /* A time of the files (UTC) as this computer's: 22 Oct 2026 21:24. */
  function when(iso) {
    if (!iso) {
      return "";
    }
    var d = new Date(iso);
    if (isNaN(d)) {
      return iso;
    }
    return d.toLocaleDateString("en-GB", {day: "numeric", month: "short", year: "numeric"}) + " " +
      String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  // ------------------------------------------------------------ the lock
  /* js/team_key.js, fresh (the editor writes it when saving is set up). */
  function loadKey() {
    return new Promise(function (resolve) {
      if (FG.TEAM_KEY !== undefined) {
        resolve();
        return;
      }
      var tag = document.createElement("script");
      tag.src = "js/team_key.js?t=" + Date.now();
      tag.onload = tag.onerror = function () { resolve(); };
      document.head.appendChild(tag);
    });
  }

  function lockNote(text, wrong) {
    var n = $("lock-note");
    n.textContent = text;
    n.className = wrong ? "note wrong" : "note";
  }

  function setUpLock() {
    var keyReady = loadKey();
    $("lock-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var pw = $("password").value, button = $("open");
      button.disabled = true;
      button.textContent = "Checking...";
      keyReady.then(function () {
        if (!FG.TEAM_KEY) {
          throw new Error("no key");
        }
        return FG.teamSave.unlock(FG.TEAM_KEY, pw);
      }).then(function () {
        $("password").value = "";
        $("lock").hidden = true;
        $("app").hidden = false;
        $("drop").focus();
      }, function (err) {
        button.disabled = false;
        button.textContent = "Open";
        if (err && err.message === "no key") {
          lockNote("There is no team password yet: it is set when saving mazes is set up in the maze editor " +
            "(the game with ?edit=1).", true);
        } else {
          lockNote("That is not the team password.", true);
          $("password").select();
        }
      });
    });
    $("lock-again").addEventListener("click", function () {
      // nothing of the files is kept: the page starts again, locked
      root.location.reload();
    });
  }

  // ------------------------------------------------------------ opening files
  function isTest(name, data) {
    return /^TEST_/.test(name) || !!(data && data.test);
  }

  function addText(name, text) {
    var data = null, error = null;
    try {
      data = JSON.parse(text);
    } catch (err) {
      error = "not JSON";
    }
    if (data && !FG.tables.isGameFile(data)) {
      error = /partial-short/.test(name) ? "the short form of a game cut short (only its moves); its full file has the game" :
        "not a game file";
    }
    if (error) {
      state.skipped.push({name: name, why: error});
      return;
    }
    state.files[name] = {name: name, data: data};
  }

  function baseName(path) {
    return String(path).split(/[\\/]/).pop();
  }

  /* The files of a drop: plain files, and the files in dropped folders. */
  function droppedFiles(dt) {
    var items = dt.items ? Array.prototype.slice.call(dt.items) : [];
    var entries = items.map(function (it) { return it.webkitGetAsEntry ? it.webkitGetAsEntry() : null; });
    if (!entries.length || entries.some(function (e) { return !e; })) {
      return Promise.resolve(Array.prototype.slice.call(dt.files || []));
    }
    function walk(entry) {
      if (entry.isFile) {
        return new Promise(function (resolve) { entry.file(function (f) { resolve([f]); }, function () { resolve([]); }); });
      }
      return new Promise(function (resolve) {
        var reader = entry.createReader(), all = [];
        (function more() {
          reader.readEntries(function (list) {
            if (!list.length) {
              Promise.all(all.map(walk)).then(function (lists) { resolve([].concat.apply([], lists)); });
              return;
            }
            all = all.concat(Array.prototype.slice.call(list));
            more();
          }, function () { resolve([]); });
        })();
      });
    }
    return Promise.all(entries.map(walk)).then(function (lists) { return [].concat.apply([], lists); });
  }

  function progress(done, total) {
    var p = $("progress");
    p.hidden = total === 0 || done >= total;
    p.firstElementChild.style.width = (total ? 100 * done / total : 0) + "%";
  }

  function openFiles(list) {
    list = list.filter(function (f) { return /\.(json|zip)$/i.test(f.name); });
    if (!list.length) {
      $("opened").textContent = "No .json or .zip files there.";
      return Promise.resolve();
    }
    var done = 0;
    progress(0, list.length);
    var jobs = list.map(function (file) {
      var read = /\.zip$/i.test(file.name) ?
        file.arrayBuffer().then(FG.zipfile.read).then(function (entries) {
          var dec = new TextDecoder("utf-8");
          entries.forEach(function (en) {
            if (/\.json$/i.test(en.name) && !/(^|\/)__MACOSX\//.test(en.name)) {
              addText(baseName(en.name), dec.decode(en.bytes));
            }
          });
        }) :
        file.text().then(function (text) { addText(baseName(file.webkitRelativePath || file.name), text); });
      return read.catch(function (err) {
        state.skipped.push({name: file.name, why: err.message});
      }).then(function () {
        done += 1;
        progress(done, list.length);
      });
    });
    return Promise.all(jobs).then(refresh);
  }

  function setUpOpening() {
    var drop = $("drop");
    ["dragenter", "dragover"].forEach(function (t) {
      drop.addEventListener(t, function (e) {
        e.preventDefault();
        drop.classList.add("over");
      });
    });
    ["dragleave", "drop"].forEach(function (t) {
      drop.addEventListener(t, function (e) {
        e.preventDefault();
        drop.classList.remove("over");
      });
    });
    drop.addEventListener("drop", function (e) {
      droppedFiles(e.dataTransfer).then(openFiles);
    });
    ["pick-files", "pick-folder"].forEach(function (id) {
      $(id).addEventListener("change", function (e) {
        openFiles(Array.prototype.slice.call(e.target.files || []));
        e.target.value = "";
      });
    });
    $("with-tests").addEventListener("change", function (e) {
      state.withTests = e.target.checked;
      refresh();
    });
    $("get-xlsx").addEventListener("click", function () { download("xlsx"); });
    $("get-csv").addEventListener("click", function () { download("csv"); });
  }

  // ------------------------------------------------------------ the tables
  function chosen() {
    var all = Object.keys(state.files).map(function (k) { return state.files[k]; });
    var real = all.filter(function (f) { return !isTest(f.name, f.data); });
    // only test games: they are shown, so that the page can be tried out
    var tests = state.withTests || !real.length;
    return {files: tests ? all : real, tests: all.length - real.length, onlyTests: !real.length && all.length > 0};
  }

  function refresh() {
    var c = chosen();
    state.built = FG.tables.build(c.files);
    state.built.skipped = state.built.skipped.concat(state.skipped);
    $("with-tests").checked = state.withTests || c.onlyTests;
    $("with-tests").disabled = c.onlyTests;
    var n = Object.keys(state.files).length;
    var msg = n + " game file" + (n === 1 ? "" : "s") + " open";
    if (c.tests && !state.withTests && !c.onlyTests) {
      msg += "; " + c.tests + " test game" + (c.tests === 1 ? "" : "s") + " left out (tick below to include them)";
    }
    if (c.onlyTests) {
      msg += "; all are test games, so they are shown";
    }
    if (state.skipped.length) {
      msg += ". Not read: " + state.skipped.map(function (s) { return s.name + " (" + s.why + ")"; }).join(", ");
    }
    $("opened").textContent = msg + ".";
    $("results").hidden = !state.built.games.length;
    if (!state.built.games.length) {
      return;
    }
    renderStats();
    renderTableList();
    renderGames();
    renderDictionary();
    if (state.picked && !state.built.games.some(function (f) { return f.name === state.picked; })) {
      state.picked = null;
    }
    if (state.picked) {
      showGame(state.picked);
    } else {
      $("game-card").hidden = true;
    }
  }

  function table(name) {
    return state.built.tables.filter(function (t) { return t.name === name; })[0];
  }

  /* The rows of a table as objects. */
  function objects(name, file) {
    var t = table(name), cols = t.columns.map(function (c) { return c[0]; });
    var fi = cols.indexOf("file");
    return t.rows.filter(function (r) { return !file || r[fi] === file; }).map(function (r) {
      var o = {};
      cols.forEach(function (c, i) { o[c] = r[i]; });
      return o;
    });
  }

  function mean(xs) {
    xs = xs.filter(function (x) { return typeof x === "number"; });
    return xs.length ? xs.reduce(function (a, b) { return a + b; }, 0) / xs.length : null;
  }

  function renderStats() {
    var games = objects("games");
    var players = {};
    games.forEach(function (g) { players[g.player] = true; });
    var starved = games.filter(function (g) { return g.ended_how === "starved"; }).length;
    var d3 = games.filter(function (g) { return g.view === "3d"; }).length;
    var tiles = [
      [games.length, "games"],
      [Object.keys(players).length, "players"],
      [fmt(mean(games.map(function (g) { return g.moves; })), 1), "moves a game, on average"],
      [fmt(mean(games.map(function (g) { return g.food_eaten; })), 1), "food eaten a game, on average"],
      [Math.round(100 * starved / games.length) + "%", "ended starved"],
      [d3 + " / " + (games.length - d3), "in 3D / in 2D"],
      [fmt(mean(games.map(function (g) { return g.visits; })), 1), "food-room visits a game"],
      [fmt(mean(games.map(function (g) { return g.duration_s === null ? null : g.duration_s / 60; })), 1), "minutes a game"]
    ];
    $("stats").innerHTML = tiles.map(function (t) {
      return "<div class=\"stat\"><b>" + esc(t[0]) + "</b><span>" + esc(t[1]) + "</span></div>";
    }).join("");
  }

  function renderTableList() {
    $("table-list").innerHTML = state.built.tables.map(function (t) {
      return "<div><span class=\"rows\">" + t.rows.length.toLocaleString() + " rows</span><b>" + esc(t.name) +
        "</b><br>1 row: " + esc(t.row) + "</div>";
    }).join("");
  }

  var GAME_COLUMNS = [
    ["started", "Started"], ["player", "Player"], ["game", "Game"], ["condition", "Condition"], ["maze", "Maze"],
    ["view", "View"], ["character", "Character"], ["ended_how", "Ended"], ["moves", "Moves", 0],
    ["food_eaten", "Eaten", 1], ["energy_end", "Energy", 1], ["visits", "Visits", 0], ["rooms_entered", "Rooms", 0],
    ["duration_s", "Minutes", 1]
  ];

  function renderGames() {
    var rows = objects("games"), s = state.sort;
    rows.sort(function (a, b) {
      var x = a[s.key], y = b[s.key];
      if (s.key === "duration_s") {
        x = x === null ? null : x;
      }
      var c = x === y ? 0 : x === null ? 1 : y === null ? -1 : typeof x === "number" && typeof y === "number" ? x - y :
        String(x).localeCompare(String(y));
      return s.up ? c : -c;
    });
    var head = "<thead><tr>" + GAME_COLUMNS.map(function (c) {
      var on = c[0] === s.key;
      return "<th data-key=\"" + c[0] + "\" class=\"" + (on ? "sorted" + (s.up ? " up" : "") : "") + "\">" + esc(c[1]) + "</th>";
    }).join("") + "</tr></thead>";
    var body = "<tbody>" + rows.map(function (g) {
      return "<tr class=\"pick" + (g.file === state.picked ? " on" : "") + "\" tabindex=\"0\" data-file=\"" + esc(g.file) + "\">" +
        GAME_COLUMNS.map(function (c) {
          var v = g[c[0]];
          if (c[0] === "started") {
            return "<td>" + esc(when(v)) + (g.test ? " <span class=\"tag test\">test</span>" : "") + "</td>";
          }
          if (c[0] === "ended_how") {
            var cls = v === "starved" ? "starved" : v === "finished" ? "finished" : "closed";
            return "<td><span class=\"tag " + cls + "\">" + esc(v || (g.partial ? "cut short" : "")) + "</span></td>";
          }
          if (c[0] === "view") {
            return "<td>" + esc(v === "3d" ? "3D" + (g.camera ? " " + g.camera : "") : "2D") + "</td>";
          }
          if (c[0] === "duration_s") {
            return "<td class=\"n\">" + esc(v === null ? "" : (v / 60).toFixed(1)) + "</td>";
          }
          return c.length > 2 ? "<td class=\"n\">" + esc(fmt(v, c[2])) + "</td>" : "<td>" + esc(v) + "</td>";
        }).join("") + "</tr>";
    }).join("") + "</tbody>";
    var el = $("games");
    el.innerHTML = head + body;
    Array.prototype.forEach.call(el.querySelectorAll("th"), function (th) {
      th.addEventListener("click", function () {
        var k = th.getAttribute("data-key");
        state.sort = {key: k, up: state.sort.key === k ? !state.sort.up : true};
        renderGames();
      });
    });
    Array.prototype.forEach.call(el.querySelectorAll("tbody tr"), function (tr) {
      var pick = function () {
        state.picked = tr.getAttribute("data-file");
        renderGames();
        showGame(state.picked);
        $("game-card").scrollIntoView({behavior: "smooth", block: "start"});
      };
      tr.addEventListener("click", pick);
      tr.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          pick();
        }
      });
    });
  }

  function renderDictionary() {
    $("dictionary").innerHTML = "<p class=\"note\">Times are seconds from the start of the game. Yes and no are 1 and 0; " +
      "an empty cell has no value. Rooms are s&lt;row&gt;&lt;column&gt;, s00 top left.</p>" +
      state.built.tables.map(function (t) {
        return "<details class=\"dict\"><summary>" + esc(t.name) + "<small>1 row: " + esc(t.row) + "</small></summary>" +
          "<dl class=\"columns\">" + t.columns.map(function (c) {
            return "<dt>" + esc(c[0]) + "</dt><dd>" + esc(c[1]) + "</dd>";
          }).join("") + "</dl></details>";
      }).join("");
  }

  // ------------------------------------------------------------ a game
  function showGame(name) {
    var f = state.files[name];
    var card = $("game-card");
    if (!f) {
      card.hidden = true;
      return;
    }
    var g = objects("games", name)[0], visits = objects("visits", name);
    var facts = [
      ["Started", when(g.started)], ["Condition", g.condition], ["Maze", g.maze],
      ["View", g.view === "3d" ? "3D, " + (g.camera || "eyes") : "2D"], ["Character", g.character],
      ["Ended", g.ended_how || "cut short"], ["Minutes", g.duration_s === null ? "" : (g.duration_s / 60).toFixed(1)],
      ["Moves", g.moves], ["Stays", (g.idle_stays || 0) + (g.space_stays || 0)], ["Food eaten", fmt(g.food_eaten, 2)],
      ["Food lost", fmt(g.food_lost, 2)], ["Energy at the end", fmt(g.energy_end, 2)], ["Lowest energy", fmt(g.energy_min, 2)],
      ["Visits to food rooms", g.visits], ["Rooms entered", g.rooms_entered + " of " + g.rooms_in_maze],
      ["Revisits", g.revisits], ["Straight back", g.backtracks], ["Decision, median ms", fmt(g.decision_ms_median, 0)]
    ];
    if (g.view === "3d") {
      facts.push(["Paintings looked at", g.paintings_looked_at], ["Likes", g.likes], ["Records played", g.music_plays]);
    }
    card.hidden = false;
    card.innerHTML =
      "<div class=\"game-head\"><h2>Player " + esc(g.player) + ", game " + esc(g.game) + "</h2>" +
      "<span class=\"note\">" + esc(name) + "</span></div>" +
      "<div class=\"facts\">" + facts.map(function (x) {
        return "<div><span>" + esc(x[0]) + "</span><b>" + esc(x[1]) + "</b></div>";
      }).join("") + "</div>" +
      "<div class=\"pictures\"><div class=\"map\"><canvas id=\"route\"></canvas></div>" +
      "<div class=\"chart\"><canvas id=\"energy\"></canvas><div class=\"legend\" id=\"energy-legend\"></div></div></div>" +
      "<h3>Visits to food rooms</h3>" + visitsTable(visits) +
      "<h3>Steps</h3><div class=\"scroll\" style=\"max-height: 360px\">" + stepsTable(objects("steps", name)) + "</div>";
    drawRoute(f.data.game);
    drawEnergy(f.data.game, objects("steps", name));
  }

  function visitsTable(visits) {
    if (!visits.length) {
      return "<p class=\"note\">No food room was entered.</p>";
    }
    var cols = [["visit", "Visit"], ["food_room", "Food room"], ["room", "Room"], ["enter_step", "Entered", 0],
      ["leave_step", "Left", 0], ["stays", "Stays", 0], ["duration_s", "Seconds", 1], ["level_before", "Level before", 2],
      ["level_end", "Level left", 2], ["eaten", "Eaten", 2], ["energy_end", "Energy after", 2], ["travel_steps", "Steps since last", 0]];
    return "<div class=\"scroll\" style=\"max-height: 280px\"><table class=\"ledger\"><thead><tr>" +
      cols.map(function (c) { return "<th>" + esc(c[1]) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      visits.map(function (v) {
        return "<tr>" + cols.map(function (c) {
          return c.length > 2 ? "<td class=\"n\">" + esc(fmt(v[c[0]], c[2])) + "</td>" : "<td>" + esc(v[c[0]]) + "</td>";
        }).join("") + "</tr>";
      }).join("") + "</tbody></table></div>";
  }

  function stepsTable(steps) {
    var cols = [["step", "Step", 0], ["move", "Move"], ["by", "By"], ["room", "Room"], ["in_food_room", "Food room"],
      ["decision_ms", "Decision ms", 0], ["paid", "Paid", 2], ["energy", "Energy", 2], ["eaten", "Eaten", 2],
      ["events", "Events"]];
    return "<table class=\"ledger\"><thead><tr>" + cols.map(function (c) { return "<th>" + esc(c[1]) + "</th>"; }).join("") +
      "</tr></thead><tbody>" + steps.map(function (st) {
        return "<tr>" + cols.map(function (c) {
          return c.length > 2 ? "<td class=\"n\">" + esc(fmt(st[c[0]], c[2])) + "</td>" : "<td>" + esc(st[c[0]]) + "</td>";
        }).join("") + "</tr>";
      }).join("") + "</tbody></table>";
  }

  function drawRoute(game) {
    var canvas = $("route"), box = canvas.parentNode;
    // drawn at least as wide as the end page's map (for its key), then fitted to the box
    var w = Math.max(560, box.clientWidth - 20), h = Math.round(w * 0.92);
    if (FG.MAZES && !FG.MAZES[game.layout.maze] && game.maze_def) {
      FG.MAZES[game.layout.maze] = {rooms: game.maze_def.rooms};
    }
    try {
      FG.route.draw(canvas, game, w, h);
      canvas.style.width = "100%";
      canvas.style.height = "auto";
    } catch (err) {
      box.innerHTML = "<p class=\"note\" style=\"color:#ddd\">The map could not be drawn: " + esc(err.message) + "</p>";
    }
  }

  var CANVAS_FONT = "13px Seravek, 'Gill Sans', Ubuntu, 'Segoe UI', Calibri, sans-serif";

  function drawEnergy(game, steps) {
    var canvas = $("energy"), box = canvas.parentNode;
    var w = Math.max(300, box.clientWidth - 24), h = 290, dpr = root.devicePixelRatio || 1;
    canvas.style.height = h + "px";
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    var g = canvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    var size = (game.settings && game.settings.stomach && game.settings.stomach.size) || 20;
    var foods = state.built.foods;
    var L = 40, R = 40, T = 14, B = 34, n = Math.max(1, steps.length - 1);
    var X = function (i) { return L + (w - L - R) * i / n; };
    var Y = function (v) { return T + (h - T - B) * (1 - v); };
    var colour = {patch: "#e1a52c", small: "#a5622d"};
    var pale = {patch: "rgba(225,165,44,0.18)", small: "rgba(165,98,45,0.16)"};
    // the steps in a food room
    steps.forEach(function (st, i) {
      if (st.in_food_room && i > 0) {
        g.fillStyle = pale[st.in_food_room] || "rgba(94,125,80,0.15)";
        g.fillRect(X(i - 0.5), T, Math.max(1, X(1) - X(0)), h - T - B);
      }
    });
    // the grid
    g.strokeStyle = "#e5dccb";
    g.lineWidth = 1;
    g.font = CANVAS_FONT;
    g.fillStyle = "#5d564a";
    for (var k = 0; k <= 4; k++) {
      var y = Y(k / 4);
      g.beginPath();
      g.moveTo(L, y);
      g.lineTo(w - R, y);
      g.stroke();
      g.textAlign = "right";
      g.textBaseline = "middle";
      g.fillText(String(Math.round(size * k / 4)), L - 6, y);
      g.textAlign = "left";
      g.fillText(Math.round(100 * k / 4) + "%", w - R + 6, y);
    }
    g.textAlign = "center";
    g.textBaseline = "top";
    var every = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].filter(function (e) { return n / e <= 10; })[0] || 2000;
    for (var s = 0; s <= n; s += every) {
      g.fillText(String(s), X(s), h - B + 6);
    }
    g.fillText("step", (L + w - R) / 2, h - 16);
    function line(get, col, width, dash) {
      g.strokeStyle = col;
      g.lineWidth = width;
      g.setLineDash(dash || []);
      g.beginPath();
      steps.forEach(function (st, i) {
        var v = get(st);
        if (v === null || v === undefined) {
          return;
        }
        if (i === 0) {
          g.moveTo(X(i), Y(v));
        } else {
          g.lineTo(X(i), Y(v));
        }
      });
      g.stroke();
      g.setLineDash([]);
    }
    foods.forEach(function (fd) {
      line(function (st) { return st["level_" + fd]; }, colour[fd] || "#5e7d50", 2, fd === "small" ? [6, 4] : null);
    });
    line(function (st) { return st.energy === null ? null : st.energy / size; }, "#2c5c8a", 2.6);
    $("energy-legend").innerHTML = "<span><i style=\"background:#2c5c8a\"></i>energy (left)</span>" +
      foods.map(function (fd) {
        return "<span><i style=\"background:" + (colour[fd] || "#5e7d50") + "\"></i>" + esc(fd) + " food room's level (right)</span>";
      }).join("") + "<span><i style=\"background:rgba(225,165,44,0.35);height:10px\"></i>in a food room</span>";
  }

  // ------------------------------------------------------------ downloads
  function xml(s) {
    return String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, "").replace(/&/g, "&amp;")
      .replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function columnLetter(i) {
    var s = "";
    for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) {
      s = String.fromCharCode(65 + (i - 1) % 26) + s;
    }
    return s;
  }

  var NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  var RNS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

  /* 1 sheet: a header row (bold, frozen, with filters) and the rows. */
  function sheet(names, rows, widths) {
    var out = ["<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>",
      "<worksheet xmlns=\"" + NS + "\" xmlns:r=\"" + RNS + "\">",
      "<sheetViews><sheetView workbookViewId=\"0\"><pane ySplit=\"1\" topLeftCell=\"A2\" activePane=\"bottomLeft\" " +
      "state=\"frozen\"/></sheetView></sheetViews><cols>"];
    names.forEach(function (n, i) {
      out.push("<col min=\"" + (i + 1) + "\" max=\"" + (i + 1) + "\" width=\"" + (widths ? widths[i] :
        Math.min(42, Math.max(9, n.length + 3))) + "\" customWidth=\"1\"/>");
    });
    out.push("</cols><sheetData>");
    var all = [names].concat(rows);
    all.forEach(function (r, ri) {
      var cells = ["<row r=\"" + (ri + 1) + "\">"];
      r.forEach(function (v, ci) {
        if (v === null || v === undefined || v === "") {
          return;
        }
        var ref = columnLetter(ci) + (ri + 1);
        if (typeof v === "number" && isFinite(v) && ri > 0) {
          cells.push("<c r=\"" + ref + "\"><v>" + v + "</v></c>");
        } else {
          cells.push("<c r=\"" + ref + "\" t=\"inlineStr\"" + (ri === 0 ? " s=\"1\"" : "") + "><is><t xml:space=\"preserve\">" +
            xml(v) + "</t></is></c>");
        }
      });
      cells.push("</row>");
      out.push(cells.join(""));
    });
    var ref = "A1:" + columnLetter(Math.max(0, names.length - 1)) + all.length;
    out.push("</sheetData><autoFilter ref=\"" + ref + "\"/></worksheet>");
    return {xml: out.join(""), ref: ref};
  }

  /* The sheets of the workbook: about, the dictionary, then each table. */
  function sheets(built) {
    var dict = FG.tables.dictionary(built), list = [];
    var games = objects("games");
    var about = [
      ["The games of the foraging game, as tables"],
      ["Made", new Date().toISOString().replace(/\.\d+Z$/, "Z")],
      ["By", "analysis.html of the game, version " + VERSION],
      ["Games", built.games.length],
      ["Players", Object.keys(games.reduce(function (a, g) { a[g.player] = 1; return a; }, {})).length],
      ["Test games", state.withTests ? "included" : "left out, unless all the games are tests"],
      ["Files", built.games.map(function (f) { return f.name; }).join(" ")],
      [""],
      ["How to read them", "1 row for each observation; each table says what a row is. Times are seconds from the start " +
        "of the game. Yes and no are 1 and 0; an empty cell has no value. Rooms are s<row><column>, s00 top left. The sheet " +
        "dictionary says what every column holds."],
      [""],
      ["Table", "1 row", "Rows"]
    ].concat(built.tables.map(function (t) { return [t.name, t.row, t.rows.length]; }));
    list.push({name: "about", sheet: sheet(["About", "", ""], about, [22, 90, 10])});
    list.push({name: "dictionary", sheet: sheet(dict.columns.map(function (c) { return c[0]; }), dict.rows, [14, 24, 110])});
    built.tables.forEach(function (t) {
      var names = t.columns.map(function (c) { return c[0]; });
      for (var part = 0; part === 0 || part * EXCEL_ROWS < t.rows.length; part++) {
        list.push({name: t.name + (part ? " " + (part + 1) : ""),
          sheet: sheet(names, t.rows.slice(part * EXCEL_ROWS, (part + 1) * EXCEL_ROWS))});
      }
    });
    return list;
  }

  function workbook(built) {
    var list = sheets(built);
    var files = [
      {name: "[Content_Types].xml", bytes: "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
        "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">" +
        "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>" +
        "<Default Extension=\"xml\" ContentType=\"application/xml\"/>" +
        "<Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/>" +
        "<Override PartName=\"/xl/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml\"/>" +
        list.map(function (s, i) {
          return "<Override PartName=\"/xl/worksheets/sheet" + (i + 1) + ".xml\" " +
            "ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>";
        }).join("") + "</Types>"},
      {name: "_rels/.rels", bytes: "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
        "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">" +
        "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" " +
        "Target=\"xl/workbook.xml\"/></Relationships>"},
      {name: "xl/workbook.xml", bytes: "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
        "<workbook xmlns=\"" + NS + "\" xmlns:r=\"" + RNS + "\"><sheets>" +
        list.map(function (s, i) {
          return "<sheet name=\"" + xml(s.name.slice(0, 31)) + "\" sheetId=\"" + (i + 1) + "\" r:id=\"rId" + (i + 1) + "\"/>";
        }).join("") + "</sheets><definedNames>" + list.map(function (s, i) {
          // the filters of each sheet, as Excel keeps them
          return "<definedName name=\"_xlnm._FilterDatabase\" localSheetId=\"" + i + "\" hidden=\"1\">'" +
            xml(s.name.slice(0, 31)) + "'!" + s.sheet.ref.replace(/([A-Z]+)(\d+)/g, "$$$1$$$2") + "</definedName>";
        }).join("") + "</definedNames></workbook>"},
      {name: "xl/_rels/workbook.xml.rels", bytes: "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
        "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">" +
        list.map(function (s, i) {
          return "<Relationship Id=\"rId" + (i + 1) + "\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/" +
            "relationships/worksheet\" Target=\"worksheets/sheet" + (i + 1) + ".xml\"/>";
        }).join("") +
        "<Relationship Id=\"rId" + (list.length + 1) + "\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/" +
        "relationships/styles\" Target=\"styles.xml\"/></Relationships>"},
      {name: "xl/styles.xml", bytes: "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
        "<styleSheet xmlns=\"" + NS + "\"><fonts count=\"2\"><font><sz val=\"11\"/><name val=\"Calibri\"/></font>" +
        "<font><b/><sz val=\"11\"/><name val=\"Calibri\"/></font></fonts>" +
        "<fills count=\"2\"><fill><patternFill patternType=\"none\"/></fill><fill><patternFill patternType=\"gray125\"/></fill></fills>" +
        "<borders count=\"1\"><border><left/><right/><top/><bottom/><diagonal/></border></borders>" +
        "<cellStyleXfs count=\"1\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\"/></cellStyleXfs>" +
        "<cellXfs count=\"2\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\" xfId=\"0\"/>" +
        "<xf numFmtId=\"0\" fontId=\"1\" fillId=\"0\" borderId=\"0\" xfId=\"0\" applyFont=\"1\"/></cellXfs>" +
        "<cellStyles count=\"1\"><cellStyle name=\"Normal\" xfId=\"0\" builtinId=\"0\"/></cellStyles></styleSheet>"}
    ].concat(list.map(function (s, i) { return {name: "xl/worksheets/sheet" + (i + 1) + ".xml", bytes: s.sheet.xml}; }));
    return FG.zipfile.write(files);
  }

  /* SPSS: the labels of a table's variables, to run after opening its CSV. */
  function spssLabels(t) {
    return "* Variable labels for " + t.name + ".csv (1 row: " + t.row.replace(/'/g, "") + ").\n" +
      "* Open the CSV first: File > Import Data > CSV Data, the first line has the variable names.\n" +
      "VARIABLE LABELS\n" + t.columns.map(function (c, i) {
        return "  " + (i ? "/" : "") + c[0] + " '" + c[1].replace(/'/g, "''").slice(0, 250) + "'";
      }).join("\n") + ".\nEXECUTE.\n";
  }

  function csvZip(built) {
    var dict = FG.tables.dictionary(built);
    var readme = "The games of the foraging game, as tables\r\n\r\n" +
      "Made " + new Date().toISOString() + " by analysis.html of the game, version " + VERSION + ", from " +
      built.games.length + " games.\r\n\r\n" +
      "Each CSV file is a table: 1 row for each observation, a header row with the column names, commas between the " +
      "columns, a point in numbers, UTF-8. Times are seconds from the start of the game; yes and no are 1 and 0; an " +
      "empty cell has no value. dictionary.csv says what every column holds.\r\n\r\n" +
      "SPSS: open a CSV with File > Import Data > CSV Data (the first line has the variable names), then run its " +
      "<table>_labels.sps (File > Open > Syntax, Run All) to give the variables their labels.\r\n" +
      "R: read.csv(\"games.csv\"). Python: pandas.read_csv(\"games.csv\").\r\n\r\n" +
      built.tables.map(function (t) { return t.name + ".csv: 1 row: " + t.row + " (" + t.rows.length + " rows)"; }).join("\r\n") +
      "\r\n";
    var files = [{name: "README.txt", bytes: readme}, {name: "dictionary.csv", bytes: FG.tables.csv(dict)}];
    built.tables.forEach(function (t) {
      files.push({name: t.name + ".csv", bytes: FG.tables.csv(t)});
      files.push({name: t.name + "_labels.sps", bytes: spssLabels(t)});
    });
    return FG.zipfile.write(files);
  }

  function save(bytes, name, type) {
    var url = URL.createObjectURL(new Blob([bytes], {type: type}));
    var a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  function download(kind) {
    var button = $(kind === "xlsx" ? "get-xlsx" : "get-csv"), label = button.textContent;
    button.disabled = true;
    button.textContent = "Making the file...";
    var made = kind === "xlsx" ? workbook(state.built) : csvZip(state.built);
    made.then(function (bytes) {
      if (kind === "xlsx") {
        save(bytes, "foraging-games-" + today() + ".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      } else {
        save(bytes, "foraging-games-" + today() + "-csv.zip", "application/zip");
      }
    }, function (err) {
      $("opened").textContent = "The file could not be made: " + err.message;
    }).then(function () {
      button.disabled = false;
      button.textContent = label;
    });
  }

  FG.analysis = {VERSION: VERSION, state: state, openFiles: openFiles, workbook: workbook, csvZip: csvZip, sheets: sheets,
    refresh: refresh};

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", function () {
      setUpLock();
      setUpOpening();
      $("footer").textContent = "The foraging game " + VERSION + ". Game files opened here are read in this browser " +
        "and never sent anywhere; Lock (or closing the page) forgets them.";
    });
  }
})(typeof window !== "undefined" ? window : globalThis);
