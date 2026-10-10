import { arrayItemCommand, deleteCommand, placeCommand, setFieldCommand, transformCommand } from "../store/commands";
import type { Json, JsonObject, Path } from "../store/json";
import { type ObjectKind, type Position, type Selection } from "../store/model";
import { pathKey } from "../store/json";

type Build = (draft: JsonObject, id: number, selection: Selection, now: number) => ReturnType<typeof placeCommand> | null;
type Edit = (build: Build) => void;

/** All author actions as thin wrappers over the pure command builders. Panels and the viewport share this one surface. */
export function createActions(edit: Edit, select: (selection: Selection) => void) {
  return {
    setField(path: Path, value: Json | undefined, label: string, typing = true) {
      edit((draft, id, selection, now) => setFieldCommand(draft, id, path, value, { label, at: now, selection, mergeKey: typing ? `typing:${pathKey(path)}` : undefined }));
    },
    addItem(path: Path, value: Json, label: string) {
      edit((draft, id, _selection, now) => arrayItemCommand(draft, id, path, { type: "add", value }, now, label));
    },
    removeItem(path: Path, index: number, label: string) {
      edit((draft, id, _selection, now) => arrayItemCommand(draft, id, path, { type: "remove", index }, now, label));
    },
    place(kind: ObjectKind, position: Position) {
      edit((draft, id, selection, now) => placeCommand(draft, id, kind, position, now, selection));
    },
    /** Form-driven move/rotate: typing in the same axis merges into one history entry. */
    setCoordinate(kind: ObjectKind, index: number, axis: keyof Position, value: number) {
      edit((draft, id, _selection, now) => transformCommand(draft, id, kind, index, { [axis]: value }, { at: now, label: axis === "rotation" ? "Xoay" : "Di chuyển", mergeKey: `typing:${kind}:${index}:${axis}` }));
    },
    /** Gizmo drag: every change in one drag gesture merges into a single history entry. */
    drag(kind: ObjectKind, index: number, next: Partial<Position>, gesture: number, label: string) {
      edit((draft, id, _selection, now) => transformCommand(draft, id, kind, index, next, { at: now, label, mergeKey: `drag:${gesture}` }));
    },
    remove(kind: ObjectKind, index: number) {
      edit((draft, id, _selection, now) => deleteCommand(draft, id, kind, index, now));
    },
    select,
  };
}

export type EditorActions = ReturnType<typeof createActions>;
