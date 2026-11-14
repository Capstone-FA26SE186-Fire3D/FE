"""Author the "firefighter carries a child" pose for the landing and write it as carry-pose.json.

The pose is built in Blender on the two real bodies (FirefighterNam and NpcBoy GLBs), checked by eye with renders,
and stored the same way the Unity clips are: per bone, the rotation relative to the rest pose in model space, so
it applies to the body whatever its bone axes are. The child's place is stored relative to the carrier.

Run inside a live Blender (5.x) session, for example through the Blender MCP:

    import sys; sys.path[:0] = [r"<workspace>/FE/scripts", r"<workspace>/Unity/Tools/CharacterHands"]
    import importlib, build_landing_carry as C; importlib.reload(C)
    C.build()          # poses both bodies, renders checks, writes public/models/landing/carry-pose.json

Blender axes: the bodies face -Y, their left is +X, up is +Z. glTF axes: (x, z, -y).
"""
import json
import math
import os

import bpy
from mathutils import Matrix, Quaternion, Vector

WORKSPACE = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
MODELS = os.path.join(WORKSPACE, "FE", "public", "models", "landing")
CHECKS = os.path.join(WORKSPACE, "artifacts", "characters", "landing", "_checks")
CARRIER, CHILD, CHILD_SCALE = "FirefighterNam", "NpcBoy", 0.72


def _window():
    return bpy.context.window_manager.windows[0]


def _load(name):
    before = set(bpy.data.objects)
    win = _window()
    with bpy.context.temp_override(window=win, scene=win.scene, view_layer=win.view_layer):
        bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, name + ".glb"))
    new = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in new if o.type == "ARMATURE")
    mesh = next(o for o in new if o.type == "MESH")
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
    return arm, mesh


def _head(arm, name):
    return arm.matrix_world @ arm.pose.bones[name].head


def _turn(arm, name, rotation):
    """Turns a bone (and its children) by a world-space rotation about its own head."""
    pb = arm.pose.bones[name]
    world = arm.matrix_world @ pb.matrix
    pivot = world.translation.copy()
    turned = Matrix.Translation(pivot) @ rotation.to_matrix().to_4x4() @ Matrix.Translation(-pivot) @ world
    pb.matrix = arm.matrix_world.inverted() @ turned
    bpy.context.view_layer.update()


def aim(arm, name, child, direction):
    """Points the segment from bone `name` to its child joint along a world direction, with the least twist."""
    current = (_head(arm, child) - _head(arm, name)).normalized()
    _turn(arm, name, current.rotation_difference(Vector(direction).normalized()))


def twist(arm, name, child, degrees):
    axis = (_head(arm, child) - _head(arm, name)).normalized()
    _turn(arm, name, Quaternion(axis, math.radians(degrees)))


PALM_SIGN = {}


def palm_normal(arm, side):
    """The way the palm faces. Its sign is fixed once per body on the rest pose, where the palms face the ground."""
    along = (_head(arm, f"CC_Base_{side}_Mid1") - _head(arm, f"CC_Base_{side}_Hand")).normalized()
    across = (_head(arm, f"CC_Base_{side}_Pinky1") - _head(arm, f"CC_Base_{side}_Index1")).normalized()
    normal = along.cross(across).normalized()
    key = (arm.name, side)
    if key not in PALM_SIGN:
        PALM_SIGN[key] = 1.0 if normal.z < 0 else -1.0
    return normal * PALM_SIGN[key]


def face_palm(arm, side, target):
    """Rolls the hand about its own length until the palm faces `target`; the roll is spread up the forearm."""
    axis = (_head(arm, f"CC_Base_{side}_Hand") - _head(arm, f"CC_Base_{side}_Forearm")).normalized()
    flat = lambda v: (v - axis * v.dot(axis)).normalized()
    now, want = flat(palm_normal(arm, side)), flat(Vector(target).normalized())
    angle = math.atan2(now.cross(want).dot(axis), now.dot(want))
    for name, share in ((f"CC_Base_{side}_ForearmTwist01", 0.33), (f"CC_Base_{side}_ForearmTwist02", 0.66), (f"CC_Base_{side}_Hand", 1.0)):
        if name in arm.pose.bones:
            _turn(arm, name, Quaternion(axis, angle * share))
    return round(math.degrees(angle), 1)


