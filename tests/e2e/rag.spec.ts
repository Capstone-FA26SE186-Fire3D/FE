import { expect, test } from "@playwright/test";

test('upload retains multipart contract and locks concurrent actions', async ({ page }) => {
  let release: () => void = () => {};
  const pending = new Promise<void>(resolve => { release = resolve; });
  let body = '';
  await page.route('**/documents', async route => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().headers()['content-type']).toContain('multipart/form-data');
    body = route.request().postData() ?? '';
    await pending;
    await route.fulfill({json:{status:'ok'}});
  });
  await page.goto('/demo/rag');
  await page.getByLabel('Câu hỏi RAG').fill('Câu hỏi thử nghiệm');
  await page.locator('input[type=file]').setInputFiles({name:'demo.txt',mimeType:'text/plain',buffer:Buffer.from('Fire3D demo only')});
  await expect(page.getByRole('button',{name:'Đang nạp tài liệu...'})).toBeDisabled();
  await expect(page.locator('input[type=file]')).toBeDisabled();
  expect(body).toContain('name="file"'); expect(body).toContain('Fire3D demo only');
  release();
  await expect(page.getByRole('status')).toContainText('demo.txt');
  await expect(page.getByRole('button',{name:'Hỏi tài liệu'})).toBeEnabled();
});

test('chat payload, source content and non-JSON error are handled', async ({page}) => {
  let attempt = 0;
  await page.route('**/chat', async route => {
    expect(route.request().postDataJSON()).toEqual({question:'Câu hỏi mẫu'});
    if (attempt++ === 0) await route.fulfill({status:503,contentType:'text/html',body:'unavailable'});
    else await route.fulfill({json:{answer:'Trả lời mẫu',sources:[{document_name:'demo.txt',chunk_index:2,content:'Nội dung nguồn minh họa'}]}});
  });
  await page.goto('/demo/rag'); await page.getByLabel('Câu hỏi RAG').fill('  Câu hỏi mẫu  ');
  await page.getByRole('button',{name:'Hỏi tài liệu'}).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Không thể hỏi tài liệu');
  await page.getByRole('button',{name:'Hỏi tài liệu'}).click();
  await expect(page.getByText('Nội dung nguồn minh họa')).toBeVisible();
});

test('network failure permits retry and malformed success cannot crash UI', async ({page}) => {
  let attempt = 0;
  await page.route('**/chat', async route => {
    if (attempt++ === 0) await route.abort('failed');
    else await route.fulfill({json:{answer:42,sources:null}});
  });
  await page.goto('/demo/rag');await page.getByLabel('Câu hỏi RAG').fill('Test');
  await page.getByRole('button',{name:'Hỏi tài liệu'}).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Không kết nối');
  await page.getByRole('button',{name:'Hỏi tài liệu'}).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('không đúng định dạng');
});
