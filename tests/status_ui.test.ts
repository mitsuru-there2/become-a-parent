// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { createElement, type ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, afterAll, expect, it, vi } from "vite-plus/test";
import { ChildStatus } from "../src/components/game/child_status";
import { publicView, start } from "../src/engine/simulation";

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
  for (const item of state.observations) delete item.short_text;
  render(createElement(ChildStatus, { state }));
  expect(screen.getAllByRole("button")).toHaveLength(4);
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
  expect(advance.getAttribute("title")).toBe("マップで残りのルートを選んでください");
  fireEvent.click(advance);
  expect(update).not.toHaveBeenCalled();
});
