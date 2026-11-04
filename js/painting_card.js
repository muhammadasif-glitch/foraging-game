/* The card of a painting, opened by I or its info button in the 3D view
 * (js/game.js pauses the game while it is open). Laid out as a museum's wall
 * label: the artist and the life dates, the title in italics with its date,
 * then the movement, the genre and where it hangs, and a few sentences about
 * the painting, or about the painter when Wikipedia has nothing on the
 * painting itself (js/painting_info.js, from Wikidata and Wikipedia). The
 * player can rate the painting on the card too: a click on a star. */
(function (root) {
  "use strict";
  var FG = root.FG = root.FG || {};

  var STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.83 6.04 6.62.78-4.9 4.53 1.3 6.54L12 17.2l-5.85 3.29 ' +
    '1.3-6.54-4.9-4.53 6.62-.78z"/></svg>';

  function $(id) {
    return document.getElementById(id);
  }

  function escape(t) {
    return String(t === null || t === undefined ? "" : t).replace(/[&<>"']/g, function (c) {
      return {"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"}[c];
    });
  }

  var hooks = null, wired = false;

  function wire() {
    if (wired) {
      return;
    }
    wired = true;
    $("icClose").addEventListener("mousedown", function (e) { e.preventDefault(); });
    $("icClose").addEventListener("click", function (e) {
      e.preventDefault();
      done("button");
    });
    // a click beside the card closes it too; a click in it (a link, a star) does not
    $("infoCard").addEventListener("mousedown", function (e) {
      if (e.target === $("infoCard")) {
        e.preventDefault();
        done("click outside");
      }
    });
    $("icStars").addEventListener("mousedown", function (e) { e.preventDefault(); });
    $("icStars").addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest("button[data-n]") : null;
      if (b && hooks && hooks.rate) {
        stars(hooks.rate(Number(b.getAttribute("data-n"))));
      }
    });
  }

  function done(how) {
    var h = hooks;
    hooks = null;
    if (h && h.closed) {
      h.closed(how);
    }
  }

  function stars(n) {
    Array.prototype.forEach.call($("icStars").children, function (b, i) {
      b.classList.toggle("on", i < n);
      b.setAttribute("aria-pressed", i < n ? "true" : "false");
    });
  }

  function upper(t) {
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
  }

  /* What the card says of painting p (an entry of FG.PAINTINGS). */
  function card(p) {
    var x = (FG.PAINTING_INFO || {})[p.id] || {};
    var out = {title: upper(x.title || p.title), painter: x.painter || p.painter, life: null, year: x.year || p.year || null,
      facts: [], about: null, aboutLabel: null, links: []};
    if (x.born || x.died) {
      out.life = (x.born || "?") + "–" + (x.died || "?");
    }
    if (x.movement) {
      out.facts.push(["Movement", upper(x.movement)]);
    }
    if (x.genre) {
      out.facts.push(["Genre", upper(x.genre)]);
    }
    if (x.collection) {
      out.facts.push(["Collection", x.collection]);
    }
    if (x.about) {
      out.about = x.about;
      out.aboutLabel = x.about_of === "painter" ? "About the painter" : "About the painting";
    }
    out.links.push(["Wikimedia Commons", p.page]);
    if (x.wiki_url) {
      out.links.push(["Wikipedia", x.wiki_url]);
    }
    out.licence = p.licence;
    return out;
  }

  /* Opens the card of painting p. h: {closed(how), rate(n) -> the rating
   * after, rating (0 to 5, or null: no rating here), where (a line above the
   * artist)}. */
  function open(p, h) {
    wire();
    hooks = h;
    var c = card(p);
    var img = $("icPic");
    var k = (FG.PAINTINGS || []).indexOf(p);
    var get = function (size) {
      var got = FG.art && k >= 0 ? FG.art.src(k, size) : Promise.resolve("img/paintings/" + size + "/" + p.id + ".jpg");
      // a picture the page gave itself: as an address for the card
      return got.then(function (x) {
        if (typeof x === "string") {
          return x;
        }
        var c = document.createElement("canvas");
        c.width = x.width;
        c.height = x.height;
        c.getContext("2d").drawImage(x, 0, 0);
        if (x.close) {
          x.close();
        }
        return new Promise(function (resolve) {
          c.toBlob(function (b) { resolve(b ? URL.createObjectURL(b) : ""); }, "image/png");
        });
      });
    };
    img.onerror = function () {
      img.onerror = null;
      get("small").then(function (url) { img.src = url; });
    };
    img.removeAttribute("src");
    get("large").then(function (url) {
      if (!$("infoCard").hidden) {
        img.src = url;
      }
    });
    img.alt = c.title + ", " + c.painter;
    $("icWhere").textContent = h && h.where ? h.where : "";
    $("icWhere").hidden = !(h && h.where);
    $("icArtist").textContent = c.painter;
    $("icLife").textContent = c.life || "";
    $("icLife").hidden = !c.life;
    $("icTitle").innerHTML = escape(c.title) + (c.year ? '<span class="lc-year">, ' + escape(c.year) + "</span>" : "");
    $("icFacts").innerHTML = c.facts.map(function (f) {
      return "<dt>" + escape(f[0]) + "</dt><dd>" + escape(f[1]) + "</dd>";
    }).join("");
    $("icFacts").hidden = !c.facts.length;
    $("icAboutLabel").textContent = c.aboutLabel || "";
    $("icAbout").textContent = c.about || "";
    $("icAboutBox").hidden = !c.about;
    var rating = h && typeof h.rating === "number" ? h.rating : null;
    $("icRate").hidden = rating === null;
    if (rating !== null) {
      $("icStars").innerHTML = [1, 2, 3, 4, 5].map(function (n) {
        return '<button type="button" tabindex="-1" data-n="' + n + '" aria-label="' + n + " star" + (n > 1 ? "s" : "") +
          '">' + STAR + "</button>";
      }).join("");
      stars(rating);
    }
    $("icSource").innerHTML = escape(c.licence) + " &middot; " + c.links.map(function (l) {
      return '<a href="' + escape(l[1]) + '" target="_blank" rel="noopener" tabindex="-1">' + escape(l[0]) + "</a>";
    }).join(" &middot; ") + (c.about ? " &middot; text from Wikipedia (CC BY-SA)" : "");
    $("infoCard").hidden = false;
  }

  function close() {
    hooks = null;
    $("infoCard").hidden = true;
  }

  FG.paintingCard = {open: open, close: close, card: card};
})(typeof window !== "undefined" ? window : globalThis);
