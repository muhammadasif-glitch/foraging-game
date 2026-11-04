/* The food as 3D models (from 2.8.0): Kenney's Food Kit (js/food_models.js,
 * CC0), drawn by three.js into pictures that take the place of the drawings
 * of js/food.js, wherever the browser has WebGL (else those drawings stay).
 *
 * The level shows as before, in 10 pieces (js/food.js pieces): at 0.73, 7
 * whole pieces and an eighth that is 0.3 of one.
 *   cheese  a wheel of 10 wedges on a plate. Kenney's wheel is 12 wedges of
 *           30 degrees, each a closed piece with its cut faces; 1 of them is
 *           widened to 36 degrees (its angles stretched), and a part of a
 *           wedge is the same piece narrower. The gap the eaten wedges leave
 *           faces the viewer, as before.
 *   bread   a loaf on a board, cut across: as long as its level, the cut
 *           face a slice of Kenney's bread.
 *   pizza   (the rich food from 2.8.0) a pizza of 10 slices on a round board,
 *           Kenney's slices of 45 degrees narrowed to 36, eaten as the wheel.
 *   apples  (the small food from 2.8.0) a bowl of 10 apples, eaten from the
 *           top of the heap; a part of an apple is a half apple.
 * side(kind, level): the 3D view's picture, the food seen from the side and
 * a little from above, standing on the bottom edge, as js/food.js sideView;
 * top(kind, level, px): from above, for the 2D view; icon(kind, px): the
 * whole food, for signs and the map. Pictures are kept by level in
 * hundredths. */
