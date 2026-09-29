export type IfcElementKind = "storey" | "wall" | "exit" | "stair" | "room" | "other";

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
