"""Build public/models/landing/animations.glb from the poses the Unity project recorded.

The Unity project plays its own character states on PlayerMale (Tests/PlayMode/LandingClipBakeTests, run with
FET3D_LANDING_CLIPS=<json>) and writes, per frame and bone, the world rotation relative to the bind pose. A rotation
relative to the bind pose does not depend on how each program orients its bones, so the same numbers pose the
Blender armature once the axes are converted (the conversion is measured from the bind positions, not assumed).

Run inside a live Blender (5.x) session, for example through the Blender MCP:

    import sys; sys.path[:0] = [r"<workspace>/FE/scripts", r"<workspace>/Unity/Tools/CharacterHands"]
    import importlib, build_landing_animations as A; importlib.reload(A)
    A.build()

Output: an armature-only GLB (PlayerMale skeleton in T-pose) with one animation per clip, all in place.
"""
import json
import os

import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector

import hand_fix as H

WORKSPACE = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
CLIPS = os.path.join(WORKSPACE, "artifacts", "characters", "landing-clips.json")
SOURCE = os.path.join(WORKSPACE, "Unity", "Assets", "_Fire3D", "Art", "Characters", "PlayerMale", "PlayerMale.fbx")
OUT = os.path.join(WORKSPACE, "FE", "public", "models", "landing", "animations.glb")


def _axes(unity_points, blender_points):
    """The signed axis permutation that takes Unity world coordinates to Blender's, fitted on the bind positions."""
    u = np.array(unity_points)
    b = np.array(blender_points)
    u -= u.mean(axis=0)
    b -= b.mean(axis=0)
    fit, *_ = np.linalg.lstsq(u, b, rcond=None)
    m = fit.T
    snapped = np.zeros((3, 3))
    for row in range(3):
        col = int(np.argmax(np.abs(m[row])))
        snapped[row, col] = 1.0 if m[row, col] > 0 else -1.0
    error = float(np.abs(b - u @ snapped.T).max())
    return snapped, error


def _quat_matrix(x, y, z, w):
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ])


def build(clips_path=CLIPS, out=OUT):
    data = json.load(open(clips_path, encoding="utf-8"))
    names = data["bones"]
    arm, mesh = H.load(SOURCE.replace("\\", "/"))
    bpy.data.objects.remove(mesh)
    arm.name = "LandingRig"
    world = arm.matrix_world.copy()
    world3 = np.array(world.to_3x3().normalized())
    scale = world.to_scale()[0]
    bones = arm.data.bones
    index = {n: i for i, n in enumerate(names)}
    listed = [n for n in names if n in bones]

    rest_positions = np.array(data["restPositions"]).reshape(-1, 3)
    axes, error = _axes([rest_positions[index[n]] for n in listed], [list(world @ bones[n].head_local) for n in listed])
    report = {"axes": axes.tolist(), "axis_fit_error_m": round(error, 4), "bones": len(listed), "clips": {}}
    assert error < 0.03, f"bind poses differ: {error}"

    order = [b.name for b in bones]  # parents before children
    rest = {n: bones[n].matrix_local.copy() for n in order}
    rest_world3 = {n: world3 @ np.array(rest[n].to_3x3().normalized()) for n in order}
    hips = data["hips"]
    fps = data["fps"]
    scene = bpy.context.window_manager.windows[0].scene
    scene.render.fps = int(fps)
    arm.animation_data_create()
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"

    for clip_name, clip in data["clips"].items():
        frames = clip["frames"]
        rot = np.array(clip["rot"]).reshape(frames, len(names), 4)
        offsets = np.array(clip["hipsOffset"]).reshape(frames, 3)
        action = bpy.data.actions.new(clip_name)
        arm.animation_data.action = action
        last = {}
        for f in range(frames):
            posed = {}
            for n in order:
                parent = bones[n].parent
                base = rest[n] if parent is None else posed[parent.name] @ rest[parent.name].inverted() @ rest[n]
                if n not in index:
                    posed[n] = base
                    continue
                delta = axes @ _quat_matrix(*rot[f, index[n]]) @ axes.T
                target3 = world3.T @ delta @ rest_world3[n]
                target = Matrix(target3.tolist()).to_4x4()
                target.translation = base.translation
                if n == hips:
                    target.translation = base.translation + Vector((world3.T @ (axes @ offsets[f])).tolist()) / scale
                posed[n] = target
                basis = base.inverted() @ target
                q = basis.to_quaternion()
                if n in last and last[n].dot(q) < 0:
                    q.negate()
                last[n] = q
                pb = arm.pose.bones[n]
                pb.rotation_quaternion = q
                pb.keyframe_insert("rotation_quaternion", frame=f)
                if n == hips:
                    pb.location = basis.translation
                    pb.keyframe_insert("location", frame=f)
        track = arm.animation_data.nla_tracks.new()
        track.name = clip_name
        track.strips.new(clip_name, 0, action)
        arm.animation_data.action = None
        report["clips"][clip_name] = frames

    for pb in arm.pose.bones:
        pb.rotation_quaternion = Quaternion()
        pb.location = Vector()
    win = bpy.context.window_manager.windows[0]
    with bpy.context.temp_override(window=win, scene=win.scene, view_layer=win.view_layer):
        bpy.ops.object.select_all(action="DESELECT")
        arm.select_set(True)
        bpy.context.view_layer.objects.active = arm
        bpy.ops.export_scene.gltf(
            filepath=out, export_format="GLB", use_selection=True, export_yup=True, export_cameras=False,
            export_lights=False, export_animations=True, export_animation_mode="NLA_TRACKS", export_force_sampling=True,
            export_optimize_animation_size=True, export_skins=False, export_def_bones=False)
    report["kb"] = os.path.getsize(out) // 1024
    return report
