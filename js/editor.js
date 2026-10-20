/* The maze editor (the game opened with ?edit=1): a grid to draw a maze on,
 * with its checks, a try in 2D or 3D, and the save into the game
 * (js/team_save.js). The drawing is kept while the maze is tried and when
 * the editor is left, until "Start again".
 *
 * Drawing: with the Rooms tool a click turns a room into no room and back,
 * and dragging paints the same over every square passed; with S, C or B a
 * click puts the start, the cheese room or the bread room there (a square
 * with no room becomes a room), and a click on it again takes it away. Keys
 * R, S, C and B choose the tool when no text box has the keyboard. */
(function (root) {
  "use strict";
  var FG = root.FG = root.FG || {};
  var T = FG.mazeTools;

  var TOOLS = ["rooms", "S", "C", "B"];
  var MARK_STYLE = {S: {fill: "#f4f7fb", text: "#0c1016"}, C: {fill: "#f4c542", text: "#2a1d00"},
    B: {fill: "#c98b4b", text: "#1f1203"}};
  var WHO = /^[\p{L}\p{M}0-9 .'-]{1,40}$/u;

  function $(id) {
    return document.getElementById(id);
  }

  function escape(t) {
    return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  }

  function fresh(moves) {
    return {rows: 5, cols: 5, cells: grid(5, 5), name: "", moves: moves, tool: "rooms"};
  }

  function grid(rows, cols, old) {
    var out = [];
    for (var r = 0; r < rows; r++) {
      var row = [];
      for (var c = 0; c < cols; c++) {
        row.push(old && old[r] && old[r][c] !== undefined ? old[r][c] : ".");
      }
      out.push(row);
    }
    return out;
  }

  var st = null;             // the drawing: {rows, cols, cells, name, moves, tool}
  var opts = null;           // what the game gave open()
  var bound = false, busy = false, paint = null, cellPx = 30;
  var lastCheck = null;

  /* opts: {draft (a drawing kept from before, or null), moves (the moves of a
   * new maze), taken(name), fits(shape, moves) (null, or why the settings do
   * not fit the maze), tryIt(view), back(), saved(name), demo}. */
  function open(o) {
    opts = o;
    st = o.draft || st || fresh(o.moves);
    bind();
    $("edName").value = st.name;
    $("edRows").value = st.rows;
    $("edCols").value = st.cols;
    $("edMoves").value = st.moves;
    $("edStatus").textContent = "";
    setupMode(!FG.TEAM_KEY);
    $("edDemo").hidden = !o.demo;
    if (!$("edRepo").value && FG.teamSave) {
      $("edRepo").value = FG.teamSave.guessRepo();
    }
    busy = false;
    render();
  }

  function draft() {
    return st;
  }

  function bind() {
    if (bound) {
      return;
    }
    bound = true;
    var cv = $("edGrid");
    cv.addEventListener("pointerdown", function (e) {
      if (busy) {
        return;
      }
      var at = cellAt(e);
      if (!at) {
        return;
      }
      cv.setPointerCapture(e.pointerId);
      if (st.tool === "rooms") {
        paint = st.cells[at[0]][at[1]] === "#" ? "." : "#";
        put(at, paint);
      } else {
        mark(at, st.tool);
        paint = null;
      }
      render();
    });
    cv.addEventListener("pointermove", function (e) {
      if (paint === null || busy) {
        return;
      }
      var at = cellAt(e);
      if (at && (st.cells[at[0]][at[1]] === "#") !== (paint === "#")) {
        put(at, paint);
        render();
      }
    });
    var stop = function () { paint = null; };
    cv.addEventListener("pointerup", stop);
    cv.addEventListener("pointercancel", stop);
    TOOLS.forEach(function (tool) {
      $("edTool_" + tool).addEventListener("click", function () { setTool(tool); });
    });
    $("edName").addEventListener("input", function () {
      var v = $("edName").value.toLowerCase().replace(/[\s-]+/g, "_").replace(/[^a-z0-9_]/g, "");
      if (v !== $("edName").value) {
        $("edName").value = v;
      }
      st.name = v;
      render();
    });
    ["edRows", "edCols"].forEach(function (id) {
      $(id).addEventListener("change", resize);
    });
    $("edMoves").addEventListener("input", function () {
      st.moves = Number($("edMoves").value);
      render();
    });
    $("edTry3d").addEventListener("click", function () { tryIt("3d"); });
    $("edTry2d").addEventListener("click", function () { tryIt("2d"); });
    $("edBack").addEventListener("click", function () {
      if (!busy) {
        opts.back();
      }
    });
    $("edClear").addEventListener("click", function () {
      if (!busy) {
        st = fresh(opts.moves);
        open(Object.assign({}, opts, {draft: st}));
      }
    });
    $("edSave").addEventListener("click", save);
    $("edResetup").addEventListener("click", function () {
      if (!busy) {
        setupMode(true);
      }
    });
    root.addEventListener("resize", function () {
      if (!$("editor").hidden) {
        render();
      }
    });
  }

  /* The fields to set up saving (the first time, or again with a new key or
   * password), or the team password alone. */
  function setupMode(on) {
    $("edSetup").hidden = !on;
    $("edUnlock").hidden = on;
    if (st) {
      render();
    }
  }

  function settingUp() {
    return !$("edSetup").hidden;
  }

  function setTool(tool) {
    st.tool = tool;
    render();
  }

  /* A key while the editor is open; returns what it did, for the record. */
  function key(e) {
    if (e.type !== "keydown" || busy) {
      return undefined;
    }
    var t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) {
      return undefined;
    }
    var k = String(e.key || "").toUpperCase();
    if (k === "R") {
      setTool("rooms");
      return "tool rooms";
    }
    if (k === "S" || k === "C" || k === "B") {
      setTool(k);
      return "tool " + k;
    }
    return "ignored: key";
  }

  function resize() {
    var R = clampSide($("edRows").value), C = clampSide($("edCols").value);
    $("edRows").value = R;
    $("edCols").value = C;
    st.rows = R;
    st.cols = C;
    st.cells = grid(R, C, st.cells);
    render();
  }

  function clampSide(v) {
    var n = Math.round(Number(v));
    return isFinite(n) ? Math.max(T.MIN_SIDE, Math.min(T.MAX_SIDE, n)) : 5;
  }

  function put(at, ch) {
    st.cells[at[0]][at[1]] = ch;
  }

  function mark(at, m) {
    var here = st.cells[at[0]][at[1]];
    if (here === m) {
      put(at, ".");
      return;
    }
    st.cells.forEach(function (row) {
      row.forEach(function (ch, c) {
        if (ch === m) {
          row[c] = ".";
        }
      });
    });
    put(at, m);
  }

  function cellAt(e) {
    var cv = $("edGrid"), box = cv.getBoundingClientRect();
    var x = e.clientX - box.left, y = e.clientY - box.top;
    var c = Math.floor(x / cellPx), r = Math.floor(y / cellPx);
    return r >= 0 && c >= 0 && r < st.rows && c < st.cols ? [r, c] : null;
  }

  // ------------------------------------------------------------ checks
  function shape() {
    return T.shapeOf(st.cells);
  }

  /* {lines: [{ok, text}], drawOk, tryOk, saveOk, info} */
  function checks() {
    var lines = [];
    var info = T.read(shape());
    var drawOk = !info.problems.length;
    if (drawOk) {
      lines.push({ok: true, text: info.count + " rooms, all reachable from each other"});
    } else {
      info.problems.forEach(function (p) { lines.push({ok: false, text: p}); });
    }
    [["start", "Start"], ["cheese", "Cheese room (worth 8)"], ["bread", "Bread room (worth 1)"]].forEach(function (k) {
      var at = info[k[0]];
      lines.push({ok: null, text: k[1] + ": " + (at ? FG.rules.roomName(at) : "a random room each game")});
    });
    var movesOk = st.moves === Math.floor(st.moves) && st.moves >= 1 && st.moves <= T.MAX_MOVES;
    if (!movesOk) {
      lines.push({ok: false, text: "The moves must be a whole number from 1 to " + T.MAX_MOVES + "."});
    }
    var fits = drawOk && movesOk ? opts.fits(shape(), st.moves) : null;
    if (fits) {
      lines.push({ok: false, text: "The settings of the game do not fit this maze: " + fits});
    }
    var nameOk = false;
    if (!st.name) {
      lines.push({ok: false, text: "Give the maze a name to save it: small letters, digits and _."});
    } else if (!T.NAME.test(st.name)) {
      lines.push({ok: false, text: "The name must start with a letter and have at most 40 letters, digits and _."});
    } else if (opts.taken(st.name)) {
      lines.push({ok: false, text: "There is already a maze called " + st.name + ". Choose another name."});
    } else {
      nameOk = true;
      lines.push({ok: true, text: "Name: " + st.name});
    }
    var tryOk = drawOk && movesOk && !fits;
    return {lines: lines, drawOk: drawOk, tryOk: tryOk, saveOk: tryOk && nameOk && !opts.demo, info: info};
  }

  // ------------------------------------------------------------ drawing
  function render() {
    lastCheck = checks();
    TOOLS.forEach(function (tool) {
      $("edTool_" + tool).classList.toggle("on", st.tool === tool);
    });
    $("edChecks").innerHTML = lastCheck.lines.map(function (l) {
      return '<li class="' + (l.ok === true ? "ok" : l.ok === false ? "bad" : "info") + '">' + escape(l.text) + "</li>";
    }).join("");
    $("edTry3d").disabled = busy || !lastCheck.tryOk;
    $("edTry2d").disabled = busy || !lastCheck.tryOk;
    $("edSave").disabled = busy || !lastCheck.saveOk;
    $("edSave").textContent = settingUp() ? "Set up saving and save" : "Save to game";
    drawGrid(lastCheck.info);
  }

  function drawGrid(info) {
    var cv = $("edGrid");
    var room = Math.min(460, Math.max(220, (root.innerWidth || 900) * 0.42));
    cellPx = Math.floor(room / Math.max(st.rows, st.cols));
    var w = cellPx * st.cols, h = cellPx * st.rows, dpr = root.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    cv.style.width = w + "px";
    cv.style.height = h + "px";
    var g = cv.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    var cut = {};
    if (info.rooms && info.count >= 2) {
      T.unreachable(info.rooms).forEach(function (rc) { cut[rc.join()] = true; });
    }
    var inset = Math.max(2, Math.round(cellPx * 0.14)), k = 0;
    var isRoom = function (r, c) { return r >= 0 && c >= 0 && r < st.rows && c < st.cols && st.cells[r][c] !== "#"; };
    // doors between rooms side by side
    g.fillStyle = "#3a4656";
    for (var r = 0; r < st.rows; r++) {
      for (var c = 0; c < st.cols; c++) {
        if (!isRoom(r, c)) {
          continue;
        }
        var d = Math.max(3, Math.round(cellPx * 0.22));
        if (isRoom(r, c + 1)) {
          g.fillRect(c * cellPx + cellPx - inset - 1, r * cellPx + (cellPx - d) / 2, 2 * inset + 2, d);
        }
        if (isRoom(r + 1, c)) {
          g.fillRect(c * cellPx + (cellPx - d) / 2, r * cellPx + cellPx - inset - 1, d, 2 * inset + 2);
        }
      }
    }
    for (r = 0; r < st.rows; r++) {
      for (c = 0; c < st.cols; c++) {
        var x = c * cellPx + inset, y = r * cellPx + inset, s = cellPx - 2 * inset;
        var ch = st.cells[r][c];
        if (ch === "#") {
          g.strokeStyle = "#232c38";
          g.lineWidth = 1;
          g.setLineDash([3, 3]);
          g.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
          g.setLineDash([]);
          continue;
        }
        g.fillStyle = T.colour(k);
        k += 1;
        roundRect(g, x, y, s, s, Math.max(2, s * 0.14));
        g.fill();
        if (cut[r + "," + c]) {
          g.strokeStyle = "#ff5d5d";
          g.lineWidth = Math.max(2, cellPx * 0.07);
          roundRect(g, x, y, s, s, Math.max(2, s * 0.14));
          g.stroke();
        }
        if (MARK_STYLE[ch]) {
          var ms = MARK_STYLE[ch], cx = x + s / 2, cy = y + s / 2, rad = s * 0.3;
          g.fillStyle = ms.fill;
          g.beginPath();
          g.arc(cx, cy, rad, 0, 2 * Math.PI);
          g.fill();
          g.fillStyle = ms.text;
          g.font = "700 " + Math.round(rad * 1.25) + "px ui-sans-serif, system-ui, sans-serif";
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.fillText(ch, cx, cy + rad * 0.06);
        }
      }
    }
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  // ------------------------------------------------------------ try, save
  function tryIt(view) {
    if (busy || !lastCheck || !lastCheck.tryOk) {
      return;
    }
    opts.tryIt(view, shape(), st.moves);
  }

  function status(text, bad) {
    $("edStatus").textContent = text;
    $("edStatus").classList.toggle("bad", !!bad);
  }

  function save() {
    if (busy || !lastCheck || !lastCheck.saveOk) {
      return;
    }
    var who = $("edWho").value.trim();
    if (!WHO.test(who)) {
      status("Write your name (at most 40 letters): it goes into the game's history with the maze.", true);
      return;
    }
    var name = st.name;
    var def = {shape: shape(), moves: st.moves, saved_by: who, saved_at: new Date().toISOString()};
    var c = T.check(name, def);
    if (c.problems.length) {
      status(c.problems.join(" "), true);
      return;
    }
    var S = FG.teamSave, work;
    if (!settingUp()) {
      work = S.save(name, def, $("edPass").value, status);
    } else {
      if ($("edPass1").value !== $("edPass2").value) {
        status("The 2 team passwords are not the same.", true);
        return;
      }
      work = S.setUpAndSave({token: $("edToken").value, repo: $("edRepo").value, branch: $("edBranch").value,
        password: $("edPass1").value}, name, def, status);
    }
    busy = true;
    render();
    work.then(function () {
      $("edToken").value = "";
      // GitHub Pages takes about 30 s to 2 minutes to serve the new file
      var t0 = Date.now();
      var clock = setInterval(function () {
        var sec = Math.round((Date.now() - t0) / 1000);
        status("Saved. Waiting for the game to update... " + Math.floor(sec / 60) + ":" + ("0" + sec % 60).slice(-2));
      }, 1000);
      status("Saved. Waiting for the game to update...");
      return S.waitForGame(name).then(function (there) {
        clearInterval(clock);
        return there;
      });
    }).then(function (there) {
      if (there) {
        status("The maze is in the game. Opening it...");
        opts.saved(name);
      } else {
        busy = false;
        render();
        status("Saved, but the game has not updated after 10 minutes. Open the page again in a few minutes: " +
          "the maze will be there.", true);
      }
    }, function (err) {
      busy = false;
      render();
      status(err && err.message ? err.message : String(err), true);
    });
  }

  FG.editor = {open: open, key: key, draft: draft, fresh: fresh};
})(typeof window !== "undefined" ? window : globalThis);
