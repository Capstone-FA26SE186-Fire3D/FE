"""Export the FET3D Mixamo characters to web GLB for the landing lab.

Run headless (Blender 4.2+):
  blender --background --python FE/scripts/export-landing-characters.py -- <mixamo-dir> <out-dir>

Writes <out-dir>/<Character>.glb (skinned mesh, textures downscaled to 1024 JPEG,
no animation) and <out-dir>/animations.glb (shared Mixamo skeleton + clips).
The three characters share the Mixamo standard skeleton, so one clip set drives all.
"""
import os
import sys

import bpy

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
SRC = args[0] if args else r"D:\MyProject\Capstone-FA26SE186-FET3D\artifacts\characters\mixamo"
OUT = args[1] if len(args) > 1 else r"D:\MyProject\Capstone-FA26SE186-FET3D\FE\public\models\landing"
os.makedirs(OUT, exist_ok=True)
LOG = open(os.path.join(OUT, "export.log"), "w", encoding="utf-8")


def log(*parts):
    LOG.write(" ".join(str(p) for p in parts) + "\n")
    LOG.flush()


CHARACTERS = ["PlayerMale", "PlayerFemale", "NpcWorker"]
# "WalkSource" is the steady part of Mixamo "Start Walking" (looped at runtime): it was downloaded with the PlayerMale
# skeleton, unlike Walking.fbx whose arm deltas collapse the arms into the torso on this rest pose.
CLIPS = {"Idle": "PlayerMale@Idle.fbx", "WalkSource": "PlayerMale@Start Walking.fbx", "Jog": "PlayerMale@Jogging.fbx", "Terrified": "Terrified.fbx"}
TEXTURE_SIZE = 1024


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_fbx(name):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=os.path.join(SRC, name), automatic_bone_orientation=False)
    return [o for o in bpy.data.objects if o not in before]


def armature_of(objects):
    return next((o for o in objects if o.type == "ARMATURE"), None)


def shrink_textures():
    for image in bpy.data.images:
        if image.size[0] > TEXTURE_SIZE or image.size[1] > TEXTURE_SIZE:
            ratio = TEXTURE_SIZE / max(image.size)
            image.scale(int(image.size[0] * ratio), int(image.size[1] * ratio))


def export(path, **kwargs):
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", export_image_format="JPEG", export_jpeg_quality=82,
        export_yup=True, export_apply=False, export_cameras=False, export_lights=False, **kwargs)
    log("wrote", path, os.path.getsize(path), "bytes")


def flatten_root_motion(action, bone="mixamorig:Hips"):
    """Keep vertical bob, remove net travel along the largest horizontal axis."""
    curves = [c for c in action.fcurves if c.data_path.endswith(f'["{bone}"].location')] if hasattr(action, "fcurves") else []
    if not curves:
        return
    net = {c.array_index: c.keyframe_points[-1].co[1] - c.keyframe_points[0].co[1] for c in curves if len(c.keyframe_points) > 1}
    log("  root net", action.name, {k: round(v, 2) for k, v in net.items()})
    for c in curves:
        if abs(net.get(c.array_index, 0)) > 5 and c.array_index != 1:
            start = c.keyframe_points[0].co[1]
            for k in c.keyframe_points:
                k.co[1] = start
                k.handle_left[1] = start
                k.handle_right[1] = start
            c.update()


# 1) characters without animation
for character in CHARACTERS:
    reset()
    objects = import_fbx(f"{character}.fbx")
    arm = armature_of(objects)
    meshes = [o for o in objects if o.type == "MESH"]
    log(character, "armature", arm.name if arm else None, "meshes", [(m.name, len(m.data.polygons)) for m in meshes], "bones", len(arm.data.bones) if arm else 0)
    for obj in bpy.data.objects:
        if obj.animation_data:
            obj.animation_data_clear()
    shrink_textures()
    export(os.path.join(OUT, f"{character}.glb"), export_animations=False, export_skins=True)

# 2) shared animation clips on the PlayerMale skeleton
reset()
objects = import_fbx("PlayerMale.fbx")
host = armature_of(objects)
for obj in list(objects):
    if obj.type == "MESH":
        bpy.data.objects.remove(obj, do_unlink=True)
if host.animation_data:
    host.animation_data_clear()
host.animation_data_create()
for clip, filename in CLIPS.items():
    imported = import_fbx(filename)
    src = armature_of(imported)
    action = src.animation_data.action if src and src.animation_data else None
    if action is None:
        log("no action in", filename)
    else:
        action.name = clip
        flatten_root_motion(action)
        track = host.animation_data.nla_tracks.new()
        track.name = clip
        strip = track.strips.new(clip, int(action.frame_range[0]), action)
        strip.name = clip
        log("clip", clip, "frames", tuple(action.frame_range))
    for obj in imported:
        if obj.type != "ARMATURE" or obj is not host:
            if obj.name in bpy.data.objects:
                bpy.data.objects.remove(obj, do_unlink=True)
host.animation_data.action = None
export(os.path.join(OUT, "animations.glb"), export_animations=True, export_animation_mode="NLA_TRACKS", export_force_sampling=True, export_optimize_animation_size=True)
log("done")
LOG.close()
