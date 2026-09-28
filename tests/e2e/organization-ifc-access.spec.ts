import { expect, test } from "@playwright/test";
import { resolveOrganizationIfcAccess } from "../../src/features/ifc-scan/organization-access";

test("waits for session restoration before choosing an IFC workspace state", () => {
  expect(resolveOrganizationIfcAccess({ ready: false, user: null })).toBe("loading");
});

test("requires sign-in and denies Trainee access", () => {
  expect(resolveOrganizationIfcAccess({ ready: true, user: null })).toBe("sign-in");
  expect(resolveOrganizationIfcAccess({ ready: true, user: { role: 2 } })).toBe("denied");
});

test("permits OrganizationUser and PlatformAdmin to use the local workspace", () => {
  expect(resolveOrganizationIfcAccess({ ready: true, user: { role: 1 } })).toBe("granted");
  expect(resolveOrganizationIfcAccess({ ready: true, user: { role: 0 } })).toBe("granted");
});
