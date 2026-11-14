"""Export the landing cast (AccuRig bodies) to web GLB.

Run inside a live Blender (5.x) session, for example through the Blender MCP:

    import sys; sys.path[:0] = [r"<workspace>/FE/scripts", r"<workspace>/Unity/Tools/CharacterHands"]
    import importlib, export_landing_cast as X; importlib.reload(X)
    X.game("PlayerMale")            # a body the Unity project already repaired
    X.landing("FirefighterKiet")    # a landing-only body straight from AccuRig

Game bodies come from Unity/Assets/_Fire3D/Art/Characters/<Name>/<Name>.fbx (hands, palms and atlas already repaired
by Unity/Tools/CharacterHands). Landing-only bodies come from artifacts/characters and get the same repair here.
Every GLB is a skinned mesh in T-pose with one JPEG atlas and no animation; clips live in animations.glb
(build-landing-animations.py).
"""
import os

import bpy
from mathutils import Matrix

import atlas_fix
import hand_batch as B
import hand_fix as H

WORKSPACE = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
ART = os.path.join(WORKSPACE, "artifacts", "characters")
UNITY = os.path.join(WORKSPACE, "Unity", "Assets", "_Fire3D", "Art", "Characters")
OUT = os.path.join(WORKSPACE, "FE", "public", "models", "landing")

# Landing-only bodies: folder under artifacts/characters and the AccuRig file in it.
LANDING = {
    "FirefighterBao": ("Firefighter", "baoc"),
    "FirefighterKiet": ("landing/FirefighterKiet", "kiet"),
    "FirefighterLoc": ("landing/FirefighterLoc", "loc"),
    "FirefighterNam": ("landing/FirefighterNam", "nam"),
    "CasualBlackShirt": ("landing/CasualBlackShirt", "hbao"),
    "CasualBlueTee": ("landing/CasualBlueTee", "dang"),
    "CasualNavyPolo": ("landing/CasualNavyPolo", "tu"),
    "CasualWhitePolo": ("landing/CasualWhitePolo", "phuong"),
}


def _window():
    return bpy.context.window_manager.windows[0]


def _shrink(size):
    for image in bpy.data.images:
        if image.type == "IMAGE" and max(image.size) > size:
            ratio = size / max(image.size)
            image.scale(int(image.size[0] * ratio), int(image.size[1] * ratio))


def _decimate(mesh, triangles):
    count = sum(len(p.vertices) - 2 for p in mesh.data.polygons)
    if count <= triangles:
        return count
    win = _window()
    mod = mesh.modifiers.new("Decimate", "DECIMATE")
    mod.ratio = triangles / count
    with bpy.context.temp_override(window=win, scene=win.scene, view_layer=win.view_layer):
        bpy.ops.object.select_all(action="DESELECT")
        mesh.select_set(True)
        bpy.context.view_layer.objects.active = mesh
        # the decimate must come before the armature in the stack
        bpy.ops.object.modifier_move_to_index(modifier=mod.name, index=0)
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return sum(len(p.vertices) - 2 for p in mesh.data.polygons)


def _export(name, arm, mesh, texture, triangles):
    rep = {"tris_in": sum(len(p.vertices) - 2 for p in mesh.data.polygons)}
    rep["tris"] = _decimate(mesh, triangles)
    for p in mesh.data.polygons:
        p.use_smooth = True
    _shrink(texture)
    arm.name = name
    mesh.name = name + "_mesh"
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name + ".glb")
    win = _window()
    with bpy.context.temp_override(window=win, scene=win.scene, view_layer=win.view_layer):
        bpy.ops.object.select_all(action="DESELECT")
        arm.select_set(True)
        mesh.select_set(True)
        bpy.context.view_layer.objects.active = arm
        bpy.ops.export_scene.gltf(
            filepath=path, export_format="GLB", use_selection=True, export_image_format="JPEG", export_jpeg_quality=80,
            export_yup=True, export_apply=False, export_cameras=False, export_lights=False, export_animations=False,
            export_skins=True, export_morph=False, export_all_influences=False)
    rep["kb"] = os.path.getsize(path) // 1024
    zs = [(mesh.matrix_world @ v.co).z for v in mesh.data.vertices]
    rep["height"] = round(max(zs) - min(zs), 3)
    return rep