def curl(arm, side, amount):
    """Closes the fingers of one hand (radians per joint) towards the palm."""
    normal = palm_normal(arm, side)
    for finger in ("Index", "Mid", "Ring", "Pinky"):
        for joint in (1, 2, 3):
            name = f"CC_Base_{side}_{finger}{joint}"
            nxt = f"CC_Base_{side}_{finger}{joint + 1}"
            if name not in arm.pose.bones:
                continue
            a = _head(arm, name)
            b = _head(arm, nxt) if nxt in arm.pose.bones else arm.matrix_world @ arm.pose.bones[name].tail
            along = (b - a).normalized()
            # turning about (finger x palm normal) brings the finger tip towards the palm side
            _turn(arm, name, Quaternion(along.cross(normal).normalized(), amount))
            normal = palm_normal(arm, side) if joint == 1 and finger == "Index" else normal


def shots(objects, tag, views=("front", "side", "quarter", "top")):
    scene = _window().scene
    centre = Vector((0, -0.15, 1.05))
    data = bpy.data.cameras.new("TMP_cam")
    data.type = "ORTHO"
    data.ortho_scale = 2.1
    cam = bpy.data.objects.new("TMP_cam", data)
    scene.collection.objects.link(cam)
    prev = (scene.render.engine, scene.camera, scene.render.resolution_x, scene.render.resolution_y, scene.render.filepath)
    scene.camera = cam
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "TEXTURE"
    scene.render.resolution_x, scene.render.resolution_y = 520, 620
    os.makedirs(CHECKS, exist_ok=True)
    offsets = {"front": Vector((0, -1, 0)), "side": Vector((-1, 0, 0)), "left": Vector((1, 0, 0)), "quarter": Vector((-0.7, -0.7, 0.25)), "top": Vector((0, -0.25, 1))}
    files = []
    for view in views:
        cam.location = centre + offsets[view].normalized() * 4
        cam.rotation_euler = (centre - cam.location).normalized().to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(CHECKS, f"{tag}_{view}.png")
        bpy.ops.render.render(write_still=True)
        files.append(scene.render.filepath)
    scene.render.engine, scene.camera, scene.render.resolution_x, scene.render.resolution_y, scene.render.filepath = prev
    bpy.data.objects.remove(cam)
    bpy.data.cameras.remove(data)
    return files


def _deltas(arm, model):
    """Rotation of every posed bone relative to its rest pose, in the body's model space (`model` is the armature's
    orientation in that space, as loaded), in glTF axes."""
    out = {}
    for pb in arm.pose.bones:
        rest = model @ pb.bone.matrix_local.to_3x3().normalized()
        posed = model @ pb.matrix.to_3x3().normalized()
        q = (posed @ rest.inverted()).to_quaternion()
        if abs(q.w) > 0.99999:
            continue
        # Blender (x, y, z) -> glTF (x, z, -y)
        out[pb.name] = [round(q.x, 5), round(q.z, 5), round(-q.y, 5), round(q.w, 5)]
    return out


