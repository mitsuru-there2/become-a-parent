// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { createElement, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, afterAll, expect, it, vi } from "vite-plus/test";
import { ChildStatus } from "../src/components/game/child_status";
import { PartyStatus } from "../src/components/game/party_status";
import { publicView, start } from "../src/engine/simulation";
import { chooseDecision } from "../src/engine/decisions";
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
  fireEvent.click(advance);
  expect(update).not.toHaveBeenCalled();
});

it("現在ルートの取得可能な判断だけを通知し、取得後に通知を更新する", () => {
  const state = startStage();
  const props = () => {
    const view = publicView(state);
    return { state: view.public, choices: view.choices };
  };
  const { rerender } = render(createElement(StageSelectionTree, props()));
  expect(screen.queryByRole("alert", { name: "取得可能な判断" })).toBeNull();
  chooseStage(state, "crossroad-school", "public");
  rerender(createElement(StageSelectionTree, props()));
  expect(screen.queryByRole("alert", { name: "取得可能な判断" })).toBeNull();
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  expect(screen.getByText("ルートを選択")).toBeTruthy();
  satisfyStage(state);
  rerender(createElement(StageSelectionTree, props()));
  const alert = screen.getByRole("alert", { name: "取得可能な判断" });
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  expect(within(alert).getAllByRole("button")).toHaveLength(5);
  const count = publicView(state).choices.flatMap((choice) =>
    choice.route_choice ? [] : choice.options.filter((option) => option.available),
  ).length;
  expect(
    within(alert).getByText(`選択中のルートに、取得できる判断が${count}件あります`),
  ).toBeTruthy();
  fireEvent.click(within(alert).getByRole("button", { name: /教育・進路/ }));
  expect(screen.getByRole("heading", { name: "教育・進路" })).toBeTruthy();
  expect(screen.queryByRole("alert", { name: "取得可能な判断" })).toBeNull();
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
  expect(screen.queryByRole("alert", { name: "取得可能な判断" })).toBeNull();
});

it("資金とパラメータの現在値に応じて通知の合計とカテゴリ件数が増減する", () => {
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
    const count = current.choices.flatMap((choice) =>
      choice.route_choice ? [] : choice.options.filter((option) => option.available),
    ).length;
    if (count === 0) expect(screen.queryByRole("alert", { name: "取得可能な判断" })).toBeNull();
    else {
      const alert = screen.getByRole("alert", { name: "取得可能な判断" });
      expect(
        within(alert).getByText(`選択中のルートに、取得できる判断が${count}件あります`),
      ).toBeTruthy();
      expect(
        within(alert).getByRole("button", {
          name: `家庭生活（${current.choices.filter((choice) => choice.menu === "home" && !choice.route_choice).flatMap((choice) => choice.options.filter((option) => option.available)).length}件）`,
        }),
      ).toBeTruthy();
    }
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
    within(screen.getByRole("alert", { name: "取得可能な判断" })).getByRole("button", {
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
    within(screen.getByRole("alert", { name: "取得可能な判断" })).getByRole("button", {
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

it("後続の岐路ではルート変更案内を優先し、次期に取得通知へ戻る", () => {
  const state = startStage();
  until(state, 8);
  const props = () => {
    const view = publicView(state);
    return { state: view.public, choices: view.choices };
  };
  const { rerender } = render(createElement(StageSelectionTree, props()));
  expect(screen.getByRole("alert", { name: "岐路のルート変更" })).toBeTruthy();
  expect(screen.queryByRole("alert", { name: "取得可能な判断" })).toBeNull();
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  until(state, 9);
  rerender(createElement(StageSelectionTree, props()));
  expect(screen.queryByRole("alert", { name: "岐路のルート変更" })).toBeNull();
  expect(screen.getByRole("alert", { name: "取得可能な判断" })).toBeTruthy();
  expect(screen.getAllByRole("alert")).toHaveLength(1);
});
