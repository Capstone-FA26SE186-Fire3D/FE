export type IfcElementKind = "storey" | "wall" | "exit" | "stair" | "room" | "other";

/** Visual layer used by the viewer's category toggles and colour palette. */
export type IfcCategory =
  | "wall"
  | "slab"
  | "roof"
  | "door"
  | "window"
  | "stair"
  | "railing"
  | "structure"
  | "space"
  | "furniture"
  | "equipment"
  | "site"
  | "other";

export type IfcBounds = {
  min: readonly [number, number, number];
  max: readonly [number, number, number];
};

export type IfcScanElement = {
  expressID: number;
  typeName: string;
  kind: IfcElementKind;
  bounds: IfcBounds | null;
};

export type IfcStorey = {
  expressID: number;
  name: string;
  /** Elevation in metres as authored in the IFC (null when missing). */
  elevation: number | null;
  elementCount: number;
};

export type IfcElementDetails = {
  expressID: number;
  typeName: string;
  category: IfcCategory;
  globalId: string | null;
  name: string | null;
  objectType: string | null;
  storeyName: string | null;
  size: readonly [number, number, number] | null;
};

export type ScenarioAnchorKind = Extract<IfcElementKind, "room" | "stair" | "exit">;

export type ScenarioSuggestion = {
  templateId: "evacuation-baseline";
  anchors: IfcScanElement[];
  missingAnchorKinds: ScenarioAnchorKind[];
  readyForReview: boolean;
};

export type IfcSceneScan = {
  fileName: string;
  schema: string;
  elements: IfcScanElement[];
  inventory: Record<IfcElementKind, number>;
  suggestion: ScenarioSuggestion;
};
