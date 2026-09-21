import { describe, expect, it } from "vite-plus/test";
import { Catalog, defaultContent } from "../src/content/catalog";
import { applyStat } from "../src/engine/automatic_events";
import { advance, publicView } from "../src/engine/simulation";
import { clone } from "../src/engine/shared";
import {
  startStage,
  chooseStage,
  satisfyStage,
  until,
  stageOption,
} from "./fixtures/stage_helpers";

const game = defaultContent.life_game!;

describe("S-018-AA〜AC 各ステージ・ルートに固有の10判断", () => {
  it("85組すべてが10件で、850件の題材・本文・所属に使い回しがない", () => {
    expect(game.decisions).toHaveLength(850);
    expect(new Set(game.decisions.map((n) => n.title)).size).toBe(850);
    expect(new Set(game.decisions.map((n) => n.options[0].description)).size).toBe(850);
    for (const group of game.route_groups!)
      for (const route of group.routes)
        for (let stage = 0; stage < 5; stage++) {
          const nodes = game.decisions.filter(
            (n) =>
              n.menu === group.menu &&
              n.stages![0] === stage &&
              n.options[0].routes![0] === route.id,
          );
          expect(nodes, `${group.id}/${route.id}/${stage}`).toHaveLength(10);
          for (const node of nodes) {
            expect(node.stages).toEqual([stage]);
            expect(node.options).toHaveLength(1);
            const o = node.options[0];
            expect(o.routes).toEqual([route.id]);
            expect(
              o.cost > 0 || o.effects.some((e) => e.delta < 0 || /stress|fatigue/.test(e.path)),
              node.id,
            ).toBe(true);
            expect(
              o.income >= 100 ||
                o.effects.some((e) => Math.abs(e.delta) >= (e.path.startsWith("child.") ? 10 : 2)),
              node.id,
            ).toBe(true);
          }
        }
    const packed = new Catalog().resolve("normal", ["community-life"]);
    expect(packed.content.life_game!.decisions).toHaveLength(851);
  });

  it("全850判断を正規のルート・前提で取得し、資金と全即時効果が適用される", () => {
    let tested = 0;
    for (const group of game.route_groups!)
      for (const route of group.routes) {
        const baseline = startStage();
        chooseStage(baseline, `crossroad-${group.id}`, route.id);
        satisfyStage(baseline);
        for (let stage = 0; stage < 5; stage++) {
          until(baseline, stage * 8);
          const nodes = game.decisions.filter(
            (n) =>
              n.menu === group.menu &&
              n.stages![0] === stage &&
              n.options[0].routes![0] === route.id,
          );
          for (const node of nodes) {
            const s = clone(baseline);
            s.cash = 10000;
            // 境界に張り付いた初期状態ではなく、正負の実変化を検査する。
            s.child.ability = { study: 40, craft: 40 };
            s.child.autonomy = 40;
            s.child.stress = 40;
            s.child.trust = { A: 40, B: 40 };
            for (const p of ["A", "B"] as const) {
              s.parents[p].stress = 5;
              s.parents[p].health = 5;
              s.decisions!.fatigue[p] = 5;
            }
            s.couple = 5;
            s.grandparents.health = 5;
            s.grandparents.relation = 5;
            const target = node.options[0];
            for (const ref of target.requires?.history ?? []) {
              if (!s.life!.history[`${ref.decision}:${ref.option}`])
                chooseStage(s, ref.decision, ref.option);
            }
            const expected = clone(s);
            expected.cash += target.income - target.cost;
            for (const effect of target.effects) applyStat(expected, effect);
            const view = stageOption(s, node.id, "take");
            expect(view.available, node.id).toBe(true);
            expect(view.effect_details?.map((e) => e.duration)).toEqual([
              "instant",
              ...(target.stage_effect ? ["stage"] : []),
              ...(target.permanent_effect ? ["permanent"] : []),
            ]);
            chooseStage(s, node.id, "take");
            expect(s.cash, node.id).toBe(expected.cash);
            expect(s.child, node.id).toEqual(expected.child);
            expect(s.parents, node.id).toEqual(expected.parents);
            expect(s.decisions!.fatigue, node.id).toEqual(expected.decisions!.fatigue);
            expect(s.decisions!.skills, node.id).toEqual(expected.decisions!.skills);
            expect(s.couple, node.id).toBe(expected.couple);
            expect(s.grandparents, node.id).toEqual(expected.grandparents);
            expect(s.life!.history[`${node.id}:take`].count).toBe(1);
            const before = clone(s);
            expect(() => chooseStage(s, node.id, "take"), node.id).toThrow();
            expect(s).toEqual(before);
            tested++;
          }
          // 本物の幼児期履歴を残し、最後の宝箱の前提として使う。
          if (group.menu === "home" && route.id === "memory" && stage === 0)
            chooseStage(baseline, "home-memory-0-01", "take");
        }
      }
    expect(tested).toBe(850);
  }, 60_000);

  it("収入優先・回復優先で同じ一期の家計と負担が大きく分かれる", () => {
    const career = startStage();
    chooseStage(career, "crossroad-work", "career");
    satisfyStage(career);
    const rest = clone(career);
    chooseStage(career, "work-career-0-06", "take");
    chooseStage(rest, "work-career-0-07", "take");
    expect(career.cash - rest.cash).toBe(200);
    expect(career.decisions!.fatigue.A - rest.decisions!.fatigue.A).toBeGreaterThanOrEqual(5);
    expect(career.parents.A.stress - rest.parents.A.stress).toBeGreaterThanOrEqual(5);
    const forecast = publicView(career).public.forecast!;
    advance(career);
    expect(career.cash).toBe(forecast.projected_cash);
  });
});
