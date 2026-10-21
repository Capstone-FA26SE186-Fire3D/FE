import { expect, test } from "@playwright/test";

/*
 * /demo/landing-lab is the developer measurement page for the circular glass landing prototype. A production build
 * (the default for this suite, `next start`) answers 404 and nothing links to it; a development server opens it.
 */
const development = process.env.PLAYWRIGHT_SERVER_MODE === "dev";

test("a production build answers 404 for /demo/landing-lab", async ({ request }) => {
  test.skip(development, "development server");
  expect((await request.get("/demo/landing-lab")).status()).toBe(404);
});

test("a development server opens /demo/landing-lab and renders with one WebGL renderer", async ({ page }) => {
  test.skip(!development, "production build");
  test.setTimeout(240_000); // each rendered step is slow on a software-GL runner; this is a functional check
  await page.goto("/demo/landing-lab");
  await expect(page.getByRole("region", { name: "Bảng đo bản thử" })).toBeVisible();
  await page.waitForFunction(() => window.__landingLab?.ready === true || window.__landingLab?.error, undefined, { timeout: 30_000 });
  const state = await page.evaluate(() => ({ error: window.__landingLab?.error, stats: window.__landingLab?.stats }));
  if (state.error) test.skip(true, `WebGL unavailable: ${state.error}`);
  await page.waitForFunction(() => (window.__landingLab?.stats?.drawCalls ?? 0) > 0);
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => window.__landingLab?.remount());
    await page.waitForTimeout(1500);
  }
  await page.waitForFunction(() => window.__landingLab?.stats?.renderers === 1);
  // Organization branch: the demonstration clock runs, the building collapses, and leaving the branch resets it completely.
  await page.evaluate(() => { window.__landingLab?.setProgress(1); window.__landingLab?.setMode("organization"); });
  await page.waitForFunction(() => Number(document.querySelector("canvas")?.dataset.cutaway) > 0.995, undefined, { timeout: 30_000 });
  await page.evaluate(() => window.__landingLab?.seekDamage(130));
  await page.waitForFunction(() => Number(document.querySelector("canvas")?.dataset.collapse) > 0.05, undefined, { timeout: 15_000 });
  await page.evaluate(() => window.__landingLab?.setMode("journey"));
  await page.waitForFunction(() => Number(document.querySelector("canvas")?.dataset.collapse) === 0 && Number(document.querySelector("canvas")?.dataset.damageTime) === 0, undefined, { timeout: 15_000 });
  // Rapid branch switching must not leak renderers or accumulate GPU resources.
  // One warm-up pass uploads each mode's resources once; further switching must not add any.
  for (const m of ["trainee", "organization", "journey"]) { await page.evaluate(mode => window.__landingLab?.setMode(mode as "journey"), m); await page.waitForTimeout(900); }
  const before = await page.evaluate(() => window.__landingLab?.stats);
  for (let i = 0; i < 6; i++) { await page.evaluate(m => window.__landingLab?.setMode(m), i % 2 ? "trainee" : "organization"); await page.waitForTimeout(250); }
  await page.evaluate(() => window.__landingLab?.setMode("journey")); await page.waitForTimeout(1500);
  const after = await page.evaluate(() => window.__landingLab?.stats);
  expect(after?.renderers).toBe(1);
  expect(after?.geometries).toBeLessThanOrEqual(before?.geometries ?? 0);
  expect(after?.textures).toBeLessThanOrEqual(before?.textures ?? 0);
  const stats = await page.evaluate(() => window.__landingLab?.stats);
  expect(stats?.renderers).toBe(1);
  expect(stats?.characters).toBeGreaterThan(0);
});
