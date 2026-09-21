import { start } from "../src/engine/simulation";
import { digest } from "../src/service/service";
// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { createElement, type ComponentProps } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { PlanEditor } from "../src/components/game/plan_editor";
import { StartForm } from "../src/components/game/start_form";
import { ImportForm } from "../src/components/game/import_form";
import { FormInput } from "../src/components/game/form_input";
import {
  $busy,
  $dirty,
  $error,
  $response,
  $savedPlan,
  loadRun,
  repository,
  update,
} from "../src/stores/game";

const renders = vi.hoisted(() => new Map<string, number>());
vi.mock("../src/components/game/form_input", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/components/game/form_input")>();
  return {
    FormInput: (props: ComponentProps<typeof FormInput>) => {
      renders.set(props.name, (renders.get(props.name) ?? 0) + 1);
      return createElement(actual.FormInput, props);
    },
  };
});
const input = (name: string) =>
  document.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)!;
const change = (name: string, value: string) =>
  fireEvent.change(input(name), { target: { value } });
const renderPlan = () =>
  render(createElement(PlanEditor, { publicState: $response.get()!.public! }));

beforeEach(async () => {
  $busy.set(false);
  $dirty.set(false);
  $error.set("");
  const id = crypto.randomUUID();
  const state = start("home-01", 0);
  await repository.transact(id, () => ({
    run: {
      id,
      revision: 0,
      state,
      digest: digest(state),
      commits: [],
      receipts: {},
      updated_at: new Date().toISOString(),
    },
    value: null,
  }));
  await loadRun(id);
  renders.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("TanStack Formの方針編集", () => {
  it("単一入力の変更で他の14項目を再描画せず、元の値で未保存を解除する", () => {
    renderPlan();
    const original = input("parents.A.rest").value;
    const before = new Map(renders);
    change("parents.A.rest", original === "1" ? "2" : "1");
    expect($dirty.get()).toBe(true);
    expect(renders.get("parents.A.rest")).toBeGreaterThan(before.get("parents.A.rest")!);
    for (const [name, count] of before)
      if (name !== "parents.A.rest") expect(renders.get(name), name).toBe(count);
    change("parents.A.rest", original);
    expect($dirty.get()).toBe(false);
  });

  it("活動と強度を補完し、プリセット・取消でも保存基準を維持する", () => {
    renderPlan();
    change("activity.domain", "study");
    expect(input("activity.level").value).toBe("1");
    change("activity.level", "0");
    expect(input("activity.domain").value).toBe("none");
    expect($dirty.get()).toBe(false);
    change("activity.level", "2");
    expect(input("activity.domain").value).toBe("craft");
    fireEvent.click(screen.getByText("編集を取り消す"));
    expect($dirty.get()).toBe(false);
    fireEvent.click(screen.getByText("子どもの「好き」に付き合う"));
    expect($dirty.get()).toBe(true);
    fireEvent.click(screen.getByText("編集を取り消す"));
    expect($dirty.get()).toBe(false);
    expect(input("activity.level").value).toBe("0");
  });

  it("出来事の保存で編集を保持し、方針保存後に基準を更新する", async () => {
    const view = renderPlan();
    change("parents.A.rest", "1");
    const choice = $response.get()!.choices[0];
    await act(async () => {
      expect(
        await update("choose", {
          event_instance: choice.instance_id,
          option_id: choice.options[0].option_id,
        }),
      ).toBe(true);
    });
    view.rerender(createElement(PlanEditor, { publicState: $response.get()!.public! }));
    expect(input("parents.A.rest").value).toBe("1");
    expect($dirty.get()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "方針を保存" }));
    await waitFor(() => expect($dirty.get()).toBe(false));
    expect($savedPlan.get()!.parents.A.rest).toBe(1);
    change("parents.A.rest", "2");
    fireEvent.click(screen.getByText("編集を取り消す"));
    expect(input("parents.A.rest").value).toBe("1");
  });

  it("不正入力と保存失敗で編集を消さず、前期への復帰で基準を更新する", async () => {
    renderPlan();
    const original = input("parents.A.rest").value;
    change("parents.A.rest", "");
    fireEvent.submit(input("parents.A.rest").closest("form")!);
    await screen.findByRole("alert");
    expect(input("parents.A.rest").value).toBe("");
    expect($dirty.get()).toBe(true);
    change("parents.A.rest", "1");
    vi.spyOn(repository, "transact").mockRejectedValueOnce(new Error("保存できません"));
    fireEvent.click(screen.getByRole("button", { name: "方針を保存" }));
    await waitFor(() => expect($error.get()).not.toBe(""));
    expect(input("parents.A.rest").value).toBe("1");
    expect($dirty.get()).toBe(true);
    fireEvent.click(screen.getByText("前期の方針に戻す"));
    await waitFor(() => expect($dirty.get()).toBe(false));
    expect(input("parents.A.rest").value).toBe(original);
  });
});

describe("開始・取り込みフォーム", () => {
  it("難易度だけを選択して開始し、非同期送信中の重複を防ぐ", async () => {
    let finish!: () => void;
    const onCreated = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    render(createElement(StartForm, { onCreated }));
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
    expect(document.querySelector('[name="scenario"]')).toBeNull();
    expect(document.querySelector('[name="seed"]')).toBeNull();
    expect(document.querySelector('[name="packs"]')).toBeNull();
    expect(screen.queryByText("追加シナリオ")).toBeNull();
    const random = vi.spyOn(crypto, "getRandomValues");
    change("difficulty", "hard");
    fireEvent.click(screen.getByRole("button", { name: /新しい人生をはじめる/ }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(random).toHaveBeenCalledTimes(1);
    const saved = await repository.read($response.get()!.run_id!);
    expect(saved!.state.scenario).toBe("home-01");
    expect(saved!.state.seed).toBeGreaterThanOrEqual(0);
    expect(saved!.state.seed).toBeLessThanOrEqual(4294967295);
    expect(saved!.state.settings?.packs).toEqual([]);
    expect($response.get()!.public!.content.difficulty_label).toBe("むずかしい");
    expect(input("difficulty").closest("fieldset")!.disabled).toBe(true);
    fireEvent.submit(input("difficulty").closest("form")!);
    expect(onCreated).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish();
    });
  });
  it("取り込み中は入力を無効化し、失敗後に同じファイルを再選択できる", async () => {
    const onImported = vi.fn(async () => {});
    const restore = vi.spyOn(repository, "restore").mockRejectedValue(new Error("壊れた保存です"));
    const file = new File(["{}"], "save.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: async () => "{}" });
    render(createElement(ImportForm, { onImported }));
    fireEvent.change(input("file"), { target: { files: [file] } });
    await waitFor(() => expect(restore).toHaveBeenCalledTimes(1));
    await waitFor(() => expect((input("file") as HTMLInputElement).disabled).toBe(false));
    expect($error.get()).toBe("壊れた保存です");
    expect(input("file").value).toBe("");
    restore.mockResolvedValueOnce("restored-run");
    fireEvent.change(input("file"), { target: { files: [file] } });
    await waitFor(() => expect(onImported).toHaveBeenCalledWith("restored-run"));
  });
});
