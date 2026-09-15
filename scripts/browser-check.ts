/** 公開UIのみで検証。エンジン・ストア・IndexedDBの内部値は参照しない。 */
import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const out = process.env.BROWSER_ARTIFACTS ?? "/tmp/parent-browser-decisions";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (["error", "warning"].includes(m.type())) errors.push(m.text());
  });
  const url = process.env.GAME_URL ?? "http://127.0.0.1:5173";
  await page.goto(url);
  await expect(page).toHaveTitle(/親伝説/);
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  await page.getByLabel("難易度").selectOption("hard");
  await page.getByRole("button", { name: "新しい人生をはじめる" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("今期の特殊イベント");
  const eventText = await dialog.innerText();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(dialog).toBeVisible();
  await page.reload();
  await expect(dialog).toHaveText(eventText, { useInnerText: true });
  await page.screenshot({ path: out + "/event-desktop.png", fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: out + "/event-mobile.png", fullPage: false });
  await dialog.locator(".choices button").first().click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".decision-card")).toHaveCount(3);
  await expect(page.locator(".plan-section")).toHaveCount(0);
  const next = page.getByRole("button", { name: "半年を進める →", exact: true });
  await expect(next).toBeDisabled();
  await page.locator(".decision-card").first().getByRole("button").first().click();
  await expect(page.locator(".decision-heading")).toContainText("1 / 3 回答済み");
  await expect(next).toBeDisabled();
  await page.reload();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".decision-heading")).toContainText("1 / 3 回答済み");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: out + "/decisions-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: out + "/decisions-desktop.png", fullPage: true });
  const log: string[] = [];
  for (let turn = 1; turn <= 40; turn++) {
    if (turn > 1) {
      await expect(dialog).toBeVisible();
      await dialog.locator(".choices button").first().click();
      await expect(dialog).toBeHidden();
    }
    for (let index = 0; index < 3; index++) {
      const card = page.locator(".decision-card").nth(index);
      if (!(await card.locator('[aria-pressed="true"]').count())) {
        await card.getByRole("button").first().click();
        await expect(card.locator('[aria-pressed="true"]')).toHaveCount(1);
      }
    }
    await expect(next).toBeEnabled();
    log.push(await page.locator(".timebar h1").innerText());
    await next.click();
    if (turn < 40) await expect(dialog).toContainText(`第${turn + 1}期`);
  }
  await expect(page.locator(".ending h1")).toBeVisible();
  const ending = await page.locator(".ending h1").innerText();
  await page.reload();
  await expect(page.locator(".ending h1")).toHaveText(ending);
  await page.screenshot({ path: out + "/ending.png", fullPage: true });
  await page.getByRole("button", { name: "家族の記録", exact: true }).click();
  await expect(page.locator(".timeline article")).toHaveCount(88);
  await expect(page.locator(".timeline")).toContainText("最期を迎えた");
  await expect(page.locator(".timeline")).not.toContainText("親A");
  await page.getByRole("button", { name: "人生の結末", exact: true }).click();
  await expect(page.locator(".ending h1")).toHaveText(ending);
  const savedUrl = page.url();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "書き出し", exact: true }).click();
  await (await downloadPromise).saveAs(out + "/save.json");
  const fresh = await browser.newPage();
  await fresh.goto(url);
  await fresh.getByLabel("保存ファイルを取り込む").setInputFiles(out + "/save.json");
  await expect(fresh.locator(".ending h1")).toHaveText(ending);
  await page.getByRole("link", { name: "← 保存一覧", exact: true }).click();
  await page.locator(".save-list a").first().click();
  await expect(page).toHaveURL(savedUrl);
  await expect(page.locator(".ending h1")).toHaveText(ending);
  await page.goto(url + "/page-that-does-not-exist");
  await expect(page.getByRole("heading", { name: "ページが見つかりません。" })).toBeVisible();
  await page.goto(url + "/play/missing-save");
  await expect(page.getByText("保存データを開けませんでした。", { exact: true })).toBeVisible();
  // 別の公開プレイで途中終了・再開・履歴画面を確認する。
  await page.goto(url);
  await page.getByRole("button", { name: "新しい人生をはじめる" }).click();
  for (let turn = 1; turn <= 40; turn++) {
    await expect(dialog).toBeVisible();
    const leave = dialog.getByRole("button", { name: /今回は何もせず様子を見る/ });
    if (await leave.count()) await leave.click();
    else await dialog.locator(".choices button").first().click();
    await expect(dialog).toBeHidden();
    for (let index = 0; index < 3; index++) {
      const card = page.locator(".decision-card").nth(index);
      await card.getByRole("button").last().click();
      await expect(card.locator('[aria-pressed="true"]')).toHaveCount(1);
    }
    await next.click();
    await expect(page.locator(".event-dialog, .game-over")).toHaveCount(1);
    if (await page.locator(".game-over").count()) break;
  }
  await expect(page.locator(".game-over")).toContainText("離婚");
  await expect(next).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".game-over")).toContainText("離婚");
  await page.screenshot({ path: out + "/game-over.png", fullPage: true });
  await page.getByRole("button", { name: "家族の記録を振り返る" }).click();
  await expect(page.locator(".timeline")).toContainText("別々の道");
  expect(errors).toEqual([]);
  await Bun.write(
    out + "/result.json",
    JSON.stringify(
      {
        mode: "public-ui",
        url,
        viewports: ["1280x900", "390x844"],
        turns: log,
        ending,
        history: 88,
        mandatoryDialog: true,
        gameOverReload: true,
        partialSave: true,
        exportImport: true,
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
