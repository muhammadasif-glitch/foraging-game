/* The pages between the games: consent, player code, instructions, breaks,
 * the end question and the thank-you. Each waits for its key and resolves
 * with what it recorded. */
(function (root) {
  "use strict";
  var FG = root.FG = root.FG || {};
  var REC = FG.recorder;

  function $(id) {
    return document.getElementById(id);
  }

  /* A text of settings.js with {name} filled in from vars. */
  function text(name, vars) {
    var t = FG.SETTINGS.texts[name];
    if (t === undefined) {
      return "";
    }
    return String(t).replace(/\{([a-z_]+)\}/g, function (all, k) {
      return vars && vars[k] !== undefined ? vars[k] : all;
    });
  }

  function page(title, body, prompt) {
    $("game-screen").hidden = true;
    $("text-screen").hidden = false;
    $("text-title").textContent = title || "";
    $("text-body").innerHTML = body || "";
    $("text-prompt").innerHTML = prompt || "";
    $("text-input").hidden = true;
    $("text-status").textContent = "";
  }

  /* Waits for one of the keys; resolves to {key, shown_at, key_at}. Keys
   * sooner than minMs after the page appeared are not taken. */
  function waitKey(accept, phase, minMs) {
    REC.setPhase(phase);
    return REC.shown().then(function (shownAt) {
      return new Promise(function (resolve) {
        REC.listen(function (e, entry) {
          if (e.type !== "keydown") {
            return undefined;
          }
          if (e.repeat) {
            return "ignored: repeat";
          }
          if (minMs && (entry.t - shownAt < minMs || REC.stillTapping(e.key, shownAt, entry.t, 400))) {
            return "ignored: too soon";
          }
          var k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
          if (accept.indexOf(k) >= 0) {
            e.preventDefault();     // the key must not reach the text field of the next page
            REC.listen(null);
            resolve({key: k, shown_at: shownAt, key_at: entry.t});
            return "accepted";
          }
          return "ignored: key";
        });
      });
    });
  }

  function consent() {
    page(text("title"), text("consent"), text("consent_question"));
    return waitKey(["y", "n"], "consent").then(function (r) {
      if (r.key === "n") {
        page(text("title"), text("declined"), "");
      }
      return {agreed: r.key === "y", shown_at: r.shown_at, answered_at: r.key_at};
    });
  }

  /* The player code: letters, digits, - and _, up to 40. */
  function code(prefill) {
    page(text("title"), "", text("code_question"));
    var input = $("text-input");
    input.hidden = false;
    input.value = prefill || "";
    setTimeout(function () { input.focus(); }, 0);
    REC.setPhase("code");
    return REC.shown().then(function (shownAt) {
      return new Promise(function (resolve) {
        REC.listen(function (e, entry) {
          if (e.type === "keydown" && e.key === "Enter") {
            var v = input.value.trim();
            if (/^[A-Za-z0-9_-]{1,40}$/.test(v)) {
              REC.listen(null);
              input.hidden = true;
              input.blur();
              resolve({code: v, shown_at: shownAt, entered_at: entry.t});
              return "accepted";
            }
            $("text-status").textContent = "Letters, digits, - and _ only, up to 40.";
            return "refused";
          }
          return undefined;
        });
      });
    });
  }

  /* The instruction pages, with the left and right arrows; Space on the
   * last page starts. Resolves to the time spent on each visit to a page. */
  function instructions(vars) {
    var pages = FG.SETTINGS.texts.instructions;
    var visits = [];
    var i = 0;
    REC.setPhase("instructions");
    return new Promise(function (resolve) {
      function showPage() {
        var last = i === pages.length - 1;
        var nav = "Page " + (i + 1) + " of " + pages.length + ". " +
          (i > 0 ? "&larr; back. " : "") + (last ? vars.start_text : "&rarr; next.");
        page(text("title"), textOf(pages[i], vars), nav);
        var visit = {page: i + 1, shown_at: null, left_at: null};
        visits.push(visit);
        REC.shown().then(function (at) { visit.shown_at = at; });
      }
      function leave(at) {
        if (visits.length) {
          visits[visits.length - 1].left_at = at;
        }
      }
      showPage();
      REC.listen(function (e, entry) {
        if (e.type !== "keydown") {
          return undefined;
        }
        if (e.repeat) {
          return "ignored: repeat";
        }
        var visit = visits[visits.length - 1];
        if (visit && (visit.shown_at === null || entry.t - visit.shown_at < 100)) {
          return "ignored: too soon";
        }
        if (e.key === "ArrowRight" && i < pages.length - 1) {
          leave(entry.t);
          i += 1;
          showPage();
          return "next";
        }
        if (e.key === "ArrowLeft" && i > 0) {
          leave(entry.t);
          i -= 1;
          showPage();
          return "back";
        }
        if (e.key === " " && i === pages.length - 1) {
          leave(entry.t);
          REC.listen(null);
          resolve(visits);
          return "start";
        }
        return "ignored: key";
      });
    });
  }

  function textOf(t, vars) {
    return String(t).replace(/\{([a-z_]+)\}/g, function (all, k) {
      return vars && vars[k] !== undefined ? vars[k] : all;
    });
  }

  /* Between games: resolves to the break's length. */
  function pause(done, label) {
    page(text("title"), "<p>" + (label === "Practice game" ? "The practice game" : label) +
      " is over. Take a short break if you like.</p>", text("next_game"));
    return waitKey([" "], "break " + done, 1000).then(function (r) {
      return {after_game: done, shown_at: r.shown_at, ended_at: r.key_at, ms: Math.round((r.key_at - r.shown_at) * 1000) / 1000};
    });
  }

  /* The end question, typed; Enter finishes. Records the text, when typing
   * started and ended, and the number of keys and of deletions. */
  function endQuestion() {
    page(text("title"), "", text("end_question"));
    var input = $("text-input");
    input.hidden = false;
    input.value = "";
    input.maxLength = 2000;
    REC.setPhase("end question");
    return REC.shown().then(function (shownAt) {
      var first = null, keys = 0, deletions = 0;
      input.focus();               // only now, so no key meant for the screen before lands in it
      return new Promise(function (resolve) {
        REC.listen(function (e, entry) {
          if (e.type !== "keydown") {
            return undefined;
          }
          if (entry.t - shownAt < 400) {
            e.preventDefault();      // a key meant for the screen before
            return "ignored: too soon";
          }
          if (e.key === "Enter" && !e.isComposing) {
            REC.listen(null);
            input.hidden = true;
            input.blur();
            resolve({text: input.value, shown_at: shownAt, first_key_at: first, entered_at: entry.t,
              keys: keys, deletions: deletions});
            return "accepted";
          }
          keys += 1;
          if (first === null) {
            first = entry.t;
          }
          if (e.key === "Backspace" || e.key === "Delete") {
            deletions += 1;
          }
          return undefined;
        });
      });
    });
  }

  function thanks() {
    page(text("title"), text("thanks"), "");
  }

  function status(t) {
    $("text-status").textContent = t;
  }

  FG.text = text;
  FG.screens = {page: page, waitKey: waitKey, consent: consent, code: code, instructions: instructions,
    pause: pause, endQuestion: endQuestion, thanks: thanks, status: status};
})(typeof window !== "undefined" ? window : globalThis);
