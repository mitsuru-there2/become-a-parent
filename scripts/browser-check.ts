/** 公開UIのみで検証。保存・ストアの内部値は参照しない。Browser plugin not available. */
import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const out = process.env.BROWSER_ARTIFACTS ?? "/tmp/parent-browser-tree";
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
  const backToMap = async () => page.getByRole("button", { name: "← マップに戻る" }).click();
  const menu = async (name: string) => {
    if (await page.getByRole("button", { name: "← マップに戻る" }).count()) await backToMap();
    await page
      .getByRole("group", { name: "アクションの地図" })
      .getByRole("button", { name: new RegExp(name) })
      .click();
  };
  const viewport = async () => {
    await page.waitForTimeout(200);
    await page.screenshot({ path: out + "/viewport-latest.png" });
    const issues = await page.evaluate(() => {
      const found: string[] = [];
      if (document.documentElement.scrollWidth > innerWidth)
        found.push("document horizontal scroll");
      if (document.documentElement.scrollHeight > innerHeight)
        found.push("document vertical scroll");
      const body = document.querySelector<HTMLElement>(".rpg-window-body");
      if (body && body.scrollHeight > body.clientHeight + 1) found.push("main vertical scroll");
      if (body && body.scrollWidth > body.clientWidth + 1) found.push("main horizontal scroll");
      const dock = document.querySelector<HTMLElement>(".rpg-dock");
      if (dock) {
        const bounds = dock.getBoundingClientRect();
        const window = document.querySelector<HTMLElement>(".rpg-window")?.getBoundingClientRect();
        if (bounds.left < -1 || bounds.right > innerWidth + 1 || bounds.bottom > innerHeight + 1)
          found.push("dock outside viewport");
        if (window && window.right - bounds.right < 12) found.push("dock touches main frame");
        if (bounds.width > 100 || bounds.height > 100) found.push("dock too large");
        if (innerWidth - bounds.right < 12 || innerHeight - bounds.bottom < 12)
          found.push("dock edge margin too small");
        if (innerWidth > 800 && bounds.left < innerWidth / 2)
          found.push("dock is not right aligned");
        const controls = [...dock.querySelectorAll<HTMLElement>(".rpg-dock-controls button")].map(
          (button) => button.getBoundingClientRect(),
        );
        const advance = dock
          .querySelector<HTMLElement>(".rpg-dock-advance")
          ?.getBoundingClientRect();
        const above = [
          ...dock.querySelectorAll<HTMLElement>(
            "[data-dock='play'], [data-dock='family'], [data-dock='history']",
          ),
        ];
        const right = [
          ...dock.querySelectorAll<HTMLElement>("[data-dock='help'], .rpg-dock-events"),
        ];
        if (
          advance &&
          above.some((button) => button.getBoundingClientRect().bottom > advance.top + 1)
        )
          found.push("dock top icons misplaced");
        if (
          advance &&
          right.some((button) => button.getBoundingClientRect().left < advance.right - 1)
        )
          found.push("dock right icons misplaced");
        controls.forEach((button, index) => {
          if (
            button.left < bounds.left - 1 ||
            button.right > bounds.right + 1 ||
            button.top < bounds.top - 1 ||
            button.bottom > bounds.bottom + 1
          )
            found.push(`dock button ${index} outside`);
          controls.slice(index + 1).forEach((other, offset) => {
            if (
              button.left < other.right - 1 &&
              button.right > other.left + 1 &&
              button.top < other.bottom - 1 &&
              button.bottom > other.top + 1
            )
              found.push(`dock buttons ${index} and ${index + offset + 1} overlap`);
          });
        });
      }
      const hud = document.querySelector<HTMLElement>(".rpg-hud");
      const age = document.querySelector<HTMLElement>(".rpg-age");
      const right = document.querySelector<HTMLElement>(".rpg-hud-right");
      const finance = document.querySelector<HTMLElement>(".rpg-money-summary");
      if (hud && age && right) {
        const hudBounds = hud.getBoundingClientRect();
        const ageBounds = age.getBoundingClientRect();
        const rightBounds = right.getBoundingClientRect();
        if (ageBounds.right > rightBounds.left + 1) found.push("age and finance overlap");
        if (rightBounds.right > hudBounds.right + 1 || rightBounds.bottom > hudBounds.bottom + 1)
          found.push("finance outside header");
        if (finance && finance.scrollWidth > finance.clientWidth + 1)
          found.push("finance text overflow");
      }
      const map = document.querySelector<HTMLElement>(".action-map");
      if (map) {
        const bounds = map.getBoundingClientRect();
        if (dock) {
          const dockBounds = dock.getBoundingClientRect();
          if (dockBounds.right > bounds.right - 1 || dockBounds.top < bounds.bottom + 4)
            found.push("dock crosses map frame");
        }
        const markers = [...map.querySelectorAll<HTMLElement>(".map-marker")].map((marker) =>
          marker.getBoundingClientRect(),
        );
        markers.forEach((marker, index) => {
          if (
            marker.left < bounds.left - 1 ||
            marker.right > bounds.right + 1 ||
            marker.top < bounds.top - 1 ||
            marker.bottom > bounds.bottom + 1
          )
            found.push(`marker ${index} outside map`);
          if (dock) {
            const dockBounds = dock.getBoundingClientRect();
            if (
              marker.left < dockBounds.right - 1 &&
              marker.right > dockBounds.left + 1 &&
              marker.top < dockBounds.bottom - 1 &&
              marker.bottom > dockBounds.top + 1
            )
              found.push(`marker ${index} covered by dock`);
          }
          markers.slice(index + 1).forEach((other, offset) => {
            if (
              marker.left < other.right &&
              marker.right > other.left &&
              marker.top < other.bottom &&
              marker.bottom > other.top
            )
              found.push(`markers ${index} and ${index + offset + 1} overlap`);
          });
        });
      }
      const tree = document.querySelector<HTMLElement>(
        ".action-tree-content.is-category .tree-scroll",
      );
      if (tree && tree.clientHeight < 60) found.push("category tree too short");
      return found;
    });
    expect(issues, `viewport ${page.viewportSize()?.width}x${page.viewportSize()?.height}`).toEqual(
      [],
    );
  };
  await expect(events).toBeVisible();
  const eventText = await events.innerText();
  const cashText = await page.locator(".rpg-cash").innerText();
  await page.reload();
  await expect(events).toHaveText(eventText, { useInnerText: true });
  await expect(page.locator(".rpg-cash")).toHaveText(cashText, { useInnerText: true });
  await dismiss();
  await expect(page.locator(".tree-map-heading")).toHaveCount(0);
  await expect(page.getByRole("group", { name: "アクションの地図" })).toBeVisible();
  await expect(page.locator(".rpg-window-bar, .rpg-family-status > span")).toHaveCount(0);
  await expect(page.locator(".rpg-money-summary")).toContainText("▲");
  await expect(page.locator(".rpg-money-summary")).toContainText("▼");
  await expect(page.locator(".rpg-dock-budget")).toHaveCount(0);
  await page.locator(".rpg-money-summary").click();
  const moneyDialog = page.getByRole("dialog", { name: "半年の資金予定" });
  await expect(moneyDialog).toBeVisible();
  await expect(moneyDialog).toContainText("基本生活費");
  await expect(moneyDialog).toContainText("半年後の資金予定");
  await moneyDialog.getByRole("button", { name: "閉じる" }).click();
  await expect(page.getByText("地図のアイコンから、選びたい暮らしの分野へ進みます。")).toHaveCount(
    0,
  );
  await expect(page.getByText("何も選ばずに半年を進められます。")).toHaveCount(0);
  await expect(page.locator(".map-footer")).toHaveCount(0);
  await expect(next).toBeEnabled();
  const dockMenu = page.getByRole("navigation", { name: "ゲーム内" });
  await expect(dockMenu.getByRole("button")).toHaveCount(6);
  await expect(dockMenu.getByRole("button")).toHaveText(["", "", "", "", "", ""]);
  await expect(dockMenu.getByRole("button", { name: "今期の出来事 ↗" })).toBeVisible();
  await expect(page.locator(".rpg-menu, .life-advance")).toHaveCount(0);
  await expect(next.locator(".rpg-dock-advance-icon")).toBeVisible();
  await page.getByRole("button", { name: "今期の出来事 ↗" }).click();
  await expect(events).toBeVisible();
  await dismiss();
  await expect(
    page.getByRole("group", { name: "アクションの地図" }).getByRole("button"),
  ).toHaveCount(5);
  await expect(page.getByRole("region", { name: "アクションのつながり" })).toHaveCount(0);
  await expect(page.getByText("現在の暮らしと取得効果")).toHaveCount(0);
  await page.getByRole("button", { name: "家族の様子", exact: true }).click();
  await expect(page.getByRole("region", { name: "現在の暮らしと取得効果" })).toBeVisible();
  await page.getByRole("button", { name: "いまの暮らし", exact: true }).click();
  for (const meter of await page.locator(".rpg-party meter").all())
    await expect(meter).toHaveAttribute("max", "10");
  await expect(page.getByRole("region", { name: "実家のステータス" })).toBeVisible();
  await page.waitForTimeout(450);
  for (const [width, height] of [
    [1280, 900],
    [1280, 720],
    [1026, 760],
    [1024, 600],
    [789, 760],
    [641, 600],
    [390, 844],
    [360, 640],
    [320, 568],
    [320, 480],
  ]) {
    await page.setViewportSize({ width, height });
    await viewport();
    if ((width === 1280 && height === 900) || (width === 390 && height === 844) || height === 480)
      await page.screenshot({ path: `${out}/overview-${width}x${height}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const node = (name: string) =>
    page
      .getByRole("region", { name: "アクションのつながり" })
      .getByRole("button", { name, exact: true });
  const detail = page.getByRole("dialog", { name: /./ });
  const confirm = () => detail.locator(".tree-select");
  const cancel = async () => detail.getByRole("button", { name: "キャンセル" }).click();
  await expect(page.locator(".rpg-scenery")).toHaveCount(0);
  await menu("教育・進路");
  await expect(page.getByRole("group", { name: "アクションの地図" })).toHaveCount(0);
  for (const [width, height] of [
    [390, 844],
    [320, 568],
    [320, 480],
    [1280, 720],
  ]) {
    await page.setViewportSize({ width, height });
    await viewport();
    if (height === 480) await page.screenshot({ path: out + "/category-320x480.png" });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await node("小学校の進路：私立小学校").click();
  await expect(confirm()).toBeDisabled();
  await expect(detail).toContainText("年収 600万円以上");
  await expect(detail.getByRole("img")).toHaveAttribute("src", /hero/);
  await expect(detail.getByRole("heading", { name: "私立小学校" })).toBeVisible();
  await page.screenshot({ path: out + "/dialog-mobile.png" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: out + "/dialog-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await cancel();
  await expect(node("大学への挑戦：専門的な受験に挑む")).toHaveCount(1);
  await backToMap();
  await expect(page.getByRole("group", { name: "アクションの地図" })).toBeVisible();
  await expect(page.getByRole("region", { name: "アクションのつながり" })).toHaveCount(0);
  await expect(
    page.getByRole("group", { name: "アクションの地図" }).getByRole("button", {
      name: /教育・進路/,
    }),
  ).toBeFocused();
  for (let t = 1; t <= 8; t++) await progress(t);
  await dismiss();
  await menu("教育・進路");
  await node("通園先：保育所に通う").click();
  await expect(detail).toContainText("保育所に通う");
  await cancel();
  await menu("遊び・放課後");
  await node("工作教室：工作教室に通う").click();
  await expect(confirm()).toBeDisabled();
  await cancel();
  await node("工作教室の体験：体験教室に参加する").click();
  await confirm().click();
  await backToMap();
  await expect(page.getByRole("region", { name: "今期の予定" })).toContainText(
    "体験教室に参加する",
  );
  await page.setViewportSize({ width: 320, height: 480 });
  await viewport();
  await page.screenshot({ path: out + "/planned-320x480.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  const forecast = await page.locator(".rpg-money-summary").innerText();
  await page.reload();
  await dismiss();
  await expect(page.locator(".rpg-money-summary")).toHaveText(forecast, {
    useInnerText: true,
  });
  await menu("遊び・放課後");
  await node("工作教室の体験：体験教室に参加する").click();
  await detail.getByRole("button", { name: "予定を取り消す" }).click();
  await backToMap();
  await expect(page.getByRole("region", { name: "今期の予定" })).toHaveCount(0);
  await menu("遊び・放課後");
  await node("工作教室の体験：体験教室に参加する").click();
  await confirm().click();
  await progress(9);
  await dismiss();
  await menu("遊び・放課後");
  await expect(node("工作教室：工作教室に通う")).toContainText("解放");
  await node("工作教室：工作教室に通う").click();
  await expect(confirm()).toBeEnabled();
  await confirm().click();
  await expect(page.locator(".rpg-save")).toHaveText("保存済み");
  await page.setViewportSize({ width: 1280, height: 900 });
  await viewport();
  await page.screenshot({ path: out + "/branch-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await viewport();
  await page.screenshot({ path: out + "/branch-mobile.png" });
  await progress(10);
  await dismiss();
  await menu("遊び・放課後");
  await node("工作教室：工作教室に通う").click();
  await expect(confirm()).toBeDisabled();
  await cancel();
  await node("工作教室：休会する").click();
  await confirm().click();
  await progress(11);
  await dismiss();
  await menu("遊び・放課後");
  await node("工作教室：工作教室に通う").click();
  await confirm().click();
  await progress(12);
  await dismiss();
  await menu("教育・進路");
  await node("小学校の進路：公立小学校").click();
  await expect(detail).toContainText("公立小学校");
  await cancel();
  await menu("遊び・放課後");
  await node("工作教室：通わずに過ごす").click();
  await confirm().click();
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
      await node(name + "：臨時の仕事を引き受ける").click();
      await confirm().click();
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
        viewports: [
          "1280x900",
          "1280x720",
          "1026x760",
          "1024x600",
          "789x760",
          "641x600",
          "390x844",
          "360x640",
          "320x568",
          "320x480",
        ],
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
