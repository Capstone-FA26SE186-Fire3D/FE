import { expect, test } from "@playwright/test";
import { putIfcObject, sha256Hex, validateIfcFile } from "../../src/features/buildings/ifc-upload";

test("accepts a non-empty IFC file and produces lowercase SHA-256 hex", async () => {
  const file = new File(["IFC"], "school.ifc", { type: "application/octet-stream" });

  expect(validateIfcFile(file)).toBeNull();
  await expect(sha256Hex(await file.arrayBuffer())).resolves.toMatch(/^[0-9a-f]{64}$/);
});

test("rejects a missing or non-IFC file before requesting an upload URL", () => {
  expect(validateIfcFile(null)).toMatch(/IFC/);
  expect(validateIfcFile(new File(["x"], "model.txt"))).toMatch(/IFC/);
});

test("sends only the octet-stream content type to a signed upload URL", async () => {
  const captured: RequestInit[] = [];

  await putIfcObject("https://storage.example/upload", new File(["IFC"], "school.ifc"), async (_url, init) => {
    captured.push(init!);
    return new Response(null, { status: 200 });
  });

  expect(captured[0].method).toBe("PUT");
  expect(new Headers(captured[0].headers).get("Content-Type")).toBe("application/octet-stream");
  expect(new Headers(captured[0].headers).get("Authorization")).toBeNull();
});

test("rejects a failed signed upload", async () => {
  await expect(
    putIfcObject("https://storage.example/upload", new File(["IFC"], "school.ifc"), async () => new Response(null, { status: 403 })),
  ).rejects.toThrow("Không thể tải IFC lên kho lưu trữ.");
});
