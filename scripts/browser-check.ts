/** Public UI verification only: no engine/store/IndexedDB inspection. */
import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const out = process.env.BROWSER_ARTIFACTS ?? "/tmp/parent-browser-check";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) errors.push(message.text());
  });
  const baseUrl = process.env.GAME_URL ?? "http://127.0.0.1:5173";
  const initialDocument = await page.goto(baseUrl);
  // Startの初期HTMLはシェル。ゲーム画面はブラウザで描画する。
  const shell = await initialDocument!.text();
  expect(shell).toContain("予定表を開いています");
  expect(shell).not.toContain("新しい人生をはじめる");
  await expect(page).toHaveTitle(/親伝説/);
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "新しい人生をはじめる" })).toBeEnabled();
  await expect(page.getByLabel("難易度")).toHaveValue("normal");
  await page.getByLabel("難易度").selectOption("hard");
  await expect(
    page.getByText("少ない資金と高めの生活費のなかで、やりくりを工夫する", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: out + "/home.png", fullPage: true });
  await page.getByRole("button", { name: "新しい人生をはじめる" }).click();
  await expect(page.getByRole("heading", { name: "0歳 春〜夏", exact: true })).toBeVisible();
  await expect(page.locator(".run-id")).toContainText("むずかしい");
  await expect(page.getByRole("button", { name: "半年を進める →", exact: true })).toBeDisabled();
  await page.locator('input[name="parents.A.rest"]').fill("1");
  await expect(page.getByRole("button", { name: "方針を保存", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "01 交代で見守る 費用 0万円", exact: true }).click();
  await expect(page.getByRole("button", { name: "半年を進める →", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "遊び方", exact: true }).click();
  await expect(page.locator(".plan-section")).toBeHidden();
  await page.getByRole("button", { name: "家族の記録", exact: true }).click();
  await expect(page.locator(".plan-section")).toBeHidden();
  await page.getByRole("button", { name: "いまの暮らし", exact: true }).click();
  await expect(page.locator('input[name="parents.A.rest"]')).toHaveValue("1");
  await page.getByRole("button", { name: "編集を取り消す", exact: true }).click();
  await expect(page.locator('input[name="parents.A.rest"]')).toHaveValue("2");
  await expect(page.getByRole("button", { name: "半年を進める →", exact: true })).toBeEnabled();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "✓ 交代で見守る 費用 0万円", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "子どもの「好き」に付き合う", exact: true }).click();
  await expect(page.getByRole("button", { name: "半年を進める →", exact: true })).toBeDisabled();
  await page.locator('input[name="parents.A.rest"]').press("Enter");
  await expect(page.getByRole("button", { name: "方針を保存", exact: true })).toBeDisabled();
  await page.screenshot({ path: out + "/game-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: out + "/game-mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  const log: { turn: number; heading: string }[] = [];
  for (let t = 1; t <= 40; t++) {
    await page.getByRole("button", { name: "子どもの「好き」に付き合う", exact: true }).click();
    const save = page.getByRole("button", { name: "方針を保存", exact: true });
    if (await save.isEnabled()) {
      await save.click();
      await expect(save).toBeDisabled();
    }
    for (const article of await page.locator(".events article").all()) {
      if (await article.locator('button[aria-pressed="true"]').count()) continue;
      await article.getByRole("button").first().click();
      await expect(article.locator('button[aria-pressed="true"]')).toHaveCount(1);
    }
    const next = page.getByRole("button", { name: "半年を進める →", exact: true });
    await expect(next).toBeEnabled();
    log.push({ turn: t, heading: await page.locator(".timebar h1").innerText() });
    await next.click();
    if (t < 40) {
      await expect(page.locator(".progress")).toContainText(`第 ${t + 1} 期 / 40`);
      await expect(next).toBeVisible();
    } else await expect(page.locator(".ending h1")).toBeVisible();
  }
  await page.screenshot({ path: out + "/ending.png", fullPage: true });
  await page.reload();
  await expect(page.locator(".ending h1")).toBeVisible();
  const ending = await page.locator(".ending h1").innerText();
  const savedUrl = page.url();
  await page.getByRole("link", { name: "← 保存一覧", exact: true }).click();
  await expect(page.locator(".save-list a")).toHaveCount(1);
  await page.locator(".save-list a").click();
  await expect(page).toHaveURL(savedUrl);
  await expect(page.locator(".ending h1")).toHaveText(ending);
  await page.getByRole("button", { name: "家族の記録", exact: true }).click();
  await expect(page.locator(".timeline article")).toHaveCount(48);
  await expect(page.locator(".timeline")).toContainText("最期を迎えた");
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "書き出し", exact: true }).click();
  const download = await downloadEvent;
  await download.saveAs(out + "/browser-save.json");
  const fresh = await browser.newPage();
  await fresh.goto(process.env.GAME_URL ?? "http://127.0.0.1:5173");
  await fresh.getByLabel("保存ファイルを取り込む").setInputFiles(out + "/browser-save.json");
  await expect(fresh.locator(".ending h1")).toHaveText(ending);
  await page.goto(baseUrl + "/page-that-does-not-exist");
  await expect(page.getByRole("heading", { name: "ページが見つかりません。" })).toBeVisible();
  await page.getByRole("link", { name: "保存一覧へ", exact: true }).click();
  await expect(page.locator(".save-list a")).toHaveCount(1);
  await page.goto(baseUrl + "/play/missing-save");
  await expect(page.getByText("保存データを開けませんでした。", { exact: true })).toBeVisible();
  await page.goto(savedUrl);
  await expect(page.locator(".ending h1")).toHaveText(ending);
  expect(errors).toEqual([]);
  await Bun.write(
    out + "/result.json",
    JSON.stringify(
      {
        mode: "public-ui",
        turns: log,
        ending,
        history: 48,
        reload: true,
        spaShell: true,
        savedListResume: true,
        directLink: true,
        unknownRoute: true,
        missingSave: true,
        exportImport: true,
        mobileOverflow: false,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ ok: true, turns: 40, ending, artifacts: out }));
} finally {
  await browser.close();
}
