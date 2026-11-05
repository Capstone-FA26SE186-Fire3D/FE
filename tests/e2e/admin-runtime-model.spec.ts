import { expect, test } from "@playwright/test";

import { parseFieldErrors } from "../../src/api/errors";
import { ApiError } from "../../src/api/types/common";
import { describeRuntimeError, parseRuntimeEntry, parseRuntimeFile, runtimeFieldLabel, sortEntries, withActive } from "../../src/features/admin-runtime/model";

/** Pure logic of /admin/runtime: the dropped payload file, its summary, server rows and error wording. */
const file = {
  runtimeVersion: "2.2.0",
  protocolVersion: "1",
  manifestSchemaVersion: "1",
  capabilities: ["alarm.call_point", "player.movement", "custom.thing"],
  capabilityContracts: {
    "alarm.call_point": { version: "1.0.0", objectKinds: ["Equipment"], events: [{ type: "AlarmRaised", payload: {} }], actions: [{ id: "press", event: "AlarmRaised" }] },
    "player.movement": { version: "1.0.0", objectKinds: ["Spawn"], events: [{ type: "Jumped", metric: "jumped", payload: {} }] },
  },
  isActive: true,
};

const problem = (status: number, payload: Record<string, unknown>) => new ApiError(String(payload.title ?? "error"), status, payload, undefined, typeof payload.code === "string" ? payload.code : undefined, parseFieldErrors(payload));

test.describe("parseRuntimeFile", () => {
  test("summarises a Unity payload and starts with activation OFF whatever the file says", () => {
    const result = parseRuntimeFile(`﻿${JSON.stringify(file)}`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary).toEqual({ runtimeVersion: "2.2.0", protocolVersion: "1", manifestSchemaVersion: "1", capabilityCount: 3, contractCount: 2, fileAsksActive: true });
    expect(result.payload.isActive).toBe(false);
    expect(result.payload.capabilityContracts).toEqual(file.capabilityContracts);
    expect(withActive(result.payload, true).isActive).toBe(true);
  });

  test("accepts a file without contracts or isActive", () => {
    const result = parseRuntimeFile(JSON.stringify({ runtimeVersion: "3.0.0", protocolVersion: "1", manifestSchemaVersion: "1", capabilities: [] }));
    expect(result.ok && result.payload).toEqual({ runtimeVersion: "3.0.0", protocolVersion: "1", manifestSchemaVersion: "1", capabilities: [], isActive: false });
  });

  test("rejects unreadable JSON and a non-object", () => {
    expect(parseRuntimeFile("{ not json").ok).toBe(false);
    expect(parseRuntimeFile("[1,2]").ok).toBe(false);
  });

  test("lists every rule the server would refuse, in Vietnamese", () => {
    const result = parseRuntimeFile(JSON.stringify({ runtimeVersion: "v2.2", protocolVersion: " ", capabilities: ["door.exit", "door.exit", "bad id"], capabilityContracts: { "fire.source": {} }, isActive: "yes" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toHaveLength(7);
    expect(result.problems.join(" ")).toContain("2.2.0");
    expect(result.problems.join(" ")).toContain("Cửa thoát");
    expect(result.problems.join(" ")).toContain("Nguồn cháy");
    for (const line of result.problems) expect(line).not.toMatch(/runtimeVersion|capabilityContracts|VALIDATION/);
  });
});

test.describe("server rows", () => {
  test("parses an entry and drops malformed contract parts", () => {
    const entry = parseRuntimeEntry({ id: "a", createdAt: "2026-11-04T00:00:00Z", ...file, capabilityContracts: { ...file.capabilityContracts, broken: "x" } });
    expect(entry?.isActive).toBe(true);
    expect(Object.keys(entry!.capabilityContracts)).toEqual(["alarm.call_point", "player.movement"]);
    expect(entry!.capabilityContracts["alarm.call_point"]).toEqual({ version: "1.0.0", objectKinds: ["Equipment"], description: null, events: [{ type: "AlarmRaised", description: null, metric: null }], actions: [{ id: "press", event: "AlarmRaised" }] });
    expect(parseRuntimeEntry({ runtimeVersion: "1.0.0" })).toBeNull();
  });

  test("keeps newest first, then the higher version on a tie", () => {
    const row = (id: string, runtimeVersion: string, createdAt: string) => parseRuntimeEntry({ id, runtimeVersion, createdAt })!;
    const sorted = sortEntries([row("a", "2.0.2", "2026-10-01T00:00:00Z"), row("b", "2.10.0", "2026-11-01T00:00:00Z"), row("c", "2.9.0", "2026-11-01T00:00:00Z")]);
    expect(sorted.map((entry) => entry.runtimeVersion)).toEqual(["2.10.0", "2.9.0", "2.0.2"]);
  });
});

test.describe("errors", () => {
  test("409 says the version is already registered", () => {
    const view = describeRuntimeError(problem(409, { code: "RUNTIME_VERSION_EXISTS", title: "This runtime version is already registered" }));
    expect(view.kind).toBe("exists");
    expect(view.title).toBe("Phiên bản này đã đăng ký rồi");
  });

  test("400 lists issues by field, naming capabilities whose ids contain dots", () => {
    const view = describeRuntimeError(problem(400, {
      code: "VALIDATION_ERROR",
      errors: {
        "$.capabilityContracts.alarm.call_point.events": ["Metric jumped of AlarmRaised is a core metric."],
        "$.capabilityContracts.player.movement.objectKinds[0]": ["Required."],
        "$.capabilityContracts.unknown.cap": ["Contract must belong to a capability listed by this runtime."],
      },
    }), file.capabilities);
    expect(view.kind).toBe("invalid");
    expect(view.issues).toEqual([
      { field: "Năng lực “Nút báo cháy” · Sự kiện", message: "Chỉ số chấm điểm này trùng với một chỉ số đã có của hệ thống hoặc của năng lực khác." },
      { field: "Năng lực “Di chuyển của người chơi” · Loại đối tượng 1", message: "Bắt buộc phải có." },
      { field: "Mô tả năng lực", message: "Mô tả này thuộc một năng lực không có trong danh sách năng lực." },
    ]);
  });

  test("400 without a field map still explains what to do", () => {
    const view = describeRuntimeError(problem(400, { code: "VALIDATION_ERROR" }));
    expect(view.issues).toEqual([]);
    expect(view.message).toContain("Xuất lại tệp");
  });

  test("field labels", () => {
    expect(runtimeFieldLabel("$.runtimeVersion")).toBe("Số phiên bản");
    expect(runtimeFieldLabel("$.capabilities[2]")).toBe("Danh sách năng lực 3");
    expect(runtimeFieldLabel("$.capabilityContracts.custom.thing.events[1].metric", file.capabilities)).toBe("Năng lực “custom.thing” · Sự kiện 2 · Chỉ số chấm điểm");
  });

  test("network failure and 404", () => {
    expect(describeRuntimeError(new TypeError("fetch failed")).kind).toBe("retry");
    expect(describeRuntimeError(problem(404, { code: "NOT_FOUND" })).kind).toBe("notFound");
  });
});
