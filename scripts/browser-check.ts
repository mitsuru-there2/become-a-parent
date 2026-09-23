/** Player-visible checks for the current stage map and mobile category screen. */
import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const out = process.env.BROWSER_ARTIFACTS ?? "/tmp/parent-browser-850";
const url = process.env.GAME_URL ?? "http://127.0.0.1:5173";
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 320, height: 568 } });
  page.setDefaultTimeout(15000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.text().includes("You have Reduced Motion enabled")) return;
    if (["error", "warning"].includes(message.type())) errors.push(message.text());
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(url);
  await expect(page).toHaveTitle(/親伝説/);
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  await page.getByRole("combobox", { name: "難易度" }).selectOption("easy");
  await page.getByRole("button", { name: "新しい人生をはじめる" }).click();
  await expect(page.locator(".stage-tree")).toBeVisible();

  const dismissEvents = async () => {
    await expect(page.locator(".rpg-save")).not.toHaveText("保存中…");
    // Events can arrive on a 300 ms stagger.
    await page.waitForTimeout(700);
    while (await page.getByRole("dialog", { name: "今期の出来事" }).count())
      await page
        .getByRole("dialog", { name: "今期の出来事" })
        .last()
        .getByRole("button", { name: "閉じる" })
        .last()
        .click();
  };
  const openCategory = async (id: string) => {
    await page.locator(`[data-menu="${id}"]`).click();
    await expect(page).toHaveURL(new RegExp(`category=${id}`));
    await expect(page.locator(".stage-route.is-mobile-active")).toBeVisible();
  };
  const closeCategory = async () => {
    await page.getByRole("button", { name: "← ホームに戻る" }).click();
    await expect(page).not.toHaveURL(/category=/);
  };
  const detail = page.locator(".stage-detail");
  const laneHeight = () =>
    page.locator(".stage-lanes").evaluate((element) => element.getBoundingClientRect().height);
  const checkParentDetail = async (parent: "父" | "母", size: string) => {
    await page.getByRole("button", { name: `${parent}の詳細を開く` }).click();
    const dialog = page.getByRole("dialog", { name: `${parent}の状態` });
    await expect(dialog).toBeVisible();
    const stats = dialog.locator(".member-full-stats.is-parent");
    expect(
      await stats.evaluate(
        (element) => getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length,
      ),
    ).toBe(2);
    const rings = stats.locator(".status-percent-ring");
    await expect(rings).toHaveCount(6);
    for (const ring of await rings.all()) {
      const { width, height } = await ring.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      });
      expect(width).toBeGreaterThanOrEqual(87);
      expect(Math.abs(width - height)).toBeLessThanOrEqual(0.5);
    }
    expect(await stats.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    await dialog.screenshot({
      path: `${out}/parent-${parent === "父" ? "father" : "mother"}-${size}.png`,
    });
    await dialog.getByRole("button", { name: "閉じる" }).first().click();
  };

  await dismissEvents();
  await expect(page.getByRole("button", { name: "この暮らしで半年進める →" })).toBeDisabled();
  await expect(page.locator(".map-marker.is-route-required")).toHaveCount(5);
  await expect(page.getByRole("alert", { name: "岐路の必須選択" })).toHaveCount(0);
  expect(
    await page.locator(".rpg-party").evaluate((element) => element.getBoundingClientRect().height),
  ).toBeLessThanOrEqual(64);
  await expect(
    page.locator(".rpg-party .child-compact-observations .observation-mark:visible"),
  ).toHaveCount(3);
  await expect(
    page.locator(".rpg-party .family-compact-stats.is-percent .status-percent-ring:visible"),
  ).toHaveCount(8);
  await expect(page.locator(".rpg-party .status-money-visual:visible")).toHaveCount(1);
  await expect(page.locator(".rpg-party .family-member-heading strong").first()).toBeHidden();
  for (const button of await page.locator(".rpg-party .family-member-button").all())
    expect(
      await button.evaluate((element) => element.getBoundingClientRect().height),
    ).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: `${out}/map-320x568.png` });
  for (const parent of ["父", "母"] as const) await checkParentDetail(parent, "320x568");
  await page.setViewportSize({ width: 390, height: 844 });
  for (const parent of ["父", "母"] as const) await checkParentDetail(parent, "390x844");
  await page.setViewportSize({ width: 320, height: 568 });

  await openCategory("education");
  expect(await laneHeight()).toBeGreaterThanOrEqual(300);
  await expect(page.getByRole("combobox", { name: "ステージを選択" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "ルートを切り替え" })).toBeVisible();
  for (const control of [
    page.getByRole("button", { name: "← ホームに戻る" }),
    page.getByRole("combobox", { name: "ステージを選択" }),
    page.getByRole("navigation", { name: "ルートを切り替え" }).getByRole("button").first(),
    page.locator(".stage-route.is-mobile-active .stage-selection").first(),
  ])
    expect(
      await control.evaluate((element) => element.getBoundingClientRect().height),
    ).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: `${out}/category-320x568.png` });
  await page.locator(".stage-route.is-mobile-active .stage-route-select").click();
  await expect(detail).toBeVisible();
  expect(
    await detail.evaluate((element) =>
      Math.round(element.getBoundingClientRect().bottom - window.innerHeight),
    ),
  ).toBe(0);
  await detail.getByRole("button", { name: "このルートを確定" }).click();
  await expect(page.locator(".stage-route.is-current.is-mobile-active")).toBeVisible();

  const available = page.locator(".stage-route.is-mobile-active .stage-selection.is-available");
  expect(await available.count()).toBeGreaterThan(0);
  const card = available.nth(Math.min((await available.count()) - 1, 2));
  const cardName = (await card.getAttribute("aria-label"))!;
  await card.click();
  const scrollBefore = await page.locator(".stage-lanes").evaluate((element) => element.scrollTop);
  await detail.getByRole("button", { name: "この選択を取得" }).click();
  await expect(page.getByRole("button", { name: cardName, exact: true })).toContainText("取得済み");
  const scrollAfter = await page.locator(".stage-lanes").evaluate((element) => element.scrollTop);
  expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThanOrEqual(3);

  await page
    .getByRole("navigation", { name: "ルートを切り替え" })
    .getByRole("button", {
      name: "私立",
      exact: true,
    })
    .click();
  await expect(page.locator(".stage-route.is-mobile-active")).toHaveAttribute(
    "aria-label",
    "私立ルート",
  );
  await page.getByRole("combobox", { name: "ステージを選択" }).selectOption("1");
  await expect(page.locator(".stage-route.is-mobile-active .stage-selection")).toHaveCount(10);
  await page.locator(".stage-route.is-mobile-active .stage-selection").first().click();
  await expect(detail.getByRole("button", { name: "この選択を取得" })).toBeDisabled();
  await detail.getByRole("button", { name: "閉じる" }).click();

  await page.reload();
  await dismissEvents();
  await expect(page).toHaveURL(/category=education/);
  await expect(page.getByRole("button", { name: cardName, exact: true })).toContainText("取得済み");
  const heights = [];
  for (const [width, height, minimum] of [
    [320, 568, 300],
    [390, 844, 500],
    [844, 390, 180],
  ]) {
    await page.setViewportSize({ width, height });
    const lane = await laneHeight();
    expect(lane).toBeGreaterThanOrEqual(minimum);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    heights.push({ width, height, lane: Math.round(lane) });
    await page.screenshot({ path: `${out}/category-${width}x${height}.png` });
  }

  await closeCategory();
  await expect(page.getByRole("button", { name: "この暮らしで半年進める →" })).toBeVisible();
  for (const id of ["home", "grandparents", "afterschool", "work"]) {
    await openCategory(id);
    await page.locator(".stage-route.is-mobile-active .stage-route-select").click();
    await detail.getByRole("button", { name: "このルートを確定" }).click();
    await closeCategory();
  }
  await expect(page.locator(".map-marker.is-route-required")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "この暮らしで半年進める →" })).toBeEnabled();
  await openCategory("education");
  await page.goBack();
  await expect(page).not.toHaveURL(/category=/);
  await expect(page.getByRole("region", { name: "ホーム", exact: true })).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 900 });
  await openCategory("education");
  for (const parent of ["父", "母"] as const) await checkParentDetail(parent, "1440x900");
  await expect(page.locator(".stage-route:visible")).toHaveCount(4);
  await expect(page.getByRole("navigation", { name: "ステージ" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "ルートを切り替え" })).toBeHidden();
  const runId = new URL(page.url()).pathname.split("/").at(-1);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(`${url}/play/${runId}?category=unknown`);
  await expect(page).not.toHaveURL(/category=/);
  await expect(page.getByRole("region", { name: "ホーム", exact: true })).toBeVisible();

  const advance = page.getByRole("button", { name: "この暮らしで半年進める →" });
  for (let turn = 0; turn < 8; turn++) {
    await expect(advance).toBeEnabled();
    await advance.click();
    await dismissEvents();
  }
  await expect(page.locator(".map-marker.is-route-changeable")).toHaveCount(5);
  await expect(page.getByRole("alert", { name: "岐路のルート変更" })).toHaveCount(0);
  await expect(advance).toBeEnabled();
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: `${out}/route-change-${width}x${height}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await openCategory("education");
  await page
    .getByRole("navigation", { name: "ルートを切り替え" })
    .getByRole("button", { name: "私立", exact: true })
    .click();
  await page.locator(".stage-route.is-mobile-active .stage-route-select").click();
  await detail.getByRole("button", { name: "このルートを確定" }).click();
  await closeCategory();
  await expect(page.locator(".map-marker.is-route-changeable")).toHaveCount(4);
  await expect(page.locator('.map-marker[data-menu="education"]')).not.toHaveClass(
    /is-route-changeable/,
  );
  await advance.click();
  await dismissEvents();
  await expect(page.locator(".map-marker.is-route-changeable")).toHaveCount(0);
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  expect(errors).toEqual([]);
  console.log(JSON.stringify({ ok: true, heights, artifacts: out }));
} finally {
  await browser.close();
}
