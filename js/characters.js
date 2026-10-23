/* The characters a player can be (settings.js: game.player), besides the
 * mouse of js/mouse.js and the arrow: a man, a woman, a dog, a robot and a
 * knight. Each is a 3D model (characters/<name>.js, made by
 * check/make_characters.py; credits in characters/CREDITS.md) drawn with
 * three.js (js/three) where the browser has WebGL.
 *
 * Each model has 3 clips that loop, each starting as the left foot lands:
 * idle (standing), walk and run. The man, the woman and the robot move as
 * people of the CMU motion capture database did; the knight and the dog
 * have their own. The game says how far the character has walked (gait, 2
 * pi a pair of steps) and how fast it goes (move); the clips are blended
 * by the speed and turned as fast as the ground goes by, so that the feet
 * keep to the floor, and the steps sound as each foot lands. A fourth clip,
 * eat, comes in while the character eats standing still: a person brings
 * the food to the mouth with the right hand and chews, the dog bites at
 * the floor.
 *
 * Each character has its own height, eyes (how high the 3D view is), top
 * speed (metres a second, a person's), sounds and, behind it, a camera of
 * its own height (INFO). Nothing else differs: the body that bumps into
 * walls, the turning, the rules and the steps of the maze are the same for
 * all.
 *
 * In the 3D view (js/gl3d.js) a character is drawn into the same picture
 * as the maze, with the maze's camera and depth (painter), so that walls
 * hide it; in the 2D view it is seen from above (topView), and on the
 * characters page standing or walking (portrait), both from a canvas of
 * its own. */