def game(name, texture=1024, triangles=14000):
    """A body the Unity project already repaired: FBX -> GLB."""
    arm, mesh = H.load(os.path.join(UNITY, name, name + ".fbx").replace("\\", "/"))
    return _export(name, arm, mesh, texture, triangles)


def _apply_pose_as_rest(arm, mesh):
    win = _window()
    with bpy.context.temp_override(window=win, scene=win.scene, view_layer=win.view_layer):
        bpy.ops.object.select_all(action="DESELECT")
        mesh.select_set(True)
        bpy.context.view_layer.objects.active = mesh
        bpy.ops.object.modifier_apply(modifier=mesh.modifiers[0].name)
        mesh.select_set(False)
        arm.select_set(True)
        bpy.context.view_layer.objects.active = arm
        bpy.ops.object.mode_set(mode="POSE")
        bpy.ops.pose.armature_apply(selected=False)
        bpy.ops.object.mode_set(mode="OBJECT")
    mod = mesh.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    bpy.context.view_layer.update()


def shots(arm, mesh, out, tag, views=("side", "front")):
    """Orthographic full-body renders for checking by eye; returns the file paths."""
    from mathutils import Vector
    scene = _window().scene
    zs = [(mesh.matrix_world @ v.co).z for v in mesh.data.vertices]
    centre = Vector((0, 0, (max(zs) + min(zs)) / 2))
    data = bpy.data.cameras.new("TMP_cam")
    data.type = "ORTHO"
    data.ortho_scale = (max(zs) - min(zs)) * 1.15
    cam = bpy.data.objects.new("TMP_cam", data)
    scene.collection.objects.link(cam)
    prev = (scene.render.engine, scene.camera, scene.render.resolution_x, scene.render.resolution_y, scene.render.filepath)
    scene.camera = cam
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "TEXTURE"
    scene.render.resolution_x, scene.render.resolution_y = 420, 640
    files = []
    offsets = {"side": Vector((1, 0, 0)), "front": Vector((0, -1, 0)), "back": Vector((0, 1, 0)), "quarter": Vector((0.7, -0.7, 0.15)), "top": Vector((0, -0.2, 1))}
    for view in views:
        cam.location = centre + offsets[view] * 4
        cam.rotation_euler = (centre - cam.location).normalized().to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(out, f"{tag}_{view}.png")
        bpy.ops.render.render(write_still=True)
        files.append(scene.render.filepath)
    scene.render.engine, scene.camera, scene.render.resolution_x, scene.render.resolution_y, scene.render.filepath = prev
    bpy.data.objects.remove(cam)
    bpy.data.cameras.remove(data)
    return files


def prepare(name):
    """A landing-only body from AccuRig: repair hands, T-pose as rest, palms down. No export."""
    folder, source = LANDING[name]
    arm, mesh = H.load(os.path.join(ART, folder, source + ".fbx").replace("\\", "/"))
    rep = {"hands": H.fix_hands(arm, mesh)}
    mesh.matrix_parent_inverse = Matrix.Identity(4)
    mesh.matrix_basis = Matrix.Identity(4)
    if mesh.data.shape_keys:
        mesh.shape_key_clear()
    _apply_pose_as_rest(arm, mesh)
    win = _window()
    with bpy.context.temp_override(window=win, scene=win.scene, view_layer=win.view_layer):
        bpy.ops.object.select_all(action="DESELECT")
        mesh.select_set(True)
        bpy.context.view_layer.objects.active = mesh
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    rep["resize"] = B.resize_hands(arm, mesh)
    rep["palm"] = B.turn_palms(arm, mesh)
    return arm, mesh, rep


def landing(name, texture=1024, triangles=14000):
    """A landing-only body from AccuRig, repaired (see prepare), with a new atlas -> GLB."""
    folder, _ = LANDING[name]
    arm, mesh, rep = prepare(name)
    atlas = os.path.join(ART, folder, "textures", name + "_atlas.jpg")
    rep["atlas"] = atlas_fix.rebake(mesh, atlas, size=2048)
    rep.update(_export(name, arm, mesh, texture, triangles))
    return rep
