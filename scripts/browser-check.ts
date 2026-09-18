/** 公開UIのみで検証。保存・ストアの内部値は参照しない。Browser plugin not available. */
import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const out = process.env.BROWSER_ARTIFACTS ?? "/tmp/parent-browser-life";
const url = process.env.GAME_URL ?? "http://127.0.0.1:5173";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(15000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (["error", "warning"].includes(m.type())) errors.push(m.text());
  });
  await page.goto(url);
  await expect(page).toHaveTitle(/親伝説/);
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  await page.getByLabel("難易度").selectOption("hard");
  await page.getByLabel("人生のシード（偶然を決める番号）").fill("3");
  await page.getByLabel("地域の創作活動（開発用サンプル）").check();
  await page.getByRole("button", { name: "新しい人生をはじめる" }).click();
  const events = page.getByRole("dialog", { name: "今期の出来事" });
  const dismiss = async () => {
    await expect(page.locator(".rpg-save")).not.toHaveText("保存中…");
    await page.waitForTimeout(100);
    if (await events.isVisible())
      await events.getByRole("button", { name: "暮らしのメニューへ →" }).click();
  };
  const next = page.getByRole("button", { name: "この暮らしで半年進める →", exact: true });
  const progress = async (turn: number) => {
    await dismiss();
    await expect(next).toBeEnabled();
    await next.click();
    if (turn < 40) await expect(page.locator(".rpg-caption")).toContainText(`第 ${turn + 1} 期`);
  };
  const menu = async (name: string) =>
    page
      .getByRole("navigation", { name: "暮らしの分類" })
      .getByRole("button", { name, exact: true })
      .click();
  const viewport = async () => {
    expect(
      await page.evaluate(() => ({
        x: document.documentElement.scrollWidth > innerWidth,
        y: document.documentElement.scrollHeight > innerHeight,
      })),
    ).toEqual({ x: false, y: false });
  };
  await expect(events).toBeVisible();
  const eventText = await events.innerText();
  const cashText = await page.locator(".rpg-cash").innerText();
  await page.reload();
  await expect(events).toHaveText(eventText, { useInnerText: true });
  await expect(page.locator(".rpg-cash")).toHaveText(cashText, { useInnerText: true });
  await dismiss();
  await expect(page.getByRole("heading", { name: "この暮らしを、続けていく。" })).toBeVisible();
  await expect(next).toBeEnabled();
  await expect(
    page.getByRole("navigation", { name: "暮らしの分類" }).getByRole("button"),
  ).toHaveCount(6);
  for (const meter of await page.locator(".rpg-party meter").all())
    await expect(meter).toHaveAttribute("max", "10");
  await viewport();
  await page.screenshot({ path: out + "/overview-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await viewport();
  await page.screenshot({ path: out + "/overview-mobile.png" });
  // 全メニューを開かず、8期を標準生活で進める。
  for (let t = 1; t <= 8; t++) await progress(t);
  await dismiss();
  await menu("遊び・放課後");
  await expect(page.getByRole("article", { name: "工作教室", exact: true })).toHaveCount(0);
  const trial = page.getByRole("article", { name: "工作教室の体験", exact: true });
  await trial.getByRole("button", { name: /体験教室に参加する/ }).click();
  await expect(page.getByRole("region", { name: "今期の予定" })).toContainText(
    "体験教室に参加する",
  );
  const forecast = await page.locator(".life-budget").innerText();
  await page.reload();
  await dismiss();
  await expect(page.locator(".life-budget")).toHaveText(forecast, { useInnerText: true });
  await menu("遊び・放課後");
  await trial.getByRole("button", { name: "この予定を取り消す" }).click();
  await expect(page.getByRole("region", { name: "今期の予定" })).toHaveCount(0);
  await trial.getByRole("button", { name: /体験教室に参加する/ }).click();
  await progress(9);
  await dismiss();
  await expect(page.locator(".life-opportunities")).toContainText("工作教室");
  await expect(page.locator(".life-opportunities")).toContainText("地域の工作会");
  await menu("遊び・放課後");
  const craft = page.getByRole("article", { name: "工作教室", exact: true });
  await craft.getByRole("button", { name: /工作教室に通う/ }).click();
  await expect(page.locator(".rpg-save")).toHaveText("保存済み");
  await craft.scrollIntoViewIfNeeded();
  await page.setViewportSize({ width: 1280, height: 900 });
  await viewport();
  await page.screenshot({ path: out + "/branch-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await viewport();
  await page.screenshot({ path: out + "/branch-mobile.png" });
  await progress(10);
  await dismiss();
  await menu("遊び・放課後");
  await expect(craft.getByRole("button", { name: /工作教室に通う/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await craft.getByRole("button", { name: /休会する/ }).click();
  await progress(11);
  await dismiss();
  await menu("遊び・放課後");
  await expect(craft.getByRole("button", { name: /休会する/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await craft.getByRole("button", { name: /工作教室に通う/ }).click();
  await progress(12);
  await dismiss();
  await menu("遊び・放課後");
  await craft.getByRole("button", { name: /通わずに過ごす/ }).click();
  await progress(13);
  for (let t = 14; t <= 40; t++) await progress(t);
  await expect(page.locator(".ending h1")).toBeVisible();
  const ending = await page.locator(".ending h1").innerText();
  await page.reload();
  await expect(page.locator(".ending h1")).toHaveText(ending);
  await page.getByRole("button", { name: "家族の記録", exact: true }).click();
  await expect(page.locator(".timeline")).toContainText("最期を迎えた");
  await page.getByRole("button", { name: "遊び方", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "書き出し", exact: true }).click();
  await (await downloadPromise).saveAs(out + "/save.json");
  const fresh = await browser.newPage();
  await fresh.goto(url);
  await fresh.getByLabel("保存ファイルを取り込む").setInputFiles(out + "/save.json");
  await expect(fresh.locator(".ending h1")).toHaveText(ending);
  await page.goto(url);
  await page.getByRole("button", { name: "新しい人生をはじめる" }).click();
  for (let t = 1; t <= 40; t++) {
    await dismiss();
    if (await page.locator(".game-over").count()) break;
    await menu("仕事・家計");
    for (const name of ["今期だけの仕事", "母の今期だけの仕事"]) {
      await page
        .getByRole("article", { name, exact: true })
        .getByRole("button", { name: /臨時の仕事を引き受ける/ })
        .click();
    }
    await next.click();
    await expect(page.locator(".rpg-save")).toHaveText("保存済み");
    if (await page.locator(".game-over").count()) break;
  }
  await expect(page.locator(".game-over")).toContainText("離婚");
  await page.reload();
  await expect(page.locator(".game-over")).toContainText("離婚");
  expect(errors).toEqual([]);
  await Bun.write(
    out + "/result.json",
    JSON.stringify(
      {
        mode: "public-ui",
        url,
        browser: "Chrome / Playwright",
        reason: "Browser plugin not available",
        viewports: ["1280x900", "390x844"],
        turns: 40,
        ending,
        errors,
        branching: true,
        dlc: true,
        cancel: true,
        resume: true,
        gameOver: true,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ ok: true, artifacts: out }));
} finally {
  await browser.close();
}
