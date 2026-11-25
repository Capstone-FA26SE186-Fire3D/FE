import { expect, test } from "@playwright/test";

import { ApiError } from "../../src/api/types/common";
import { normalizeRole, roleToApiName } from "../../src/features/auth/roles";
import { dashboardRouteFor, postLoginRoute } from "../../src/features/auth/redirect";
import { buildingFormToInput, emptyForm, formFromBuilding, validateBuildingForm } from "../../src/features/buildings/building-form-model";
import { buildingTypeLabel, isSupportedBuildingType, riskGroupInfo } from "../../src/features/buildings/data/building-types";
import { lastPlayedText, withPracticeLogNote, PRACTICE_LOG_NOTE } from "../../src/features/analytics/practice-log-model";
import { classifyUploadError, missingGroups } from "../../src/features/buildings/ifc-upload";
import { qaCriteria, qaGuide } from "../../src/features/buildings/qa-codes";
import type { Building } from "../../src/features/buildings/types";
import { lockedVersion, toEditorState, toUpdateBody, type FireInfrastructure } from "../../src/features/fire-infrastructure/api";
import { coverageGap } from "../../src/features/fire-infrastructure/plan-dossier";
import type { JsonObject } from "../../src/features/scenario-editor/store/json";
import { capabilityAllowed, categoryOf, isInfrastructureObject, itemPathToObjectPath, itemsToObjects, objectsToItems, scopeKinds } from "../../src/features/scenario-editor/v1/scope";
import { completenessIssues, shapeIssues, situationIssues } from "../../src/features/scenario-editor/v1/state";
import { parseDailyLimit, sourceText, usageText } from "../../src/features/organizations/ifc-processing";
import { coverageText, describeError } from "../../src/features/scenarios/version-readiness";

// Evidence level: pure logic against the BE contracts of BE#211–#214 (BE main @ 3786664). No browser, no network.

const placement = { floorId: "f1", position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } };
const object = (id: string, kind: string, capability?: string): JsonObject => ({ id, kind, placement, ...(capability ? { capability: { id: capability, version: "1.0.0" } } : {}) });
const context = { geometry: null, runtimes: null, metrics: null };

test.describe("role FireSafetyExpert (BE#211)", () => {
  test("the API name and the number both parse, and the name is sent back", () => {
    expect(normalizeRole("FireSafetyExpert")).toBe(3);
    expect(normalizeRole(3)).toBe(3);
    expect(roleToApiName(3)).toBe("FireSafetyExpert");
    expect(() => normalizeRole("Auditor")).toThrow();
  });

  test("an expert lands on the review queue and cannot be sent into another area", () => {
    expect(dashboardRouteFor({ role: 3 })).toBe("/expert/reviews");
    expect(postLoginRoute({ role: 3 }, "/expert/reviews?status=Approved")).toBe("/expert/reviews?status=Approved");
    expect(postLoginRoute({ role: 3 }, "/admin/overview")).toBe("/expert/reviews");
    expect(postLoginRoute({ role: 3 }, "/workspace/buildings")).toBe("/expert/reviews");
    expect(postLoginRoute({ role: 1 }, "/expert/reviews")).toBe("/workspace/buildings");
  });
});

