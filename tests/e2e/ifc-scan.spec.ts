import { expect, test } from "@playwright/test";
import { buildIfcGeometry, releaseIfcBinding } from "../../src/features/ifc-scan/ifc-loader";
import { buildSceneScan, buildScenarioSuggestion, categorizeIfcType, classifyIfcType } from "../../src/features/ifc-scan/scan-suggestions";

const element = (expressID: number, kind: "room" | "stair" | "exit") => ({
  expressID,
  kind,
  typeName: kind === "room" ? "IFCSPACE" : kind === "stair" ? "IFCSTAIR" : "IFCDOOR",
  bounds: { min: [0, 0, 0] as const, max: [1, 1, 1] as const },
});

test("classifies IFC elements used by the evacuation scan", () => {
  expect(classifyIfcType("IFCWALLSTANDARDCASE")).toBe("wall");
  expect(classifyIfcType("IFCSPACE")).toBe("room");
  expect(classifyIfcType("IFCBUILDINGELEMENTPROXY")).toBe("other");
});

test("reads web-ifc vertex data as interleaved position + normal (no shattered triangles)", () => {
  // One quad: 4 vertices × (x, y, z, nx, ny, nz). Reading it with stride 3 would yield 8 bogus vertices.
  const vertices = new Float32Array([
    0, 0, 0, 0, 1, 0,
    2, 0, 0, 0, 1, 0,
    2, 0, 3, 0, 1, 0,
    0, 0, 3, 0, 1, 0,
  ]);
  const geometry = buildIfcGeometry(vertices, new Uint32Array([0, 1, 2, 0, 2, 3]));

  expect(geometry.getAttribute("position").count).toBe(4);
  expect([geometry.getAttribute("position").getX(2), geometry.getAttribute("position").getZ(2)]).toEqual([2, 3]);
  expect(geometry.getAttribute("normal").getY(1)).toBe(1);
  expect(geometry.boundingBox?.max.toArray()).toEqual([2, 0, 3]);
  expect(() => buildIfcGeometry(new Float32Array(9), new Uint32Array([0, 1, 2]))).toThrow();
});

test("groups IFC entities into viewer layers regardless of case", () => {
  expect(categorizeIfcType("IFCWALLSTANDARDCASE")).toBe("wall");
  expect(categorizeIfcType("IfcCurtainWall")).toBe("window");
  expect(categorizeIfcType("IFCSTAIRFLIGHT")).toBe("stair");
  expect(categorizeIfcType("IFCFIRESUPPRESSIONTERMINAL")).toBe("equipment");
  expect(categorizeIfcType("IFCSPACE")).toBe("space");
  expect(categorizeIfcType("IFCBUILDINGELEMENTPROXY")).toBe("other");
  expect(classifyIfcType("IfcBuildingStorey")).toBe("storey");
});

test("requires a room, stair, and exit before a scenario is ready", () => {
  expect(buildScenarioSuggestion([element(1, "room"), element(2, "stair"), element(3, "exit")]))
    .toMatchObject({ readyForReview: true, missingAnchorKinds: [] });

  expect(buildScenarioSuggestion([element(1, "room"), element(2, "stair")]))
    .toMatchObject({ readyForReview: false, missingAnchorKinds: ["exit"] });
});

test("creates an in-memory manifest from IFC scan elements", () => {
  expect(buildSceneScan("school.ifc", "IFC4", [element(42, "exit")])).toMatchObject({
    fileName: "school.ifc",
    schema: "IFC4",
    elements: [{ expressID: 42, kind: "exit" }],
  });
});

test("does not call delete on a web-ifc binding that has no runtime disposer", () => {
  const flatMesh = { expressID: 1, geometries: { get: () => null, size: () => 0 } };

  expect(() => releaseIfcBinding(flatMesh)).not.toThrow();
});

test("shows a local-only IFC workspace", async ({ page }) => {
  await page.goto("/demo/ifc");
  await expect(page.getByRole("heading", { name: "Quét mô hình IFC" })).toBeVisible();
  await expect(page.getByLabel("Chọn tệp IFC")).toHaveAttribute("accept", ".ifc");
  await expect(page.getByText("File chỉ được xử lý trong trình duyệt này.")).toBeVisible();
  await expect(page.getByRole("toolbar", { name: "Công cụ xem mô hình" })).toBeVisible();
  await expect(page.getByText("Kéo thả tệp IFC vào đây")).toBeVisible();
});

test("serves the IFC WebAssembly asset and rejects a non-IFC file", async ({ page }) => {
  const wasm = await page.request.get("/ifc/web-ifc.wasm");
  expect(wasm.ok()).toBe(true);

  await page.goto("/demo/ifc");
  await page.getByLabel("Chọn tệp IFC").setInputFiles({
    name: "not-a-model.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not an IFC model"),
  });
  await expect(page.getByText("Hãy chọn một tệp IFC (.ifc) không rỗng.")).toBeVisible();
});
