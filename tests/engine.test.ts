import { describe, it, expect } from "vite-plus/test";
import reference from "../docs/specs/calculated-traces.json";
import { start, advance, publicView, openTurn, applyOddity, draw } from "../src/engine/simulation";
import { finish, ending } from "../src/engine/adult";
import { PEOPLE, clone } from "../src/engine/shared";
import type { Plan, State, Money, History } from "../src/engine/types";
describe("内部検証：既存ルールの移植", () => {
  for (const run of reference.runs)
    it(`${run.pattern}：40期と成人後が参照値と一致`, () => {
      const s = start(run.pattern === "BP-05" ? "home-02" : "home-01", 0);
      for (const turn of run.turns) {
        const p = turn.plan;
        s.plan = {
          parents: { A: p.parents[0], B: p.parents[1] },
          activity: { domain: p.domain, level: p.level, sponsor: "AB"[p.sponsor] },
          style: ["respect", "coach", "push"][p.q],
          help: p.help,
        } as Plan;
        s.answers = Object.fromEntries(
          turn.answers.map(([e, o]) => [
            `t${String(turn.turn).padStart(2, "0")}:${e}`,
            `${e}:${o}`,
          ]),
        );
        expect(publicView(s).public.forecast?.can_advance).toBe(true);
        advance(s);
        const got = s.effects.at(-1)!.after,
          ex = turn.state;
        expect(got.cash).toBe(ex.M);
        expect(got.couple).toBe(ex.K);
        expect([got.child.stress, got.child.autonomy, got.child.adaptation]).toEqual([
          ex.X,
          ex.U,
          ex.V,
        ]);
        expect(Object.values(got.child.interest)).toEqual(ex.I);
        expect(Object.values(got.child.ability)).toEqual(ex.B);
        for (const [i, p] of PEOPLE.entries()) {
          const v = got.parents[p],
            x = ex.P[i];
          expect([
            v.stress,
            v.health,
            v.fulfillment,
            v.social,
            v.regret,
            got.child.trust[p],
          ]).toEqual([x.S, x.H, x.F, x.N, x.G, x.T]);
        }
        expect([
          got.grandparents.health,
          got.grandparents.relation,
          got.grandparents.funds,
        ]).toEqual([ex.GH, ex.GR, ex.GM]);
      }
      expect(s.phase).toBe("finished");
      expect(s.n).toBe(40);
      expect(s.queue).toEqual([]);
      for (const [i, p] of PEOPLE.entries()) {
        const got = s.result!.parents[p],
          ex = run.result.parents[i];
        expect([got.death_age, got.happiness, got.cash, got.health]).toEqual([
          ex.age,
          ex.happiness,
          ex.cash,
          ex.health,
        ]);
      }
      const { success, ...child } = run.result.child;
      expect(s.result!.child).toMatchObject({ ...child, social_success: success });
      for (const h of s.history)
        for (const m of h.money)
          expect(m.before + m.income - m.expense - m.cap_overflow).toBe(m.after);
    });
  it("公開情報に隠し状態を含めない・観察境界", () => {
    for (const [value, text] of [
      [39, "余裕がありそう"],
      [40, "少し疲れている様子"],
      [70, "休みたがることが増えた"],
    ] as const) {
      const s = start("home-01", 0);
      s.child.stress = value;
      openTurn(s);
      const view = publicView(s);
      expect(view.public.observations[0].text).toBe(text);
      for (const hidden of [
        "aptitude",
        "adaptation",
        "trust",
        "ability",
        "seed",
        "draws",
        "target",
      ])
        expect(JSON.stringify(view)).not.toContain(`"${hidden}"`);
      view.public.parents.A.stress = 999;
      expect(s.parents.A.stress).not.toBe(999);
    }
  });
  it("条件イベントの優先順位と再発間隔", () => {
    const s = start("home-01", 0);
    s.n = 4;
    s.child.stress = 70;
    openTurn(s);
    expect(s.events.map((e) => e.event_id)).toEqual(["E-10"]);
    s.n = 5;
    openTurn(s);
    expect(s.events.map((e) => e.event_id)).toEqual(["E-09"]);
    s.n = 7;
    openTurn(s);
    expect(s.events.map((e) => e.event_id)).not.toContain("E-10");
    s.n = 8;
    openTurn(s);
    expect(s.events.map((e) => e.event_id)).toContain("E-10");
  });
  it("遅延効果の成功・失敗", () => {
    for (const id of ["L-01", "L-02"])
      for (const success of [true, false]) {
        const s = start("home-01", 0);
        s.n = 26;
        s.events = [];
        s.queue = [{ id, due_turn: 27, source: "t25:E-05", target: "craft" }];
        s.plan.style = success ? "respect" : "push";
        const no = clone(s);
        no.queue = [];
        advance(s, 99);
        advance(no, 99);
        expect(s.queue).toEqual([]);
        expect(s.history[0].related).toEqual(["t25:E-05"]);
        expect(
          id === "L-01"
            ? s.child.ability.craft - no.child.ability.craft
            : s.child.trust.A - no.child.trust.A,
        ).toBe(success ? 2 : 0);
      }
  });
  it("珍事の境界・収支上限・残金不足", () => {
    for (const [value, id] of [
      [0, "O-01"],
      [9, "O-01"],
      [10, "O-02"],
      [17, "O-02"],
      [18, "O-03"],
      [24, "O-03"],
      [25, null],
      [99, null],
    ] as const) {
      const s = start("home-01", 0),
        events: History["events"] = [],
        money: Money = {
          scope: "household",
          before: 0,
          income: 0,
          expense: 0,
          cap_overflow: 0,
          after: 0,
        };
      s.cash = 3;
      applyOddity(s, value, money, [], events);
      expect(events[0]?.event_id ?? null).toBe(id);
      expect(s.cash).toBeGreaterThanOrEqual(0);
    }
    const s = start("home-01", 0);
    s.cash = 99998;
    s.answers = { "t01:E-01": "E-01:watch" };
    advance(s, 0);
    expect(s.history[0].money[0].cap_overflow).toBe(49);
  });
  it("片親の先死亡は固定され、その後の老後も続く", () => {
    const s = start("home-01", 0);
    s.n = 40;
    s.parents.A.health = 10;
    s.parents.B.health = 100;
    finish(s, draw);
    expect(s.result!.parents.A.death_age).toBe(65);
    expect(s.result!.parents.B.death_age).toBe(90);
    expect(s.parents.A.age_months).toBe(65 * 12);
  });
  it("5結末の判定と優先順位", () => {
    const s = start("home-01", 0);
    finish(s, draw);
    const child = clone(s.result!.child);
    const check = (id: string, edit: (s: State) => void) => {
      const v = start("home-01", 0);
      edit(v);
      expect(ending(v, child).id).toBe(id);
    };
    child.social_success = 80;
    check("EN-01", (v) => {
      v.child.trust = { A: 20, B: 20 };
    });
    check("EN-02", (v) => {
      v.repaired = true;
    });
    check("EN-03", (v) => {
      v.parents.A.fulfillment = 80;
      v.parents.B.fulfillment = 80;
    });
    child.residence = "far";
    check("EN-04", () => {});
    child.residence = "near";
    check("EN-05", () => {});
  });
});