test.describe("infrastructure and scenario scopes (BE#213)", () => {
  test("each scope offers only the kinds it owns", () => {
    expect(scopeKinds("infrastructure")).toEqual(["Goal", "Equipment"]);
    expect(scopeKinds("scenario-on-infrastructure")).not.toContain("Goal");
    expect(scopeKinds("scenario")).toContain("Goal");
  });

  test("loose items and door states are scenario items; every other equipment and every goal is infrastructure", () => {
    expect(isInfrastructureObject("Goal", undefined)).toBe(true);
    expect(isInfrastructureObject("Equipment", "extinguisher.portable")).toBe(true);
    expect(isInfrastructureObject("Equipment", "item.towel")).toBe(false);
    expect(isInfrastructureObject("Hazard", "fire.source")).toBe(false);
    expect(capabilityAllowed("infrastructure", "Equipment", "item.towel")).toBe(false);
    expect(capabilityAllowed("infrastructure", "Equipment", "gas.valve")).toBe(true);
    expect(capabilityAllowed("scenario-on-infrastructure", "Equipment", "bait.belongings")).toBe(true);
    expect(capabilityAllowed("scenario-on-infrastructure", "Equipment", "gas.valve")).toBe(false);
    expect(capabilityAllowed("scenario", "Equipment", "gas.valve")).toBe(true);
    // Which door is padlocked or wedged open is the scenario's decision; the door itself stays part of the building (BE#224).
    for (const state of ["door.exit_locked", "door.fire_wedged"]) {
      expect(isInfrastructureObject("Equipment", state)).toBe(false);
      expect(capabilityAllowed("scenario-on-infrastructure", "Equipment", state)).toBe(true);
      expect(capabilityAllowed("infrastructure", "Equipment", state)).toBe(false);
    }
    expect(capabilityAllowed("infrastructure", "Equipment", "door.exit")).toBe(true);
  });

  test("the category follows from the object, the way the server seeds it", () => {
    expect(categoryOf("Goal", undefined)).toBe("Exit");
    expect(categoryOf("Goal", "assembly.point")).toBe("AssemblyPoint");
    expect(categoryOf("Equipment", "water.sink")).toBe("WaterSource");
    expect(categoryOf("Equipment", "alarm.call_point")).toBe("Equipment");
    expect(categoryOf("Spawn", undefined)).toBeNull();
  });

  test("items ↔ objects: the category is dropped on read and derived again on save, other fields untouched", () => {
    const items = [{ ...object("exit-1", "Goal"), category: "Exit", custom: 7 }, { ...object("sink-1", "Equipment", "water.sink"), category: "WaterSource" }];
    const objects = itemsToObjects(items);
    expect(objects.every((item) => !("category" in item))).toBe(true);
    expect(objects[0].custom).toBe(7);
    expect(objectsToItems(objects)).toEqual(items);
    expect(itemPathToObjectPath("$.items[2].capability.id")).toBe("$.objects[2].capability.id");
    expect(itemPathToObjectPath("$.geometry")).toBe("$.geometry");
  });

  test("the editor document and the PUT body round-trip an infrastructure version", () => {
    const infrastructure = { id: "i1", revisionId: "r1", geometry: { artifactId: "a", sha256Hash: "b".repeat(64) }, runtimeVersion: "2.5.0", items: [{ ...object("exit-1", "Goal"), category: "Exit" }] } as unknown as FireInfrastructure;
    const state = toEditorState(infrastructure);
    expect(state.schemaVersion).toBe("fet3d.editor/1");
    expect(toUpdateBody(state)).toEqual({ geometry: infrastructure.geometry, runtimeVersion: "2.5.0", items: infrastructure.items });
    // A first version has no pin and may have no runtime: both are sent as null, never invented.
    expect(toUpdateBody(toEditorState({ ...infrastructure, geometry: null, runtimeVersion: null, items: [] } as FireInfrastructure))).toEqual({ geometry: null, runtimeVersion: null, items: [] });
  });

  test("scenarios build on the newest Approved version only", () => {
    const version = (number: number, status: string) => ({ id: `v${number}`, version: number, status }) as FireInfrastructure;
    expect(lockedVersion([version(3, "Draft"), version(2, "Approved"), version(1, "Approved")])?.id).toBe("v2");
    expect(lockedVersion([version(2, "Rejected"), version(1, "Submitted")])).toBeNull();
  });

  test("an infrastructure is checked for its objects only, and needs an exit", () => {
    const codes = (draft: JsonObject) => completenessIssues(draft, { ...context, scope: "infrastructure" }).map((issue) => issue.code);
    const empty = codes({ schemaVersion: "fet3d.editor/1", objects: [] });
    expect(empty).toContain("EXIT_REQUIRED");
    expect(empty).not.toContain("SPAWN_REQUIRED");
    expect(empty.filter((code) => code === "FIELD_REQUIRED")).toHaveLength(2); // geometry and runtimeVersion; no rubric, objectives or time limit
    expect(codes({ schemaVersion: "fet3d.editor/1", objects: [object("exit-1", "Goal")] })).not.toContain("EXIT_REQUIRED");
    expect(codes({ schemaVersion: "fet3d.editor/1", objects: [object("point-1", "Goal", "assembly.point")] })).toContain("EXIT_REQUIRED");
  });

  test("a scenario on a locked infrastructure needs no goal and may hold none", () => {
    const issues = completenessIssues({ schemaVersion: "fet3d.editor/1", objects: [object("spawn-1", "Spawn"), object("exit-1", "Goal"), object("ext-1", "Equipment", "extinguisher.portable"), object("towel-1", "Equipment", "item.towel"), object("new-1", "Equipment")] }, { ...context, scope: "scenario-on-infrastructure" });
    expect(issues.some((issue) => issue.code === "GOAL_REQUIRED")).toBe(false);
    expect(issues.filter((issue) => issue.code === "SCENARIO_CONTAINS_INFRASTRUCTURE").map((issue) => issue.path)).toEqual(["$.objects[1]", "$.objects[2]"]);
    // A plain scenario draft (created before BE#213) keeps the previous rules.
    expect(completenessIssues({ schemaVersion: "fet3d.editor/1", objects: [object("spawn-1", "Spawn")] }, context).some((issue) => issue.code === "GOAL_REQUIRED")).toBe(true);
  });
});

