import type { Json, JsonObject, Path } from "../../store/json";
import type { CapabilityOption } from "../../v1/catalog";
import {
  addItemCommand, addObjectCommand, moveObjectCommand, pinGeometryCommand, removeItemCommand, removeObjectCommand, rotateObjectCommand, setCapabilityCommand, setFloorCommand, setPathCommand,
  type NewObject, type V1Command, type V1Selection,
} from "../../v1/commands";
import type { GeometryInfo } from "../../v1/geometry";
import type { GeometryPin } from "../../v1/contract";
import { roundQuaternion, yawToQuaternion, type Quat, type Vec3 } from "../../v1/matrix";

type Build = (draft: JsonObject, id: number, selection: V1Selection, now: number) => V1Command | null;
type Edit = (build: Build) => void;

/** Every author action of the v1 editor as a thin wrapper over the pure command builders. Panels and the viewport share this surface. */
export function createV1Actions(edit: Edit, select: (selection: V1Selection) => void, geometry: GeometryInfo | null) {
  return {
    setField(path: Path, value: Json | undefined, label: string, typing = true) {
      edit((draft, id, selection, now) => setPathCommand(draft, id, path, value, { label, at: now, selection, typing }));
    },
    addItem(path: Path, value: Json, label: string) {
      edit((draft, id, selection, now) => addItemCommand(draft, id, path, value, now, label, selection));
    },
    removeItem(path: Path, index: number, label: string) {
      edit((draft, id, selection, now) => removeItemCommand(draft, id, path, index, now, label, selection));
    },
    addObject(object: NewObject) {
      edit((draft, id, selection, now) => addObjectCommand(draft, id, object, now, selection));
    },
    removeObject(index: number) {
      edit((draft, id, _selection, now) => removeObjectCommand(draft, id, index, now));
    },
    /** Form-driven move: typing in the same axis merges into one history entry. */
    setCoordinate(index: number, axis: keyof Vec3, value: number) {
      edit((draft, id, _selection, now) => moveObjectCommand(draft, id, index, { [axis]: value }, { at: now, label: "Di chuyển", mergeKey: `typing:${index}:${axis}` }));
    },
    /** Gizmo drag: every change of one gesture merges into a single history entry. */
    dragTo(index: number, position: Vec3, gesture: number) {
      edit((draft, id, _selection, now) => moveObjectCommand(draft, id, index, position, { at: now, label: "Di chuyển", mergeKey: `drag:${gesture}` }));
    },
    rotateTo(index: number, q: Quat, gesture: number) {
      edit((draft, id, _selection, now) => rotateObjectCommand(draft, id, index, roundQuaternion(q), { at: now, label: "Xoay", mergeKey: `drag:${gesture}` }));
    },
    /** Yaw typed in degrees: written only when the author types, so an untouched quaternion is never rewritten. */
    setYaw(index: number, degrees: number) {
      edit((draft, id, _selection, now) => rotateObjectCommand(draft, id, index, roundQuaternion(yawToQuaternion(degrees)), { at: now, label: "Xoay", mergeKey: `typing:${index}:yaw` }));
    },
    setFloor(index: number, floorId: string) {
      edit((draft, id, _selection, now) => setFloorCommand(draft, id, index, floorId, geometry, now));
    },
    setCapability(index: number, capability: Pick<CapabilityOption, "id" | "version"> | undefined) {
      edit((draft, id, _selection, now) => setCapabilityCommand(draft, id, index, capability, now));
    },
    setParameter(index: number, name: string, value: Json | undefined, typing: boolean) {
      edit((draft, id, selection, now) => setPathCommand(draft, id, ["objects", index, "parameters", name], value, { label: "Sửa tham số", at: now, selection, typing }));
    },
    setAnchor(index: number, anchorId: string | undefined) {
      edit((draft, id, selection, now) => setPathCommand(draft, id, ["objects", index, "anchorId"], anchorId, { label: anchorId ? "Chọn cấu kiện neo" : "Bỏ cấu kiện neo", at: now, selection }));
    },
    pinGeometry(pin: GeometryPin) {
      edit((draft, id, selection, now) => pinGeometryCommand(draft, id, pin, now, selection));
    },
    select,
  };
}

export type V1Actions = ReturnType<typeof createV1Actions>;
