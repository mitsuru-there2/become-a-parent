// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { createElement, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, afterAll, expect, it, vi } from "vite-plus/test";
import { ChildStatus } from "../src/components/game/child_status";
import { ChildTitleCelebration } from "../src/components/game/child_title_celebration";
import { ObservationMark } from "../src/components/game/status_visual";
import { PartyStatus } from "../src/components/game/party_status";
import { publicView, start } from "../src/engine/simulation";
import { chooseDecision } from "../src/engine/decisions";
import { awardChildTitles } from "../src/engine/child_identity";
import { StageSelectionTree } from "../src/components/game/stage_selection_tree";
import { chooseStage, satisfyStage, startStage, until } from "./fixtures/stage_helpers";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => createElement("a", null, children),
}));
vi.mock("../src/stores/game", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/stores/game")>()),
  update: vi.fn(),
}));
const dialogMethods = ["showModal", "close"] as const;
const descriptors = dialogMethods.map((name) =>
  Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name),
);
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
});
afterAll(() => {
  dialogMethods.forEach((name, index) => {
    const descriptor = descriptors[index];
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  });
  vi.restoreAllMocks();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("父母との関係は3種類のハートで示し、区分の文字は表示しない", () => {
  const states = { low: "嫌い", middle: "普通", high: "好き" } as const;
  const diagrams = (["low", "middle", "high"] as const).map((band) => {
    const { container, unmount } = render(
      createElement(ObservationMark, {
        label: "父との関係",
        compact: true,
        observation: { code: "relationship.A", subject: "子ども", text: `${band}の様子`, band },
      }),
    );
    expect(
      screen.getByRole("img", { name: `父との関係：${states[band]}。${band}の様子` }),
    ).toBeTruthy();
    expect(screen.getByText("父")).toBeTruthy();
    expect(screen.queryByText(states[band])).toBeNull();
    expect(container.querySelector(".relationship-heart")?.classList.contains("is-filled")).toBe(
      band === "high",
    );
    expect(!!container.querySelector(".relationship-heart-half")).toBe(band === "middle");
    const diagram = container.querySelector("svg")!.innerHTML;
    unmount();
    return diagram;
  });
  expect(new Set(diagrams).size).toBe(3);
});
it("短文がない旧保存でも両親と両分野の観察本文を表示する", () => {
  const state = publicView(start("home-01", 0)).public;
  for (const item of state.observations) {
    delete item.short_text;
    delete item.band;
  }
  render(createElement(ChildStatus, { state }));
  fireEvent.click(screen.getByRole("button", { name: "子どもの詳細を開く" }));
  expect(screen.getByRole("dialog", { name: "子どもの様子" })).toBeTruthy();
  for (const code of [
    "energy",
    "relationship.A",
    "relationship.B",
    "interest.study",
    "interest.craft",
  ]) {
    const text = state.observations.find((item) => item.code === code)!.text;
    expect(screen.getAllByText(text).length).toBeGreaterThan(0);
  }
});

it("子どもの代表状態と獲得済み称号を仮画像とともに表示する", async () => {
  const { Catalog } = await import("../src/content/catalog");
  const { startDecisions } = await import("../src/engine/decisions");
  const state = startDecisions("home-01", 0, new Catalog().resolve("normal"));
  state.child.profile!.music = 45;
  awardChildTitles(state);
  const { rerender } = render(createElement(ChildStatus, { state: publicView(state).public }));
  expect(screen.getByRole("button", { name: "子どもの詳細を開く" }).textContent).toContain(
    "音楽家",
  );
  fireEvent.click(screen.getByRole("button", { name: "子どもの詳細を開く" }));
  const dialog = screen.getByRole("dialog", { name: "子どもの様子" });
  expect(
    within(dialog).getByRole("img", { name: "音楽家の子どものプロフィール画像" }),
  ).toBeTruthy();
  expect(within(dialog).getByText(/天才ピアニスト/)).toBeTruthy();
  state.child.profile!.making = 50;
  awardChildTitles(state);
  rerender(createElement(ChildStatus, { state: publicView(state).public }));
  expect(
    within(dialog).getByRole("img", { name: "発明家の子どものプロフィール画像" }),
  ).toBeTruthy();
  expect(within(dialog).getByText(/天才ピアニスト/)).toBeTruthy();
  expect(within(dialog).getByText(/小さな発明家/)).toBeTruthy();
});

it("新称号を目立つ通知で祝い、閉じた後の新しい獲得は再表示する", () => {
  const first = [{ id: "pianist", label: "天才ピアニスト" }];
  const { rerender } = render(
    createElement(ChildTitleCelebration, {
      runId: "test",
      revision: 1,
      titles: first,
    }),
  );
  expect(screen.getByRole("status").textContent).toContain("新しい称号を獲得！");
  expect(screen.getByRole("status").textContent).toContain("天才ピアニスト");
  fireEvent.click(screen.getByRole("button", { name: "称号のお祝いを閉じる" }));
  expect(screen.queryByRole("status")).toBeNull();
  rerender(
    createElement(ChildTitleCelebration, {
      runId: "test",
      revision: 2,
      titles: [{ id: "gamer", label: "生粋のゲーマー" }],
    }),
  );
  expect(screen.getByRole("status").textContent).toContain("生粋のゲーマー");
});

it("家族4枠から詳細を開き、成績は学齢期に公開値だけを表示する", async () => {
  const { Catalog } = await import("../src/content/catalog");
  const { startDecisions } = await import("../src/engine/decisions");
  const state = publicView(startDecisions("home-01", 0, new Catalog().resolve("normal"))).public;
  const { rerender } = render(createElement(PartyStatus, { state }));
  expect(screen.getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([
    "子どもの詳細を開く",
    "父の詳細を開く",
    "母の詳細を開く",
    "実家の詳細を開く",
  ]);
  expect(screen.queryByText("対話")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "子どもの詳細を開く" }));
  expect(screen.queryByRole("meter", { name: "成績" })).toBeNull();
  expect(screen.queryByText("自分で選ぶ様子")).toBeNull();
  expect(screen.getByText("好きなことと、できること。それぞれの育ちを見守ります。")).toBeTruthy();
  rerender(
    createElement(PartyStatus, {
      state: {
        ...state,
        time: { ...state.time, child_months: 72 },
        life: { ...state.life!, study_score: 64 },
      },
    }),
  );
  expect(screen.getByRole("meter", { name: "成績" }).getAttribute("value")).toBe("64");
  fireEvent.click(screen.getAllByRole("button", { name: "閉じる" })[0]);
  fireEvent.click(screen.getByRole("button", { name: "父の詳細を開く" }));
  expect(screen.getByRole("dialog", { name: "父の状態" })).toBeTruthy();
  expect(screen.getByText("対話")).toBeTruthy();
});

it("公開状態が変わると下部カードの差分と子どもの観察変化を示す", async () => {
  const { Catalog } = await import("../src/content/catalog");
  const { startDecisions } = await import("../src/engine/decisions");
  const state = publicView(startDecisions("home-01", 0, new Catalog().resolve("normal"))).public;
  const { rerender } = render(createElement(PartyStatus, { state }));
  expect(document.querySelector(".status-change")).toBeNull();
  const next = structuredClone(state);
  next.parents.A.health += 4;
  next.grandparents.funds -= 8;
  const energy = next.observations.find((item) => item.code === "energy")!;
  energy.band = energy.band === "low" ? "middle" : "low";
  rerender(createElement(PartyStatus, { state: next }));
  expect(
    within(screen.getByRole("button", { name: "父の詳細を開く" })).getByText("+4"),
  ).toBeTruthy();
  expect(
    within(screen.getByRole("button", { name: "実家の詳細を開く" })).getByText("-8万円"),
  ).toBeTruthy();
  expect(screen.getByRole("img", { name: /^余裕：/ }).classList.contains("status-changed")).toBe(
    true,
  );
  expect(
    screen.getByRole("button", { name: "母の詳細を開く" }).closest("[data-changed]"),
  ).toBeNull();
});

it("進行不可時は理由を表示し、advanceを送信しない", async () => {
  const { fireEvent, waitFor } = await import("@testing-library/react");
  const { Catalog } = await import("../src/content/catalog");
  const { startDecisions } = await import("../src/engine/decisions");
  const { DecisionPlay } = await import("../src/components/game/decision_play");
  const { update } = await import("../src/stores/game");
  const view = publicView(startDecisions("home-01", 0, new Catalog().resolve("normal")));
  view.public.decision_turn!.event_result = [];
  view.public.life!.crossroad = null;
  view.public.forecast!.can_advance = false;
  view.public.forecast!.reasons = [
    { code: "RESOURCE_LIMIT", path: "cash", message: "資金が足りません" },
  ];
  const response = {
    api_version: "cli-2",
    ok: true,
    command: "observe",
    run_id: "blocked",
    revision: 1,
    phase: "childhood",
    ...view,
    payload: null,
    error: null,
  } as const;
  render(createElement(DecisionPlay, { response }));
  fireEvent.click(screen.getByRole("button", { name: "この暮らしで半年進める →" }));
  await waitFor(() =>
    expect(screen.getByRole("dialog", { name: "半年を進める前に" })).toBeTruthy(),
  );
  expect(screen.getByText("資金が足りません")).toBeTruthy();
  expect(update).not.toHaveBeenCalled();
});

it("岐路の必須選択が残る間は半年進行ボタンを無効にする", async () => {
  const { fireEvent } = await import("@testing-library/react");
  const { Catalog } = await import("../src/content/catalog");
  const { startDecisions } = await import("../src/engine/decisions");
  const { DecisionPlay } = await import("../src/components/game/decision_play");
  const { update } = await import("../src/stores/game");
  const view = publicView(startDecisions("home-01", 0, new Catalog().resolve("normal")));
  view.public.decision_turn!.event_result = [];
  const response = {
    api_version: "cli-2",
    ok: true,
    command: "observe",
    run_id: "crossroad-blocked",
    revision: 1,
    phase: "childhood",
    ...view,
    payload: null,
    error: null,
  } as const;
  render(createElement(DecisionPlay, { response }));
  const advance = screen.getByRole("button", { name: "この暮らしで半年進める →" });
  expect((advance as HTMLButtonElement).disabled).toBe(true);
  expect(advance.getAttribute("title")).toBe("ホームで残りのルートを選んでください");
  expect(screen.queryByRole("alert", { name: "岐路の必須選択" })).toBeNull();
  expect(document.querySelectorAll(".map-marker.is-route-required")).toHaveLength(5);
  fireEvent.click(advance);
  expect(update).not.toHaveBeenCalled();
});

it("現在ルートの取得可能な判断数をマップに表示し、取得後に更新する", () => {
  const state = startStage();
  const props = () => {
    const view = publicView(state);
    return { state: view.public, choices: view.choices };
  };
  const { rerender } = render(createElement(StageSelectionTree, props()));
  const map = screen.getByRole("group", { name: "ホームの選択" });
  expect(within(map).getAllByText("ルートを選択")).toHaveLength(5);
  expect(map.querySelectorAll(".map-marker.is-route-required")).toHaveLength(5);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByText(/取得可能 \d+件/)).toBeNull();
  chooseStage(state, "crossroad-school", "public");
  rerender(createElement(StageSelectionTree, props()));
  expect(screen.getByText(/取得可能 \d+件/)).toBeTruthy();
  expect(within(map).getAllByText("ルートを選択")).toHaveLength(4);
  expect(
    within(map)
      .getByRole("button", { name: /教育・進路/ })
      .classList.contains("is-route-required"),
  ).toBe(false);
  expect(screen.queryByRole("alert")).toBeNull();
  satisfyStage(state);
  rerender(createElement(StageSelectionTree, props()));
  expect(screen.queryByRole("alert")).toBeNull();
  expect(within(map).queryByText("ルートを選択")).toBeNull();
  const availableMenus = new Set(
    publicView(state)
      .choices.filter(
        (choice) => !choice.route_choice && choice.options.some((option) => option.available),
      )
      .map((choice) => choice.menu),
  );
  expect(within(map).getAllByText(/取得可能 \d+件/)).toHaveLength(availableMenus.size);
  fireEvent.click(within(map).getByRole("button", { name: /教育・進路/ }));
  expect(screen.getByRole("heading", { name: "教育・進路" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "← ホームに戻る" }));
  // 公開された取得可能な判断をすべて取得し、取得済み・条件待ち・別ステージだけにする。
  for (;;) {
    const choice = publicView(state).choices.find(
      (item) => !item.route_choice && item.options.some((option) => option.available),
    );
    if (!choice) break;
    const option = choice.options.find((item) => item.available)!;
    chooseDecision(state, choice.instance_id, option.option_id);
  }
  rerender(createElement(StageSelectionTree, props()));
  expect(screen.queryByText(/取得可能 \d+件/)).toBeNull();
});

