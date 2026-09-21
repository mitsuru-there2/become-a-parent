import { describe, expect, it } from "vite-plus/test";
import { Catalog } from "../src/content/catalog";
import { observeChild, publicView, start } from "../src/engine/simulation";
import { startDecisions } from "../src/engine/decisions";

describe("子どもの公開観察の短文（D-058）", () => {
  it("全文と同じ境界で短文を返し、保存・履歴や隠し値を変更しない", () => {
    const settings = new Catalog().resolve("normal");
    for (const n of [0, 6, 12, 24, 39]) {
      for (const [value, energy] of [
        [39, "余裕がありそう"],
        [40, "少し疲れている"],
        [69, "少し疲れている"],
        [70, "休みたがることが増えた"],
      ] as const) {
        const state = startDecisions("home-01", 0, settings);
        state.n = n;
        state.child.stress = value;
        state.observations = observeChild(state);
        const before = JSON.stringify(state);
        const view = publicView(state).public;
        expect(view.observations.find((item) => item.code === "energy")?.short_text).toBe(energy);
        expect(JSON.stringify(state)).toBe(before);
        expect(state.observations.every((item) => item.short_text === undefined)).toBe(true);
        expect(state.observations.every((item) => item.band === undefined)).toBe(true);
        expect(view.observations.find((item) => item.code === "energy")?.band).toBe(
          value < 40 ? "low" : value < 70 ? "middle" : "high",
        );
        for (const hidden of [
          "child",
          "aptitude",
          "adaptation",
          "trust",
          "autonomy",
          "ability",
          "draws",
        ])
          expect(Object.keys(view)).not.toContain(hidden);
        expect(
          view.observations.every((item) =>
            Object.values(item).every((value) => typeof value === "string"),
          ),
        ).toBe(true);
        expect(view.observations.some((item) => item.code === "agency")).toBe(n >= 6);
      }
    }
  });
  it("乳児と成長後の関係・両分野の興味を別々に伝える", () => {
    const state = start("home-01", 0, new Catalog().resolve("normal"));
    state.child.trust.A = 29;
    state.child.trust.B = 60;
    state.child.interest.study = 39;
    state.child.interest.craft = 60;
    const baby = observeChild(state, true);
    expect(baby.find((item) => item.code === "relationship.A")?.short_text).toBe("反応が少ない");
    expect(baby.find((item) => item.code === "relationship.B")?.short_text).toBe(
      "自分から触れ合う",
    );
    expect(baby.find((item) => item.code === "interest.study")?.short_text).toBe(
      "ことば・数：最近は関心が薄い",
    );
    expect(baby.find((item) => item.code === "interest.craft")?.short_text).toBe(
      "形・音：自分から遊ぶ",
    );
    state.n = 6;
    state.child.trust.A = 30;
    state.child.interest.study = 40;
    const grown = observeChild(state, true);
    expect(grown.find((item) => item.code === "relationship.A")?.short_text).toBe("近況を話す");
    expect(grown.find((item) => item.code === "relationship.B")?.short_text).toBe(
      "自分から話しに来る",
    );
    expect(grown.find((item) => item.code === "interest.study")?.short_text).toBe(
      "学習：誘うと取り組む",
    );
  });
  it("旧コンテンツと一致しない過去の本文には短文を付けない", () => {
    const oldSettings = new Catalog().resolve("normal");
    for (const key of Object.keys(oldSettings.content.text)) {
      if (key.startsWith("observation_")) delete oldSettings.content.text[key];
    }
    const legacy = start("home-01", 0, oldSettings);
    expect(
      publicView(legacy).public.observations.every((item) => item.short_text === undefined),
    ).toBe(true);
    const state = start("home-01", 0, new Catalog().resolve("normal"));
    state.observations[0].text = "過去の観察";
    expect(publicView(state).public.observations[0]).toEqual(state.observations[0]);
  });
  it("関係・興味・能力・自律性の図は既存の区分だけを公開する", () => {
    const state = start("home-01", 0, new Catalog().resolve("normal"));
    state.n = 12;
    for (const value of [0, 29, 30, 39, 40, 59, 60, 100]) {
      state.child.trust = { A: value, B: value };
      state.child.interest = { study: value, craft: value };
      state.child.ability = { study: value, craft: value };
      state.child.autonomy = value;
      state.observations = observeChild(state);
      for (const item of publicView(state).public.observations) {
        if (item.code === "energy") continue;
        const low = item.code.startsWith("interest.") ? 40 : 30;
        expect(item.band).toBe(value < low ? "low" : value < 60 ? "middle" : "high");
      }
    }
    const before = publicView(state).public.observations;
    state.child.aptitude = { study: 1, craft: 2 };
    state.child.adaptation = 99;
    state.observations = observeChild(state);
    expect(publicView(state).public.observations).toEqual(before);
    state.child.trust.A = 65;
    state.child.trust.B = 75;
    state.observations = observeChild(state);
    expect(publicView(state).public.observations).toEqual(before);
  });
});

it("公開履歴は隠し値の実数を観察へ置き換え、保存の記録と公開成績を保つ", async () => {
  const { publicHistory, publicStateHistory } = await import("../src/engine/public_history");
  const state = startDecisions("home-01", 0, new Catalog().resolve("normal"));
  const entry = {
    ...state.history[0],
    kind: "turn" as const,
    observations: observeChild(state),
    text: [
      "子ども・ストレス 28→27",
      "子ども・信頼・父 67→70",
      "子ども・能力・創作 10→20",
      "子ども・能力・学び 40→43",
      "疲労・父 6→5",
    ],
  };
  const before = JSON.stringify(entry);
  const projected = publicHistory(entry, true);
  expect(projected.text).toContain("子ども・能力・学び 40→43");
  expect(projected.text).toContain("疲労・父 6→5");
  expect(projected.text.some((line) => /子ども・(?:ストレス|信頼|能力・創作).*\d/.test(line))).toBe(
    false,
  );
  expect(JSON.stringify(entry)).toBe(before);
  expect(publicHistory(entry, false).text.some((line) => /子ども・.*\d/.test(line))).toBe(false);
  const view = publicView(state).public;
  view.decision_turn!.previous_result = entry;
  expect(publicStateHistory(view).decision_turn!.previous_result!.text).toEqual(projected.text);
});
