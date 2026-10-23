// The pictures of the characters page (img/characters/<name>.png): each
// character standing, turned a little to the viewer, drawn by the game's own
// js/characters.js in Chromium (Playwright, as check/play_check.js).
//
//   node check/character_pictures.js [names...]
//
// The mouse's picture (img/characters/mouse.png) was drawn by the mouse of
// version 2.6.0 and is kept as it is.
"use strict";
var fs = require("fs"), path = require("path"), http = require("http");
var {chromium} = require("playwright");

var ROOT = path.resolve(__dirname, "..");
var W = 480, H = 600;
var TYPES = {".html": "text/html", ".js": "text/javascript", ".png": "image/png"};

var PAGE = '<!doctype html><meta charset="utf-8"><body style="margin:0;background:transparent">' +
  '<script src="js/three/three.min.js"></script><script src="js/three/GLTFLoader.js"></script>' +
  '<script src="js/characters.js"></script></body>';

async function main() {
  var server = http.createServer(function (req, res) {
    var url = decodeURIComponent(req.url.split("?")[0]);
    if (url === "/pictures.html") {
      res.writeHead(200, {"Content-Type": "text/html"});
      return res.end(PAGE);
    }
    var p = path.join(ROOT, url);
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, {"Content-Type": TYPES[path.extname(p)] || "application/octet-stream"});
    fs.createReadStream(p).pipe(res);
  });
  await new Promise(function (r) { server.listen(0, r); });
  var base = "http://localhost:" + server.address().port;
  var browser = await chromium.launch(fs.existsSync("/opt/pw-browsers/chromium") ?
    {executablePath: "/opt/pw-browsers/chromium", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]} :
    {});
  var page = await browser.newPage();
  await page.goto(base + "/pictures.html");
  var names = process.argv.slice(2);
  if (!names.length) {
    names = await page.evaluate(function () { return FG.characters.LIST.filter(FG.characters.is); });
  }
  fs.mkdirSync(path.join(ROOT, "img", "characters"), {recursive: true});
  for (var n of names) {
    var url = await page.evaluate(function (a) {
      return FG.characters.load(a.n).then(function () {
        var c = FG.characters.portrait(a.n, {phase: 0, move: 0, t: 0.4, turn: 0}, -0.45, a.w, a.h);
        return c.toDataURL("image/png");
      });
    }, {n: n, w: W, h: H});
    var out = path.join(ROOT, "img", "characters", n + ".png");
    fs.writeFileSync(out, Buffer.from(url.split(",")[1], "base64"));
    console.log(n + ": " + path.relative(ROOT, out));
  }
  await browser.close();
  server.close();
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
