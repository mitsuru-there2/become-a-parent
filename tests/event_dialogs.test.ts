// @vitest-environment jsdom
import { createElement, createRef } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { EventDialogs } from "../src/components/game/event_dialogs";
import type { AutomaticEventResult } from "../src/engine/types";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("期首のイベントダイアログ", () => {
  it("300ms間隔で一件ずつ重ね、手前から個別に閉じられる", () => {
    vi.useFakeTimers();
    const events: AutomaticEventResult[] = [
      {
        event_id: "first",
        kind: "good",
        text: "最初の出来事",
        changes: ["資金 +10万円"],
        visual: { src: "/assets/marketing/hero.png", alt: "最初の出来事の絵" },
      },
      { event_id: "second", kind: "bad", text: "次の出来事", changes: [] },
      { event_id: "third", kind: "good", text: "最後の出来事", changes: [] },
    ];
    const onClose = vi.fn();
    render(
      createElement(EventDialogs, {
        events,
        legacyLines: [],
        onClose,
        headingRef: createRef<HTMLHeadingElement>(),
        stagger: true,
      }),
    );
    expect(document.querySelectorAll(".turn-event-dialog")).toHaveLength(1);
    const first = screen.getByRole("dialog", { name: "今期の出来事" });
    expect(within(first).getByText("最初の出来事")).toBeTruthy();
    expect(within(first).getByRole("img", { name: "最初の出来事の絵" })).toBeTruthy();
    expect(within(first).getByText("1 / 3 件")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(document.querySelectorAll(".turn-event-dialog")).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(document.querySelectorAll(".turn-event-dialog")).toHaveLength(2);
    expect(document.querySelector('[data-depth="1"]')?.getAttribute("aria-hidden")).toBe("true");
    const second = screen.getByRole("dialog", { name: "今期の出来事" });
    expect(within(second).getByText("次の出来事")).toBeTruthy();
    expect(
      within(second).getByRole("img", { name: "家族に起きた出来事を表す仮の挿絵" }),
    ).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(document.querySelectorAll(".turn-event-dialog")).toHaveLength(3);
    const third = screen.getByRole("dialog", { name: "今期の出来事" });
    expect(within(third).getByText("最後の出来事")).toBeTruthy();
    expect(within(third).getByText("3 / 3 件")).toBeTruthy();
    fireEvent.click(within(third).getAllByRole("button", { name: "閉じる" })[0]);
    expect(within(screen.getByRole("dialog")).getByText("次の出来事")).toBeTruthy();
    fireEvent.click(
      within(screen.getByRole("dialog")).getAllByRole("button", { name: "閉じる" })[0],
    );
    expect(within(screen.getByRole("dialog")).getByText("最初の出来事")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("次のカードが開く前に閉じた場合は待たずに次を表示する", () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(
      createElement(EventDialogs, {
        events: [
          { event_id: "first", kind: "good", text: "最初", changes: [] },
          { event_id: "second", kind: "bad", text: "次", changes: [] },
        ],
        legacyLines: [],
        onClose,
        headingRef: createRef<HTMLHeadingElement>(),
        stagger: true,
      }),
    );
    fireEvent.click(
      within(screen.getByRole("dialog")).getAllByRole("button", { name: "閉じる" })[0],
    );
    expect(within(screen.getByRole("dialog")).getByText("次")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(document.querySelectorAll(".turn-event-dialog")).toHaveLength(1);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