it("資金とパラメータの現在値に応じてマップのカテゴリ件数が増減する", () => {
  const state = startStage();
  chooseStage(state, "crossroad-home", "daily");
  satisfyStage(state);
  const target = state.settings!.content.life_game!.decisions.find(
    (item) => item.id === "home-daily-0-04",
  )!.options[0];
  target.requires = { stats: [{ path: "child.ability.study", op: "gte", value: 60 }] };
  const props = () => {
    const view = publicView(state);
    return { state: view.public, choices: view.choices };
  };
  const { rerender } = render(createElement(StageSelectionTree, props()));
  const verifyCount = () => {
    const current = props();
    rerender(createElement(StageSelectionTree, current));
    const count = current.choices.filter(
      (choice) => !choice.route_choice && choice.options.some((option) => option.available),
    ).length;
    const homeCount = current.choices.filter(
      (choice) =>
        choice.menu === "home" &&
        !choice.route_choice &&
        choice.options.some((option) => option.available),
    ).length;
    const homeMarker = document.querySelector('.map-marker[data-menu="home"]')!;
    expect(homeMarker.querySelector(".map-available-count")?.textContent ?? null).toBe(
      homeCount ? `取得可能 ${homeCount}件` : null,
    );
    expect(screen.queryByRole("alert", { name: "取得可能な判断" })).toBeNull();
    return count;
  };
  state.cash = 0;
  const poorCount = verifyCount();
  state.cash = 10000;
  expect(verifyCount()).toBeGreaterThan(poorCount);
  state.child.ability.study = 59;
  const belowThreshold = verifyCount();
  state.child.ability.study = 60;
  expect(verifyCount()).toBe(belowThreshold + 1);
  state.child.ability.study = 59;
  expect(verifyCount()).toBe(belowThreshold);
  state.cash = 0;
  expect(verifyCount()).toBe(poorCount);
});