test.describe("building PC06 (BE#212)", () => {
  const valid = { ...emptyForm, name: "Chung cư Hòa Bình", buildingType: "Apartment", totalFloors: "9" };

  test("the API value is sent, the label is shown, and a legacy label is refused", () => {
    expect(isSupportedBuildingType("Apartment")).toBe(true);
    expect(isSupportedBuildingType("Chung cư")).toBe(false);
    expect(buildingTypeLabel("School")).toBe("Trường học");
    expect(buildingTypeLabel(null)).toBe("");
    expect(validateBuildingForm({ ...valid, buildingType: "Chung cư" }).buildingType).toBeTruthy();
    expect(buildingFormToInput(valid).buildingType).toBe("Apartment");
    expect(riskGroupInfo("Group1")?.label).toBe("Nhóm 1");
    expect(riskGroupInfo(null)).toBeNull();
  });

  test("an untouched facility sheet sends explicit empties, because PUT replaces every field", () => {
    expect(validateBuildingForm(valid)).toEqual({});
    expect(buildingFormToInput(valid)).toMatchObject({ floorAreaSquareMeters: null, facilityHeadName: null, facilityHeadPhone: null, onSiteForce: null, emergencyContacts: [] });
  });

  test("the facility sheet follows the API rules", () => {
    const filled = { ...valid, floorArea: "3200.5", headName: "Trần Thị B", headPhone: "114", teamSize: "12", leaderName: "Lê C", leaderPhone: "(028) 3838-1234", inHours: true, offHours: false, contacts: [{ name: "Cảnh sát PCCC", phone: "114", role: "" }] };
    expect(validateBuildingForm(filled)).toEqual({});
    expect(buildingFormToInput(filled)).toMatchObject({
      floorAreaSquareMeters: 3200.5, facilityHeadPhone: "114",
      onSiteForce: { teamSize: 12, leaderName: "Lê C", leaderPhone: "(028) 3838-1234", availableInHours: true, availableOffHours: false },
      emergencyContacts: [{ name: "Cảnh sát PCCC", phone: "114", role: null }],
    });
    const bad = validateBuildingForm({ ...filled, floorArea: "12.345", headPhone: "ab", teamSize: "", contacts: [{ name: "", phone: "1", role: "" }] });
    expect(Object.keys(bad).sort()).toEqual(["contacts.0.name", "contacts.0.phone", "floorArea", "headPhone", "teamSize"]);
  });

  test("editing an existing building keeps its facility sheet", () => {
    const building = { id: "b1", name: "Trường A", buildingType: "School", totalFloors: 4, isActive: true, createdAt: "", updatedAt: "", organizationId: "o1", location: null, contact: null,
      floorAreaSquareMeters: 1800, facilityHeadName: "Hiệu trưởng", facilityHeadPhone: "0281234567", onSiteForce: { teamSize: 6, leaderName: null, leaderPhone: null, availableInHours: true, availableOffHours: false }, emergencyContacts: [{ name: "Công an phường", phone: "02838383838", role: "Công an" }] } as Building;
    expect(buildingFormToInput(formFromBuilding(building), building)).toMatchObject({ buildingType: "School", floorAreaSquareMeters: 1800, facilityHeadName: "Hiệu trưởng", onSiteForce: building.onSiteForce, emergencyContacts: building.emergencyContacts });
  });
});

