import { expect, test, type Page } from "@playwright/test";

async function scrollTo(page: Page, progress: number) {
  await page.evaluate(p => {
    const journey = document.querySelector('main > section') as HTMLElement;
    window.scrollTo({ top: (journey.offsetHeight - innerHeight) * p, behavior: 'instant' });
  }, progress);
}
async function ready(page: Page) {
  await expect(page.locator('main')).toHaveAttribute('data-scene-mode', 'motion');
  await page.waitForFunction(() => Number((document.querySelector('canvas') as HTMLCanvasElement)?.dataset.frames) > 4);
}
async function settled(page: Page, branch: 'phone' | 'cutaway') {
  await page.waitForFunction(key => Number((document.querySelector('canvas') as HTMLCanvasElement)?.dataset[key]) > .995, branch);
  await expect(page.getByRole('button', { name: 'Tiếp tục', exact: true })).toBeEnabled();
}

test('rendered POV reverses while ambient time continues', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /THREE.WebGLProgram|Fire3D:(init|render)/.test(message.text())) errors.push(message.text());
  });
  await page.goto('/'); await ready(page);
  const canvas = page.locator('canvas');
  const start = await canvas.getAttribute('data-camera');
  await scrollTo(page, .4);
  await expect(page.getByRole('heading', { name: 'Tập một lần. Hiểu thêm một chút.' })).toBeVisible();
  await page.waitForFunction(initial => document.querySelector('canvas')?.getAttribute('data-camera') !== initial, start);
  const ambient = Number(await canvas.getAttribute('data-ambient-time'));
  await scrollTo(page, 0);
  await page.waitForFunction(() => Math.abs(Number(document.querySelector('canvas')?.getAttribute('data-camera')?.split(',')[2]) - 7.4) < .02);
  expect(Number(await canvas.getAttribute('data-ambient-time'))).toBeGreaterThan(ambient);
  expect(errors).toEqual([]);
});

test('choices interrupt and return before routing explicitly', async ({ page }) => {
  // Headless trace: each rendered click takes 7–11s on this runner.
  // This is a functional check, not evidence that interaction latency meets target.
  test.setTimeout(120_000);
  await page.goto('/'); await ready(page);
  await scrollTo(page, .9);
  const next = page.getByRole('button', { name: 'Tiếp tục', exact: true });
  await expect(next).toBeHidden();
  await page.getByRole('button', { name: 'Tôi muốn tập huấn', exact: true }).click();
  await page.waitForFunction(() => Number(document.querySelector('canvas')?.getAttribute('data-phone')) > .15);
  await page.getByRole('button', { name: 'Tôi muốn tổ chức tập huấn', exact: true }).click();
  await settled(page, 'cutaway');
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole('button', { name: 'Quay lại điểm lựa chọn' }).click();
  await expect(next).toBeHidden();
  await page.getByRole('button', { name: 'Tôi muốn tập huấn', exact: true }).click();
  await settled(page, 'phone'); await next.click();
  await expect(page).toHaveURL(/\/login\?/);
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.getByRole('button', { name: 'Đăng nhập trải nghiệm' }).click();
  await expect(page).toHaveURL(/\/learning-hub$/);
});

test('cutaway supports drag, arrow keys and Home without selection or outline', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/'); await ready(page);
  const canvas = page.locator('canvas');
  await scrollTo(page, .9);
  const next = page.getByRole('button', { name: 'Tiếp tục', exact: true });
  await expect(next).toBeHidden();
  await page.getByRole('button', { name: 'Tôi muốn tập huấn', exact: true }).click();
  await page.waitForFunction(() => Number(document.querySelector('canvas')?.getAttribute('data-phone')) > .15);
  await page.getByRole('button', { name: 'Tôi muốn tổ chức tập huấn', exact: true }).click();
  await settled(page, 'cutaway');
  const orbit = page.getByRole('group', { name: 'Điều khiển góc nhìn công trình' });
  const bounds = (await orbit.boundingBox())!;
  const beforeOrbit = await canvas.getAttribute('data-camera');
  await page.mouse.move(bounds.x + bounds.width * .5, bounds.y + bounds.height * .5);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * .65, bounds.y + bounds.height * .55, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(initial => document.querySelector('canvas')?.getAttribute('data-camera') !== initial, beforeOrbit);
  expect(await page.evaluate(() => getSelection()?.toString())).toBe('');
  expect(await orbit.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('none');
  await expect(orbit).toBeFocused();
  const beforeKeyboardOrbit = await canvas.getAttribute('data-camera');
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(initial => document.querySelector('canvas')?.getAttribute('data-camera') !== initial, beforeKeyboardOrbit);
  expect(await orbit.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('none');
  const beforeReset = await canvas.getAttribute('data-camera');
  await page.keyboard.press('Home');
  await page.waitForFunction(initial => document.querySelector('canvas')?.getAttribute('data-camera') !== initial, beforeReset);
  await expect(page).toHaveURL(/\/$/);
  await expect(canvas).toHaveCount(1);
});

test('reduced motion skips WebGL and keeps every reading beat and branch reachable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('main')).toHaveAttribute('data-scene-mode', 'static');
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Biết mình đang ở đâu.' })).toBeVisible();
  await page.getByRole('button', { name: 'Tôi muốn tổ chức tập huấn', exact: true }).click();
  await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
  await expect(page).toHaveURL(/\/organizations$/);
  await expect(page.getByRole('heading', { name: 'Publish release và QR' })).toBeVisible();
});

test('context loss gives a usable poster fallback, not a blank canvas', async ({ page }) => {
  await page.goto('/'); await ready(page);
  await page.locator('canvas').evaluate(canvas => {
    (canvas as HTMLCanvasElement).getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
  });
  await expect(page.locator('main')).toHaveAttribute('data-scene-mode', 'static');
  await expect(page.getByRole('status')).toContainText('Chế độ ảnh tĩnh');
  await expect(page.locator('canvas')).toHaveCount(0);
  const poster = await page.request.get('/assets/landing-cutaway.webp');
  expect(poster.ok()).toBeTruthy();
  await page.getByRole('button', { name: 'Tôi muốn tập huấn', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Tiếp tục', exact: true })).toBeEnabled();
});

test('mobile menu exposes every route and layout stays within viewport', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('/'); await ready(page);
  await page.getByLabel('Mở menu điều hướng').click();
  await expect(page.getByRole('navigation', { name: 'Điều hướng trên điện thoại' }).getByRole('link', { name: 'Dành cho tổ chức' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Mở menu điều hướng')).toBeFocused();
  await scrollTo(page, .9);
  const button = page.getByRole('button', { name: 'Tôi muốn tổ chức tập huấn', exact: true });
  const bounds = await button.boundingBox();
  expect(bounds!.height).toBeGreaterThanOrEqual(44);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(640);
  expect(await button.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});
