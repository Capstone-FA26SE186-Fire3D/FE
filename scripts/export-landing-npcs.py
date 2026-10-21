"""Rig the extra (unrigged) FET3D NPC meshes onto the Mixamo skeleton and export web GLBs.

The NPC meshes in artifacts/characters/blender/*.fbx are not rigged yet (Mixamo rigging is pending), so for the landing
lab they are skinned with Blender automatic weights to a height-scaled copy of the NpcWorker Mixamo skeleton. The result
shares bone names with animations.glb, so the same clips drive them. Background-quality only; the production characters
remain the Mixamo-rigged ones used in Unity.

  blender --background --python FE/scripts/export-landing-npcs.py -- <characters-dir> <out-dir>
"""
import os
import sys

import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ROOT = args[0] if args else r"D:\MyProject\Capstone-FA26SE186-FET3D\artifacts\characters"
OUT = args[1] if len(args) > 1 else r"D:\MyProject\Capstone-FA26SE186-FET3D\FE\public\models\landing"
NPCS = ["NpcOfficeMale", "NpcOfficeFemale", "NpcSecurity", "NpcTechnician", "NpcCleaner", "NpcBoy", "NpcGirl"]
TEXTURE_SIZE = 1024
LOG = open(os.path.join(OUT, "export-npcs.log"), "w", encoding="utf-8")


def log(*parts):
    LOG.write(" ".join(str(p) for p in parts) + "\n")
    LOG.flush()


def world_height(objs):
    zs = [(o.matrix_world @ Vector(c)).z for o in objs for c in o.bound_box]
    return max(zs) - min(zs), min(zs)


def import_fbx(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False)
    return [o for o in bpy.data.objects if o not in before]


for name in NPCS:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    try:
        npc = import_fbx(os.path.join(ROOT, "blender", f"{name}.fbx"))
        meshes = [o for o in npc if o.type == "MESH"]
        height, floor = world_height(meshes)
        donor = import_fbx(os.path.join(ROOT, "mixamo", "NpcWorker.fbx"))
        arm = next(o for o in donor if o.type == "ARMATURE")
        donor_meshes = [o for o in donor if o.type == "MESH"]
        donor_height, donor_floor = world_height(donor_meshes)
        ratio = height / donor_height
        arm.scale = arm.scale * ratio
        arm.location.z += floor - donor_floor * ratio
        bpy.context.view_layer.update()
        log(name, "height", round(height, 3), "donor", round(donor_height, 3), "ratio", round(ratio, 3), "meshes", [m.name for m in meshes])
        for o in bpy.data.objects:
            o.select_set(False)
        for m in meshes:
            m.select_set(True)
        arm.select_set(True)
        bpy.context.view_layer.objects.active = arm
        bpy.ops.object.parent_set(type="ARMATURE_AUTO")
        for m in meshes:
            weighted = sum(1 for v in m.data.vertices if any(g.weight > 0.001 for g in v.groups))
            skinned = weighted > len(m.data.vertices) * 0.95 and any(mod.type == "ARMATURE" for mod in m.modifiers)
            log("  skin", m.name, "weighted verts", weighted, "of", len(m.data.vertices), "ok" if skinned else "AUTO WEIGHTS FAILED -> transfer from NpcWorker")
            if skinned:
                continue
            # Heat weighting fails on some meshes: copy the weights of the nearest NpcWorker surface instead.
            m.parent = arm
            m.matrix_parent_inverse = arm.matrix_world.inverted()
            for bone in arm.data.bones:
                if bone.name not in m.vertex_groups:
                    m.vertex_groups.new(name=bone.name)
            transfer = m.modifiers.new("WeightTransfer", "DATA_TRANSFER")
            transfer.object = donor_meshes[0]
            transfer.use_vert_data = True
            transfer.data_types_verts = {"VGROUP_WEIGHTS"}
            transfer.vert_mapping = "POLYINTERP_NEAREST"
            transfer.layers_vgroup_select_src = "ALL"
            transfer.layers_vgroup_select_dst = "NAME"
            bpy.context.view_layer.objects.active = m
            with bpy.context.temp_override(object=m, active_object=m):
                bpy.ops.object.modifier_apply(modifier=transfer.name)
            armature_modifier = m.modifiers.new("Armature", "ARMATURE")
            armature_modifier.object = arm
        for o in donor_meshes:
            bpy.data.objects.remove(o, do_unlink=True)
        for image in bpy.data.images:
            if max(image.size) > TEXTURE_SIZE:
                k = TEXTURE_SIZE / max(image.size)
                image.scale(int(image.size[0] * k), int(image.size[1] * k))
        path = os.path.join(OUT, f"{name}.glb")
        bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_image_format="JPEG", export_jpeg_quality=82,
                                  export_yup=True, export_animations=False, export_skins=True, export_cameras=False, export_lights=False)
        log("wrote", path, os.path.getsize(path))
    except Exception as error:  # keep going: one bad NPC must not block the rest
        log("FAILED", name, repr(error))
log("done")
LOG.close()
