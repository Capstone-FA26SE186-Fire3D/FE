import { expect, test, type Page } from "@playwright/test";

/*
 * Runs against `pnpm dev` (set PLAYWRIGHT_DEV_URL, e.g. http://localhost:5241); skipped otherwise.
 * Evidence type: the prototype uses LOCAL SAMPLE DATA and route-mocked auth. No review/Learn/Library API exists
 * yet, so none of this is integration evidence.
 */
const devUrl = process.env.PLAYWRIGHT_DEV_URL;
test.skip(!devUrl, "set PLAYWRIGHT_DEV_URL to a running `pnpm dev` server");
test.use({ baseURL: devUrl });

const admin = { id: "admin", email: "admin@fire3d.test", fullName: "Platform Admin", role: 0, organizationId: null, profileRevision: 1 };
const owner = { id: "owner", email: "owner@fire3d.test", fullName: "Nguyễn Văn A", username: "nguyen.van.a", role: 1, organizationId: "org-1", profileRevision: 1 };

async function signIn(page: Page, user: typeof admin | typeof owner = admin) {
  await page.addInitScript(() => sessionStorage.setItem("fire3d-auth-tokens", JSON.stringify({ accessToken: "ops-access", refreshToken: "ops-refresh" })));
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: user, headers: { ETag: '"1"' } }));
}

const apiCalls = (page: Page) => {
  const calls: string[] = [];
  page.on("request", (request) => { const { pathname } = new URL(request.url()); if (/^\/api\/.*(scenario-versions|scenario-reviews|admin\/learn|library)/i.test(pathname)) calls.push(`${request.method()} ${pathname}`); });
  return calls;
};

test("dev shows the prototype banner and the pending blocker together", async ({ page }) => {
  await signIn(page);
  for (const path of ["/admin/reviews", "/admin/learn", "/admin/library"]) {
    await page.goto(path);
    await expect(page.getByTestId("pending-module")).toBeVisible();
    await expect(page.getByTestId("prototype-banner")).toContainText("Dữ liệu mẫu · chỉ môi trường phát triển");
  }
});

test("organization users are blocked in dev as well", async ({ page }) => {
  await signIn(page, owner);
  await page.goto("/admin/reviews");
  await expect(page.getByRole("heading", { name: "Không có quyền truy cập" })).toBeVisible();
  await expect(page.getByTestId("prototype-banner")).toHaveCount(0);
});