test.describe("IFC upload and QA codes (BE#214)", () => {
  test("an unsupported schema names what the file declares and asks for a new upload", () => {
    const error = classifyUploadError("complete", new ApiError("Unsupported schema.", 422, { errors: { fileSchema: ["IFC2X2_FINAL"], supportedSchemas: ["IFC2X3", "IFC4", "IFC4X3"] } }, undefined, "IFC_UNSUPPORTED_SCHEMA"));
    expect(error.message).toContain("IFC2X2_FINAL");
    expect(error.restart).toBe(true);
    expect(error.code).toBe("IFC_UNSUPPORTED_SCHEMA");
    // The Draft revision was deleted with the 422, so replaying the completion gets 404: also a fresh start, not "storage mismatch".
    expect(classifyUploadError("complete", new ApiError("Not found.", 404, undefined, undefined, "IFC_UPLOAD_INTENT_NOT_FOUND")).restart).toBe(true);
  });

  test("the three new codes have guidance and their own criteria rows", () => {
    for (const code of ["IFC_NO_STOREYS", "IFC_NO_STAIRS_MULTISTOREY", "IFC_UNIT_NOT_METRE"]) expect(qaGuide(code)?.title).toBeTruthy();
    const issue = (issueCode: string, severity: string) => ({ issueCode, severity, isCurrentAttempt: true });
    const rows = qaCriteria([issue("IFC_NO_STAIRS_MULTISTOREY", "Error"), issue("IFC_UNIT_NOT_METRE", "Warning")]);
    expect(rows).toHaveLength(12);
    expect(rows.find((row) => row.id === "stairs")).toMatchObject({ passed: false, blocking: true });
    expect(rows.find((row) => row.id === "units")).toMatchObject({ passed: false, blocking: false });
    expect(rows.find((row) => row.id === "storeys")).toMatchObject({ passed: true });
  });
});

// Evidence level: pure logic against BE#215–#219 (BE main @ f589374). No browser, no network.
test.describe("PC06 situation fields (BE#215)", () => {
  const filled = { audience: "Evacuee", workingHours: "OffHours", assumption: { time: "22 giờ", location: "Bếp tầng 1", cause: "Chập điện", peoplePresent: 12 } };

  test("a draft on a fire infrastructure needs audience, working hours and every assumption field", () => {
    expect(situationIssues({}).map((item) => item.path)).toEqual(["$.audience", "$.workingHours", "$.assumption"]);
    expect(situationIssues({ audience: "Evacuee", workingHours: "InHours", assumption: { time: "8 giờ" } }).map((item) => item.path)).toEqual(["$.assumption.location", "$.assumption.cause", "$.assumption.peoplePresent"]);
    expect(situationIssues(filled)).toEqual([]);
    const paths = (scope: "scenario" | "scenario-on-infrastructure") => completenessIssues({ objects: [] }, { ...context, scope }).map((item) => item.path);
    expect(paths("scenario-on-infrastructure")).toContain("$.audience");
    // A draft created before fire infrastructures existed keeps the old rules.
    expect(paths("scenario")).not.toContain("$.audience");
  });

  test("wrong values are reported at the path the server uses", () => {
    const paths = shapeIssues({ schemaVersion: "fet3d.editor/1", audience: "Everyone", workingHours: "Night", assumption: { time: "", peoplePresent: 1.5, extra: 1 } }).map((item) => item.path);
    expect(paths).toEqual(expect.arrayContaining(["$.audience", "$.workingHours", "$.assumption.time", "$.assumption.peoplePresent", "$.assumption.extra"]));
    expect(shapeIssues({ schemaVersion: "fet3d.editor/1", ...filled }).filter((item) => item.path.startsWith("$.a") || item.path === "$.workingHours")).toEqual([]);
  });

  test("publish says which working hours still lack an appraised situation", () => {
    expect(coverageGap({ inHours: true, offHours: true })).toBeNull();
    expect(coverageGap({ inHours: true, offHours: false })).toContain("ngoài giờ");
    expect(coverageGap({ inHours: false, offHours: false })).toContain("Chưa có tình huống nào đạt thẩm định");
    expect(coverageText({ workingHours: ["OffHours"] })).toContain("ngoài giờ làm việc");
    expect(coverageText({ workingHours: ["InHours"] })).toContain("trong giờ làm việc");
    expect(coverageText({ workingHours: ["InHours", "OffHours"] })).toBeUndefined();
    const error = new ApiError("x", 409, { errors: { workingHours: ["OffHours"] } }, undefined, "PLAN_SCENARIO_COVERAGE_INCOMPLETE");
    expect(describeError(error).message).toContain("ngoài giờ làm việc");
    expect(describeError(new ApiError("x", 409, undefined, undefined, "PLAN_SCENARIO_COVERAGE_INCOMPLETE")).message).toContain("một tình huống trong giờ và một tình huống ngoài giờ");
  });
});

