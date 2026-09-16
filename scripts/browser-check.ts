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
  const dialog = page.locator(".rpg-window");
  const body = page.locator(".rpg-window-body");
  const selectEvent = async (last = false) => {
    await expect(dialog).toContainText("今期の特殊イベント");
    const options = body.locator(".choices button");
    await (last ? options.last() : options.first()).click();
    await expect(dialog).not.toContainText("今期の特殊イベント");
    const proceed = page.getByRole("button", { name: "3つの判断へ →" });
    if (!(await page.locator(".game-over").count())) {
      await expect(proceed).toBeVisible();
      await proceed.click();
      await expect(dialog).toContainText("判断 1 / 3");
    }
  };
  const selectDecisions = async (last = false) => {
    for (let index = 0; index < 3; index++) {
      await page.getByRole("button", { name: new RegExp(`判断${index + 1}$`) }).click();
      const options = body.locator(".choices button");
      await (last ? options.last() : options.first()).click();
      await expect(page.locator(".rpg-save")).toHaveText("保存済み");
      await expect(dialog).not.toContainText(`判断 ${index + 1} / 3`);
    }
  };
  const checkViewport = async () => {
    expect(
      await page.evaluate(() => ({
        x: document.documentElement.scrollWidth > innerWidth,
        y: document.documentElement.scrollHeight > innerHeight,
      })),
    ).toEqual({ x: false, y: false });
  };
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("今期の特殊イベント");
  for (const meter of await page.locator(".rpg-party meter").all()) {
    await expect(meter).toHaveAttribute("max", "10");
    const value = Number(await meter.getAttribute("value"));
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(10);
  }
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
  await checkViewport();
  await selectEvent();
  await expect(body.locator(".choices")).toHaveCount(1);
  await expect(page.locator(".plan-section")).toHaveCount(0);
  const next = page.getByRole("button", { name: "半年を進める →", exact: true });
  await expect(next).toHaveCount(0);
  await body.locator(".choices button").first().click();
  await expect(dialog).toContainText("1 / 3 回答済み");
  await page.reload();
  await expect(dialog).toContainText("判断 2 / 3");
  await checkViewport();
  await page.screenshot({ path: out + "/decisions-mobile.png", fullPage: false });
  await page.setViewportSize({ width: 1280, height: 900 });
  await checkViewport();
  await page.screenshot({ path: out + "/decisions-desktop.png", fullPage: false });
  const log: string[] = [];
  for (let turn = 1; turn <= 40; turn++) {
    if (turn > 1) await selectEvent();
    await selectDecisions();
    await checkViewport();
    await expect(next).toBeEnabled();
    log.push(await page.locator(".rpg-age").innerText());
    await next.click();
    if (turn < 40) await expect(page.locator(".rpg-caption")).toContainText(`第 ${turn + 1} 期`);
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
  await page.getByRole("button", { name: "遊び方", exact: true }).click();
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
    await selectEvent(true);
    if (await page.locator(".game-over").count()) break;
    await selectDecisions(true);
    await next.click();
    await expect(next).toHaveCount(0);
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
        sequentialEvents: true,
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
