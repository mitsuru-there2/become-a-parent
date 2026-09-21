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
});