it("別ルートは閲覧専用と示して取得を拒否し、将来ステージと岐路の変更を区別する", () => {
  const state = startStage();
  chooseStage(state, "crossroad-school", "public");
  const props = () => {
    const view = publicView(state);
    return { state: view.public, choices: view.choices };
  };
  satisfyStage(state);
  const { container, rerender } = render(createElement(StageSelectionTree, props()));
  fireEvent.click(
    within(screen.getByRole("group", { name: "ホームの選択" })).getByRole("button", {
      name: /教育・進路/,
    }),
  );
  expect(screen.getByText("✓ 選択中のルート")).toBeTruthy();
  expect(screen.getAllByText("— 選択不可・閲覧のみ")).toHaveLength(3);
  const otherRoute = container.querySelector<HTMLElement>(".stage-route.is-inactive")!;
  const candidate = within(otherRoute).getAllByRole("button")[0];
  expect(candidate.textContent).toContain("別ルートのため選択不可");
  fireEvent.click(candidate);
  const detail = screen.getByRole("dialog");
  expect(
    (within(detail).getByRole("button", { name: "この選択を取得" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  fireEvent.click(within(detail).getByRole("button", { name: "閉じる" }));
  expect(document.activeElement).toBe(candidate);
  fireEvent.click(screen.getByRole("button", { name: "4〜7歳" }));
  expect(screen.queryByText("✓ 選択中のルート")).toBeNull();
  expect(screen.queryByText("— 選択不可・閲覧のみ")).toBeNull();
  expect(screen.getAllByText("◇ 対象ステージで取得").length).toBeGreaterThan(0);
  until(state, 8);
  rerender(createElement(StageSelectionTree, props()));
  expect(screen.getByText("✓ 選択中のルート")).toBeTruthy();
  expect(screen.getAllByRole("button", { name: /このルートを確認/ })).toHaveLength(3);
});

it("後続の岐路では変更可能なカテゴリをマップに示し、変更後と次期に消す", () => {
  const state = startStage();
  satisfyStage(state);
  until(state, 8);
  const props = () => {
    const view = publicView(state);
    return { state: view.public, choices: view.choices };
  };
  const { rerender } = render(createElement(StageSelectionTree, props()));
  expect(document.querySelectorAll(".map-marker.is-route-changeable")).toHaveLength(5);
  expect(screen.queryByRole("alert", { name: "岐路のルート変更" })).toBeNull();
  const education = document.querySelector<HTMLElement>('.map-marker[data-menu="education"]')!;
  expect(education.textContent).toContain("ルート変更可");
  fireEvent.click(education);
  expect(screen.getByRole("heading", { name: "教育・進路" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "← ホームに戻る" }));

  state.cash = 10000;
  chooseStage(state, "crossroad-school", "private");
  rerender(createElement(StageSelectionTree, props()));
  expect(document.querySelectorAll(".map-marker.is-route-changeable")).toHaveLength(4);
  expect(
    document
      .querySelector('.map-marker[data-menu="education"]')
      ?.classList.contains("is-route-changeable"),
  ).toBe(false);
  until(state, 9);
  rerender(createElement(StageSelectionTree, props()));
  expect(document.querySelectorAll(".map-marker.is-route-changeable")).toHaveLength(0);
  expect(screen.getAllByText(/取得可能 \d+件/).length).toBeGreaterThan(0);
}, 30_000);

it("カテゴリをURL状態で開き、モバイルの表示ルートを切り替えられる", () => {
  const state = startStage();
  chooseStage(state, "crossroad-school", "public");
  const view = publicView(state);
  const onCategoryChange = vi.fn();
  const { container } = render(
    createElement(StageSelectionTree, {
      state: view.public,
      choices: view.choices,
      category: "education",
      onCategoryChange,
    }),
  );
  expect(screen.getByRole("heading", { name: "教育・進路" })).toBeTruthy();
  expect(container.querySelector(".stage-route.is-mobile-active")?.getAttribute("aria-label")).toBe(
    "公立・地域ルート",
  );
  const routes = screen.getByRole("navigation", { name: "ルートを切り替え" });
  fireEvent.click(within(routes).getByRole("button", { name: "私立" }));
  expect(container.querySelector(".stage-route.is-mobile-active")?.getAttribute("aria-label")).toBe(
    "私立ルート",
  );
  fireEvent.change(screen.getByRole("combobox", { name: "ステージを選択" }), {
    target: { value: "1" },
  });
  expect(screen.getByRole("combobox", { name: "ステージを選択" })).toHaveProperty("value", "1");
  expect(container.querySelector(".stage-route.is-mobile-active")?.getAttribute("aria-label")).toBe(
    "公立・地域ルート",
  );
  fireEvent.click(screen.getByRole("button", { name: "← ホームに戻る" }));
  expect(onCategoryChange).toHaveBeenCalledWith(null);
});

it("取得や資金変更でもルート内の判断の並び順を維持する", () => {
  const state = startStage();
  chooseStage(state, "crossroad-home", "daily");
  satisfyStage(state);
  state.cash = 10000;
  const props = () => {
    const view = publicView(state);
    return { state: view.public, choices: view.choices };
  };
  satisfyStage(state);
  const { container, rerender } = render(createElement(StageSelectionTree, props()));
  fireEvent.click(
    within(screen.getByRole("group", { name: "ホームの選択" })).getByRole("button", {
      name: /家庭生活/,
    }),
  );
  const cards = () =>
    Array.from(container.querySelectorAll(".stage-route.is-current .stage-selection"));
  const before = cards();
  const first = before.find((card) => card.classList.contains("is-available"))!;
  expect(first.textContent).toContain("今すぐ取得できます");
  const choice = props().choices.find(
    (item) =>
      !item.route_choice &&
      item.options.some(
        (option) => first.getAttribute("aria-label") === `${item.text}：${option.label}`,
      ),
  )!;
  chooseDecision(state, choice.instance_id, choice.options[0].option_id);
  rerender(createElement(StageSelectionTree, props()));
  expect(first.classList.contains("is-acquired")).toBe(true);
  expect(cards()).toEqual(before);
  state.cash = 0;
  rerender(createElement(StageSelectionTree, props()));
  expect(cards()).toEqual(before);
});
