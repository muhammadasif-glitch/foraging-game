/* Sending the data to DataPipe (https://pipe.jspsych.org), which saves each
 * file into the researchers' storage (a Google Drive folder).
 *
 * Every file is first put into a queue, kept in this browser's storage (and
 * in memory, when the storage cannot be used), then sent; it leaves the
 * queue only once DataPipe has taken it. A file that could not be sent is
 * tried again a few times, then every 30 s while the page is open, and again
 * whenever the page is opened in the same browser. Each file in the queue
 * carries its own experiment ID, and the storage keys carry the experiment ID
 * and the page's address, so 2 studies on the same site never send each
 * other's files. Several open pages of the study share the queue: each adds
 * its own files and removes the ones it has sent.
 *
 * While a game (or the session) is going on, its file so far is kept in a
 * "slot" after every change. If the page is closed, the slots go into the
 * queue and the browser is asked to send them on the way out. It allows 64 KB
 * for all of them together, so the game goes first (in a short form when the
 * whole file would not fit) and the session after it if there is room; the
 * rest follows the next time. Every open page marks itself as alive once a
 * minute. A slot left by a page that ended without closing properly (a crash)
 * goes into the queue once its page has not been alive for 10 minutes; the
 * pages look for such slots every minute and never take their own.
 *
 * API (https://pipe.jspsych.org/docs/api): POST /api/data/ with
 * {experimentID, filename, data}; 201 stored, 202 queued (also stored),
 * 400 FILE_EXISTS means the file is already there, and 400 METADATA_ERROR
 * that DataPipe could not make the Psych-DS metadata but keeps the file and
 * stores it later: all 4 count as kept. Any other 400 is a refusal (for
 * example INVALID_DATA, or data collection turned off): sending again soon
 * would not change it, so the file waits for the next visit, and is given up
 * after 3 refusals, so that a refused file is not sent again and again.
 * Files queued by an older version of the game without trial_type, which
 * DataPipe's validation needs, get it before they are sent. POST
 * /api/condition/ with {experimentID} gives {condition: n}, handing out 0 to
 * n - 1 in turn.
 */