(function (root) {
  "use strict";
  var FG = root.FG = root.FG || {};

  var TILE = 3.2;                    // metres: the height of a wall, 1 tile
  var PI = Math.PI;

  /* For each: label, height (metres, standing), eye (the eyes of the 3D
   * view, part of the height of a wall), speed (top speed, metres a
   * second), camera behind it (back: how far behind, in tiles; eye: its
   * height, near: its height when close, as part of the height of a wall;
   * horizon), zoom2d (how much bigger than itself it is drawn in 2D, as the
   * mouse is), reach (metres from its middle to its furthest part, seen
   * from above), print (its prints in 2D), sounds: steps, voice, eating,
   * sniffing; file: its model. */
  var INFO = {
    man: {label: "Man", height: 1.8, eye: 0.52, speed: 5.5, reach: 0.6,
      camera: {back: 1.6, eye: 0.78, near: 0.66, horizon: 0.41}, zoom2d: 6, print: "shoe",
      sound: {steps: "shoes", voice: "man", eat: "crunch", sniff: false}},
    woman: {label: "Woman", height: 1.68, eye: 0.48, speed: 5.3, reach: 0.55,
      camera: {back: 1.55, eye: 0.74, near: 0.62, horizon: 0.41}, zoom2d: 6.2, print: "bare",
      sound: {steps: "bare", voice: "woman", eat: "crunch", sniff: false}},
    dog: {label: "Dog", height: 0.72, eye: 0.19, speed: 6, reach: 0.6,
      camera: {back: 1.0, eye: 0.42, near: 0.3, horizon: 0.47}, zoom2d: 6, print: "paw",
      sound: {steps: "claws", voice: "dog", eat: "chomp", sniff: true}},
    mouse: {label: "Mouse", height: 0.3},
    robot: {label: "Robot", height: 1.5, eye: 0.42, speed: 5, reach: 0.6,
      camera: {back: 1.5, eye: 0.7, near: 0.56, horizon: 0.42}, zoom2d: 5.6, print: "robot",
      sound: {steps: "robot", voice: "robot", eat: "whirr", sniff: false}},
    knight: {label: "Knight", height: 1.9, eye: 0.53, speed: 5, reach: 0.7,
      camera: {back: 1.65, eye: 0.8, near: 0.68, horizon: 0.4}, zoom2d: 5.4, print: "boot",
      sound: {steps: "armour", voice: "knight", eat: "crunch", sniff: false}}
  };
  var LIST = ["man", "woman", "dog", "mouse", "robot", "knight"];
  Object.keys(INFO).forEach(function (n) {
    INFO[n].file = "characters/" + n + ".js";
    INFO[n].picture = "img/characters/" + n + ".png";
  });

  function is(name) {
    return INFO.hasOwnProperty(name) && name !== "mouse";
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function smooth(a, b, v) {
    var k = clamp((v - a) / (b - a), 0, 1);
    return k * k * (3 - 2 * k);
  }

  function frac(v) {
    return v - Math.floor(v);
  }

  // ------------------------------------------------------------ loading
  var models = {};                  // name -> Promise of a Model

  /* The file of a character (a script, so that it also loads opened as a
   * file): resolves with FG.characterFiles[name]. */
  function fetchFile(name) {
    var have = FG.characterFiles && FG.characterFiles[name];
    if (have) {
      return Promise.resolve(have);
    }
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = INFO[name].file;
      s.async = true;
      s.onload = function () {
        var f = FG.characterFiles && FG.characterFiles[name];
        if (f) {
          resolve(f);
        } else {
          reject(new Error(INFO[name].file + " holds no " + name));
        }
      };
      s.onerror = function () { reject(new Error("could not load " + INFO[name].file)); };
      document.head.appendChild(s);
    });
  }

  function bytesOf(b64) {
    var s = root.atob(b64), n = s.length, out = new Uint8Array(n);
    for (var i = 0; i < n; i++) {
      out[i] = s.charCodeAt(i);
    }
    return out;
  }

  /* The model of a character, loaded once: a Promise of a Model. */
  function load(name) {
    if (!is(name)) {
      return Promise.reject(new Error("no character " + name));
    }
    if (!models[name]) {
      models[name] = fetchFile(name).then(function (file) {
        return new Promise(function (resolve, reject) {
          if (!root.THREE || !root.THREE.GLTFLoader) {
            reject(new Error("three.js is missing"));
            return;
          }
          var bytes = bytesOf(file.model);
          new root.THREE.GLTFLoader().parse(bytes.buffer, "", function (gltf) {
            try {
              resolve(new Model(name, gltf, file));
            } catch (err) {
              reject(err);
            }
          }, reject);
        });
      });
      models[name].catch(function () { delete models[name]; });
    }
    return models[name];
  }

  /* The Model of name if it has come in, else null. */
  var ready = {};
  function loaded(name) {
    return ready[name] || null;
  }

  // ------------------------------------------------------------ a model
  /* A loaded character: its scene (the model in metres, feet on y = 0,
   * facing +z), its clips and the mixer that poses it. */
  function Model(name, gltf, file) {
    var THREE = root.THREE;
    this.name = name;
    this.info = INFO[name];
    this.meta = file.clips;
    this.sounds = file.sounds || null;
    this.root = gltf.scene;
    this.mixer = new THREE.AnimationMixer(this.root);
    this.actions = {};
    var self = this;
    gltf.animations.forEach(function (clip) {
      var a = self.mixer.clipAction(clip);
      a.play();
      a.setEffectiveWeight(0);
      self.actions[clip.name] = a;
    });
    ["idle", "walk", "run"].forEach(function (k) {
      if (!self.actions[k]) {
        throw new Error(name + " has no " + k + " clip");
      }
    });
    this.actions.eat = this.actions.eat || null;
    this.materials = [];
    this.root.traverse(function (o) {
      if (o.isMesh) {
        o.frustumCulled = false;
        [].concat(o.material).forEach(function (mat) {
          if (self.materials.indexOf(mat) < 0) {
            mat.userData.opaque = !mat.transparent;
            mat.userData.opacity = mat.opacity;
            self.materials.push(mat);
          }
        });
      }
    });
    // its height and soles, standing
    this.actions.idle.setEffectiveWeight(1);
    this.actions.idle.time = 0;
    this.mixer.update(0);
    this.root.rotation.y = -(file.front || 0);
    this.root.updateMatrixWorld(true);
    var box = skinnedBox(this.root);
    this.units = box.max.y - box.min.y;              // its height, in its own units
    this.metres = this.info.height / this.units;     // metres a unit
    this.length = (box.max.z - box.min.z) * this.metres;
    this.floor = box.min.y;
    this.holder = new THREE.Group();
    this.holder.add(this.root);
    this.root.scale.setScalar(this.metres);
    // standing on the floor, its middle where the character is
    var mid = box.getCenter(new THREE.Vector3());
    this.root.position.set(-mid.x * this.metres, -this.floor * this.metres, -mid.z * this.metres);
    this.holder.updateMatrixWorld(true);
    // how fast the ground goes by in walk and run (metres a second, the
    // clip at its own pace), and the distance of a pair of steps
    this.pace = {};
    ["walk", "run"].forEach(function (k) {
      var m = self.meta[k];
      var stride = m.stride * self.metres;
      self.pace[k] = {stride: stride, speed: stride * (m.cycles || 1) / m.duration};
    });
    this.state = {turnPhase: 0, t: null, eat: 0, eatTime: 0, eatUntil: -1};
    ready[name] = this;
  }

  function skinnedBox(obj) {
    var THREE = root.THREE, box = new THREE.Box3(), v = new THREE.Vector3();
    obj.traverse(function (o) {
      if (!o.isMesh || !o.visible) {
        return;
      }
      var pos = o.geometry.attributes.position, step = Math.max(1, Math.floor(pos.count / 4000));
      for (var i = 0; i < pos.count; i += step) {
        v.fromBufferAttribute(pos, i);
        if (o.isSkinnedMesh) {
          o.boneTransform(i, v);
        }
        v.applyMatrix4(o.matrixWorld);
        box.expandByPoint(v);
      }
    });
    return box;
  }

  /* Metres a pair of steps at speed v (metres a second): the walk's, the
   * run's, or between. */
  Model.prototype.stride = function (v) {
    var w = this.runShare(v);
    return this.pace.walk.stride * (1 - w) + this.pace.run.stride * w;
  };

  Model.prototype.runShare = function (v) {
    var a = this.pace.walk.speed * 1.15, b = Math.max(a + 0.5, Math.min(this.pace.run.speed, a * 2.2));
    return smooth(a, b, v);
  };

  /* Poses the model as fig says: {phase (the gait: 2 pi a pair of steps),
   * move (0 standing to 1 at full speed), back (walking backwards), t
   * (seconds), turn (radians a second), eat (true while it eats)}. */
  var EAT_IN = 0.3, EAT_OUT = 0.45, EAT_GAP = 0.3;
  Model.prototype.pose = function (fig) {
    var st = this.state, dt = st.t === null ? 0 : clamp(fig.t - st.t, 0, 0.1);
    st.t = fig.t;
    var v = clamp(fig.move || 0, 0, 1) * this.info.speed;
    var go = smooth(0.04, 0.5, v), run = this.runShare(v);
    // turning on the spot: small steps
    var spin = (1 - go) * smooth(0.6, 2.5, Math.abs(fig.turn || 0));
    st.turnPhase += dt * Math.abs(fig.turn || 0) * 0.3;
    var cycles = (fig.phase - PI / 2) / (2 * PI);
    if (fig.back) {
      cycles = -cycles;
    }
    var w = {idle: (1 - go) * (1 - spin), walk: go * (1 - run) + spin, run: go * run};
    var A = this.actions, M = this.meta;
    ["walk", "run"].forEach(function (k) {
      var c = k === "walk" && spin > go ? st.turnPhase : cycles;
      A[k].time = frac(c / (M[k].cycles || 1) + (M[k].offset || 0)) * M[k].duration;
    });
    A.idle.time = frac(fig.t / M.idle.duration) * M.idle.duration;
    if (A.eat) {
      // eating: in over EAT_IN seconds, from the start of its clip; out over
      // EAT_OUT once the bites stop for EAT_GAP (between the bites of a
      // stay) or the character moves
      if (fig.eat) {
        st.eatUntil = fig.t + EAT_GAP;
      }
      var want = fig.t < st.eatUntil ? 1 - go : 0;
      if (st.eat === 0 && want > 0) {
        st.eatTime = 0;
      }
      st.eat = clamp(st.eat + clamp(want - st.eat, -dt / EAT_OUT, dt / EAT_IN), 0, 1);
      st.eatTime += dt;
      A.eat.time = frac(st.eatTime / M.eat.duration) * M.eat.duration;
      w.eat = w.idle * st.eat;
      w.idle -= w.eat;
    }
    Object.keys(w).forEach(function (k) {
      A[k].setEffectiveWeight(w[k]);
    });
    this.mixer.update(0);
  };

  /* Tiles a step (half a pair) at share move of the top speed, with
   * tilesPerMetre tiles a metre of the view; before the model has come in,
   * the run's measure of a person. */
  function stepTiles(name, move, tilesPerMetre) {
    var m = ready[name], v = clamp(move, 0, 1) * INFO[name].speed;
    var stride = m ? m.stride(v) : 2.4;
    return Math.max(0.05, stride / 2 * tilesPerMetre);
  }

  // ------------------------------------------------------------ the 3D view
  /* The camera of the 3D view (js/gl3d.js) as a 4 x 4 matrix: at cam
   * (x, y, eye height), looking along dir, x across the screen tx / fov,
   * the middle line at k, depth from near to far. */
  function mazeCamera(cam, dir, fov, k, depth) {
    var dx = dir[0], dy = dir[1], px = cam[0], py = cam[1], pz = cam[2], A = depth[0], B = depth[1];
    var along = dx * px + dy * py;
    // rows: clip x, y, z, w
    var r = [[-dy / fov, dx / fov, 0, (dy * px - dx * py) / fov],
      [k * dx, k * dy, 2, -2 * pz - k * along],
      [A * dx, A * dy, 0, -A * along + B],
      [dx, dy, 0, -along]];
    var m = new Array(16);
    for (var c = 0; c < 4; c++) {
      for (var row = 0; row < 4; row++) {
        m[c * 4 + row] = r[row][c];
      }
    }
    return m;
  }

  /* Draws characters into the picture of the 3D view, in its WebGL
   * context gl: three.js shares the context, the maze's camera and its
   * depth, so walls in front of a character hide it.
   *
   * three.js's world is the maze's with y turned over (y north, z up: the
   * maze has y south), so that its models are not drawn in a mirror. */
  function Painter(gl) {
    var THREE = root.THREE;
    this.gl = gl;
    this.three = new THREE.WebGLRenderer({canvas: gl.canvas, context: gl});
    this.three.autoClear = false;
    this.three.setPixelRatio(1);
    this.three.outputEncoding = THREE.sRGBEncoding;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x000000, 0, 10);
    this.sky = new THREE.HemisphereLight(0xfff6ea, 0x4a4440, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    this.back = new THREE.DirectionalLight(0xdfe8ff, 0.4);
    this.scene.add(this.sky, this.sun, this.sun.target, this.back, this.back.target);
    this.camera = new THREE.Camera();
    this.camera.matrixAutoUpdate = false;
    this.shadow = blob(THREE);
    this.scene.add(this.shadow);
    this.model = null;
    this.target = null;
    this.targetOf = null;
  }

  /* A soft dark round on the floor under a character. */
  function blob(THREE) {
    var c = document.createElement("canvas");
    c.width = c.height = 64;
    var g = c.getContext("2d"), r = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    r.addColorStop(0, "rgba(0,0,0,0.55)");
    r.addColorStop(0.6, "rgba(0,0,0,0.25)");
    r.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
    var tex = new THREE.CanvasTexture(c);
    var mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({map: tex, transparent: true, depthWrite: false, fog: true}));
    mesh.matrixAutoUpdate = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = -1;
    return mesh;
  }

  /* Draws the Model model posed by fig at (x, y) tiles facing angle (the
   * maze's), seen by the 3D view's camera cam ({cam: [x, y, eye], dir, fov,
   * k, depth}); into framebuffer fbo (null: the canvas) of w x h pixels.
   * look: {light (0 dark to 1 lit), fog (rgb 0 to 1), fogFar, alpha}. */
  Painter.prototype.draw = function (model, fig, x, y, angle, cam, fbo, w, h, look) {
    var THREE = root.THREE, three = this.three;
    // (a model is in 1 scene at a time: the pictures' may have taken it)
    if (this.model !== model || model.holder.parent !== this.scene) {
      if (this.model && this.model.holder.parent === this.scene) {
        this.scene.remove(this.model.holder);
      }
      this.scene.add(model.holder);
      this.model = model;
    }
    model.pose(fig);
    // where it stands, facing angle (three's y is the maze's -y)
    var s = 1 / TILE;
    var m = new THREE.Matrix4().makeTranslation(x, -y, 0);
    m.multiply(new THREE.Matrix4().makeRotationZ(PI / 2 - angle));
    m.multiply(new THREE.Matrix4().makeRotationX(PI / 2));
    m.multiply(new THREE.Matrix4().makeScale(s, s, s));
    model.holder.matrixAutoUpdate = false;
    model.holder.matrix.copy(m);
    var r = model.info.reach * 1.25 / TILE;
    this.shadow.matrix.makeTranslation(x, -y, 0.002).multiply(new THREE.Matrix4().makeScale(r * 1.6, r * 1.6, 1));
    this.shadow.material.opacity = look.alpha === undefined ? 1 : look.alpha;
    // the camera: a proper view (for the lights) and the maze's picture
    var d = cam.dir, f = new THREE.Vector3(d[0], -d[1], 0).normalize(), up = new THREE.Vector3(0, 0, 1);
    var right = new THREE.Vector3().crossVectors(f, up).normalize();
    var world = new THREE.Matrix4().makeBasis(right, up, f.clone().negate());
    world.setPosition(cam.cam[0], -cam.cam[1], cam.cam[2]);
    var vp = new THREE.Matrix4().fromArray(mazeCamera(cam.cam, cam.dir, cam.fov, cam.k, cam.depth));
    var flip = new THREE.Matrix4().makeScale(1, -1, 1);
    this.camera.matrix.copy(world);
    this.camera.matrixWorld.copy(world);
    this.camera.matrixWorldInverse.copy(world).invert();
    this.camera.projectionMatrix.copy(vp).multiply(flip).multiply(world);
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    // the light of its room; the sun over the camera's shoulder
    var L = clamp(look.light === undefined ? 1 : look.light, 0, 1);
    this.sky.intensity = 0.25 + 0.65 * L;
    this.sun.intensity = 0.15 + 1.25 * L;
    this.back.intensity = 0.1 + 0.3 * L;
    this.sun.position.set(cam.cam[0] - d[1] * 0.6, -(cam.cam[1] + d[0] * 0.6), 2.2);
    this.sun.target.position.set(x, -y, 0);
    this.back.position.set(x + d[0] * 2, -(y + d[1] * 2), 1.2);
    this.back.target.position.set(x, -y, 0.3);
    var fog = look.fog || [0, 0, 0];
    this.scene.fog.color.setRGB(fog[0], fog[1], fog[2]).convertSRGBToLinear();
    this.scene.fog.far = look.fogFar || 10;
    var alpha = look.alpha === undefined ? 1 : look.alpha;
    model.materials.forEach(function (mat) {
      mat.transparent = !mat.userData.opaque || alpha < 1;
      mat.opacity = mat.userData.opacity * alpha;
    });
    this.scene.updateMatrixWorld(true);
    three.resetState();
    if (fbo) {
      if (this.targetOf !== fbo || this.target.width !== w || this.target.height !== h) {
        if (this.target) {
          this.target.dispose();
        }
        this.target = new THREE.WebGLRenderTarget(w, h, {depthBuffer: true});
        this.target.texture.generateMipmaps = false;
        three.setRenderTargetFramebuffer(this.target, fbo);
        this.targetOf = fbo;
      }
      three.setRenderTarget(this.target);
    } else {
      three.setRenderTarget(null);
      three.setViewport(0, 0, w, h);
    }
    three.render(this.scene, this.camera);
    three.setRenderTarget(null);
    three.resetState();
  };

  // ------------------------------------------------------------ pictures
  // 1 WebGL canvas of its own (three.js) for the 2D view and the first page
  var pictures = null;
  function picturer() {
    if (pictures === null) {
      pictures = false;
      try {
        var THREE = root.THREE;
        if (THREE && THREE.GLTFLoader) {
          var c = document.createElement("canvas");
          c.width = c.height = 2;
          var r = new THREE.WebGLRenderer({canvas: c, alpha: true, antialias: true, preserveDrawingBuffer: true,
            failIfMajorPerformanceCaveat: false});
          r.outputEncoding = THREE.sRGBEncoding;
          r.setPixelRatio(1);
          r.setClearColor(0x000000, 0);
          var scene = new THREE.Scene();
          var sky = new THREE.HemisphereLight(0xfff6ea, 0x4a4440, 0.95);
          var sun = new THREE.DirectionalLight(0xffffff, 1.35);
          var fill = new THREE.DirectionalLight(0xdfe8ff, 0.35);
          scene.add(sky, sun, fill);
          pictures = {canvas: c, r: r, scene: scene, sun: sun, fill: fill, model: null,
            perspective: new THREE.PerspectiveCamera(30, 1, 0.05, 50), above: new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20)};
        }
      } catch (err) {
        pictures = false;
      }
    }
    return pictures || null;
  }

  function show(P, model) {
    if (P.model !== model || model.holder.parent !== P.scene) {
      if (P.model && P.model.holder.parent === P.scene) {
        P.scene.remove(P.model.holder);
      }
      P.scene.add(model.holder);
      P.model = model;
    }
  }

  function size(P, w, h) {
    if (P.canvas.width !== w || P.canvas.height !== h) {
      P.r.setSize(w, h, false);
    }
  }

  /* The character seen from above, facing heading (the 2D view, x to the
   * right and y down): a canvas px pixels wide whose middle is where it
   * stands, half metres wide each way; null without WebGL or before its
   * model has come in. */
  function topView(name, fig, heading, px, half) {
    var P = picturer(), model = ready[name];
    if (!P || !model) {
      return null;
    }
    size(P, px, px);
    show(P, model);
    model.pose(fig);
    var THREE = root.THREE;
    // in the picture's world x is to the right and y down (as the 2D view),
    // so z goes away from the eye: the character's up is -z
    model.holder.matrixAutoUpdate = false;
    model.holder.matrix.makeRotationZ(heading - PI / 2).multiply(new THREE.Matrix4().makeRotationX(-PI / 2));
    var cam = P.above;
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    cam.position.set(0, 0, -10);
    cam.up.set(0, -1, 0);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
    P.sun.position.set(-1, -2, -6);
    P.fill.position.set(2, 1, -3);
    P.scene.updateMatrixWorld(true);
    P.r.render(P.scene, cam);
    return P.canvas;
  }

  /* The character for the first page: w x h pixels, turned yaw (radians)
   * to the viewer, posed by fig; a canvas, or null. */
  function portrait(name, fig, yaw, w, h) {
    var P = picturer(), model = ready[name];
    if (!P || !model) {
      return null;
    }
    size(P, w, h);
    show(P, model);
    model.pose(fig);
    model.holder.matrixAutoUpdate = false;
    model.holder.matrix.makeRotationY(yaw);
    // all of it in the picture: as tall as it is, or as long
    var H = model.info.height, E = Math.max(H, model.length * 1.8 * w / h), cam = P.perspective;
    cam.aspect = w / h;
    cam.fov = 30;
    var d = E * 0.5 / Math.tan(15 * PI / 180) * 1.18;
    cam.position.set(0, H * 0.5 + E * 0.12, d);
    cam.lookAt(0, H * 0.48, 0);
    cam.updateProjectionMatrix();
    P.sun.position.set(-2, 4, 3);
    P.fill.position.set(3, 2, -2);
    P.scene.updateMatrixWorld(true);
    P.r.render(P.scene, cam);
    return P.canvas;
  }

  function available() {
    return !!picturer();
  }

  // ------------------------------------------------------------ prints (2D)
  /* A print of a foot of kind (INFO.print) on the floor of the 2D view at
   * (x, y) pixels, pointing a, T pixels a tile, alpha how clear. */
  function print2d(g, x, y, a, Tp, alpha, kind) {
    if (alpha <= 0) {
      return;
    }
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.globalAlpha = Math.max(0, Math.min(1, alpha)) * 0.5;
    g.fillStyle = "#3a2e26";
    var k = Tp / 32;
    g.beginPath();
    if (kind === "shoe" || kind === "boot") {
      var s = kind === "boot" ? 1.15 : 1;
      g.ellipse(2.5 * k * s, 0, 3.2 * k * s, 1.5 * k * s, 0, 0, 2 * PI);
      g.moveTo(-2.4 * k * s, 0);
      g.ellipse(-2.6 * k * s, 0, 1.4 * k * s, 1.3 * k * s, 0, 0, 2 * PI);
    } else if (kind === "bare") {
      g.ellipse(1.6 * k, 0, 2.4 * k, 1.2 * k, 0, 0, 2 * PI);
      g.moveTo(-1.6 * k, 0);
      g.ellipse(-2 * k, 0, 1.1 * k, 1.0 * k, 0, 0, 2 * PI);
      [[4.4, -0.9, 0.55], [4.7, -0.1, 0.45], [4.6, 0.6, 0.4], [4.3, 1.2, 0.35]].forEach(function (q) {
        g.moveTo((q[0] + q[2]) * k, q[1] * k);
        g.ellipse(q[0] * k, q[1] * k, q[2] * k, q[2] * 0.85 * k, 0, 0, 2 * PI);
      });
    } else if (kind === "robot") {
      g.rect(-3 * k, -1.8 * k, 6.5 * k, 3.6 * k);
    } else {
      g.ellipse(-0.6 * k, 0, 1.6 * k, 1.4 * k, 0, 0, 2 * PI);
      [[1.4, -1.4], [2.1, -0.5], [2.1, 0.5], [1.4, 1.4]].forEach(function (q) {
        g.moveTo((q[0] + 0.6) * k, q[1] * k);
        g.ellipse(q[0] * k, q[1] * k, 0.6 * k, 0.5 * k, 0, 0, 2 * PI);
      });
    }
    g.fill();
    if (kind === "robot") {
      g.globalAlpha *= 0.6;
      g.fillStyle = "#f4efe8";
      for (var i = -2; i <= 2; i++) {
        g.fillRect(i * 1.2 * k - 0.25 * k, -1.8 * k, 0.5 * k, 3.6 * k);
      }
    }
    g.restore();
  }

  FG.characters = {
    LIST: LIST, INFO: INFO, TILE: TILE, is: is, load: load, loaded: loaded, stepTiles: stepTiles,
    painter: function (gl) { return root.THREE ? new Painter(gl) : null; }, mazeCamera: mazeCamera,
    topView: topView, portrait: portrait, available: available, print2d: print2d
  };
})(typeof window !== "undefined" ? window : globalThis);
