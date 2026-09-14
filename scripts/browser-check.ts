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
  await page.goto(process.env.GAME_URL ?? "http://127.0.0.1:5173");
  await expect(page.getByRole("button", { name: "新しい人生をはじめる" })).toBeEnabled();
  await page.screenshot({ path: out + "/home.png", fullPage: true });
  await page.getByRole("button", { name: "新しい人生をはじめる" }).click();
  await expect(page.getByRole("heading", { name: "0歳 春〜夏", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "半年を進める →", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "01 交代で見守る 費用 0万円", exact: true }).click();
  await expect(page.getByRole("button", { name: "半年を進める →", exact: true })).toBeEnabled();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "✓ 交代で見守る 費用 0万円", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "好きに付き合う", exact: true }).click();
  await expect(page.getByRole("button", { name: "半年を進める →", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "方針を保存", exact: true }).click();
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
    await page.getByRole("button", { name: "好きに付き合う", exact: true }).click();
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
