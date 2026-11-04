"""Blender (4.2): a Microsoft Rocketbox avatar, or one of Rocketbox's clips,
as a glTF file for check/make_rocketbox.py.

    blender -b --python check/rocketbox_blend.py -- avatar AVATAR.fbx TEXTURES_DIR OUT.glb
    blender -b --python check/rocketbox_blend.py -- clip CLIP.fbx NAME OUT.glb HIPS [IDLE.fbx]

avatar: the model at rest, its skeleton named Bip01 (the children's is
Bip02), its textures from its own folder, no clip; prints its hip height
("HIPS"), the height of the root of a Biped.

clip: the clip on its own skeleton, as an animation named NAME. glTF keeps
every bone's turn from its parent, as 3ds Max does, so check/make_rocketbox.py
can give the turns to the avatar bone by bone (in Blender a pose is a turn
from the bone's own rest, which differs between the clip's skeleton and the
avatar's). The clips were made on a grown-up: the root's motion (its height,
rise and fall, sway) is scaled by HIPS over the clip's hip height (the mean
height of the root in IDLE, or in the clip itself), so that a child's
shorter legs reach the floor. A walk or a run goes forward in its file
(motion extracted to the floor, "xy"): how far it goes is printed
("TRAVEL", at the avatar's size), and the forward and sideways travel is
taken out (the game moves the character itself); the rise and fall of each
step is kept.
"""
import os
import re
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1:]
MODE = argv[0]
FPS = 30

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps = FPS


def imported(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False, ignore_leaf_bones=False,
                             use_anim=True, anim_offset=1.0)
    return [o for o in bpy.data.objects if o not in before]


def root_heights(path):
    """The heights of the root over a clip's file."""
    objs = imported(path)
    arm = next(o for o in objs if o.type == "ARMATURE")
    fc = [f for f in arm.animation_data.action.fcurves if f.data_path == "location" and f.array_index == 2][0]
    zs = [k.co[1] for k in fc.keyframe_points]
    for o in objs:
        bpy.data.objects.remove(o, do_unlink=True)
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    return zs


if MODE == "avatar":
    AVATAR, TEX, OUT = argv[1], argv[2], argv[3]
    objs = imported(AVATAR)
    arm = next(o for o in objs if o.type == "ARMATURE")
    for o in objs:
        if o.type == "EMPTY":
            bpy.data.objects.remove(o, do_unlink=True)
    for b in arm.data.bones:
        b.name = re.sub(r"^Bip0\d", "Bip01", b.name)
    arm.name = "Bip01"
    arm.data.name = "Bip01"
    for mesh in [o for o in bpy.data.objects if o.type == "MESH"]:
        for vg in mesh.vertex_groups:
            vg.name = re.sub(r"^Bip0\d", "Bip01", vg.name)
    print("HIPS %.6f" % arm.location.z)
    if arm.animation_data:
        arm.animation_data.action = None
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    for im in bpy.data.images:
        name = os.path.basename(im.filepath.replace("\\", "/"))
        path = os.path.join(TEX, name)
        if os.path.exists(path):
            im.filepath = path
            im.reload()
        else:
            print("MISSING TEXTURE", name)
    # a skin, not plastic: no specular shine from the Max materials
    for mat in bpy.data.materials:
        if mat.use_nodes:
            for n in mat.node_tree.nodes:
                if n.type == "BSDF_PRINCIPLED":
                    n.inputs["Roughness"].default_value = 0.75
                    if "Specular IOR Level" in n.inputs:
                        for link in list(n.inputs["Specular IOR Level"].links):
                            mat.node_tree.links.remove(link)
                        n.inputs["Specular IOR Level"].default_value = 0.25
                    n.inputs["Metallic"].default_value = 0.0
    bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_yup=True, export_skins=True,
                              export_animations=False, export_image_format="AUTO", export_morph=False,
                              export_apply=False)
else:
    CLIP, NAME, OUT, HIPS = argv[1], argv[2], argv[3], float(argv[4])
    zs = root_heights(argv[5] if len(argv) > 5 else CLIP)
    scale = HIPS / (sum(zs) / len(zs))
    objs = imported(CLIP)
    arm = next(o for o in objs if o.type == "ARMATURE")
    for o in objs:
        if o is not arm:
            bpy.data.objects.remove(o, do_unlink=True)
    act = arm.animation_data.action
    act.name = NAME
    for a in list(bpy.data.actions):
        if a is not act:
            bpy.data.actions.remove(a)
    loc = {fc.array_index: fc for fc in act.fcurves if fc.data_path == "location"}
    for fc in loc.values():
        for k in fc.keyframe_points:
            k.co[1] *= scale
            k.handle_left[1] *= scale
            k.handle_right[1] *= scale
        fc.update()
    print("SCALE %.5f" % scale)
    if NAME in ("walk", "run"):
        sc = bpy.context.scene
        ends = []
        for fr in (act.frame_range[0], act.frame_range[1]):
            sc.frame_set(int(fr))
            ends.append(arm.matrix_world @ arm.pose.bones["Bip01 Pelvis"].head)
        travel = ((ends[1].x - ends[0].x) ** 2 + (ends[1].y - ends[0].y) ** 2) ** 0.5
        print("TRAVEL %s %.6f" % (NAME, travel))
        for i in (0, 1):
            kp = loc[i].keyframe_points
            first, last = kp[0].co[1], kp[-1].co[1]
            t0, t1 = kp[0].co[0], kp[-1].co[0]
            for k in kp:
                shift = (last - first) * ((k.co[0] - t0) / (t1 - t0) if t1 > t0 else 0)
                k.co[1] -= shift
                k.handle_left[1] -= shift
                k.handle_right[1] -= shift
            loc[i].update()
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_yup=True, export_skins=False,
                              export_animations=True, export_animation_mode="ACTIVE_ACTIONS",
                              export_force_sampling=True, export_frame_step=1, export_optimize_animation_size=False,
                              export_morph=False, export_apply=False)
print("WROTE", os.path.getsize(OUT))