test.describe("junk-IFC guard and processing limit (BE#219)", () => {
  test("a precheck refusal names the missing parts and asks for a new file", () => {
    expect(missingGroups({ missing: ["IfcBuildingStorey", "IfcDoor"] })).toBe("tầng, cửa");
    const error = classifyUploadError("complete", new ApiError("x", 422, { errors: { missing: ["IfcSpace"], qaCodes: ["IFC_NO_SPACES"] } }, undefined, "IFC_PRECHECK_FAILED"));
    expect(error.message).toContain("phòng");
    expect(error.restart).toBe(true);
    expect(classifyUploadError("initiate", new ApiError("x", 409, undefined, undefined, "IFC_SOURCE_ALREADY_FAILED")).restart).toBe(true);
  });

  test("organization limits are not retried automatically", () => {
    for (const [status, code] of [[409, "IFC_ORG_JOB_RUNNING"], [429, "IFC_PROCESS_DAILY_LIMIT"], [403, "IFC_PROCESSING_DISABLED"]] as const) {
      const error = classifyUploadError("complete", new ApiError("x", status, undefined, undefined, code));
      expect(error.retryable, code).toBeFalsy();
      expect(error.message, code).toMatch(/[àáạảãăâđêôơư]/i);
    }
  });

  test("daily limit input and the usage line", () => {
    expect(parseDailyLimit(" 20 ")).toBe(20);
    expect(parseDailyLimit("0")).toBe(0);
    expect(parseDailyLimit("100001")).toBeNull();
    expect(parseDailyLimit("2.5")).toBeNull();
    expect(parseDailyLimit("")).toBeNull();
    expect(usageText({ dailyLimit: 20, used: 3, remaining: 17 })).toBe("Hôm nay còn 17 trong 20 lượt xử lý mô hình.");
    expect(usageText({ dailyLimit: 20, used: 20, remaining: 0 })).toContain("đã dùng hết 20 lượt");
    expect(usageText({ dailyLimit: 0, used: 0, remaining: 0 })).toContain("tạm dừng");
    expect(sourceText("Organization")).toContain("riêng");
    expect(sourceText("Configuration")).toContain("chung");
  });
});

test.describe("practice log (BE#218)", () => {
  test("the note is written once, also when the server quoted it", () => {
    expect(withPracticeLogNote("a,b\n")).toBe(`${PRACTICE_LOG_NOTE}\na,b\n`);
    expect(withPracticeLogNote(`"${PRACTICE_LOG_NOTE}"\na,b\n`)).toBe(`"${PRACTICE_LOG_NOTE}"\na,b\n`);
    expect(withPracticeLogNote(`\ufeff${PRACTICE_LOG_NOTE}\na,b\n`)).toBe(`\ufeff${PRACTICE_LOG_NOTE}\na,b\n`);
  });

  test("last practice date is shown in Vietnam time, and a missing one is not invented", () => {
    expect(lastPlayedText("2026-09-20T18:30:00Z")).toBe("21/09/2026");
    expect(lastPlayedText(null)).toBeNull();
    expect(lastPlayedText("not a date")).toBeNull();
  });
});
