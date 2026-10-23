"""Reads, changes and writes .glb files (binary glTF 2.0), for the
characters of the game: their materials, textures, clips and the clips made
here (js/characters.js draws them).

Only what the game draws is kept on writing: the meshes the nodes use, their
materials and textures, the skins and the clips.
"""
import io
import json
import struct

import numpy as np
from PIL import Image

COMPONENT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
SIZE = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
TYPE = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT2": 4, "MAT3": 9, "MAT4": 16}
JSON_CHUNK, BIN_CHUNK = 0x4E4F534A, 0x004E4942


def read(path):
    data = open(path, "rb").read()
    magic, version, total = struct.unpack("<III", data[:12])
    if magic != 0x46546C67 or version != 2:
        raise ValueError("%s is not a glTF 2.0 .glb" % path)
    pos, doc, blob = 12, None, b""
    while pos < total:
        size, kind = struct.unpack("<II", data[pos:pos + 8])
        chunk = data[pos + 8:pos + 8 + size]
        if kind == JSON_CHUNK:
            doc = json.loads(chunk.decode("utf-8"))
        elif kind == BIN_CHUNK:
            blob = chunk
        pos += 8 + size
    return Model(doc, blob)


class Model:
    def __init__(self, doc, blob):
        self.doc = doc
        self.blob = bytearray(blob)
        self.new_images = {}

    # ------------------------------------------------------------ data
    def view(self, i):
        v = self.doc["bufferViews"][i]
        start = v.get("byteOffset", 0)
        return bytes(self.blob[start:start + v["byteLength"]])

    def accessor(self, i):
        """The values of accessor i as a float or int array, (count, n)."""
        a = self.doc["accessors"][i]
        n = TYPE[a["type"]]
        dtype = COMPONENT[a["componentType"]]
        out = np.zeros((a["count"], n), dtype=dtype)
        if "bufferView" in a:
            v = self.doc["bufferViews"][a["bufferView"]]
            elem = SIZE[a["componentType"]] * n
            stride = v.get("byteStride") or elem
            start = v.get("byteOffset", 0) + a.get("byteOffset", 0)
            raw = np.frombuffer(bytes(self.blob[start:start + stride * (a["count"] - 1) + elem]), dtype=np.uint8)
            rows = np.lib.stride_tricks.as_strided(raw, shape=(a["count"], elem), strides=(stride, 1))
            out = rows.copy().view(dtype).reshape(a["count"], n)
        if a.get("normalized"):
            out = out.astype(np.float32) / np.iinfo(dtype).max
        return out

    def add_accessor(self, values, kind, component=5126):
        """A new accessor of values ((count, n) array, floats unless
        component says otherwise); its index."""
        values = np.ascontiguousarray(values, dtype=COMPONENT[component])
        if values.ndim == 1:
            values = values[:, None]
        while len(self.blob) % 4:
            self.blob.append(0)
        start = len(self.blob)
        self.blob.extend(values.tobytes())
        self.doc["bufferViews"].append({"buffer": 0, "byteOffset": start, "byteLength": values.nbytes})
        acc = {"bufferView": len(self.doc["bufferViews"]) - 1, "componentType": component, "count": len(values),
               "type": kind}
        if kind == "SCALAR" and component == 5126:
            acc["min"] = [float(values.min())]
            acc["max"] = [float(values.max())]
        self.doc["accessors"].append(acc)
        return len(self.doc["accessors"]) - 1

    def add_clip(self, name, times, tracks):
        """A clip: times (seconds), tracks [(node, "rotation"|"translation", values)]."""
        t = self.add_accessor(np.asarray(times, dtype=np.float32), "SCALAR")
        samplers, channels = [], []
        for node, path, values in tracks:
            out = self.add_accessor(values, "VEC4" if path == "rotation" else "VEC3")
            samplers.append({"input": t, "output": out, "interpolation": "LINEAR"})
            channels.append({"sampler": len(samplers) - 1, "target": {"node": node, "path": path}})
        self.doc.setdefault("animations", []).append({"name": name, "samplers": samplers, "channels": channels})

    def image_bytes(self, i):
        img = self.doc["images"][i]
        return self.view(img["bufferView"]), img.get("mimeType", "image/png")

    # ------------------------------------------------------------ changes
    def spec_gloss_to_metal_rough(self):
        """KHR_materials_pbrSpecularGlossiness (not read by three.js r147)
        as a plain metal/rough material of the same colour."""
        for m in self.doc.get("materials", []):
            ext = (m.get("extensions") or {}).pop("KHR_materials_pbrSpecularGlossiness", None)
            if ext is None:
                continue
            pbr = {"metallicFactor": 0.0,
                   "roughnessFactor": round(1.0 - float(ext.get("glossinessFactor", 1.0)), 3)}
            if "diffuseFactor" in ext:
                pbr["baseColorFactor"] = ext["diffuseFactor"]
            if "diffuseTexture" in ext:
                pbr["baseColorTexture"] = ext["diffuseTexture"]
            m["pbrMetallicRoughness"] = pbr
            if not m["extensions"]:
                del m["extensions"]
        for key in ("extensionsUsed", "extensionsRequired"):
            if key in self.doc:
                self.doc[key] = [e for e in self.doc[key] if e != "KHR_materials_pbrSpecularGlossiness"]
                if not self.doc[key]:
                    del self.doc[key]

    def strip_morphs(self):
        for mesh in self.doc.get("meshes", []):
            for prim in mesh["primitives"]:
                prim.pop("targets", None)
            mesh.pop("weights", None)
            (mesh.get("extras") or {}).pop("targetNames", None)
        for node in self.doc.get("nodes", []):
            node.pop("weights", None)
        for anim in self.doc.get("animations", []):
            anim["channels"] = [c for c in anim["channels"] if c["target"].get("path") != "weights"]

    def slim(self):
        """Takes off what the game does not use: tangents (three.js works
        them out), texture places no material reads, 32-bit indices where 16
        bits do."""
        used_uv = {0}
        for m in self.doc.get("materials", []):
            slots = [v for k, v in m.items() if k.endswith("Texture")]
            slots += [v for k, v in (m.get("pbrMetallicRoughness") or {}).items() if k.endswith("Texture")]
            used_uv.update(s.get("texCoord", 0) for s in slots)
        for mesh in self.doc.get("meshes", []):
            for prim in mesh["primitives"]:
                attrs = prim["attributes"]
                attrs.pop("TANGENT", None)
                for k in list(attrs):
                    if k.startswith("TEXCOORD_") and int(k.split("_")[1]) not in used_uv:
                        del attrs[k]
                idx = prim.get("indices")
                if idx is not None and self.doc["accessors"][idx]["componentType"] == 5125:
                    values = self.accessor(idx)[:, 0]
                    if values.max() < 65535:
                        prim["indices"] = self.add_accessor(values.astype(np.uint16), "SCALAR", 5123)
                        self.doc["bufferViews"][-1]["target"] = 34963

    def keep_clips(self, wanted):
        """wanted: {old name: new name}; the other clips go."""
        anims = []
        for a in self.doc.get("animations", []):
            if a.get("name") in wanted:
                a["name"] = wanted[a["name"]]
                anims.append(a)
        self.doc["animations"] = anims
        for a in anims:
            used = sorted({c["sampler"] for c in a["channels"]})
            remap = {old: new for new, old in enumerate(used)}
            a["samplers"] = [a["samplers"][i] for i in used]
            for c in a["channels"]:
                c["sampler"] = remap[c["sampler"]]

    def drop_meshes(self, names):
        """Takes the meshes off the nodes named (or of a mesh named) in names."""
        for node in self.doc.get("nodes", []):
            mesh = node.get("mesh")
            mname = self.doc["meshes"][mesh].get("name") if mesh is not None else None
            if node.get("name") in names or mname in names:
                node.pop("mesh", None)
                node.pop("skin", None)

    def images_of(self, pattern):
        """The images the materials whose names match pattern use."""
        import re
        out = set()
        for m in self.doc.get("materials", []):
            if not re.search(pattern, m.get("name", "")):
                continue
            slots = [v for k, v in m.items() if k.endswith("Texture")]
            slots += [v for k, v in (m.get("pbrMetallicRoughness") or {}).items() if k.endswith("Texture")]
            for s in slots:
                out.add(self.doc["textures"][s["index"]]["source"])
        return out

    def resize_images(self, most=1024, quality=86, smaller=None):
        """Images at most `most` pixels a side (or smaller: {image: pixels});
        JPEG, but PNG (256 colours) where the material is see-through."""
        alpha = set()
        for m in self.doc.get("materials", []):
            if m.get("alphaMode") in ("BLEND", "MASK"):
                t = (m.get("pbrMetallicRoughness") or {}).get("baseColorTexture")
                if t is not None:
                    alpha.add(self.doc["textures"][t["index"]]["source"])
        for i, img in enumerate(self.doc.get("images", [])):
            if "bufferView" not in img:
                continue
            raw, _ = self.image_bytes(i)
            im = Image.open(io.BytesIO(raw))
            im.load()
            w, h = im.size
            scale = min(1.0, (smaller or {}).get(i, most) / max(w, h))
            if scale < 1:
                im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
            out = io.BytesIO()
            if i in alpha:
                im.convert("RGBA").quantize(256, method=Image.FASTOCTREE).save(out, "PNG", optimize=True)
                self.new_images[i] = (out.getvalue(), "image/png")
            else:
                im.convert("RGB").save(out, "JPEG", quality=quality, optimize=True)
                self.new_images[i] = (out.getvalue(), "image/jpeg")

    # ------------------------------------------------------------ writing
    def write(self, path):
        doc = self.doc
        used_mesh = sorted({n["mesh"] for n in doc.get("nodes", []) if "mesh" in n})
        mesh_map = {old: new for new, old in enumerate(used_mesh)}
        doc["meshes"] = [doc["meshes"][i] for i in used_mesh]
        for n in doc.get("nodes", []):
            if "mesh" in n:
                n["mesh"] = mesh_map[n["mesh"]]

        used_acc, used_mat = set(), set()
        for mesh in doc["meshes"]:
            for prim in mesh["primitives"]:
                used_acc.update(prim["attributes"].values())
                if "indices" in prim:
                    used_acc.add(prim["indices"])
                for t in prim.get("targets", []):
                    used_acc.update(t.values())
                if "material" in prim:
                    used_mat.add(prim["material"])
        for skin in doc.get("skins", []):
            if "inverseBindMatrices" in skin:
                used_acc.add(skin["inverseBindMatrices"])
        for a in doc.get("animations", []):
            for s in a["samplers"]:
                used_acc.update((s["input"], s["output"]))

        mat_ids = sorted(used_mat)
        mat_map = {old: new for new, old in enumerate(mat_ids)}
        if "materials" in doc:
            doc["materials"] = [doc["materials"][i] for i in mat_ids]
            for mesh in doc["meshes"]:
                for prim in mesh["primitives"]:
                    if "material" in prim:
                        prim["material"] = mat_map[prim["material"]]

        holders = []
        for m in doc.get("materials", []):
            for key, val in m.items():
                if key.endswith("Texture"):
                    holders.append(val)
                elif key == "pbrMetallicRoughness":
                    holders += [v for k, v in val.items() if k.endswith("Texture")]
                elif key == "extensions":
                    for ev in val.values():
                        if isinstance(ev, dict):
                            holders += [v for k, v in ev.items() if k.endswith("Texture")]
        tex_ids = sorted({h["index"] for h in holders})
        tex_map = {old: new for new, old in enumerate(tex_ids)}
        for h in holders:
            h["index"] = tex_map[h["index"]]
        if "textures" in doc:
            doc["textures"] = [doc["textures"][i] for i in tex_ids]
            if not doc["textures"]:
                del doc["textures"]
        img_ids = sorted({t["source"] for t in doc.get("textures", []) if "source" in t})
        img_map = {old: new for new, old in enumerate(img_ids)}
        samp_ids = sorted({t["sampler"] for t in doc.get("textures", []) if "sampler" in t})
        samp_map = {old: new for new, old in enumerate(samp_ids)}
        for t in doc.get("textures", []):
            if "source" in t:
                t["source"] = img_map[t["source"]]
            if "sampler" in t:
                t["sampler"] = samp_map[t["sampler"]]
        if "samplers" in doc:
            doc["samplers"] = [doc["samplers"][i] for i in samp_ids]
            if not doc["samplers"]:
                del doc["samplers"]

        out, views = bytearray(), []

        def add(raw, extra):
            while len(out) % 4:
                out.append(0)
            v = {"buffer": 0, "byteOffset": len(out), "byteLength": len(raw)}
            v.update(extra)
            out.extend(raw)
            views.append(v)
            return len(views) - 1

        acc_ids = sorted(used_acc)
        acc_map = {old: new for new, old in enumerate(acc_ids)}
        accessors = []
        for old in acc_ids:
            acc = dict(doc["accessors"][old])
            if "bufferView" in acc:
                src = doc["bufferViews"][acc["bufferView"]]
                extra = {"target": src["target"]} if "target" in src else {}
                elem = SIZE[acc["componentType"]] * TYPE[acc["type"]]
                stride = src.get("byteStride") or elem
                start = src.get("byteOffset", 0) + acc.get("byteOffset", 0)
                if stride == elem:
                    raw = bytes(self.blob[start:start + acc["count"] * elem])
                else:
                    raw = b"".join(bytes(self.blob[start + k * stride:start + k * stride + elem])
                                   for k in range(acc["count"]))
                acc["bufferView"] = add(raw, extra)
                acc.pop("byteOffset", None)
            accessors.append(acc)
        doc["accessors"] = accessors
        for mesh in doc["meshes"]:
            for prim in mesh["primitives"]:
                prim["attributes"] = {k: acc_map[v] for k, v in prim["attributes"].items()}
                if "indices" in prim:
                    prim["indices"] = acc_map[prim["indices"]]
                if "targets" in prim:
                    prim["targets"] = [{k: acc_map[v] for k, v in t.items()} for t in prim["targets"]]
        for skin in doc.get("skins", []):
            if "inverseBindMatrices" in skin:
                skin["inverseBindMatrices"] = acc_map[skin["inverseBindMatrices"]]
        for a in doc.get("animations", []):
            for s in a["samplers"]:
                s["input"] = acc_map[s["input"]]
                s["output"] = acc_map[s["output"]]

        old_images = doc.get("images", [])
        images = []
        for old in img_ids:
            img = dict(old_images[old])
            raw, mime = self.new_images.get(old) or self.image_bytes(old)
            img["bufferView"] = add(raw, {})
            img["mimeType"] = mime
            img.pop("uri", None)
            images.append(img)
        if images:
            doc["images"] = images
        else:
            doc.pop("images", None)
        while len(out) % 4:
            out.append(0)
        doc["bufferViews"] = views
        doc["buffers"] = [{"byteLength": len(out)}]
        text = json.dumps(doc, separators=(",", ":")).encode("utf-8")
        while len(text) % 4:
            text += b" "
        data = (struct.pack("<III", 0x46546C67, 2, 28 + len(text) + len(out)) +
                struct.pack("<II", len(text), JSON_CHUNK) + text + struct.pack("<II", len(out), BIN_CHUNK) + bytes(out))
        with open(path, "wb") as f:
            f.write(data)
        self.blob, self.new_images = out, {}
        return len(data)
