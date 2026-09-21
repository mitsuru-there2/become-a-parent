/** 公開UIのみでステージの操作を検証。Browser plugin not available. */
import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const out = process.env.BROWSER_ARTIFACTS ?? "/tmp/parent-browser-stage";
const url = process.env.GAME_URL ?? "http://127.0.0.1:5173";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(15000);
  await page.addInitScript(() => {
    const original = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = <T extends ArrayBufferView>(array: T): T => {
      if (array instanceof Uint32Array && array.length === 1) {
        array[0] = 3;
        return array;
      }
      return original(array);
    };
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (["error", "warning"].includes(m.type()) && !m.text().includes("Reduced Motion"))
      errors.push(m.text());
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(url);
  await expect(page).toHaveTitle(/親伝説/);
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  await page.getByRole("button", { name: "新しい人生をはじめる" }).click();
  const dismiss = async () => {
    await expect(page.locator(".rpg-save")).not.toHaveText("保存中…");
    // Dialogs deliberately appear on a 300 ms stagger.
    await page.waitForTimeout(700);
    while (await page.getByRole("dialog", { name: "今期の出来事" }).count())
      await page
        .getByRole("dialog", { name: "今期の出来事" })
        .last()
        .getByRole("button", { name: "閉じる" })
        .last()
        .click();
  };
  const next = page.getByRole("button", { name: "この暮らしで半年進める →", exact: true });
  const alert = page.getByRole("alert", { name: "岐路の必須選択" });
  const back = page.getByRole("button", { name: "← マップに戻る" });
  const detail = page.getByRole("dialog").filter({ has: page.locator("#stage-detail-title") });
  const viewport = async () => {
    const problems = await page.evaluate(() => {
      const result: string[] = [];
      if (document.documentElement.scrollWidth > innerWidth + 1)
        result.push("document horizontal overflow");
      if (document.documentElement.scrollHeight > innerHeight + 1)
        result.push("document vertical overflow");
      const dock = document.querySelector<HTMLElement>(".rpg-bottom")!.getBoundingClientRect();
      if (dock.bottom > innerHeight + 1 || dock.left < -1 || dock.right > innerWidth + 1)
        result.push("footer outside viewport");
      const lanes = document.querySelector<HTMLElement>(".stage-lanes");
      if (lanes && lanes.clientHeight < 44) result.push("choices viewport too short");
      for (const button of document.querySelectorAll<HTMLElement>(
        ".stage-tabs button, .stage-route-select, .stage-selection",
      )) {
        const bounds = button.getBoundingClientRect();
        if (bounds.height < 44 || bounds.width < 44) result.push("control below 44px");
      }
      return result;
    });
    expect(problems).toEqual([]);
  };
  await dismiss();
  await expect(alert).toBeVisible();
  await expect(next).toBeDisabled();
  for (let remaining = 5; remaining > 0; remaining--) {
    await expect(alert.getByRole("button")).toHaveCount(remaining);
    await alert.getByRole("button").first().click();
    await expect(page.locator(".tree-category-heading h2")).toBeFocused();
    await page.locator(".stage-route-select").first().click();
    await expect(detail).toContainText("無料");
    await expect(detail).toContainText("次の岐路まで変更できません");
    await detail.getByRole("button", { name: "このルートを確定", exact: true }).click();
    await expect(detail).toHaveCount(0);
    await expect(alert).toHaveCount(0);
    await expect(page.locator(".stage-route.is-current")).toHaveCount(1);
    await back.click();
  }
  await expect(next).toBeEnabled();
  await page.screenshot({ path: `${out}/map-desktop.png` });
  for (const [width, height] of [
    [1440, 900],
    [1024, 768],
    [390, 844],
    [320, 568],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await viewport();
    await page.locator('[data-menu="home"]').click();
    await viewport();
    await expect(page.getByRole("navigation", { name: "ステージ", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "16〜19歳", exact: true }).click();
    await expect(page.locator(".stage-summary")).toContainText("別のステージを閲覧");
    await page.getByRole("button", { name: "0〜3歳 · 現在", exact: true }).click();
    await page.screenshot({ path: `${out}/home-${width}x${height}.png` });
    await back.click();
    await expect(page.locator('[data-menu="home"]')).toBeFocused();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-menu="home"]').click();
  const trial = page.getByRole("button", { name: /家事支援を試す/ }).first();
  await trial.click();
  await expect(detail).toContainText("取得時のみ");
  await detail.getByRole("button", { name: "この選択を取得", exact: true }).click();
  await expect(trial).toContainText("取得済み");
  await expect(trial).toBeFocused();
  await trial.click();
  await expect(detail.getByRole("button", { name: "取得済み", exact: true })).toBeDisabled();
  await detail.getByRole("button", { name: "閉じる", exact: true }).click();
  const help = page.getByRole("button", { name: /家事支援の利用.*定期/ }).first();
  await help.click();
  await expect(detail).toContainText("このステージ中・毎期");
  await expect(detail.getByRole("button", { name: "この選択を取得", exact: true })).toBeEnabled();
  await page.screenshot({ path: `${out}/effect-detail-mobile.png` });
  await detail.getByRole("button", { name: "この選択を取得", exact: true }).click();
  await expect(help).toContainText("取得済み");
  await page.reload();
  await dismiss();
  await page.locator('[data-menu="home"]').click();
  await expect(page.getByRole("button", { name: /家事支援の利用.*定期/ }).first()).toContainText(
    "取得済み",
  );
  await back.click();
  for (let n = 0; n < 8; n++) {
    await expect(next).toBeEnabled();
    await next.click();
    await dismiss();
  }
  await expect(alert).toContainText("4歳");
  await expect(next).toBeDisabled();
  await alert.getByRole("button", { name: "教育・進路のルートへ →", exact: true }).click();
  await page
    .getByRole("region", { name: "私立ルート", exact: true })
    .getByRole("button", { name: /このルートを確認/ })
    .click();
  await expect(detail).toContainText("80万円");
  await expect(detail).toContainText("+3");
  await detail.getByRole("button", { name: "このルートを確定", exact: true }).click();
  await expect(page.locator(".stage-summary")).toContainText("現在のルート：私立");
  await page.screenshot({ path: `${out}/route-change-mobile.png` });
  await back.click();
  await page.getByRole("button", { name: "遊び方", exact: true }).click();
  await expect(page.getByText(/件数の上限はありません/)).toBeVisible();
  await expect(page.getByText(/確定後の取消はできません/)).toBeVisible();
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  expect(errors).toEqual([]);
  console.log(
    JSON.stringify({
      ok: true,
      url: page.url(),
      viewports: 5,
      checks: [
        "identity",
        "nonblank",
        "no-overlay",
        "console",
        "crossroad",
        "immediate-acquisition",
        "same-turn-unlock",
        "saved-reload",
        "stage-boundary",
        "switch-penalty",
        "focus",
        "responsive",
      ],
      artifacts: out,
    }),
  );
} finally {
  await browser.close();
}