def build(write=True, tag="carry"):
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)
    bpy.ops.outliner.orphans_purge(do_local_ids=True, do_recursive=True)
    man, man_mesh = _load(CARRIER)
    kid, kid_mesh = _load(CHILD)
    bpy.context.view_layer.update()
    man_loaded, kid_loaded = man.matrix_world.copy(), kid.matrix_world.copy()
    report = {"armature_scale": [round(man_loaded.to_scale()[0], 4), round(kid_loaded.to_scale()[0], 4)]}

    # How far the carrier's body reaches forward at arm height: the child lies just in front of it.
    world = man_mesh.matrix_world
    belly = min((world @ v.co).y for v in man_mesh.data.vertices if 0.95 < (world @ v.co).z < 1.3 and abs((world @ v.co).x) < 0.15)
    shoulder_l, shoulder_r = _head(man, "CC_Base_L_Upperarm"), _head(man, "CC_Base_R_Upperarm")
    report["belly_front_y"] = round(belly, 3)
    report["shoulders"] = [[round(c, 3) for c in shoulder_l], [round(c, 3) for c in shoulder_r]]
    for body in (man, kid):
        for side in ("L", "R"):
            palm_normal(body, side)                # fixes the palm sign on the rest pose
    front = belly - 0.07           # the line the child's spine lies on: against the chest
    hold = 1.1                     # height of the forearms

    # Carrier: upper arms forward and down, forearms right under the child from near side to far side, the hands
    # palm up beyond it with the fingers closing up round its far side.
    for side, sx in (("L", 1), ("R", -1)):
        shoulder = _head(man, f"CC_Base_{side}_Upperarm")
        height = hold + (0.06 if side == "L" else 0.0)     # the left arm carries the back, a little higher
        elbow = Vector((sx * (abs(shoulder.x) + 0.1), shoulder.y - 0.17, height - 0.02))
        hand = Vector((sx * 0.1, front - 0.19, height - 0.03))
        aim(man, f"CC_Base_{side}_Upperarm", f"CC_Base_{side}_Forearm", elbow - shoulder)
        aim(man, f"CC_Base_{side}_Forearm", f"CC_Base_{side}_Hand", hand - _head(man, f"CC_Base_{side}_Forearm"))
        aim(man, f"CC_Base_{side}_Hand", f"CC_Base_{side}_Mid1", Vector((-sx * 0.35, -0.45, 0.82)))
        report[f"carrier_palm_{side}"] = face_palm(man, side, Vector((-sx * 0.2, 0.75, 0.6)))
        curl(man, side, 0.55)
        report[f"carrier_hand_{side}"] = [round(c, 3) for c in _head(man, f"CC_Base_{side}_Hand")]
    # A slight lean back balances the load; the head turns down to the child.
    _turn(man, "CC_Base_Spine01", Quaternion(Vector((1, 0, 0)), math.radians(-5)))
    _turn(man, "CC_Base_Head", Quaternion(Vector((1, 0, 0)), math.radians(14)) @ Quaternion(Vector((0, 0, 1)), math.radians(12)))

    # Child: lying across the forearms, head towards the carrier's left shoulder, knees over the right forearm.
    spine = Vector((0.83, 0.0, 0.56)).normalized()                 # hips -> head
    face = (Vector((-0.56, 0.0, 0.83)) * 0.92 + Vector((0, -1, 0)) * 0.4).normalized()   # where the chest faces
    face = (face - spine * face.dot(spine)).normalized()
    side_axis = (-face).cross(spine).normalized()                  # the child's own +X (its left): X = Y x Z
    basis = Matrix((side_axis, -face, spine)).transposed()         # columns: child X, Y (back), Z (up)
    hips_rest = (kid.matrix_world @ kid.pose.bones["CC_Base_Hip"].head) * CHILD_SCALE
    hips_at = Vector((-0.02, front - 0.02, hold + 0.07))
    # `place` takes the child's model space (as loaded) to where it lies in the carrier's.
    place = Matrix.Translation(hips_at - basis @ hips_rest) @ basis.to_4x4() @ Matrix.Scale(CHILD_SCALE, 4)
    kid.matrix_world = place @ kid_loaded
    bpy.context.view_layer.update()
    for side, sx in (("L", 1), ("R", -1)):
        # legs: thighs over the right forearm, shins hanging
        aim(kid, f"CC_Base_{side}_Thigh", f"CC_Base_{side}_Calf", Vector((-0.86, -0.06 - 0.05 * sx, 0.42)))
        aim(kid, f"CC_Base_{side}_Calf", f"CC_Base_{side}_Foot", Vector((-0.28, -0.03, -0.96)))
    # arms: down along the body, forearms across the belly, palms on it, fingers relaxed
    for side, sx in (("L", 1), ("R", -1)):
        aim(kid, f"CC_Base_{side}_Upperarm", f"CC_Base_{side}_Forearm", -spine * 0.9 + face * 0.22 + side_axis * (0.32 * sx))
        aim(kid, f"CC_Base_{side}_Forearm", f"CC_Base_{side}_Hand", -spine * 0.6 + face * 0.4 - side_axis * (0.68 * sx))
        aim(kid, f"CC_Base_{side}_Hand", f"CC_Base_{side}_Mid1", -spine * 0.6 + face * 0.1 - side_axis * (0.8 * sx))
        report[f"child_palm_{side}"] = face_palm(kid, side, -face)
        curl(kid, side, 0.4)
    # the head rests towards the carrier's chest
    _turn(kid, "CC_Base_Head", Quaternion(spine, math.radians(-20)) @ Quaternion(side_axis, math.radians(-12)))

    report["files"] = shots([man_mesh, kid_mesh], tag)
    if write:
        # child's model space relative to the carrier's, glTF axes (x, z, -y), as position + quaternion + scale
        loc, rot, scale = place.decompose()
        data = {
            "carrier": CARRIER, "child": CHILD, "childScale": CHILD_SCALE,
            "carrierBones": _deltas(man, man_loaded.to_3x3().normalized()), "childBones": _deltas(kid, kid_loaded.to_3x3().normalized()),
            "childPosition": [round(loc.x, 4), round(loc.z, 4), round(-loc.y, 4)],
            "childRotation": [round(rot.x, 5), round(rot.z, 5), round(-rot.y, 5), round(rot.w, 5)],
        }
        path = os.path.join(MODELS, "carry-pose.json")
        json.dump(data, open(path, "w", encoding="utf-8"), separators=(",", ":"))
        report["json_kb"] = round(os.path.getsize(path) / 1024, 1)
        report["bones"] = [len(data["carrierBones"]), len(data["childBones"])]
    return report
