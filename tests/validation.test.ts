import * as v from "valibot";
import { describe, it, expect } from "vite-plus/test";
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  SearchParamError,
} from "@tanstack/react-router";
import base from "../config/base.json";
import { clone } from "../src/engine/shared";
import { initialPlan } from "../src/engine/simulation";
import { difficultyIdSchema } from "../src/content/schemas";
import { ContentError, validateContent } from "../src/content/validation";
import { bounded, mergePlan, validateChoice } from "../src/service/contract";

describe("Valibotへの移行：入力を補正せず検査する", () => {
  it("入れ子の不正型・未知キーはContentErrorで項目を示す", () => {
    for (const value of ["10", NaN, Infinity, -1, 1.5, null]) {
      const config = clone(base);
      (config.events["E-01"].options[0] as { cost: unknown }).cost = value;
      expect(() => validateContent(config)).toThrow(ContentError);
      expect(() => validateContent(config)).toThrow("events.E-01.options.0.cost");
    }
    const config = clone(base);
    Object.assign(config.events["E-01"].trigger, { chance: 10 });
    expect(() => validateContent(config)).toThrow("events.E-01.trigger.chance");
    for (const events of [null, [], { "E-01": null }]) {
      expect(() => validateContent({ ...base, events })).toThrow(ContentError);
    }
  });
  it("正常な設定を変更せず、特殊キーを黙って除外しない", () => {
    const config = clone(base);
    validateContent(config);
    expect(config).toEqual(base);
    for (const key of ["__proto__", "constructor", "prototype"]) {
      const invalid = clone(base);
      invalid.events = JSON.parse(`{"${key}": {}}`);
      expect(() => validateContent(invalid)).toThrow(ContentError);
    }
  });
  it("CLIの範囲・部分編集・選択の厳格性を維持する", () => {
    const plan = initialPlan();
    for (const value of ["1", true, NaN, Infinity, undefined])
      expect(() => bounded(value, 0, 3, "rest")).toThrow();
    for (const patch of [
      {},
      { parents: {} },
      { parents: { A: {} } },
      { parents: { A: { rest: undefined } } },
      { parents: { A: { rest: "2" } } },
      { parents: { A: { unknown: 1 } } },
      JSON.parse('{"__proto__":{}}'),
    ]) {
      expect(() => mergePlan(plan, patch)).toThrow();
      expect(plan).toEqual(initialPlan());
    }
    expect(mergePlan(plan, { parents: { A: { rest: 3 } } }).parents.A.rest).toBe(3);
    for (const value of [
      null,
      [],
      { event_instance: "t01:E-01" },
      { event_instance: "t01:E-01", option_id: 1 },
      { event_instance: "t01:E-01", option_id: "E-01:watch", extra: 1 },
    ])
      expect(() => validateChoice(value)).toThrow();
  });
});
describe("TanStack RouterとStandard Schemaの結合", () => {
  // 本番URLには未導入。ライブラリ同士の互換性を実際のRouterで検証する。
  const searchSchema = v.object({ difficulty: v.optional(difficultyIdSchema, "normal") });
  const create = (url: string) => {
    const root = createRootRoute();
    const route = createRoute({
      getParentRoute: () => root,
      path: "/",
      validateSearch: searchSchema,
    });
    return createRouter({
      routeTree: root.addChildren([route]),
      history: createMemoryHistory({ initialEntries: [url] }),
    });
  };
  it("追加アダプターなしで検査と既定値を適用する", () => {
    for (const [url, difficulty] of [
      ["/?difficulty=hard", "hard"],
      ["/", "normal"],
    ]) {
      const router = create(url);
      const match = router.matchRoutes(router.latestLocation).at(-1)!;
      expect(match.searchError).toBeUndefined();
      expect(match.search).toEqual({ difficulty });
    }
  });
  it("不明な難易度をRouterの検証エラーにする", () => {
    const router = create("/?difficulty=unknown");
    const match = router.matchRoutes(router.latestLocation).at(-1)!;
    expect(match.searchError).toBeInstanceOf(SearchParamError);
    expect(match.searchError).toMatchObject({ message: expect.stringContaining("difficulty") });
  });
});
