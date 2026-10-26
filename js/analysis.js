/* The team's data page (analysis.html): the game files saved by DataPipe
 * as the tables of js/tables.js, to look at and to download for Excel,
 * SPSS, R or Python.
 *
 * Filters on the left (condition, maze, view, character, how the games
 * ended) choose the games; the page shows them in numbers, a table by
 * condition and charts (moves and starving by condition, the food level
 * when a food room was left, energy over the steps, the rooms entered), and
 * the games as rows: one picked is shown in full (its route, energy, visits
 * and steps) and in blue in the charts. The downloads hold the games in the
 * filter. Print / PDF prints the results as a report. Only descriptive
 * numbers are worked out here; tests and models belong in SPSS or R.
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

  var VERSION = "2.7.1";
  var EXCEL_ROWS = 1000000;           // rows of a sheet before a table goes on in the next
  var $ = function (id) { return document.getElementById(id); };

  var state = {files: {}, skipped: [], withTests: false, built: null, sort: {key: "started", up: true}, picked: null,
    off: {}, rows: {}, inFilter: {}, games: [], heatMaze: null};

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
    // files can be dropped anywhere on the page
    var app = $("app");
    ["dragenter", "dragover"].forEach(function (t) {
      app.addEventListener(t, function (e) {
        e.preventDefault();
        app.classList.add("over");
      });
    });
    ["dragleave", "drop"].forEach(function (t) {
      app.addEventListener(t, function (e) {
        e.preventDefault();
        app.classList.remove("over");
      });
    });
    app.addEventListener("drop", function (e) {
      droppedFiles(e.dataTransfer).then(openFiles);
    });
    $("reset").addEventListener("click", function () {
      state.off = {};
      if (state.built && state.built.games.length) {
        renderFilters();
        render();
      }
    });
    $("print").addEventListener("click", function () { root.print(); });
    // the charts drawn again for a printed page, and again after it; and when the window changes size
    root.addEventListener("beforeprint", function () {
      if (state.games.length) {
        state.printWidth = true;
        drawCharts();
      }
    });
    root.addEventListener("afterprint", function () {
      state.printWidth = null;
      if (state.games.length) {
        drawCharts();
      }
    });
    var resizing = null;
    root.addEventListener("resize", function () {
      clearTimeout(resizing);
      resizing = setTimeout(function () {
        if (state.games.length && !state.printWidth) {
          drawCharts();
        }
      }, 200);
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
    state.rows = {};
    $("with-tests").checked = state.withTests || c.onlyTests;
    $("with-tests").disabled = c.onlyTests;
    var n = Object.keys(state.files).length;
    var msg = n + " file" + (n === 1 ? "" : "s") + " open";
    if (c.tests && !state.withTests && !c.onlyTests) {
      msg += ", " + c.tests + " test game" + (c.tests === 1 ? "" : "s") + " left out";
    }
    if (c.onlyTests) {
      msg += ", all test games";
    }
    if (state.skipped.length) {
      msg += ". Not read: " + state.skipped.map(function (s) { return s.name + " (" + s.why + ")"; }).join(", ");
    }
    $("opened").textContent = msg;
    var any = state.built.games.length > 0;
    $("results").hidden = !any;
    $("drop").hidden = any;
    ["print", "get-xlsx", "get-csv"].forEach(function (id) { $(id).disabled = !any; });
    if (!any) {
      return;
    }
    renderFilters();
    render();
  }

  function table(name, built) {
    return (built || state.built).tables.filter(function (t) { return t.name === name; })[0];
  }

  /* The rows of a table as objects (made once for each opening of files). */
  function objects(name) {
    if (!state.rows[name]) {
      var t = table(name), cols = t.columns.map(function (c) { return c[0]; });
      state.rows[name] = t.rows.map(function (r) {
        var o = {};
        cols.forEach(function (c, i) { o[c] = r[i]; });
        return o;
      });
    }
    return state.rows[name];
  }

  /* The rows of a table for the games in the filter. */
  function inFilter(name) {
    var files = state.inFilter;
    return objects(name).filter(function (r) { return files[r.file]; });
  }

  function nums(xs) {
    return xs.filter(function (x) { return typeof x === "number" && isFinite(x); });
  }

  function mean(xs) {
    xs = nums(xs);
    return xs.length ? xs.reduce(function (a, b) { return a + b; }, 0) / xs.length : null;
  }

  function sd(xs) {
    xs = nums(xs);
    if (xs.length < 2) {
      return null;
    }
    var m = mean(xs);
    return Math.sqrt(xs.reduce(function (a, x) { return a + (x - m) * (x - m); }, 0) / (xs.length - 1));
  }

  function median(xs) {
    xs = nums(xs).sort(function (a, b) { return a - b; });
    if (!xs.length) {
      return null;
    }
    var k = Math.floor(xs.length / 2);
    return xs.length % 2 ? xs[k] : (xs[k - 1] + xs[k]) / 2;
  }

  // ------------------------------------------------------------ the filter
  function viewOf(g) {
    return g.view === "3d" ? "3D " + (g.camera || "eyes") : "2D";
  }

  function endedOf(g) {
    return g.ended_how || (g.partial ? "cut short" : "");
  }

  var FILTERS = [
    ["condition", "Condition", function (g) { return g.condition || ""; }],
    ["maze", "Maze", function (g) { return g.maze || ""; }],
    ["view", "View", viewOf],
    ["character", "Character", function (g) { return g.character || ""; }],
    ["ended", "Ended", endedOf]
  ];

  function passes(g) {
    return FILTERS.every(function (f) { return !(state.off[f[0]] && state.off[f[0]][f[2](g)]); });
  }

  function renderFilters() {
    var games = objects("games");
    $("filter-list").innerHTML = FILTERS.map(function (f) {
      var count = {};
      games.forEach(function (g) {
        var v = f[2](g);
        count[v] = (count[v] || 0) + 1;
      });
      var vals = Object.keys(count).sort(function (a, b) { return count[b] - count[a] || a.localeCompare(b); });
      return "<fieldset><legend>" + esc(f[1]) + "</legend>" + vals.map(function (v) {
        var on = !(state.off[f[0]] && state.off[f[0]][v]);
        return "<label class=\"check\"><input type=\"checkbox\" data-filter=\"" + f[0] + "\" data-value=\"" + esc(v) + "\"" +
          (on ? " checked" : "") + "> <span>" + esc(v || "none") + "</span><i>" + count[v] + "</i></label>";
      }).join("") + "</fieldset>";
    }).join("");
    Array.prototype.forEach.call($("filter-list").querySelectorAll("input"), function (box) {
      box.addEventListener("change", function () {
        var k = box.getAttribute("data-filter"), v = box.getAttribute("data-value");
        state.off[k] = state.off[k] || {};
        if (box.checked) {
          delete state.off[k][v];
        } else {
          state.off[k][v] = true;
        }
        render();
      });
    });
  }

  /* The filter in words, for the print and the downloads. */
  function filterWords() {
    var parts = FILTERS.map(function (f) {
      var off = Object.keys(state.off[f[0]] || {});
      return off.length ? f[1].toLowerCase() + " not " + off.map(function (v) { return v || "none"; }).join(", ") : null;
    }).filter(Boolean);
    return (parts.length ? parts.join("; ") : "all games") + (state.withTests ? "; test games included" : "");
  }

  // ------------------------------------------------------------ the page
  function render() {
    var games = objects("games").filter(passes);
    state.inFilter = {};
    games.forEach(function (g) { state.inFilter[g.file] = true; });
    if (state.picked && !state.inFilter[state.picked]) {
      state.picked = null;
    }
    state.games = games;
    renderNumbers(games);
    $("by-condition").innerHTML = games.length ? byCondition(games) : "<p class=\"muted\">No game in the filter.</p>";
    drawCharts();
    renderHeat(games);
    renderGames(games);
    renderTableList();
    renderDictionary();
    if (state.picked) {
      showGame(state.picked);
    } else {
      $("game-card").hidden = true;
    }
  }

  /* The charts as wide as their panels (state.printWidth: for a printed page). */
  function drawCharts() {
    var games = state.games;
    $("moves-chart").innerHTML = stripChart(games, "moves", "Moves in the game", widthOf("moves-chart"));
    $("starved-chart").innerHTML = starvedChart(games, widthOf("starved-chart"));
    $("leave-chart").innerHTML = leaveChart(inFilter("visits"), widthOf("leave-chart"));
    $("energy-chart").innerHTML = energyChart(games, inFilter("steps"), widthOf("energy-chart"));
    bindPicks();
  }

  function widthOf(id) {
    if (state.printWidth) {
      return id === "energy-chart" ? 680 : 460;
    }
    return Math.max(280, Math.min(1400, Math.round($(id).clientWidth || 360)));
  }

  function bindPicks() {
    Array.prototype.forEach.call(document.querySelectorAll("svg [data-pick]"), function (el) {
      el.onclick = function () { pick(el.getAttribute("data-pick")); };
    });
  }

  function pick(file) {
    state.picked = state.picked === file ? null : file;
    render();
  }

  function renderNumbers(games) {
    var players = {};
    games.forEach(function (g) { players[g.player] = true; });
    var starved = games.filter(function (g) { return g.ended_how === "starved"; }).length;
    var list = [
      [games.length, "games"],
      [Object.keys(players).length, "players"],
      [games.length ? Math.round(100 * starved / games.length) + "%" : "", "starved"],
      [fmt(mean(games.map(function (g) { return g.moves; })), 1), "moves a game"],
      [fmt(mean(games.map(function (g) { return g.food_eaten; })), 1), "food eaten a game"],
      [games.reduce(function (a, g) { return a + (g.visits || 0); }, 0), "food-room visits"],
      [fmt(median(games.map(function (g) { return g.duration_s === null ? null : g.duration_s / 60; })), 1), "minutes a game (median)"]
    ];
    $("numbers").innerHTML = list.map(function (x) {
      return "<span><b>" + esc(x[0]) + "</b> " + esc(x[1]) + "</span>";
    }).join("");
    $("print-meta").textContent = "Made " + when(new Date().toISOString()) + " from " + games.length + " games of " +
      Object.keys(players).length + " players. Filter: " + filterWords() + ".";
  }

  function conditionsOf(games) {
    var seen = {};
    games.forEach(function (g) { seen[g.condition || ""] = true; });
    return Object.keys(seen).sort();
  }

  function mSd(xs, nd) {
    var m = mean(xs), s = sd(xs);
    return m === null ? "" : m.toFixed(nd) + (s === null ? "" : " (" + s.toFixed(nd) + ")");
  }

  function byCondition(games) {
    var conds = conditionsOf(games);
    var groups = conds.map(function (c) { return games.filter(function (g) { return (g.condition || "") === c; }); });
    if (conds.length > 1) {
      conds.push("All");
      groups.push(games);
    }
    var col = function (k) { return function (gs) { return gs.map(function (g) { return g[k]; }); }; };
    var rows = [
      ["Games", function (gs) { return String(gs.length); }],
      ["Players", function (gs) {
        var p = {};
        gs.forEach(function (g) { p[g.player] = true; });
        return String(Object.keys(p).length);
      }],
      ["Moves, M (SD)", function (gs) { return mSd(col("moves")(gs), 1); }],
      ["Food eaten, M (SD)", function (gs) { return mSd(col("food_eaten")(gs), 1); }],
      ["Energy at the end, M (SD)", function (gs) { return mSd(col("energy_end")(gs), 1); }],
      ["Food-room visits, M (SD)", function (gs) { return mSd(col("visits")(gs), 1); }],
      ["Rooms entered, M (SD)", function (gs) { return mSd(col("rooms_entered")(gs), 1); }],
      ["Starved, %", function (gs) {
        return gs.length ? String(Math.round(100 * gs.filter(function (g) { return g.ended_how === "starved"; }).length / gs.length)) : "";
      }],
      ["Minutes, median", function (gs) {
        var m = median(gs.map(function (g) { return g.duration_s === null ? null : g.duration_s / 60; }));
        return m === null ? "" : m.toFixed(1);
      }]
    ];
    return "<div class=\"scroll\"><table class=\"apa\"><thead><tr><th></th>" + conds.map(function (c) {
      return "<th class=\"n\">" + esc(c || "none") + "</th>";
    }).join("") + "</tr></thead><tbody>" + rows.map(function (r) {
      return "<tr><td>" + esc(r[0]) + "</td>" + groups.map(function (gs) { return "<td class=\"n\">" + esc(r[1](gs)) + "</td>"; }).join("") +
        "</tr>";
    }).join("") + "</tbody></table></div>";
  }

  // ------------------------------------------------------------ charts (SVG)
  var BLUE = "#1f5fa8";

  /* Round steps for an axis from 0 (or lo) to hi: about n of them. */
  function ticks(lo, hi, n) {
    if (!(hi > lo)) {
      hi = lo + 1;
    }
    var raw = (hi - lo) / (n || 5), mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var step = [1, 2, 2.5, 5, 10].map(function (k) { return k * mag; }).filter(function (k) { return k >= raw; })[0];
    var out = [];
    for (var v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) {
      out.push(+v.toFixed(10));
    }
    return {list: out, top: Math.max(hi, out[out.length - 1])};
  }

  /* A chart w x h: x from xr[0] to xr[1] (xt: its ticks, a number or
   * [value, label]), y likewise; with the axes and their labels. */
  function Chart(w, h, xr, yr, xt, yt, xl, yl) {
    var c = this;
    c.w = w;
    c.h = h;
    c.L = 46;
    c.R = 12;
    c.T = 10;
    c.B = 34;
    c.xr = xr;
    c.yr = yr;
    c.parts = [];
    c.marks = [];
    var y0 = c.y(yr[0]);
    yt.forEach(function (t) {
      c.parts.push("<line class=\"gridline\" x1=\"" + c.L + "\" x2=\"" + (w - c.R) + "\" y1=\"" + c.y(t) + "\" y2=\"" + c.y(t) + "\"/>" +
        "<text class=\"tick\" x=\"" + (c.L - 6) + "\" y=\"" + (c.y(t) + 4) + "\" text-anchor=\"end\">" + esc(t) + "</text>");
    });
    xt.forEach(function (t) {
      var v = Array.isArray(t) ? t[0] : t, lab = Array.isArray(t) ? t[1] : t;
      c.parts.push("<line class=\"axis\" x1=\"" + c.x(v) + "\" x2=\"" + c.x(v) + "\" y1=\"" + y0 + "\" y2=\"" + (y0 + 4) + "\"/>" +
        "<text class=\"tick\" x=\"" + c.x(v) + "\" y=\"" + (y0 + 16) + "\" text-anchor=\"middle\">" + esc(lab) + "</text>");
    });
    c.parts.push("<line class=\"axis\" x1=\"" + c.L + "\" x2=\"" + (w - c.R) + "\" y1=\"" + y0 + "\" y2=\"" + y0 + "\"/>" +
      "<line class=\"axis\" x1=\"" + c.L + "\" x2=\"" + c.L + "\" y1=\"" + c.T + "\" y2=\"" + y0 + "\"/>");
    if (xl) {
      c.parts.push("<text class=\"label\" x=\"" + ((c.L + w - c.R) / 2) + "\" y=\"" + (h - 3) + "\" text-anchor=\"middle\">" + esc(xl) + "</text>");
    }
    c.parts.push("<text class=\"label\" transform=\"translate(12," + ((c.T + y0) / 2) + ") rotate(-90)\" text-anchor=\"middle\">" +
      esc(yl) + "</text>");
  }

  Chart.prototype.x = function (v) {
    return +(this.L + (this.w - this.L - this.R) * (v - this.xr[0]) / (this.xr[1] - this.xr[0])).toFixed(1);
  };

  Chart.prototype.y = function (v) {
    return +(this.T + (this.h - this.T - this.B) * (1 - (v - this.yr[0]) / (this.yr[1] - this.yr[0]))).toFixed(1);
  };

  Chart.prototype.svg = function (label) {
    return "<svg class=\"chart\" width=\"" + this.w + "\" height=\"" + this.h + "\" viewBox=\"0 0 " + this.w + " " + this.h +
      "\" role=\"img\" aria-label=\"" + esc(label) + "\">" +
      this.parts.join("") + this.marks.join("") + "</svg>";
  };

  /* A number from 0 to 1 for a text, the same every time (spreading points). */
  function spread(text) {
    var h = 2166136261;
    for (var i = 0; i < text.length; i++) {
      h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    }
    return ((h >>> 0) % 1000) / 1000;
  }

  function who(g) {
    return "player " + g.player + ", game " + g.game;
  }

  function stripChart(games, key, label, w) {
    var conds = conditionsOf(games);
    var vals = nums(games.map(function (g) { return g[key]; }));
    if (!vals.length) {
      return "<p class=\"muted\">No values.</p>";
    }
    var yt = ticks(0, Math.max.apply(null, vals), 5);
    var c = new Chart(w, 230, [-0.5, conds.length - 0.5], [0, yt.top], conds.map(function (n, i) { return [i, n || "none"]; }),
      yt.list, "", label);
    conds.forEach(function (n, i) {
      var gs = games.filter(function (g) { return (g.condition || "") === n && typeof g[key] === "number"; });
      gs.forEach(function (g) {
        var on = g.file === state.picked;
        c.marks.push("<circle class=\"" + (on ? "dot on" : "dot") + "\" data-pick=\"" + esc(g.file) + "\" cx=\"" +
          c.x(i + (spread(g.file) - 0.5) * 0.4) + "\" cy=\"" + c.y(g[key]) + "\" r=\"" + (on ? 4.5 : 3) + "\"><title>" +
          esc(who(g) + ": " + g[key]) + "</title></circle>");
      });
      var m = mean(gs.map(function (g) { return g[key]; }));
      if (m !== null) {
        c.marks.push("<line class=\"mean\" x1=\"" + c.x(i - 0.3) + "\" x2=\"" + c.x(i + 0.3) + "\" y1=\"" + c.y(m) + "\" y2=\"" + c.y(m) + "\"/>");
      }
    });
    return c.svg(label + " by condition");
  }

  function starvedChart(games, w) {
    var conds = conditionsOf(games);
    if (!games.length) {
      return "";
    }
    var c = new Chart(w, 230, [-0.5, conds.length - 0.5], [0, 100], conds.map(function (n, i) { return [i, n || "none"]; }),
      [0, 25, 50, 75, 100], "", "Starved, %");
    conds.forEach(function (n, i) {
      var gs = games.filter(function (g) { return (g.condition || "") === n; });
      var v = 100 * gs.filter(function (g) { return g.ended_how === "starved"; }).length / gs.length;
      c.marks.push("<rect class=\"colbar\" x=\"" + c.x(i - 0.22) + "\" width=\"" + (c.x(0.22) - c.x(-0.22)).toFixed(1) + "\" y=\"" +
        c.y(v) + "\" height=\"" + (c.y(0) - c.y(v)).toFixed(1) + "\"/>" +
        // the number over the bar, or in it near the top
        "<text class=\"tick\" x=\"" + c.x(i) + "\" y=\"" + (v > 88 ? c.y(v) + 14 : c.y(v) - 5) + "\" text-anchor=\"middle\"" +
        (v > 88 ? " style=\"fill:#fff\"" : "") + ">" + Math.round(v) + "% of " + gs.length + "</text>");
    });
    return c.svg("Starved by condition");
  }

  function leaveChart(visits, w) {
    var done = visits.filter(function (v) { return typeof v.stays === "number" && typeof v.level_end === "number"; });
    if (!done.length) {
      return "<p class=\"muted\">No visit to a food room in the filter.</p>";
    }
    var xt = ticks(0, Math.max(5, Math.max.apply(null, done.map(function (v) { return v.stays; }))), 6);
    var c = new Chart(w, 230, [0, xt.top], [0, 1], xt.list, [0, 0.25, 0.5, 0.75, 1], "Stays in the visit", "Level when leaving");
    // the picked game's visits last, on top
    done.sort(function (a, b) { return (a.file === state.picked) - (b.file === state.picked); });
    done.forEach(function (v) {
      var on = v.file === state.picked;
      c.marks.push("<circle class=\"" + (v.food_room === "small" ? "dot open" : "dot") + (on ? " on" : "") + "\" data-pick=\"" +
        esc(v.file) + "\" cx=\"" + c.x(v.stays) + "\" cy=\"" + c.y(v.level_end) + "\" r=\"" + (on ? 4.5 : 3.4) + "\"><title>" +
        esc("player " + v.player + ", game " + v.game + ", visit " + v.visit + " (" + v.food_room + "): " + v.stays +
          " stays, left at " + fmt(v.level_end, 2)) + "</title></circle>");
    });
    return c.svg("Food level when leaving a food room, by the stays of the visit");
  }

  function energyChart(games, steps, w) {
    if (!steps.length) {
      return "";
    }
    var by = {};
    steps.forEach(function (st) {
      if (typeof st.energy === "number") {
        (by[st.file] = by[st.file] || []).push([st.step, st.energy]);
      }
    });
    var size = Math.max.apply(null, nums(games.map(function (g) { return g.stomach_size; })).concat([1]));
    var last = Math.max.apply(null, steps.map(function (st) { return st.step; }).concat([1]));
    var xt = ticks(0, last, Math.max(4, Math.round(w / 110))), yt = ticks(0, size, 4);
    var c = new Chart(w, 260, [0, xt.top], [0, yt.top], xt.list, yt.list, "Step", "Energy");
    var picked = null;
    games.forEach(function (g) {
      var pts = by[g.file];
      if (!pts) {
        return;
      }
      var d = pts.map(function (p, i) { return (i ? "L" : "M") + c.x(p[0]) + "," + c.y(p[1]); }).join("");
      var path = "<path class=\"" + (g.file === state.picked ? "line on" : "line") + "\" data-pick=\"" + esc(g.file) + "\" d=\"" + d +
        "\"><title>" + esc(who(g)) + "</title></path>";
      if (g.file === state.picked) {
        picked = path;
      } else {
        c.marks.push(path);
      }
    });
    if (picked) {
      c.marks.push(picked);
    }
    return c.svg("Energy over the steps of each game");
  }

  /* The rooms of a maze: its grid (FG.MAZES, or a team maze as a game file has it). */
  function mazeRooms(name) {
    if (FG.MAZES && FG.MAZES[name]) {
      return FG.MAZES[name].rooms;
    }
    var f = state.built.games.filter(function (x) { return x.data.game.layout.maze === name && x.data.game.maze_def; })[0];
    return f ? f.data.game.maze_def.rooms : null;
  }

  function renderHeat(games) {
    var count = {};
    games.forEach(function (g) { count[g.maze] = (count[g.maze] || 0) + 1; });
    var mazes = Object.keys(count).sort(function (a, b) { return count[b] - count[a] || a.localeCompare(b); });
    var sel = $("heat-maze");
    if (mazes.indexOf(state.heatMaze) < 0) {
      state.heatMaze = mazes[0] || null;
    }
    sel.innerHTML = mazes.map(function (m) {
      return "<option value=\"" + esc(m) + "\"" + (m === state.heatMaze ? " selected" : "") + ">" + esc(m) + " (" + count[m] + ")</option>";
    }).join("");
    sel.onchange = function () {
      state.heatMaze = sel.value;
      renderHeat(state.games);
    };
    $("heat-chart").innerHTML = state.heatMaze ? heatChart(state.heatMaze, games) : "";
  }

  function heatChart(maze, games) {
    var rooms = mazeRooms(maze);
    if (!rooms) {
      return "<p class=\"muted\">The maze " + esc(maze) + " is not known here.</p>";
    }
    var files = {};
    games.forEach(function (g) {
      if (g.maze === maze) {
        files[g.file] = true;
      }
    });
    var n = {};
    inFilter("navigation").forEach(function (r) {
      if (files[r.file]) {
        n[r.to_room] = (n[r.to_room] || 0) + 1;
      }
    });
    var most = Math.max.apply(null, Object.keys(n).map(function (k) { return n[k]; }).concat([1]));
    var H = rooms.length, W = rooms[0].length, cell = Math.min(52, Math.floor(300 / Math.max(W, H)));
    var out = [];
    for (var i = 0; i < H; i++) {
      for (var j = 0; j < W; j++) {
        if (rooms[i][j] < 0) {
          continue;
        }
        var name = "s" + i + j, v = n[name] || 0, k = v / most;
        var shade = "rgb(" + Math.round(246 - 196 * k) + "," + Math.round(247 - 170 * k) + "," + Math.round(249 - 110 * k) + ")";
        out.push("<rect x=\"" + (j * cell + 1) + "\" y=\"" + (i * cell + 1) + "\" width=\"" + (cell - 3) + "\" height=\"" + (cell - 3) +
          "\" fill=\"" + shade + "\" class=\"room\"><title>" + name + ": " + v + "</title></rect>" +
          "<text class=\"tick\" x=\"" + (j * cell + cell / 2) + "\" y=\"" + (i * cell + cell / 2 + 4) + "\" text-anchor=\"middle\"" +
          (k > 0.55 ? " style=\"fill:#fff\"" : "") + ">" + v + "</text>");
      }
    }
    return "<svg class=\"chart heat\" viewBox=\"0 0 " + (W * cell) + " " + (H * cell) + "\" style=\"max-width:" + (W * cell) +
      "px\" role=\"img\" aria-label=\"Moves into each room of " + esc(maze) + "\">" + out.join("") + "</svg>";
  }

  // ------------------------------------------------------------ games and tables
  var GAME_COLUMNS = [
    ["started", "started"], ["player", "player"], ["game", "game"], ["condition", "condition"], ["maze", "maze"],
    ["view", "view"], ["character", "character"], ["ended_how", "ended"], ["moves", "moves", 0],
    ["food_eaten", "food_eaten", 1], ["energy_end", "energy_end", 1], ["visits", "visits", 0], ["rooms_entered", "rooms", 0],
    ["duration_s", "minutes", 1]
  ];

  function renderGames(games) {
    var rows = games.slice(), s = state.sort;
    rows.sort(function (a, b) {
      var x = a[s.key], y = b[s.key];
      var c = x === y ? 0 : x === null ? 1 : y === null ? -1 : typeof x === "number" && typeof y === "number" ? x - y :
        String(x).localeCompare(String(y));
      return s.up ? c : -c;
    });
    var head = "<thead><tr><th class=\"rn\"></th>" + GAME_COLUMNS.map(function (c) {
      var on = c[0] === s.key;
      return "<th data-key=\"" + c[0] + "\" class=\"" + (c.length > 2 ? "n " : "") + (on ? "sorted" + (s.up ? " up" : "") : "") + "\">" +
        esc(c[1]) + "</th>";
    }).join("") + "</tr></thead>";
    var body = "<tbody>" + rows.map(function (g, k) {
      return "<tr class=\"" + (g.file === state.picked ? "on" : "") + "\" tabindex=\"0\" data-file=\"" + esc(g.file) + "\">" +
        "<td class=\"rn\">" + (k + 1) + "</td>" + GAME_COLUMNS.map(function (c) {
          var v = g[c[0]];
          if (c[0] === "started") {
            return "<td>" + esc(when(v)) + (g.test ? " <span class=\"tag\">test</span>" : "") + "</td>";
          }
          if (c[0] === "ended_how") {
            return "<td>" + esc(endedOf(g)) + "</td>";
          }
          if (c[0] === "view") {
            return "<td>" + esc(viewOf(g)) + "</td>";
          }
          if (c[0] === "duration_s") {
            return "<td class=\"n\">" + esc(v === null ? "" : (v / 60).toFixed(1)) + "</td>";
          }
          return c.length > 2 ? "<td class=\"n\">" + esc(fmt(v, c[2])) + "</td>" : "<td>" + esc(v) + "</td>";
        }).join("") + "</tr>";
    }).join("") + "</tbody>";
    var el = $("games");
    el.innerHTML = head + body;
    Array.prototype.forEach.call(el.querySelectorAll("th[data-key]"), function (th) {
      th.addEventListener("click", function () {
        var k = th.getAttribute("data-key");
        state.sort = {key: k, up: state.sort.key === k ? !state.sort.up : true};
        renderGames(state.games);
      });
    });
    Array.prototype.forEach.call(el.querySelectorAll("tbody tr"), function (tr) {
      tr.addEventListener("click", function () { pick(tr.getAttribute("data-file")); });
      tr.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          pick(tr.getAttribute("data-file"));
        }
      });
    });
  }

  function renderTableList() {
    var n = state.games.length;
    $("table-list").innerHTML = "<p class=\"muted\">The downloads hold the " + n + " game" + (n === 1 ? "" : "s") +
      " in the filter: 1 row for each observation, every column described.</p><table class=\"grid-table\"><thead><tr>" +
      "<th>table</th><th>1 row</th><th class=\"n\">rows</th></tr></thead><tbody>" +
      state.built.tables.map(function (t) {
        return "<tr><td><b>" + esc(t.name) + "</b></td><td>" + esc(t.row) + "</td><td class=\"n\">" +
          inFilter(t.name).length.toLocaleString("en-GB") + "</td></tr>";
      }).join("") + "</tbody></table>";
  }

  function renderDictionary() {
    $("dictionary").innerHTML = "<p class=\"muted\">Times are seconds from the start of the game. Yes and no are 1 and 0; " +
      "an empty cell has no value. Rooms are s&lt;row&gt;&lt;column&gt;, s00 top left.</p>" +
      state.built.tables.map(function (t) {
        return "<h3>" + esc(t.name) + " <span class=\"muted\">1 row: " + esc(t.row) + "</span></h3>" +
          "<table class=\"grid-table dict-table\"><tbody>" + t.columns.map(function (c) {
            return "<tr><td><code>" + esc(c[0]) + "</code></td><td>" + esc(c[1]) + "</td></tr>";
          }).join("") + "</tbody></table>";
      }).join("");
  }

  // ------------------------------------------------------------ the game picked
  function showGame(name) {
    var f = state.files[name];
    var card = $("game-card");
    var g = objects("games").filter(function (x) { return x.file === name; })[0];
    if (!f || !g) {
      card.hidden = true;
      return;
    }
    var visits = objects("visits").filter(function (v) { return v.file === name; });
    var steps = objects("steps").filter(function (st) { return st.file === name; });
    var facts = [
      ["started", when(g.started)], ["condition", g.condition], ["maze", g.maze], ["view", viewOf(g)],
      ["character", g.character], ["ended", endedOf(g)], ["minutes", g.duration_s === null ? "" : (g.duration_s / 60).toFixed(1)],
      ["moves", g.moves], ["stays", (g.idle_stays || 0) + (g.space_stays || 0)], ["food eaten", fmt(g.food_eaten, 2)],
      ["food lost", fmt(g.food_lost, 2)], ["energy at the end", fmt(g.energy_end, 2)], ["lowest energy", fmt(g.energy_min, 2)],
      ["food-room visits", g.visits], ["rooms entered", g.rooms_entered + " of " + g.rooms_in_maze],
      ["revisits", g.revisits], ["straight back", g.backtracks], ["decision, median ms", fmt(g.decision_ms_median, 0)]
    ];
    if (g.view === "3d") {
      facts.push(["paintings looked at", g.paintings_looked_at], ["likes", g.likes], ["records played", g.music_plays]);
    }
    card.hidden = false;
    card.innerHTML =
      "<h2>Picked: " + esc(who(g)) + " <span class=\"muted\">" + esc(name) + "</span>" +
      "<button class=\"link screen\" type=\"button\" id=\"unpick\">close</button></h2>" +
      "<div class=\"scroll\"><table class=\"facts\"><tbody>" + facts.map(function (x, i) {
        return (i % 3 === 0 ? "<tr>" : "") + "<th>" + esc(x[0]) + "</th><td>" + esc(x[1]) + "</td>" + (i % 3 === 2 ? "</tr>" : "");
      }).join("") + "</tbody></table></div>" +
      "<div class=\"pair\"><figure><canvas id=\"route\"></canvas><figcaption>The route through the maze.</figcaption></figure>" +
      "<figure><canvas id=\"energy\"></canvas><figcaption id=\"energy-legend\"></figcaption></figure></div>" +
      "<h3>Visits to food rooms</h3>" + visitsTable(visits) +
      "<h3 class=\"screen\">Steps</h3><div class=\"scroll tall screen\">" + stepsTable(steps) + "</div>";
    $("unpick").addEventListener("click", function () { pick(name); });
    drawRoute(f.data.game);
    drawEnergy(f.data.game, steps);
  }

  function visitsTable(visits) {
    if (!visits.length) {
      return "<p class=\"muted\">No food room was entered.</p>";
    }
    var cols = [["visit", "visit"], ["food_room", "food room"], ["room", "room"], ["enter_step", "entered", 0],
      ["leave_step", "left", 0], ["stays", "stays", 0], ["duration_s", "seconds", 1], ["level_before", "level before", 2],
      ["level_end", "level left", 2], ["eaten", "eaten", 2], ["energy_end", "energy after", 2], ["travel_steps", "steps since last", 0]];
    return "<div class=\"scroll\"><table class=\"grid-table\"><thead><tr>" +
      cols.map(function (c) { return "<th" + (c.length > 2 ? " class=\"n\"" : "") + ">" + esc(c[1]) + "</th>"; }).join("") +
      "</tr></thead><tbody>" + visits.map(function (v) {
        return "<tr>" + cols.map(function (c) {
          return c.length > 2 ? "<td class=\"n\">" + esc(fmt(v[c[0]], c[2])) + "</td>" : "<td>" + esc(v[c[0]]) + "</td>";
        }).join("") + "</tr>";
      }).join("") + "</tbody></table></div>";
  }

  function stepsTable(steps) {
    var cols = [["step", "step", 0], ["move", "move"], ["by", "by"], ["room", "room"], ["in_food_room", "food room"],
      ["decision_ms", "decision ms", 0], ["paid", "paid", 2], ["energy", "energy", 2], ["eaten", "eaten", 2],
      ["events", "events"]];
    return "<table class=\"grid-table\"><thead><tr>" + cols.map(function (c) {
      return "<th" + (c.length > 2 ? " class=\"n\"" : "") + ">" + esc(c[1]) + "</th>";
    }).join("") + "</tr></thead><tbody>" + steps.map(function (st) {
      return "<tr>" + cols.map(function (c) {
        return c.length > 2 ? "<td class=\"n\">" + esc(fmt(st[c[0]], c[2])) + "</td>" : "<td>" + esc(st[c[0]]) + "</td>";
      }).join("") + "</tr>";
    }).join("") + "</tbody></table>";
  }

  function drawRoute(game) {
    var canvas = $("route"), box = canvas.parentNode;
    // drawn at least as wide as the end page's map (for its key), then fitted to the box
    var w = Math.max(560, box.clientWidth), h = Math.round(w * 0.92);
    if (FG.MAZES && !FG.MAZES[game.layout.maze] && game.maze_def) {
      FG.MAZES[game.layout.maze] = {rooms: game.maze_def.rooms};
    }
    try {
      FG.route.draw(canvas, game, w, h);
      canvas.style.width = "100%";
      canvas.style.height = "auto";
    } catch (err) {
      box.innerHTML = "<p class=\"muted\">The map could not be drawn: " + esc(err.message) + "</p>";
    }
  }

  var CANVAS_FONT = "12px system-ui, 'Segoe UI', Roboto, Arial, sans-serif";

  function drawEnergy(game, steps) {
    var canvas = $("energy"), box = canvas.parentNode;
    var w = Math.max(300, box.clientWidth), h = 300, dpr = root.devicePixelRatio || 1;
    canvas.style.width = "100%";
    canvas.style.height = h + "px";
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    var g = canvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#fff";
    g.fillRect(0, 0, w, h);
    var size = (game.settings && game.settings.stomach && game.settings.stomach.size) || 20;
    var foods = state.built.foods;
    var L = 40, R = 40, T = 12, B = 34, n = Math.max(1, steps.length - 1);
    var X = function (i) { return L + (w - L - R) * i / n; };
    var Y = function (v) { return T + (h - T - B) * (1 - v); };
    var colour = {patch: "#b07a12", small: "#7a5230"};
    // the steps in a food room
    steps.forEach(function (st, i) {
      if (st.in_food_room && i > 0) {
        g.fillStyle = st.in_food_room === "small" ? "rgba(122,82,48,0.10)" : "rgba(176,122,18,0.12)";
        g.fillRect(X(i - 0.5), T, Math.max(1, X(1) - X(0)), h - T - B);
      }
    });
    g.strokeStyle = "#e4e6e9";
    g.lineWidth = 1;
    g.font = CANVAS_FONT;
    g.fillStyle = "#555";
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
    g.strokeStyle = "#222";
    g.beginPath();
    g.moveTo(L, T);
    g.lineTo(L, h - B);
    g.lineTo(w - R, h - B);
    g.stroke();
    g.textAlign = "center";
    g.textBaseline = "top";
    var every = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].filter(function (e) { return n / e <= 10; })[0] || 2000;
    for (var s = 0; s <= n; s += every) {
      g.fillText(String(s), X(s), h - B + 6);
    }
    g.fillText("step", (L + w - R) / 2, h - 15);
    function line(get, col, width, dash) {
      g.strokeStyle = col;
      g.lineWidth = width;
      g.setLineDash(dash || []);
      g.beginPath();
      var started = false;
      steps.forEach(function (st, i) {
        var v = get(st);
        if (v === null || v === undefined) {
          return;
        }
        if (!started) {
          g.moveTo(X(i), Y(v));
          started = true;
        } else {
          g.lineTo(X(i), Y(v));
        }
      });
      g.stroke();
      g.setLineDash([]);
    }
    foods.forEach(function (fd) {
      line(function (st) { return st["level_" + fd]; }, colour[fd] || "#666", 1.6, fd === "small" ? [5, 4] : null);
    });
    line(function (st) { return st.energy === null ? null : st.energy / size; }, BLUE, 2.4);
    $("energy-legend").innerHTML = "Energy (blue, left axis) and the level of each food room (right axis): " +
      foods.map(function (fd) {
        return "<span class=\"key\" style=\"border-color:" + (colour[fd] || "#666") + (fd === "small" ? ";border-top-style:dashed" : "") +
          "\"></span>" + esc(fd);
      }).join(", ") + ". Shaded: steps in a food room.";
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
    var gt = table("games", built), pc = gt.columns.map(function (c) { return c[0]; }).indexOf("player");
    var about = [
      ["The games of the foraging game, as tables"],
      ["Made", new Date().toISOString().replace(/\.\d+Z$/, "Z")],
      ["By", "analysis.html of the game, version " + VERSION],
      ["Games", built.games.length],
      ["Players", Object.keys(gt.rows.reduce(function (a, r) { a[r[pc]] = 1; return a; }, {})).length],
      ["Filter", filterWords()],
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
      built.games.length + " games (filter: " + filterWords() + ").\r\n\r\n" +
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
    // the games in the filter
    var built = FG.tables.build(state.built.games.filter(function (f) { return state.inFilter[f.name]; }));
    var made = kind === "xlsx" ? workbook(built) : csvZip(built);
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
    refresh: refresh, render: render};

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", function () {
      setUpLock();
      setUpOpening();
      $("footer").textContent = "The foraging game " + VERSION + ". Game files opened here are read in this browser " +
        "and never sent anywhere; Lock (or closing the page) forgets them.";
    });
  }
})(typeof window !== "undefined" ? window : globalThis);
