"""Writes js/food_models.js, the 3D models of the food (js/food3d.js), from
Kenney's Food Kit 2.0 (CC0, www.kenney.nl; img/food/KENNEY_LICENSE.txt):

    python check/media/make_food_models.py "PATH/TO/kenney_food-kit/Models/GLB format"

Each model goes in as a glTF file in base64 with its texture
(Textures/colormap.png) inside it, so that nothing is fetched from
elsewhere (a page in a sandbox may not fetch a data: address)."""
import base64
import json
import os
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
MODELS = {"wedges": "cheese.glb", "loaf": "loaf.glb", "slice": "bread.glb", "plate": "plate.glb",
          "board": "cutting-board.glb", "pizza": "pizza.glb", "round_board": "cutting-board-round.glb",
          "apple": "apple.glb", "apple_half": "apple-half.glb", "bowl": "bowl.glb"}


def embed(path, png):
    b = open(path, "rb").read()
    n = struct.unpack("<I", b[12:16])[0]
    doc = json.loads(b[20:20 + n])
    rest = b[20 + n:]
    bn = struct.unpack("<I", rest[0:4])[0]
    blob = bytearray(rest[8:8 + bn])
    while len(blob) % 4:
        blob.append(0)
    for im in doc.get("images", []):
        if "uri" in im:
            off = len(blob)
            blob += png
            while len(blob) % 4:
                blob.append(0)
            doc.setdefault("bufferViews", []).append({"buffer": 0, "byteOffset": off, "byteLength": len(png)})
            im.pop("uri")
            im["bufferView"] = len(doc["bufferViews"]) - 1
            im["mimeType"] = "image/png"
    doc["buffers"][0]["byteLength"] = len(blob)
    js = json.dumps(doc, separators=(",", ":")).encode()
    while len(js) % 4:
        js += b" "
    out = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(blob))
    out += struct.pack("<II", len(js), 0x4E4F534A) + js + struct.pack("<II", len(blob), 0x004E4942) + bytes(blob)
    return out


def main():
    src = sys.argv[1]
    png = open(os.path.join(src, "Textures", "colormap.png"), "rb").read()
    out = {k: base64.b64encode(embed(os.path.join(src, f), png)).decode() for k, f in MODELS.items()}
    with open(os.path.join(REPO, "js", "food_models.js"), "w") as f:
        f.write("/* The 3D models of the food (js/food3d.js): Kenney's Food Kit 2.0 (www.kenney.nl, CC0,\n"
                " * img/food/KENNEY_LICENSE.txt), glTF in base64, each with its texture inside: %s.\n"
                " * Written by check/media/make_food_models.py. */\n" % ", ".join(sorted(MODELS.values())))
        f.write("(function (root) {\n  (root.FG = root.FG || {}).FOOD_MODELS = %s;\n})(typeof window !== \"undefined\" ? "
                "window : globalThis);\n" % json.dumps(out))
    print(os.path.getsize(os.path.join(REPO, "js", "food_models.js")))


if __name__ == "__main__":
    main()