test.describe("reviews prototype", () => {
  test("filters, pagination in URL, detail with separate readiness and hashes", async ({ page }) => {
    await signIn(page);
    const calls = apiCalls(page);
    await page.goto("/admin/reviews");
    await expect(page.getByRole("table", { name: /Hàng chờ/ }).getByRole("row")).toHaveCount(7); // header + 6
    await page.getByLabel("Trạng thái duyệt").selectOption("Submitted");
    await expect(page).toHaveURL(/status=Submitted/);
    await page.getByRole("combobox", { name: "Tổ chức" }).selectOption("org-saomai");
    await expect(page).toHaveURL(/organizationId=org-saomai/);
    await expect(page.getByRole("button", { name: /Cháy kho hàng giờ cao điểm/ })).toBeVisible();
    await page.getByRole("button", { name: /Cháy kho hàng giờ cao điểm/ }).click();
    await expect(page).toHaveURL(/review=version-/);
    await expect(page.getByText("Readiness kỹ thuật không thay thế việc duyệt nội dung")).toBeVisible();
    await page.getByRole("tab", { name: "Hash đóng băng" }).click();
    await expect(page.getByLabel("Hash nội dung")).toHaveText(/^[0-9a-f]{64}$/);
    await page.getByRole("tab", { name: "Readiness kỹ thuật" }).click();
    await expect(page.getByText("ConfirmForTraining")).toBeVisible();
    expect(calls).toEqual([]);
  });

  test("pagination", async ({ page }) => {
    await signIn(page);
    await page.goto("/admin/reviews");
    await page.getByRole("button", { name: "Trang sau" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByText("Trang 2/3")).toBeVisible();
  });

  test("reject requires a reason and keeps the idempotency key across a lost response", async ({ page }) => {
    await signIn(page);
    await page.goto("/admin/reviews?status=Submitted");
    await page.getByRole("button", { name: /Sơ tán giờ ra chơi/ }).click();
    await page.getByRole("button", { name: "Từ chối", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Từ chối", exact: true }).click();
    await expect(dialog.getByText("Nhập lý do từ chối")).toBeVisible();
    await dialog.getByLabel(/Lý do từ chối/).fill("Thiếu tiêu chí thời gian phản ứng.");
    await dialog.getByRole("button", { name: "Từ chối", exact: true }).click();
    await expect(page.getByText("Đã từ chối kịch bản")).toBeVisible();
    await expect(page.getByText("Thiếu tiêu chí thời gian phản ứng.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Duyệt nội dung" })).toHaveCount(0);
  });

  test("network failure keeps the reason and retry succeeds once", async ({ page }) => {
    await signIn(page);
    await page.goto("/admin/reviews?status=Submitted");
    await page.getByLabel("Lỗi mạng ở lần gửi quyết định kế tiếp").check();
    await page.getByRole("button", { name: /Cháy phòng máy chủ/ }).click();
    await page.getByRole("button", { name: "Từ chối", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/Lý do từ chối/).fill("Cần bổ sung rubric.");
    await dialog.getByRole("button", { name: "Từ chối", exact: true }).click();
    await expect(dialog.getByText("Không kết nối được tới máy chủ")).toBeVisible();
    await expect(dialog.getByLabel(/Lý do từ chối/)).toHaveValue("Cần bổ sung rubric.");
    await dialog.getByRole("button", { name: "Thử lại" }).click();
    await expect(page.getByText("Đã từ chối kịch bản", { exact: true })).toBeVisible();
  });

  test("approve needs confirmation; hash mismatch is reported and the detail can be reloaded", async ({ page }) => {
    await signIn(page);
    await page.goto("/admin/reviews?status=Submitted");
    await page.getByRole("button", { name: /Mất điện và khói/ }).click();
    await page.getByLabel("409 hash không khớp ở lần kế tiếp").check();
    await page.getByRole("button", { name: "Duyệt nội dung" }).click();
    const dialog = page.getByRole("dialog");
    const confirm = dialog.getByRole("button", { name: "Duyệt nội dung" });
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel("Tôi đã xem nội dung và rubric của đúng phiên bản này.").check();
    await confirm.click();
    await expect(dialog.getByText("Hash không khớp nội dung đã nộp")).toBeVisible();
    await dialog.getByRole("button", { name: "Tải lại chi tiết" }).click();
    await page.getByRole("button", { name: "Duyệt nội dung" }).click();
    await page.getByRole("dialog").getByLabel("Tôi đã xem nội dung và rubric của đúng phiên bản này.").check();
    await page.getByRole("dialog").getByRole("button", { name: "Duyệt nội dung" }).click();
    await expect(page.getByText("Đã duyệt nội dung kịch bản")).toBeVisible();
  });

  test("loading, empty and error simulations", async ({ page }) => {
    await signIn(page);
    await page.goto("/admin/reviews");
    await page.getByLabel("Mô phỏng").selectOption("error");
    await expect(page.getByText("Không tải được hàng chờ")).toBeVisible();
    await page.getByLabel("Mô phỏng").selectOption("empty");
    await expect(page.getByText("Chưa có kịch bản nào chờ duyệt")).toBeVisible();
    await page.getByLabel("Mô phỏng").selectOption("normal");
    await page.getByRole("button", { name: /Sơ tán giờ ra chơi/ }).click();
    await expect(page.getByRole("button", { name: "Về hàng chờ" })).toBeVisible();
    await page.getByLabel("Mô phỏng").selectOption("loading");
    await page.getByRole("button", { name: "Về hàng chờ" }).click();
    await expect(page.getByText("Đang tải hàng chờ duyệt…")).toBeAttached();
  });
});

test.describe("learn prototype", () => {
  test("list, filters and status meaning", async ({ page }) => {
    await signIn(page);
    await page.goto("/admin/learn");
    await page.getByLabel("Trạng thái bài").selectOption("Hidden");
    await expect(page).toHaveURL(/status=Hidden/);
    await page.getByRole("button", { name: /An toàn khi nấu ăn/ }).click();
    await page.getByRole("tab", { name: "Xuất bản" }).click();
    await expect(page.getByText(/vẫn có thể là nguồn RAG/).first()).toBeVisible();
  });

  test("video block rejects other providers, shows a link card and never an iframe", async ({ page }) => {
    await signIn(page);
    await page.goto("/admin/learn?post=new");
    await page.getByRole("tab", { name: "Nội dung" }).click();
    await page.getByLabel("Loại khối").selectOption("video");
    await page.getByRole("button", { name: "Thêm khối" }).click();
    await page.getByLabel("Đường dẫn video").fill("https://vimeo.com/123456");
    await expect(page.getByText("Chỉ chấp nhận video từ YouTube, Facebook hoặc TikTok.")).toBeVisible();
    await page.getByLabel("Đường dẫn video").fill("https://youtu.be/dQw4w9WgXcQ");
    await page.getByLabel("Tóm tắt dự phòng").fill("Tóm tắt cách thoát nạn.");
    const preview = page.getByTestId("media-preview");
    await expect(preview).toContainText("YouTube");
    await expect(preview.getByRole("link")).toHaveAttribute("href", "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await expect(page.locator("iframe")).toHaveCount(0);
  });

  test("create validates the slug, then saves a draft that cannot be published without a situation", async ({ page }) => {
    await signIn(page);
    await page.goto("/admin/learn?post=new");
    await page.getByLabel("Tiêu đề", { exact: true }).fill("Bài thử");
    await page.getByLabel(/Slug/).fill("Bài Thử!");
    await page.getByRole("button", { name: "Lưu bản nháp" }).click();
    await expect(page.getByText(/Slug chỉ gồm chữ thường/).first()).toBeVisible();
    await page.getByLabel(/Slug/).fill("bai-thu-moi");
    await page.getByRole("tab", { name: "Nội dung" }).click();
    await page.getByRole("button", { name: "Thêm khối" }).click();
    await page.getByRole("textbox", { name: "Nội dung *" }).fill("Đoạn mở đầu.");
    await page.getByRole("button", { name: "Lưu bản nháp" }).click();
    await expect(page.getByText("Đã tạo bản nháp")).toBeVisible();
    await expect(page).toHaveURL(/post=lp-/);
    await page.getByRole("tab", { name: "Xuất bản" }).click();
    await page.getByRole("button", { name: "Xuất bản bản nháp" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Xuất bản", exact: true }).click();
    await expect(page.getByRole("dialog").getByText("Chọn ít nhất một tình huống")).toBeVisible();
  });

  test("412 keeps my edit and offers to compare with the newer version", async ({ page }) => {
    await signIn(page);
    await page.goto("/admin/learn?status=Published");
    await page.getByRole("button", { name: /Thoát nạn khi có khói dày/ }).first().click();
    await page.getByLabel("Tiêu đề", { exact: true }).fill("Tiêu đề tôi vừa sửa");
    await page.getByRole("button", { name: "Giả lập: người khác sửa bài này" }).click();
    await page.getByRole("button", { name: "Lưu bản nháp" }).click();
    await expect(page.getByText("Bài đã được thay đổi ở nơi khác kể từ lần bạn mở").first()).toBeVisible();
    await expect(page.getByLabel("Tiêu đề", { exact: true })).toHaveValue("Tiêu đề tôi vừa sửa");
    await expect(page.getByText("Đối chiếu với bản mới nhất")).toBeVisible();
    await page.getByRole("button", { name: "Giữ nội dung của tôi" }).click();
    await page.getByRole("button", { name: "Lưu bản nháp" }).click();
    await expect(page.getByText("Đã lưu bản nháp")).toBeVisible();
  });

  test("hide, show, delete and restore follow the documented lifecycle", async ({ page }) => {
    await signIn(page);
    await page.goto("/admin/learn?status=Published");
    await page.getByRole("button", { name: /Nhớ nhanh quy tắc PASS/ }).click();
    await page.getByRole("tab", { name: "Xuất bản" }).click();
    await page.getByRole("button", { name: "Ẩn bài" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Ẩn bài" }).click();
    await expect(page.getByText("Đã ẩn bài", { exact: true })).toBeVisible();
    await expect(page.getByText("Đã ẩn", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Xóa bài" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Xóa bài" }).click();
    await expect(page.getByText("Đã xóa bài", { exact: true })).toBeVisible();
    await expect(page.getByText("Đã xóa", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Khôi phục" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Khôi phục" }).click();
    await expect(page.getByText("Đã khôi phục bài", { exact: true })).toBeVisible();
    await expect(page.getByText("Đã ẩn", { exact: true }).first()).toBeVisible(); // restored to Hidden, not public
  });

  test("showing a hidden post with an unapproved source is refused by the (sample) backend", async ({ page }) => {
    await signIn(page);
    await page.goto("/admin/learn?status=Unpublished");
    await page.getByRole("button", { name: /Hỗ trợ người lớn tuổi/ }).click();
    await page.getByRole("tab", { name: "Xuất bản" }).click();
    await page.getByRole("button", { name: "Xuất bản bản nháp" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Xuất bản", exact: true }).click();
    await expect(page.getByRole("dialog").getByText(/Nguồn chưa được duyệt|nguồn Common chưa được duyệt/)).toBeVisible();
  });
});

test.describe("library prototype", () => {
  test("tabs, versions are immutable once published, new draft then publish", async ({ page }) => {
    await signIn(page);
    await page.goto("/admin/library");
    await page.getByRole("tab", { name: "Rubric mẫu" }).click();
    await expect(page).toHaveURL(/kind=RubricSample/);
    await page.getByRole("button", { name: /Rubric sơ tán cơ bản/ }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByText("Đã xuất bản (bất biến)")).toBeVisible();
    await drawer.getByRole("button", { name: "Tạo phiên bản mới" }).click();
    await drawer.getByLabel("Tên phiên bản").fill("Rubric sơ tán cơ bản v2");
    await drawer.getByRole("button", { name: "Lưu bản nháp" }).click();
    await expect(page.getByText("Đã tạo bản nháp mới")).toBeVisible();
    await drawer.getByRole("button", { name: /Xuất bản v2/ }).click();
    await expect(page.getByText("Đã xuất bản v2")).toBeVisible();
  });

  test("equipment cannot be saved without a runtime capability and shows the no-new-capability notice", async ({ page }) => {
    await signIn(page);
    await page.goto("/admin/library?kind=Equipment");
    await expect(page.getByText("Metadata thiết bị không thêm khả năng cho runtime")).toBeVisible();
    await page.getByRole("button", { name: "Thêm mục", exact: true }).first().click();
    const drawer = page.getByRole("dialog");
    await drawer.getByLabel("Mã").fill("smoke-hood");
    await drawer.getByLabel("Tên phiên bản").fill("Mặt nạ lọc khói");
    await drawer.getByRole("button", { name: "Tạo mục" }).click();
    await expect(drawer.getByText("Thiết bị phải gắn ít nhất một khả năng runtime đã có.")).toBeVisible();
    await expect(drawer.getByLabel("Tên phiên bản")).toHaveValue("Mặt nạ lọc khói");
    await drawer.getByLabel("cover.nose").check();
    await drawer.getByRole("button", { name: "Tạo mục" }).click();
    await expect(page.getByText("Đã tạo mục thư viện")).toBeVisible();
  });

  test("duplicate code is rejected and deactivate needs confirmation", async ({ page }) => {
    await signIn(page);
    await page.goto("/admin/library");
    await page.getByRole("button", { name: "Thêm mục", exact: true }).first().click();
    const drawer = page.getByRole("dialog");
    await drawer.getByLabel("Mã").fill("school-evacuation");
    await drawer.getByLabel("Tên phiên bản").fill("Trùng mã");
    await drawer.getByRole("button", { name: "Tạo mục" }).click();
    await expect(drawer.getByText("Mã này đã tồn tại.")).toBeVisible();
    await drawer.getByRole("button", { name: "Hủy" }).click();
    await page.getByRole("button", { name: /Khói tại văn phòng nhiều tầng/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Ngừng dùng" }).click();
    await page.getByRole("dialog").filter({ hasText: "Ngừng dùng mục này?" }).getByRole("button", { name: "Xác nhận" }).click();
    await expect(page.getByText("Đã ngừng dùng mục")).toBeVisible();
  });
});

for (const width of [1440, 375]) {
  for (const theme of ["light", "dark"] as const) {
    test(`prototype screens fit ${width}px in the ${theme} theme`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: width === 375 ? 800 : 900 });
      await page.emulateMedia({ colorScheme: theme });
      await signIn(page);
      for (const path of ["/admin/reviews", "/admin/reviews?review=version-sample-1", "/admin/learn", "/admin/learn?post=lp-1", "/admin/library"]) {
        await page.goto(path);
        await expect(page.getByTestId("prototype-banner")).toBeVisible();
        await page.waitForTimeout(700);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${path} overflows horizontally`).toBeLessThanOrEqual(0);
        await page.screenshot({ path: testInfo.outputPath(`${path.replace(/[^a-z0-9]+/gi, "_")}-${width}-${theme}.png`), fullPage: true });
      }
    });
  }
}