(function (root) {
  "use strict";
  var FG = root.FG = root.FG || {};

  var BASE = "https://pipe.jspsych.org/api/";
  var STALE_MS = 10 * 60 * 1000;
  var KEEPALIVE_BUDGET = 60000;
  var MAX_REFUSALS = 3;
  var held = {};               // files refused on this visit: tried again on the next one
  var experimentId = null;
  var sending = true;
  var prefix = "foraging-game";
  var added = {};              // files this page put into the queue and has not sent: name -> item
  var sent = {};               // files this page has seen taken by DataPipe
  var slots = {};              // this page's slots: name -> {filename, experimentID, text, short}
  var sessionId = null;
  var keptInBrowser = true;    // whether the last write to the browser's storage worked
  var log = [];
  var retrying = null;
  var sweeping = null;

  function store() {
    try {
      return root.localStorage || null;
    } catch (err) {
      return null;
    }
  }

  function storageGet(key) {
    var s = store();
    if (!s) {
      return null;
    }
    try {
      return s.getItem(key);
    } catch (err) {
      return null;
    }
  }

  function storageSet(key, value) {
    var s = store();
    if (!s) {
      return false;
    }
    try {
      s.setItem(key, value);
      return true;
    } catch (err) {
      return false;
    }
  }

  function storageRemove(key) {
    var s = store();
    if (s) {
      try {
        s.removeItem(key);
      } catch (err) {
        // nothing to remove
      }
    }
  }

  function queueKey() {
    return prefix + ":queue";
  }

  function slotKey(name) {
    return prefix + ":slot:" + sessionId + ":" + name;
  }

  function aliveKey(session) {
    return prefix + ":alive:" + session;
  }

  function markAlive() {
    if (sending && sessionId) {
      storageSet(aliveKey(sessionId), String(Date.now()));
    }
  }

  function stored() {
    try {
      return JSON.parse(storageGet(queueKey()) || "{}") || {};
    } catch (err) {
      return {};
    }
  }

  /* Writes this page's changes into the shared queue in storage. */
  function saveQueue() {
    var s = stored();
    Object.keys(added).forEach(function (n) { s[n] = added[n]; });
    Object.keys(sent).forEach(function (n) { delete s[n]; });
    keptInBrowser = storageSet(queueKey(), JSON.stringify(s));
  }

  /* What is left to send: the shared queue and this page's own files. */
  function current() {
    var s = stored();
    Object.keys(added).forEach(function (n) {
      if (!s[n]) {
        s[n] = added[n];
      }
    });
    Object.keys(sent).forEach(function (n) { delete s[n]; });
    return s;
  }

  function enqueue(filename, text, id) {
    added[filename] = {experimentID: id || experimentId, text: text};
    saveQueue();
  }

  function dequeue(filename) {
    delete added[filename];
    sent[filename] = true;
    saveQueue();
  }

  /* id: the experiment; session: this session's id; options.send false
   * sends and keeps nothing. */
  function init(id, session, options) {
    experimentId = id;
    sessionId = session;
    sending = !(options && options.send === false);
    var path = (root.location && root.location.pathname) || "";
    prefix = "foraging-game:" + id + ":" + path.replace(/[^\/]*$/, "");
    if (sending && !sweeping) {
      markAlive();
      sweeping = setInterval(function () {
        markAlive();
        flush();
      }, 60000);
    }
  }

  function post(path, body, opts) {
    opts = opts || {};
    var controller = (!opts.keepalive && typeof AbortController !== "undefined") ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, opts.timeout || 20000) : null;
    return fetch(BASE + path, {
      method: "POST",
      headers: {"Content-Type": "application/json", "Accept": "*/*"},
      body: JSON.stringify(body),
      keepalive: !!opts.keepalive,
      signal: controller ? controller.signal : undefined
    }).then(function (res) {
      return res.text().then(function (text) {
        if (timer) {
          clearTimeout(timer);
        }
        var json = null;
        try {
          json = JSON.parse(text);
        } catch (err) {
          json = {message: text};
        }
        return {status: res.status, body: json || {}};
      });
    }, function (err) {
      if (timer) {
        clearTimeout(timer);
      }
      throw err;
    });
  }

  /* Whether DataPipe's answer means the file is kept. */
  function kept(r) {
    var code = r.body && r.body.error;
    return r.status === 201 || r.status === 202 ||
      (r.status === 400 && (code === "FILE_EXISTS" || code === "METADATA_ERROR"));
  }

  /* A game file of an older version, queued without trial_type: given it. */
  function repaired(text) {
    if (text.indexOf('"trial_type"') >= 0) {
      return text;
    }
    try {
      var obj = JSON.parse(text);
      if (obj && typeof obj === "object" && !Array.isArray(obj) && obj.format === "foraging-game" &&
          obj.trial_type === undefined) {
        var out = {trial_type: "foraging-game"};
        Object.keys(obj).forEach(function (k) { out[k] = obj[k]; });
        return JSON.stringify(out);
      }
    } catch (err) {
      // not JSON: sent as it is
    }
    return text;
  }

  function sendOnce(filename) {
    var item = current()[filename];
    if (!item || held[filename]) {
      return Promise.resolve(item ? {ok: false, status: "held", error: "refused before"} :
        {ok: true, status: "already sent", error: null});
    }
    var text = repaired(item.text);
    if (text !== item.text) {
      item = {experimentID: item.experimentID, text: text, refused: item.refused || 0};
      added[filename] = item;
      saveQueue();
    }
    return post("data/", {experimentID: item.experimentID, filename: filename, data: text}).then(function (r) {
      var code = r.body && r.body.error;
      log.push({file: filename, status: r.status, error: code || null, t: FG.recorder.now()});
      if (kept(r)) {
        dequeue(filename);
        return {ok: true, status: r.status, error: code || null};
      }
      if (r.status === 400) {
        // refused: not again on this visit; given up after MAX_REFUSALS
        held[filename] = true;
        var again = {experimentID: item.experimentID, text: text, refused: (item.refused || 0) + 1};
        if (again.refused >= MAX_REFUSALS) {
          log.push({file: filename, status: "given up", error: code || null, t: FG.recorder.now()});
          dequeue(filename);
        } else {
          added[filename] = again;
          saveQueue();
        }
      }
      return {ok: false, status: r.status, error: code || (r.body && r.body.message) || "error"};
    }, function (err) {
      log.push({file: filename, status: 0, error: "no answer", t: FG.recorder.now()});
      return {ok: false, status: 0, error: "no answer: " + err};
    });
  }

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  /* While files are left, try them all every 30 s. */
  function keepTrying() {
    if (retrying || !sending) {
      return;
    }
    retrying = setInterval(function () {
      var names = Object.keys(current()).filter(function (n) { return !held[n]; });
      if (!names.length) {
        clearInterval(retrying);
        retrying = null;
        return;
      }
      names.forEach(sendOnce);
    }, 30000);
  }

  /* Queues the file, then sends it; tries up to 5 times over about 30 s,
   * then keeps trying every 30 s. Resolves to {ok, status, error}. */
  function save(filename, obj) {
    var text = JSON.stringify(obj);
    if (!sending) {
      (root.FG_SENT = root.FG_SENT || []).push({filename: filename, data: obj});
      return Promise.resolve({ok: true, status: "not sent (send=0)", error: null});
    }
    enqueue(filename, text);
    var tries = 0;
    function attempt() {
      tries += 1;
      return sendOnce(filename).then(function (r) {
        // a refusal (400) waits for the next visit; no answer or a server
        // error is tried again every 30 s
        if (r.ok || tries >= 5 || r.status === 400) {
          if (!r.ok && r.status !== 400) {
            keepTrying();
          }
          return r;
        }
        return wait(1000 * Math.pow(2, tries)).then(attempt);
      });
    }
    return attempt();
  }

  /* The slots of other sessions whose page has been gone for 10 minutes go
   * into the queue, and their marks are removed. */
  function takeStaleSlots(s, now) {
    var slotStart = prefix + ":slot:";
    var aliveStart = prefix + ":alive:";
    var keys = [];
    for (var i = 0; i < s.length; i++) {
      keys.push(s.key(i));
    }
    function lastSeen(session) {
      var t = Number(s.getItem(aliveKey(session)));
      return isFinite(t) ? t : 0;
    }
    keys.forEach(function (k) {
      if (!k || k.indexOf(slotStart) !== 0) {
        return;
      }
      var session = k.slice(slotStart.length).split(":")[0];
      if (session === sessionId) {
        return;
      }
      var item = null;
      try {
        item = JSON.parse(s.getItem(k) || "null");
      } catch (err) {
        item = null;
      }
      if (!item || !item.filename) {
        s.removeItem(k);
        return;
      }
      if (now - Math.max(Number(item.updated) || 0, lastSeen(session)) > STALE_MS) {
        added[item.filename] = {experimentID: item.experimentID, text: item.text};
        s.removeItem(k);
      }
    });
    keys.forEach(function (k) {
      if (k && k.indexOf(aliveStart) === 0 && k !== aliveKey(sessionId) &&
          now - lastSeen(k.slice(aliveStart.length)) > STALE_MS) {
        s.removeItem(k);
      }
    });
  }

  /* Sends what earlier visits (or pages) left: the queue, and the slots of
   * pages gone for 10 minutes. Resolves to the number of files left. */
  function flush() {
    if (!sending) {
      return Promise.resolve(0);
    }
    var s = store();
    if (s) {
      try {
        takeStaleSlots(s, Date.now());
        saveQueue();
      } catch (err) {
        // nothing usable was left
      }
    }
    var names = Object.keys(current()).filter(function (n) { return !held[n]; });
    if (!names.length) {
      return Promise.resolve(Object.keys(current()).length);
    }
    return Promise.all(names.map(sendOnce)).then(function () {
      var left = Object.keys(current()).length;
      if (Object.keys(current()).some(function (n) { return !held[n]; })) {
        keepTrying();
      }
      return left;
    });
  }

  /* Keeps the file so far of a game or of the session. short: a shorter
   * form of it, sent on closing when the whole file is too long. */
  function keepSlot(name, filename, obj, short) {
    if (!sending) {
      return;
    }
    var item = {filename: filename, experimentID: experimentId, text: JSON.stringify(obj),
      short: short ? {filename: short.filename, text: JSON.stringify(short.obj)} : null,
      updated: Date.now()};
    slots[name] = item;
    storageSet(slotKey(name), JSON.stringify({filename: item.filename, experimentID: item.experimentID,
      text: item.text, updated: item.updated}));
  }

  function dropSlot(name) {
    delete slots[name];
    storageRemove(slotKey(name));
  }

  /* On closing the page: every slot of this page into the queue, and an
   * attempt to send them on the way out, the game first, within the 64 KB
   * the browser allows for all of them. */
  function closeSlots() {
    if (!sending) {
      slots = {};
      return;
    }
    var names = Object.keys(slots).sort(function (a, b) {
      return (a === "game" ? 0 : 1) - (b === "game" ? 0 : 1);
    });
    names.forEach(function (name) {
      var item = slots[name];
      added[item.filename] = {experimentID: item.experimentID, text: item.text};
      storageRemove(slotKey(name));
    });
    storageRemove(aliveKey(sessionId));
    saveQueue();
    var budget = KEEPALIVE_BUDGET;
    names.forEach(function (name) {
      var item = slots[name];
      var body = {experimentID: item.experimentID, filename: item.filename, data: item.text};
      var size = JSON.stringify(body).length;
      if (size > budget && item.short) {
        body = {experimentID: item.experimentID, filename: item.short.filename, data: item.short.text};
        size = JSON.stringify(body).length;
      }
      if (size <= budget) {
        budget -= size + 500;
        try {
          post("data/", body, {keepalive: true}).then(function (r) {
            if (kept(r) && body.filename === item.filename) {
              dequeue(item.filename);
            }
          }, function () {});
        } catch (err) {
          // sent next time
        }
      }
    });
    slots = {};
  }

  /* The next condition from DataPipe: resolves to {condition, error}. */
  function condition() {
    if (!sending) {
      return Promise.resolve({condition: null, error: "not sent (send=0)"});
    }
    return post("condition/", {experimentID: experimentId}, {timeout: 8000}).then(function (r) {
      if (r.status === 200 && typeof r.body.condition === "number") {
        return {condition: r.body.condition, error: null};
      }
      return {condition: null, error: (r.body && (r.body.error || r.body.message)) || ("status " + r.status)};
    }, function (err) {
      return {condition: null, error: "no answer: " + err};
    });
  }

  /* left: files of this page not yet taken by DataPipe; kept: whether the
   * browser's storage holds them; refused: those DataPipe refused. */
  function state() {
    return {left: Object.keys(added).length, kept: keptInBrowser,
      refused: Object.keys(added).filter(function (n) { return held[n]; }).length};
  }

  FG.datapipe = {
    init: init, save: save, flush: flush, keepSlot: keepSlot, dropSlot: dropSlot,
    closeSlots: closeSlots, condition: condition, state: state, log: log
  };
})(typeof window !== "undefined" ? window : globalThis);
