import type { IfcElementKind, IfcScanElement, IfcSceneScan, ScenarioAnchorKind, ScenarioSuggestion } from "./types";

const kindsByIfcType: Record<string, IfcElementKind> = {
  IFCBUILDINGSTOREY: "storey",
  IFCWALL: "wall",
  IFCWALLSTANDARDCASE: "wall",
  IFCDOOR: "exit",
  IFCSTAIR: "stair",
  IFCSTAIRFLIGHT: "stair",
  IFCSPACE: "room",
};

const scenarioAnchorKinds: readonly ScenarioAnchorKind[] = ["room", "stair", "exit"];

export function classifyIfcType(typeName: string): IfcElementKind {
  return kindsByIfcType[typeName] ?? "other";
}

export function buildScenarioSuggestion(elements: readonly IfcScanElement[]): ScenarioSuggestion {
  const anchors = scenarioAnchorKinds.flatMap((kind) => elements.find((element) => element.kind === kind) ?? []);
  const missingAnchorKinds = scenarioAnchorKinds.filter((kind) => !anchors.some((anchor) => anchor.kind === kind));

  return {
    templateId: "evacuation-baseline",
    anchors,
    missingAnchorKinds: [...missingAnchorKinds],
    readyForReview: missingAnchorKinds.length === 0,
  };
}

export function buildSceneScan(fileName: string, schema: string, elements: IfcScanElement[]): IfcSceneScan {
  const inventory: Record<IfcElementKind, number> = { storey: 0, wall: 0, exit: 0, stair: 0, room: 0, other: 0 };
  for (const element of elements) inventory[element.kind] += 1;

  return { fileName, schema, elements, inventory, suggestion: buildScenarioSuggestion(elements) };
}
