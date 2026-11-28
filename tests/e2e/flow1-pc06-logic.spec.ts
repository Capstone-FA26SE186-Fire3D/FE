import { expect, test } from "@playwright/test";

import { ApiError } from "../../src/api/types/common";
import { normalizeRole, roleToApiName } from "../../src/features/auth/roles";
import { dashboardRouteFor, postLoginRoute } from "../../src/features/auth/redirect";
import { buildingFormToInput, emptyForm, formFromBuilding, validateBuildingForm } from "../../src/features/buildings/building-form-model";
import { buildingTypeLabel, isSupportedBuildingType, riskGroupInfo } from "../../src/features/buildings/data/building-types";
import { lastPlayedText, withPracticeLogNote, PRACTICE_LOG_NOTE } from "../../src/features/analytics/practice-log-model";
import { classifyProcessError, classifyUploadError, failedChecks, limitResetText, missingGroups } from "../../src/features/buildings/ifc-upload";
import { qaCriteria, qaGuide } from "../../src/features/buildings/qa-codes";
import type { Building } from "../../src/features/buildings/types";
import { lockedVersion, toEditorState, toUpdateBody, type FireInfrastructure } from "../../src/features/fire-infrastructure/api";
import { coverageGap } from "../../src/features/fire-infrastructure/plan-dossier";
import { buildApplyPlan } from "../../src/features/org-ai/apply-plan";
import { planApply } from "../../src/features/library/apply";
import type { LibraryVersion } from "../../src/features/library/types";
import { plainLimitation } from "../../src/features/org-ai/labels";
import { scenarioDraftBody } from "../../src/features/org-ai/scenario-draft-body";
import type { JsonObject } from "../../src/features/scenario-editor/store/json";
import { MOUNTED_CAPABILITIES, heightProblem, heightText, isWallNormal, mountedY, mountingOf, shapeOf, sizeText, yawFacing } from "../../src/features/scenario-editor/v1/equipment-mounting";
import { yawToQuaternion } from "../../src/features/scenario-editor/v1/matrix";
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
    expect(dashboardRouteFor({ role: 3 })).toBe("/expert/overview");
    expect(postLoginRoute({ role: 3 }, "/expert/reviews?status=Approved")).toBe("/expert/reviews?status=Approved");
    expect(postLoginRoute({ role: 3 }, "/admin/overview")).toBe("/expert/overview");
    expect(postLoginRoute({ role: 3 }, "/workspace/buildings")).toBe("/expert/overview");
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

  test("a refused processing run says why, when to come back and which run is in the way", () => {
    // Retry-After of the daily limit is the time to the next UTC midnight: a clock time, never a countdown of hours in seconds.
    const now = new Date(2026, 10, 25, 22, 30);
    expect(limitResetText(8.5 * 3600, now)).toBe("07:00 ngày mai");
    expect(limitResetText(3600, now)).toBe("23:30 hôm nay");
    expect(limitResetText(undefined, now)).toBe("");
    const limit = classifyProcessError(new ApiError("x", 429, undefined, 30_600, "IFC_PROCESS_DAILY_LIMIT"));
    expect(limit.message).toMatch(/Lượt mới có lại lúc \d\d:\d\d (hôm nay|ngày mai)\./);
    expect(limit.message).toContain("không cần tải lại");
    expect(limit).toMatchObject({ retryable: false, restart: false, retryAfterSeconds: undefined });

    const running = classifyProcessError(new ApiError("x", 409, { errors: { jobId: ["job-7"] } }, undefined, "IFC_ORG_JOB_RUNNING"));
    expect(running).toMatchObject({ jobId: "job-7", retryable: false });
    expect(running.message).toContain("mỗi lúc chỉ xử lý một mô hình");
    expect(classifyProcessError(new ApiError("x", 409, { errors: { jobId: "job-8" } }, undefined, "IFC_ORG_JOB_RUNNING")).jobId).toBe("job-8");
    expect(classifyProcessError(new ApiError("x", 403, undefined, undefined, "IFC_PROCESSING_DISABLED")).message).toContain("tạm dừng");

    // Anything else at this step keeps the old behaviour: the file is stored and the request may be sent again.
    expect(classifyProcessError(new ApiError("x", 503, undefined, 5))).toMatchObject({ retryable: true, retryAfterSeconds: 5 });
    expect(classifyProcessError(new ApiError("x", 409)).retryable).toBe(false);
    for (const error of [limit, running]) expect(error.message).not.toMatch(/IFC_|jobId|Retry-After/);
  });

  test("a file that already failed lists what failed, in words", () => {
    expect(failedChecks({ qaCodes: ["IFC_NO_STAIRS_MULTISTOREY", "IFC_NO_DOORS", "IFC_NO_DOORS", "SOMETHING_NEW"] })).toEqual(["nhà nhiều tầng nhưng không có cầu thang", "mô hình không có cửa"]);
    const error = classifyUploadError("initiate", new ApiError("x", 409, { errors: { qaCodes: ["IFC_NO_WALLS_OR_SLABS"] } }, undefined, "IFC_SOURCE_ALREADY_FAILED"));
    expect(error.message).toContain("không đạt: mô hình không có tường và sàn.");
    expect(error.message).not.toContain("IFC_");
    for (const code of ["IFC_NO_DOORS", "IFC_NO_WALLS_OR_SLABS"]) expect(qaGuide(code)?.action, code).toBe("reupload");
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

test.describe("how equipment is mounted in the app", () => {
  // Equipment capabilities of runtime 2.5.0 (BE runtime catalog, objectKinds Equipment).
  const EQUIPMENT = ["door.exit", "door.fire", "gas.valve", "glass.pane", "item.towel", "water.bath", "water.sink", "blanket.fire", "firstaid.kit", "item.blanket", "water.shower", "door.standard", "furniture.bed", "item.clothing", "power.breaker", "signal.window", "alarm.detector", "bait.belongings", "ppe.escape_hood", "window.openable", "alarm.call_point", "door.exit_locked", "door.fire_wedged", "transport.elevator", "extinguisher.portable", "suppression.sprinkler", "tool.emergency_hammer", "extinguisher.hose_reel"];

  test("every Equipment capability of the app has a mounting, and nothing else is listed", () => {
    expect([...MOUNTED_CAPABILITIES].sort()).toEqual([...EQUIPMENT].sort());
    expect(mountingOf("fire.source")).toBeNull();
    expect(mountingOf(undefined)).toBeNull();
  });

  test("the front of a wall item is turned out of the wall it is put on", () => {
    // With yaw θ the front of a prefab (local -Z) points to (-sin θ, 0, -cos θ): it must equal the wall's normal.
    for (const normal of [{ x: 0, z: 1 }, { x: 0, z: -1 }, { x: 1, z: 0 }, { x: -1, z: 0 }, { x: Math.SQRT1_2, z: Math.SQRT1_2 }]) {
      const yaw = (yawFacing(normal) * Math.PI) / 180;
      expect(-Math.sin(yaw)).toBeCloseTo(normal.x, 6);
      expect(-Math.cos(yaw)).toBeCloseTo(normal.z, 6);
    }
    expect(yawFacing({ x: 0, z: 1 })).toBe(180);
    expect(yawFacing({ x: 0, z: -1 })).toBe(0);
    expect(yawToQuaternion(yawFacing({ x: 0, z: 1 })).y).toBeCloseTo(1, 6);
    expect(isWallNormal({ x: 0, y: 0, z: 1 })).toBe(true);
    expect(isWallNormal({ x: 0, y: 1, z: 0 })).toBe(false); // a floor
    expect(isWallNormal({ x: 0.2, y: -0.98, z: 0 })).toBe(false); // a ceiling
  });

  test("the height follows the prefab: some lift themselves, the fire blanket hangs where it is put", () => {
    const cabinet = mountingOf("extinguisher.hose_reel")!;
    const blanket = mountingOf("blanket.fire")!;
    const bottle = mountingOf("extinguisher.portable")!;
    expect(mountedY(cabinet, 1.4)).toBe(0);
    expect(mountedY(blanket, 0)).toBe(1.25);
    expect(mountedY(bottle, 0.75)).toBe(0.75); // on a table
    expect(heightProblem(cabinet, 1.2)).toContain("Y phải là 0");
    expect(heightProblem(cabinet, 0)).toBeNull();
    expect(heightProblem(blanket, 0)).toContain("1,25 m");
    expect(heightProblem(blanket, 1.25)).toBeNull();
    expect(heightProblem(bottle, 0.75)).toBeNull();
    expect(heightText(cabinet)).toContain("1,15 m");
    expect(sizeText(blanket)).toBe("Rộng 0,3 × cao 0,32 × sâu 0,07 m");
  });

  test("only items with a body of their own get a true-size shape; doors, windows and lifts follow the model", () => {
    expect(shapeOf("extinguisher.hose_reel")).toEqual({ mount: "wall", width: 0.9, height: 0.9, depth: 0.24, lift: 1.15, front: true });
    expect(shapeOf("alarm.detector")).toMatchObject({ mount: "ceiling", front: false });
    expect(shapeOf("extinguisher.portable")).toMatchObject({ mount: "stand", front: false });
    for (const id of ["door.exit", "door.exit_locked", "window.openable", "transport.elevator"]) expect(shapeOf(id), id).toBeUndefined();
    expect(shapeOf("fire.source")).toBeUndefined();
  });
});

test.describe("library template on a PC06 situation (BE#215)", () => {
  const template = { id: "v1", itemId: "i1", kind: "ScenarioTemplate", code: "TPL-PC06-X", versionNumber: 1, name: "Mẫu", status: "Published", revision: 2, requiredCapabilities: [], publishedAt: null,
    payload: { state: { schemaVersion: "fet3d.editor/1", name: "Cháy bếp", audience: "EvacuationGuide", workingHours: "OffHours", assumption: { time: "1 giờ sáng", location: "Căn 402", cause: "Chập điện", peoplePresent: 260 } } } } as unknown as LibraryVersion;
  const context = { metrics: null, schemaVersions: null, object: null, runtimeCapabilities: null };
  const ids = (plan: ReturnType<typeof planApply>) => plan.groups.map((group) => group.id);

  test("a template fills audience, working hours and the assumption of a situation, shown with the form's words", () => {
    const plan = planApply(template, { schemaVersion: "fet3d.editor/1" }, { ...context, situation: true });
    expect(ids(plan)).toEqual(["template:name", "template:audience", "template:workingHours", "template:assumption"]);
    const by = Object.fromEntries(plan.groups.map((group) => [group.id, group]));
    expect(by["template:audience"]).toMatchObject({ label: "Đối tượng luyện tập", incoming: "Hướng dẫn thoát nạn", status: "new", defaultAction: "fill" });
    expect(by["template:workingHours"].incoming).toBe("Ngoài giờ làm việc");
    expect(by["template:assumption"].incoming).toBe("1 giờ sáng · Căn 402 · Chập điện · 260 người có mặt");
    expect(by["template:assumption"].writes.fill).toEqual([{ path: ["assumption"], value: { time: "1 giờ sáng", location: "Căn 402", cause: "Chập điện", peoplePresent: 260 } }]);
    for (const group of plan.groups) expect(`${group.label} ${group.incoming}`).not.toMatch(/EvacuationGuide|OffHours|peoplePresent/);
  });

  test("what the author already chose is kept unless they ask to replace it", () => {
    const plan = planApply(template, { schemaVersion: "fet3d.editor/1", audience: "Evacuee", workingHours: "OffHours" }, { ...context, situation: true });
    const by = Object.fromEntries(plan.groups.map((group) => [group.id, group]));
    expect(by["template:audience"]).toMatchObject({ status: "different", defaultAction: "keep", current: "Người thoát nạn" });
    expect(by["template:workingHours"].status).toBe("same");
  });

  test("replacing a partial assumption keeps the author's other fields", () => {
    const partial = { ...template, payload: { state: { assumption: { time: "Đêm" } } } } as LibraryVersion;
    const plan = planApply(partial, { assumption: { time: "Sáng", location: "Bếp", peoplePresent: 12 } }, { ...context, situation: true });
    expect(plan.groups[0].writes.replace).toEqual([{ path: ["assumption"], value: { time: "Đêm", location: "Bếp", peoplePresent: 12 } }]);
  });

  test("a draft that is not a situation on a fire infrastructure does not take these fields, and is told why", () => {
    const plan = planApply(template, { schemaVersion: "fet3d.editor/1" }, { ...context, situation: false });
    expect(ids(plan)).toEqual(["template:name"]);
    expect(plan.notes.join(" ")).toContain("Hạ tầng PCCC");
  });
});

test.describe("AI proposal on a PC06 situation (BE#213, BE#215)", () => {
  const pin = { artifactId: "a1", sha256Hash: "h".repeat(64) };
  const proposal: JsonObject = { schemaVersion: "fet3d.editor/1", geometry: pin, audience: "Evacuee", assumption: { time: "8 giờ", location: "Bếp", cause: "Chập điện", peoplePresent: 30 },
    objects: [object("spawn-a", "Spawn"), object("exit-a", "Goal"), object("ext-a", "Equipment", "extinguisher.portable"), object("towel-a", "Equipment", "item.towel"), object("lock-a", "Equipment", "door.exit_locked")] };
  const draft: JsonObject = { schemaVersion: "fet3d.editor/1", geometry: pin, objects: [] };

  test("a proposal asked from an open situation names its fire infrastructure (BE#231)", () => {
    expect(scenarioDraftBody("b1", "Cháy bếp")).toEqual({ buildingId: "b1", prompt: "Cháy bếp" });
    expect(scenarioDraftBody("b1", "Cháy bếp", { buildingId: "b1", infrastructureId: "infra-2" })).toEqual({ buildingId: "b1", prompt: "Cháy bếp", infrastructureId: "infra-2" });
    // The assistant can be pointed at another Building while a situation is open: that Building's own infrastructure applies.
    expect(scenarioDraftBody("b2", "Cháy bếp", { buildingId: "b1", infrastructureId: "infra-2" })).toEqual({ buildingId: "b2", prompt: "Cháy bếp" });
  });

  test("the server's note on missing PC06 fields is shown with the form's labels, never with field names (BE#231)", () => {
    const all = plainLimitation("Bản nháp chưa có audience, workingHours, assumption.time, assumption.location, assumption.cause, assumption.peoplePresent: cần điền trước khi lưu (đối tượng, trong/ngoài giờ, giả định).");
    expect(all).toBe("Bản nháp còn thiếu: đối tượng luyện tập, thời gian xảy ra (trong giờ hoặc ngoài giờ), thời điểm, vị trí xảy ra cháy, nguyên nhân, số người có mặt. Hãy điền ở nhóm “Giả định của tình huống” trước khi lưu.");
    expect(all).not.toMatch(/audience|workingHours|assumption/);
    expect(plainLimitation("Bản nháp chưa có assumption: cần điền trước khi lưu (đối tượng, trong/ngoài giờ, giả định).")).toContain("còn thiếu: giả định của tình huống.");
    // A field this version does not know is not printed by its path.
    const unknown = plainLimitation("Bản nháp chưa có workingHours, evacuationPlan.leader: cần điền trước khi lưu (…).");
    expect(unknown).toContain("thời gian xảy ra (trong giờ hoặc ngoài giờ) và mục khác");
    expect(unknown).not.toContain("evacuationPlan");
    expect(plainLimitation("Bản nháp chưa có somethingNew: cần điền trước khi lưu.")).toContain("một số mục bắt buộc");
    // Every other line is the AI's or the server's own sentence and stays as written.
    for (const line of ["Không xét nhà xưởng", "Đã bỏ 3 đối tượng thuộc hạ tầng PCCC (1 lối thoát/điểm tập kết, 2 thiết bị cố định): tình huống dùng các đối tượng này từ hạ tầng đã thẩm định."]) expect(plainLimitation(line)).toBe(line);
  });

  test("exits and fixed equipment are not offered; scenario objects and door states are", () => {
    const plan = buildApplyPlan(proposal, draft, new Set(["f1"]), "scenario-on-infrastructure");
    const eligible = plan.objects.filter((item) => item.eligible).map((item) => item.id);
    expect(eligible).toEqual(["spawn-a", "towel-a", "lock-a"]);
    expect(plan.objects.find((item) => item.id === "exit-a")?.reason).toContain("Hạ tầng PCCC");
    // A draft created before fire infrastructures existed still takes everything.
    expect(buildApplyPlan(proposal, draft, new Set(["f1"])).objects.every((item) => item.eligible)).toBe(true);
  });

  test("the situation fields can be applied; audience stays a deliberate choice", () => {
    const plan = buildApplyPlan(proposal, draft, new Set(["f1"]), "scenario-on-infrastructure");
    expect(plan.fields.find((field) => field.key === "assumption")).toMatchObject({ selectable: true, defaultOn: true });
    expect(plan.fields.find((field) => field.key === "audience")).toMatchObject({ selectable: true, defaultOn: false });
    expect(plan.ignoredKeys).not.toContain("audience");
  });
});