(function (root) {
  "use strict";
  var FG = root.FG = root.FG || {};

  var PIECES = 10, W = 480, H = 360;
  /* The 10 apples in the bowl, [x, y, z, turn]: 4 at the bottom, 4 on them,
   * 2 on top; the first ones stay longest (eaten from the top). */
  var APPLES = [
    [0.13, 0.05, 0.0, 0.3], [-0.13, 0.05, 0.0, 1.9], [0.0, 0.05, 0.13, 2.6], [0.0, 0.05, -0.13, 4.1],
    [0.09, 0.2, 0.09, 0.9], [-0.09, 0.2, 0.09, 3.3], [0.09, 0.2, -0.09, 5.0], [-0.09, 0.2, -0.09, 1.4],
    [0.0, 0.34, 0.075, 2.2], [0.0, 0.34, -0.075, 4.6]], APPLE_SIZE = 1.3;
  var THREE = null, R = null, scene = null, models = null, failed = false, loading = null, listeners = [];
  var kept = {}, order = [], KEEP = 60;

  function canWebGL() {
    try {
      var c = document.createElement("canvas");
      return !!(c.getContext("webgl2") || c.getContext("webgl"));
    } catch (e) {
      return false;
    }
  }

  function bytesOf(b64) {
    var s = root.atob(b64), out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) {
      out[i] = s.charCodeAt(i);
    }
    return out;
  }

  /* The palette texture inside a GLB file (all of Kenney's share one), as
   * its PNG bytes: decoded by the page itself (createImageBitmap), with no
   * address, so that it shows where a page may not load blob: or data:
   * addresses (in a claude.ai artifact the loader's own texture failed, and
   * the food came out white). */
  function pngOf(bytes) {
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var jlen = dv.getUint32(12, true);
    var json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jlen)));
    var bin = 20 + jlen + 8;
    var im = (json.images || [])[0];
    if (!im || im.bufferView === undefined) {
      return null;
    }
    var bv = json.bufferViews[im.bufferView];
    return bytes.subarray(bin + (bv.byteOffset || 0), bin + (bv.byteOffset || 0) + bv.byteLength);
  }

  function palette(b64) {
    var png = pngOf(bytesOf(b64));
    if (!png || !root.createImageBitmap) {
      return Promise.resolve(null);
    }
    return root.createImageBitmap(new Blob([png], {type: "image/png"}), {imageOrientation: "none",
      premultiplyAlpha: "none", colorSpaceConversion: "none"}).then(function (bmp) {
      var tx = new THREE.Texture(bmp);
      tx.flipY = false;
      tx.magFilter = THREE.NearestFilter;
      tx.minFilter = THREE.NearestMipmapNearestFilter || THREE.NearestMipMapNearestFilter;
      if (THREE.sRGBEncoding && tx.encoding !== undefined) {
        tx.encoding = THREE.sRGBEncoding;
      }
      if (THREE.SRGBColorSpace && tx.colorSpace !== undefined) {
        tx.colorSpace = THREE.SRGBColorSpace;
      }
      tx.needsUpdate = true;
      return tx;
    }, function () { return null; });
  }

  function parse(loader, b64) {
    return new Promise(function (resolve, reject) {
      loader.parse(bytesOf(b64).buffer, "", function (g) { resolve(g.scene); }, reject);
    });
  }

  /* 1 wedge of the wheel, widened from 30 to 36 degrees: its geometry with
   * the angle of every point from the axis stretched (part: of 36). */
  function wedgeGeometry(src, part) {
    var g = src.clone(), pos = g.attributes.position;
    // the wedge's own angles about y, from its middle direction (so that a
    // piece across the angle of pi is measured whole): from a0 to a1
    var sx = 0, sz = 0, i;
    for (i = 0; i < pos.count; i++) {
      sx += pos.getX(i);
      sz += pos.getZ(i);
    }
    var am = Math.atan2(sz, sx), a0 = Infinity, a1 = -Infinity;
    var rel = function (x, z) {
      var a = Math.atan2(z, x) - am;
      return Math.atan2(Math.sin(a), Math.cos(a));
    };
    for (i = 0; i < pos.count; i++) {
      var x = pos.getX(i), z = pos.getZ(i);
      if (x * x + z * z > 1e-6) {
        var a = rel(x, z);
        a0 = Math.min(a0, a);
        a1 = Math.max(a1, a);
      }
    }
    var k = (2 * Math.PI / PIECES) * part / (a1 - a0);
    for (i = 0; i < pos.count; i++) {
      var px = pos.getX(i), pz = pos.getZ(i), r = Math.hypot(px, pz);
      if (r > 1e-6) {
        var b = am + a0 + (rel(px, pz) - a0) * k;
        pos.setXYZ(i, r * Math.cos(b), pos.getY(i), r * Math.sin(b));
      }
    }
    pos.needsUpdate = true;
    // its faces turned with it: their light anew (each face has its own corners)
    g.computeVertexNormals();
    return {geometry: g, a0: am + a0};
  }

  function load() {
    if (loading) {
      return loading;
    }
    loading = new Promise(function (resolve) {
      THREE = root.THREE;
      if (!THREE || !THREE.GLTFLoader || !FG.FOOD_MODELS || !canWebGL()) {
        failed = true;
        resolve(false);
        return;
      }
      // every model has its texture inside its own file (check/media/make_food_models.py)
      var M = FG.FOOD_MODELS, loader = new THREE.GLTFLoader();
      var names = ["wedges", "loaf", "slice", "plate", "board", "pizza", "round_board", "apple", "apple_half", "bowl"];
      Promise.all(names.map(function (k) { return parse(loader, M[k]); }).concat([palette(M.wedges)]))
        .then(function (s) {
          // every model's material with the palette decoded here (see pngOf)
          var tx = s.pop();
          if (tx) {
            s.forEach(function (sc) {
              sc.traverse(function (o) {
                if (o.isMesh) {
                  (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
                    m.map = tx;
                    m.needsUpdate = true;
                  });
                }
              });
            });
          }
          var first = function (sc, name) {
            var found = null;
            sc.traverse(function (o) {
              if (o.isMesh && !found && (!name || o.name === name || (o.parent && o.parent.name === name))) {
                found = o;
              }
            });
            return found;
          };
          models = {wedge: first(s[0]), loaf: s[1], slice: s[2], plate: s[3], board: s[4],
            pizzaSlice: first(s[5], "slice1") || first(s[5]), roundBoard: s[6], apple: s[7], appleHalf: s[8], bowl: s[9]};
          var canvas = document.createElement("canvas");
          R = new THREE.WebGLRenderer({canvas: canvas, alpha: true, antialias: true, preserveDrawingBuffer: true});
          R.setPixelRatio(1);
          R.setSize(W, H, false);
          R.localClippingEnabled = true;
          if (R.outputEncoding !== undefined && THREE.sRGBEncoding) {
            R.outputEncoding = THREE.sRGBEncoding;
          }
          resolve(true);
          listeners.forEach(function (fn) { fn(); });
        }, function () {
          failed = true;
          resolve(false);
        });
    });
    return loading;
  }

  function lights(sc) {
    sc.add(new THREE.HemisphereLight(0xfff6e6, 0x5a4a3a, 1.05));
    var sun = new THREE.DirectionalLight(0xffffff, 1.25);
    sun.position.set(-1.5, 3, 2.2);
    sc.add(sun);
    var fill = new THREE.DirectionalLight(0xfff0dd, 0.4);
    fill.position.set(2, 1.2, -1.5);
    sc.add(fill);
  }

  /* The food at a level as a group, standing on y = 0, its middle at x = z = 0. */
  function build(kind, level) {
    var g = new THREE.Group(), lv = Math.max(0, Math.min(1, level));
    var tenths = Math.round(lv * PIECES * 1e6) / 1e6, whole = Math.floor(tenths), part = tenths - whole;
    if (kind === "bread") {
      var board = models.board.clone();
      board.rotation.y = Math.PI / 2;
      g.add(board);
      var lb = new THREE.Box3().setFromObject(models.loaf);
      var len = lb.max.x - lb.min.x, cut = lb.min.x + len * lv;
      var lift = 0.06;
      if (lv > 0.001) {
        var plane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), cut);
        var loaf = models.loaf.clone(true);
        loaf.traverse(function (o) {
          if (o.isMesh) {
            o.material = o.material.clone();
            o.material.clippingPlanes = [plane];
            o.material.side = THREE.DoubleSide;
          }
        });
        loaf.position.y = lift;
        g.add(loaf);
        // the cut face: a slice of bread, standing across the loaf
        var sb = new THREE.Box3().setFromObject(models.slice);
        var sl = models.slice.clone(true);
        sl.rotation.z = Math.PI / 2;
        var sw = sb.max.x - sb.min.x, ldepth = lb.max.z - lb.min.z;
        sl.scale.set((lb.max.y - lb.min.y) / sw, 0.35, ldepth / (sb.max.z - sb.min.z));
        sl.position.set(cut + 0.004, lift + lb.min.y + (lb.max.y - lb.min.y) / 2, 0);
        // (rotated, the slice's width stands up; its middle onto the loaf's)
        var tmp = new THREE.Group();
        tmp.add(sl);
        tmp.updateMatrixWorld(true);
        var sbox = new THREE.Box3().setFromObject(tmp);
        sl.position.y += lift + lb.min.y - sbox.min.y;
        sl.position.x += cut - sbox.min.x + 0.002;
        tmp.remove(sl);
        g.add(sl);
      }
      return g;
    }
    if (kind === "apples") {
      var bowl = models.bowl.clone();
      bowl.scale.setScalar(1.2);
      g.add(bowl);
      // the apples go from the top of the heap down: the k-th of APPLES is there at k < whole
      for (var a = 0; a < whole && a < APPLES.length; a++) {
        var ap = models.apple.clone();
        ap.position.set(APPLES[a][0], APPLES[a][1], APPLES[a][2]);
        ap.rotation.y = APPLES[a][3];
        ap.scale.setScalar(APPLE_SIZE);
        g.add(ap);
      }
      if (part > 1e-3 && whole < APPLES.length) {
        // a part of an apple: a half apple, its cut face to the viewer, as large as the part
        var h = models.appleHalf.clone(), at = APPLES[whole];
        h.rotation.y = -Math.PI / 2;
        h.scale.setScalar(APPLE_SIZE * (0.65 + 0.35 * part));
        h.position.set(at[0], at[1], at[2]);
        g.add(h);
      }
      return g;
    }
    var pizza = kind === "pizza";
    var base = pizza ? models.roundBoard.clone() : models.plate.clone();
    base.scale.setScalar(pizza ? 1.18 : 1.05);
    g.add(base);
    var piece = pizza ? models.pizzaSlice : models.wedge;
    var src = piece.geometry, mat = piece.material;
    var full = wedgeGeometry(src, 1);
    var step = 2 * Math.PI / PIECES;
    // the first wedge just right of the front, as the drawings had it
    var start = Math.PI / 2 + 0.32;
    var add = function (geo, a0, k) {
      var m = new THREE.Mesh(geo, mat);
      m.rotation.y = -(start + k * step - a0);
      m.position.y = pizza ? 0.072 : 0.07;
      g.add(m);
    };
    for (var k = 0; k < whole; k++) {
      add(full.geometry, full.a0, k);
    }
    if (part > 1e-3) {
      var p = wedgeGeometry(src, part);
      add(p.geometry, p.a0, whole);
    }
    return g;
  }

  // the framing of each kind: fixed, from the whole food, so that every level is drawn alike
  var frames = {};
  function frameOf(kind) {
    if (!frames[kind]) {
      var b = new THREE.Box3().setFromObject(build(kind, 1));
      frames[kind] = {box: b, size: b.getSize(new THREE.Vector3()), mid: b.getCenter(new THREE.Vector3())};
    }
    return frames[kind];
  }

  function render(kind, level, view, w, h) {
    var sc = new THREE.Scene();
    lights(sc);
    var food = build(kind, level);
    sc.add(food);
    var f = frameOf(kind), cam;
    R.setSize(w, h, false);
    if (view === "top") {
      var s = Math.max(f.size.x, f.size.z) * 0.55;
      cam = new THREE.OrthographicCamera(-s, s, s, -s, 0.01, 20);
      cam.position.set(f.mid.x, 5, f.mid.z + 0.0001);
      cam.lookAt(f.mid.x, 0, f.mid.z);
    } else {
      // from the side and a little from above; the food on the bottom edge
      cam = new THREE.PerspectiveCamera(28, w / h, 0.01, 50);
      var span = Math.max(f.size.x, f.size.z, f.size.y * 1.6);
      var d = span * 2.6, el = 0.42;
      cam.position.set(f.mid.x, f.mid.y + d * Math.sin(el), f.mid.z + d * Math.cos(el));
      cam.lookAt(f.mid.x, f.mid.y * 0.85, f.mid.z);
    }
    R.setClearColor(0x000000, 0);
    R.render(sc, cam);
    var c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    var g = c.getContext("2d");
    g.drawImage(R.domElement, 0, 0);
    if (view !== "top") {
      // standing on the bottom edge: the picture moved down to its lowest
      // drawn row. That row is the plate's, the board's or the bowl's, the same
      // at every level, so it is found once for each food and size (reading
      // the pixels back took longer than drawing, where WebGL is drawn by the
      // processor)
      var key = w + "x" + h, bottom = f.bottom && f.bottom[key];
      if (bottom === undefined) {
        var data = g.getImageData(0, 0, w, h).data;
        bottom = 0;
        for (var y = h - 1; y >= 0 && !bottom; y--) {
          for (var x = 0; x < w; x += 2) {
            if (data[(y * w + x) * 4 + 3] > 8) {
              bottom = y;
              break;
            }
          }
        }
        // (measured on the whole food: a level drawn first may lack nothing below)
        if (level >= 1 || !bottom) {
          f.bottom = f.bottom || {};
          f.bottom[key] = bottom;
        }
      }
      if (bottom && bottom < h - 2) {
        var c2 = document.createElement("canvas");
        c2.width = w;
        c2.height = h;
        c2.getContext("2d").drawImage(c, 0, h - 2 - bottom);
        c = c2;
      }
    }
    return c;
  }

  function get(key, make) {
    if (!kept[key]) {
      order.push(key);
      if (order.length > KEEP) {
        delete kept[order.shift()];
      }
      kept[key] = make();
    }
    return kept[key];
  }

  function ready() {
    return !!models && !failed;
  }

  function side(kind, level) {
    if (!ready()) {
      return null;
    }
    var lv = Math.round(Math.max(0, Math.min(1, level)) * 100);
    return get("s" + kind + lv, function () {
      var c = render(kind, lv / 100, "side", W, H);
      return {w: c.width, h: c.height, canvas: c};
    });
  }

  function top(kind, level, px) {
    if (!ready()) {
      return null;
    }
    var lv = Math.round(Math.max(0, Math.min(1, level)) * 100), size = px > 160 ? 384 : 192;
    return get("t" + kind + lv + ":" + size, function () { return render(kind, lv / 100, "top", size, size); });
  }

  function icon(kind) {
    if (!ready()) {
      return null;
    }
    return get("i" + kind, function () { return render(kind, 1, "side", 240, 180); });
  }

  FG.food3d = {load: load, ready: ready, side: side, top: top, icon: icon,
    onReady: function (fn) { listeners.push(fn); }};
})(typeof window !== "undefined" ? window : globalThis);
