/* Saving a maze from the editor into the game on GitHub.
 *
 * The repository is public, so a password checked by the page itself would
 * stop no one: anyone can read the code. What stops others is GitHub, which
 * only lets a key with write access change the repository. That key is kept
 * in js/team_key.js locked with the team password (PBKDF2 with SHA-256, then
 * AES-GCM, in the browser's Web Crypto), so it is of use only to someone who
 * knows the password. It is unlocked in the browser for 1 save and not kept.
 *
 * A save reads js/my_mazes.js through GitHub's contents API, adds the maze
 * (a name already there is refused, so a saved maze is never changed) and
 * writes it back with the version it read; if someone else saved in between,
 * GitHub refuses and the save is done again on top of theirs. GitHub Pages
 * then serves the new file after about 30 s to 2 minutes; waitForGame()
 * checks for it, so that the page can reload when the maze is there.
 *
 * Setting up (once): a GitHub key that may change only this repository's
 * contents, the repository and its branch, and the team password, at least
 * MIN_PASSWORD characters (the locked key is public, so a short password
 * could be found by trying many). */
(function (root) {
  "use strict";
  var FG = root.FG = root.FG || {};

  var API = "https://api.github.com";
  var MAZES_PATH = "js/my_mazes.js", KEY_PATH = "js/team_key.js";
  var ITERATIONS = 600000;
  var MIN_PASSWORD = 16;
  var TRIES = 4;
  var WAIT_MS = 10 * 60 * 1000, POLL_MS = 5000;

  function SaveError(message, code) {
    this.name = "SaveError";
    this.message = message;
    this.code = code || "error";
  }
  SaveError.prototype = Object.create(Error.prototype);

  function bytes(text) {
    return new TextEncoder().encode(text);
  }

  function toBase64(buf) {
    var a = new Uint8Array(buf), s = "";
    for (var i = 0; i < a.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000));
    }
    return root.btoa(s);
  }

  function fromBase64(text) {
    var s = root.atob(String(text).replace(/\s+/g, ""));
    var a = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) {
      a[i] = s.charCodeAt(i);
    }
    return a;
  }

  // ------------------------------------------------------------ the lock
  function deriveKey(password, salt, iterations) {
    return root.crypto.subtle.importKey("raw", bytes(password), "PBKDF2", false, ["deriveKey"]).then(function (base) {
      return root.crypto.subtle.deriveKey({name: "PBKDF2", salt: salt, iterations: iterations, hash: "SHA-256"},
        base, {name: "AES-GCM", length: 256}, false, ["encrypt", "decrypt"]);
    });
  }

  /* secret locked with password: {iterations, salt, iv, data}, base64. */
  function lock(secret, password) {
    var salt = root.crypto.getRandomValues(new Uint8Array(16));
    var iv = root.crypto.getRandomValues(new Uint8Array(12));
    return deriveKey(password, salt, ITERATIONS).then(function (key) {
      return root.crypto.subtle.encrypt({name: "AES-GCM", iv: iv}, key, bytes(secret));
    }).then(function (data) {
      return {iterations: ITERATIONS, salt: toBase64(salt), iv: toBase64(iv), data: toBase64(data)};
    });
  }

  /* The secret of a lock, or a SaveError "password" for a wrong password. */
  function unlock(locked, password) {
    return deriveKey(password, fromBase64(locked.salt), locked.iterations).then(function (key) {
      return root.crypto.subtle.decrypt({name: "AES-GCM", iv: fromBase64(locked.iv)}, key, fromBase64(locked.data))
        .then(function (plain) { return new TextDecoder().decode(plain); },
          function () { throw new SaveError("Wrong team password.", "password"); });
    });
  }

  // ------------------------------------------------------------ GitHub
  function call(token, method, path, body) {
    var headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
      "Authorization": "Bearer " + token};
    if (body) {
      headers["Content-Type"] = "application/json";
    }
    return root.fetch(API + path, {method: method, headers: headers, cache: "no-store",
      body: body ? JSON.stringify(body) : undefined}).then(function (res) {
      return res.text().then(function (text) {
        var json = null;
        try {
          json = JSON.parse(text);
        } catch (err) {
          json = null;
        }
        return {status: res.status, body: json || {}};
      });
    }, function () {
      throw new SaveError("No connection to GitHub. Check the internet connection and try again.", "network");
    });
  }

  function refused(r) {
    if (r.status === 401) {
      return new SaveError("GitHub does not accept the key any more (it may have run out or been withdrawn). " +
        "Set up saving again with a new key.", "key");
    }
    if (r.status === 403 || r.status === 404) {
      return new SaveError("The key may not change this repository (GitHub says " + r.status + "). " +
        "It needs \"Contents: read and write\" for this repository.", "key");
    }
    return new SaveError("GitHub refused the save (" + r.status + (r.body.message ? ": " + r.body.message : "") +
      "). Try again in a minute.", "github");
  }

  function contentsPath(repo, path) {
    return "/repos/" + repo + "/contents/" + path;
  }

  /* {text, sha} of a file of the repository, or null when there is none. */
  function getFile(token, repo, branch, path) {
    return call(token, "GET", contentsPath(repo, path) + "?ref=" + encodeURIComponent(branch)).then(function (r) {
      if (r.status === 200 && typeof r.body.content === "string") {
        return {text: new TextDecoder().decode(fromBase64(r.body.content)), sha: r.body.sha};
      }
      if (r.status === 404 && r.body && /not found/i.test(r.body.message || "")) {
        return null;
      }
      throw refused(r);
    });
  }

  /* Writes a file over the version sha read before (null: a new file).
   * Resolves to true, or to "conflict" when the file changed since. */
  function putFile(token, repo, branch, path, text, sha, message) {
    var body = {message: message, content: toBase64(bytes(text)), branch: branch};
    if (sha) {
      body.sha = sha;
    }
    return call(token, "PUT", contentsPath(repo, path), body).then(function (r) {
      if (r.status === 200 || r.status === 201) {
        return true;
      }
      if (r.status === 409 || r.status === 422) {
        return "conflict";
      }
      throw refused(r);
    });
  }

  function keyFileText(locked) {
    return [
      "/* The GitHub key the maze editor saves mazes with, locked with the team",
      " * password (PBKDF2-SHA256 and AES-GCM in the browser), so that only someone",
      " * who knows the password can save. Written by the editor when saving is set",
      " * up; null until then. See js/team_save.js. */",
      "(function (root) {",
      "  var FG = root.FG = root.FG || {};",
      "  FG.TEAM_KEY = " + JSON.stringify(locked, null, 2).replace(/\n/g, "\n  ") + ";",
      "})(typeof window !== \"undefined\" ? window : globalThis);",
      ""
    ].join("\n");
  }

  // ------------------------------------------------------------ saving
  /* Adds 1 maze to js/my_mazes.js: name and def ({shape, moves, saved_by,
   * saved_at}). Done again on top of a save that came in between. */
  function addMaze(token, repo, branch, name, def, status, tries) {
    status("Saving to GitHub...");
    return getFile(token, repo, branch, MAZES_PATH).then(function (file) {
      var mazes = file ? FG.mazeTools.parseFile(file.text) : {};
      if (Object.prototype.hasOwnProperty.call(mazes, name)) {
        throw new SaveError("Someone saved a maze called " + name + " a moment ago. Choose another name.", "taken");
      }
      mazes[name] = def;
      return putFile(token, repo, branch, MAZES_PATH, FG.mazeTools.fileText(mazes), file ? file.sha : null,
        "Maze " + name + ", saved by " + def.saved_by + " in the maze editor");
    }).then(function (r) {
      if (r === "conflict") {
        if (tries + 1 >= TRIES) {
          throw new SaveError("GitHub was busy with other saves. Try again in a minute.", "conflict");
        }
        return addMaze(token, repo, branch, name, def, status, tries + 1);
      }
      return true;
    });
  }

  /* Saves a maze with the key of js/team_key.js and the team password. */
  function save(name, def, password, status) {
    var locked = FG.TEAM_KEY;
    if (!locked) {
      return Promise.reject(new SaveError("Saving is not set up yet.", "setup"));
    }
    status("Unlocking the key...");
    return unlock(locked, password).then(function (token) {
      return addMaze(token, locked.repo, locked.branch, name, def, status, 0);
    });
  }

  /* The repository of a page on GitHub Pages (owner.github.io/repo/...), or "". */
  function guessRepo() {
    var m = /^([a-z0-9-]+)\.github\.io$/i.exec(root.location.hostname || "");
    var first = (root.location.pathname || "").split("/").filter(Boolean)[0];
    return m && first && !/\.html?$/.test(first) ? m[1] + "/" + first : "";
  }

  /* Sets up saving: checks the key, locks it with the password, writes
   * js/team_key.js, then saves the maze with it. opts: {token, repo, branch,
   * password}. */
  function setUpAndSave(opts, name, def, status) {
    var token = String(opts.token || "").trim(), repo = String(opts.repo || "").trim();
    var branch = String(opts.branch || "").trim() || "main";
    if (!token) {
      return Promise.reject(new SaveError("Paste the GitHub key.", "setup"));
    }
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
      return Promise.reject(new SaveError("The repository is written owner/name, for example " +
        "muhammadasif-glitch/foraging-game.", "setup"));
    }
    if (String(opts.password || "").length < MIN_PASSWORD) {
      return Promise.reject(new SaveError("The team password must have at least " + MIN_PASSWORD +
        " characters, for example 4 or 5 random words.", "setup"));
    }
    status("Checking the GitHub key...");
    return call(token, "GET", "/repos/" + repo).then(function (r) {
      if (r.status !== 200) {
        throw r.status === 404 ? new SaveError("GitHub does not know the repository " + repo + ", or the key " +
          "may not see it.", "setup") : refused(r);
      }
      status("Locking the key with the team password...");
      return lock(token, opts.password);
    }).then(function (sealed) {
      var locked = {repo: repo, branch: branch, iterations: sealed.iterations, salt: sealed.salt, iv: sealed.iv,
        data: sealed.data, made_at: new Date().toISOString()};
      var write = function (tries) {
        return getFile(token, repo, branch, KEY_PATH).then(function (file) {
          return putFile(token, repo, branch, KEY_PATH, keyFileText(locked), file ? file.sha : null,
            "Saving from the maze editor set up by " + def.saved_by);
        }).then(function (r) {
          if (r === "conflict" && tries + 1 < TRIES) {
            return write(tries + 1);
          }
          if (r === "conflict") {
            throw new SaveError("GitHub was busy. Try again in a minute.", "conflict");
          }
          FG.TEAM_KEY = locked;
          return addMaze(token, repo, branch, name, def, status, 0);
        });
      };
      status("Saving the locked key to GitHub...");
      return write(0);
    });
  }

  /* Resolves to true once the game's page serves js/my_mazes.js with the
   * maze in it (GitHub Pages takes about 30 s to 2 minutes), or to false
   * after 10 minutes. tick(seconds) is called while waiting. */
  function waitForGame(name, tick) {
    var t0 = Date.now();
    return new Promise(function (resolve) {
      function look() {
        var url = MAZES_PATH + "?t=" + Date.now();
        root.fetch(url, {cache: "no-store"}).then(function (res) {
          return res.ok ? res.text() : "";
        }).then(function (text) {
          var has = false;
          try {
            has = Object.prototype.hasOwnProperty.call(FG.mazeTools.parseFile(text), name);
          } catch (err) {
            has = false;
          }
          next(has);
        }, function () { next(false); });
      }
      function next(has) {
        if (has) {
          resolve(true);
          return;
        }
        var waited = Date.now() - t0;
        if (waited >= WAIT_MS) {
          resolve(false);
          return;
        }
        if (tick) {
          tick(Math.round(waited / 1000));
        }
        setTimeout(look, POLL_MS);
      }
      look();
    });
  }

  FG.teamSave = {
    SaveError: SaveError, MIN_PASSWORD: MIN_PASSWORD, ITERATIONS: ITERATIONS, MAZES_PATH: MAZES_PATH,
    KEY_PATH: KEY_PATH, lock: lock, unlock: unlock, save: save, setUpAndSave: setUpAndSave,
    waitForGame: waitForGame, guessRepo: guessRepo, keyFileText: keyFileText
  };
})(typeof window !== "undefined" ? window : globalThis);
