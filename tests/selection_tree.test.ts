import "fake-indexeddb/auto";
import { describe, expect, it } from "vite-plus/test";
import { Catalog, defaultContent } from "../src/content/catalog";
import { clone } from "../src/engine/shared";
import { startDecisions } from "../src/engine/decisions";
import { advance, publicView } from "../src/engine/simulation";
import { activeTreeEffects } from "../src/engine/tree_effects";
import { validateLifeState } from "../src/engine/life_save";
import { annualIncome } from "../src/engine/life_requirements";
import { activeStageEffects } from "../src/engine/stage_state";
import { applyAutomaticEvents } from "../src/engine/automatic_events";
import {
  Service,
  replayRun,
  exportRun,
  importRun,
  validateRun,
  digest,
} from "../src/service/service";
import { GameDatabase, IndexedRepository } from "../src/storage/indexeddb";
import type { State } from "../src/engine/types";

import {
  startStage,
  chooseStage,
  satisfyStage,
  until,
  stageOption as option,
} from "./fixtures/stage_helpers";

describe("S-018-V〜Y 岐路・ステージ・即時取得", () => {
  it("現行ルールは5分類の既定ルートで開始し、変更しなくても進める", () => {
    const s = startDecisions("home-01", 2, new Catalog().resolve("normal"));
    const life = publicView(s).public.life!;
    expect(life.crossroad!.missing).toEqual([]);
    expect(life.crossroad!.changeable).toHaveLength(5);
    expect(life.route_groups!.every((group) => group.current === group.routes[0].id)).toBe(true);
    expect(publicView(s).public.forecast!.can_advance).toBe(true);
    const untouched = startDecisions("home-01", 2, new Catalog().resolve("normal"));
    advance(untouched);
    expect(untouched.n).toBe(1);
    expect(() => validateLifeState(untouched)).not.toThrow();
    const before = clone(s);
    expect(() => chooseStage(s, "crossroad-school", "public")).toThrow();
    expect(s).toEqual(before);
    const cash = s.cash;
    const stress = s.child.stress;
    chooseStage(s, "crossroad-school", "private");
    expect(s.cash).toBe(cash);
    expect(s.child.stress).toBe(stress);
    expect(publicView(s).public.life!.crossroad!.changeable).toHaveLength(4);
    expect(() => chooseStage(s, "crossroad-school", "home")).toThrow();
    expect(() => validateLifeState(s)).not.toThrow();
    advance(s);
    expect(s.life!.stage_routes!["0:school"]).toBe("private");
    expect(() => validateLifeState(s)).not.toThrow();
  });
  it("既定ルートの判断を取ってから初回変更しても保存状態を検証できる", () => {
    const s = startDecisions("home-01", 2, new Catalog().resolve("normal"));
    chooseStage(s, "grandparents-visit-0-01", "take");
    chooseStage(s, "crossroad-grandparents", "care");
    expect(() => validateLifeState(s)).not.toThrow();
  });
  it("初回だけ全カテゴリの確定が必要で、後続の全岐路は無料で自動継承する", () => {
    const s = startStage();
    expect(s.versions).toEqual({ rules: "rules-13", data: "data-14", save: "save-14" });
    expect(publicView(s).public.life!.crossroad!.missing).toHaveLength(5);
    const before = clone(s);
    expect(() => advance(s)).toThrow();
    expect(s).toEqual(before);
    chooseStage(s, "crossroad-school", "public");
    expect(publicView(s).public.life!.crossroad!.missing).toHaveLength(4);
    expect(publicView(s).public.forecast!.can_advance).toBe(false);
    satisfyStage(s);
    for (let n = 1; n <= 40; n++) {
      const forecast = publicView(s).public.forecast!;
      expect(forecast.can_advance).toBe(true);
      advance(s);
      if (n < 40 && n % 8 === 0) {
        const life = publicView(s).public.life!;
        expect(life.crossroad!.missing).toEqual([]);
        expect(life.crossroad!.changeable).toHaveLength(5);
        for (const group of life.route_groups!) expect(group.current).toBe(group.previous);
        expect(s.cash).toBe(forecast.projected_cash);
        expect(() => validateLifeState(s)).not.toThrow();
      }
    }
    expect(s.history.filter((h) => h.kind === "special")).toHaveLength(5);
    expect(s.phase).toBe("finished");
    expect(s.result!.parents.A.death_age).toBeGreaterThan(50);
  });
  it("岐路ごとに一度のみ確定し、途中変更・取消を拒否する", () => {
    const s = startStage();
    satisfyStage(s);
    for (const id of ["public", "private", "cancel"]) {
      const before = clone(s);
      expect(() => chooseStage(s, "crossroad-school", id)).toThrow();
      expect(s).toEqual(before);
    }
    advance(s);
    expect(() => chooseStage(s, "crossroad-school", "home")).toThrow();
    expect(publicView(s).public.life!.crossroad).toBeNull();
  });
  it("初回・継続は無料、変更費と負担は即時一度だけ、資金不足は無変更", () => {
    const s = startStage();
    const initial = s.cash;
    satisfyStage(s);
    expect(s.cash).toBe(initial);
    until(s, 8);
    s.cash = 79;
    const before = clone(s);
    expect(() => chooseStage(s, "crossroad-school", "private")).toThrow();
    expect(s).toEqual(before);
    s.cash = 80;
    const stress = s.child.stress;
    chooseStage(s, "crossroad-school", "private");
    expect(s.cash).toBe(0);
    expect(s.child.stress).toBe(Math.min(100, stress + 3));
    expect(publicView(s).public.life!.crossroad!.changeable).toHaveLength(4);
    for (const route of ["public", "private", "international"])
      expect(() => chooseStage(s, "crossroad-school", route)).toThrow();
    satisfyStage(s);
    const forecast = publicView(s).public.forecast!;
    expect(forecast.cash_flow!.reduce((n, item) => n + (item.cost ?? 0), 0)).toBe(forecast.cost);
    advance(s);
    expect(s.cash).toBe(forecast.projected_cash);
    until(s, 16);
    expect(s.life!.stage_routes!["2:school"]).toBe("private");
    const cash = s.cash;
    satisfyStage(s);
    expect(s.cash).toBe(cash);
  });
  it("カテゴリ・ルート・ステージと条件で取得を制限し、同一期の後続取得と後半取得を許可", () => {
    const s = startStage();
    expect(option(s, "home-daily-0-01", "take").available).toBe(false);
    satisfyStage(s);
    expect(option(s, "home-memory-0-01", "take").available).toBe(false);
    const cash = s.cash;
    chooseStage(s, "home-daily-0-01", "take");
    expect(s.cash).toBe(cash - 75);
    expect(option(s, "home-daily-0-04", "take").available).toBe(true);
    chooseStage(s, "home-daily-0-04", "take");
    chooseStage(s, "home-daily-0-10", "take");
    expect(Object.keys(s.life!.history)).toHaveLength(3);
    const before = clone(s);
    expect(() => chooseStage(s, "home-daily-0-01", "take")).toThrow();
    expect(s).toEqual(before);
    expect(() => chooseStage(s, "home-daily-0-04", "cancel")).toThrow();
    until(s, 7);
    chooseStage(s, "grandparents-visit-0-01", "take");
    expect(s.life!.history["grandparents-visit-0-01:take"].first_turn).toBe(8);
    expect(option(s, "home-memory-4-03", "take").available).toBe(false);
  });
  it.skip("即時・ステージ・恒久効果を分け、境界で期限だけ終了し、継続ルートでも再発動しない", () => {
    const s = startStage();
    satisfyStage(s);
    const target = s.settings!.content.life_game!.decisions.find(
      (n) => n.id === "grandparents-visit-0-01",
    )!.options[0];
    target.effects = [{ path: "child.ability.craft", delta: 2 }];
    target.stage_effect = {
      cost: 3,
      income: 5,
      effects: [{ path: "child.ability.craft", delta: 1 }],
      event_modifiers: [{ label: "今の支援", kind: "good", percent: 10 }],
    };
    target.permanent_effect = {
      cost: 1,
      income: 2,
      effects: [{ path: "child.ability.study", delta: 1 }],
      event_modifiers: [{ label: "思い出", kind: "good", percent: 5 }],
    };
    const craft = s.child.ability.craft;
    chooseStage(s, "grandparents-visit-0-01", "take");
    expect(s.child.ability.craft).toBe(craft + 2);
    expect(activeTreeEffects(s)).toHaveLength(2);
    const forecast = publicView(s).public.forecast!;
    advance(s);
    expect(s.child.ability.craft).toBe(craft + 3);
    expect(s.cash).toBe(forecast.projected_cash);
    until(s, 8);
    expect(activeTreeEffects(s).map((e) => e.label)).toEqual(["思い出"]);
    const income = annualIncome(s);
    satisfyStage(s);
    expect(annualIncome(s)).toBe(income);
    expect(activeStageEffects(s)).toHaveLength(1);
    until(s, 16);
    chooseStage(s, "crossroad-grandparents", "care");
    satisfyStage(s);
    expect(activeTreeEffects(s).map((e) => e.label)).toEqual(["思い出"]);
    until(s, 40);
    expect(activeStageEffects(s)).toEqual([]);
  });
  it("年収・成績・親能力・即時費用と継続費の境界を共通取得条件で検査する", () => {
    const s = startStage();
    satisfyStage(s);
    const target = s.settings!.content.life_game!.decisions.find((n) => n.id === "home-daily-0-04")!
      .options[0];
    delete target.requires;
    target.requires = {
      annual_income: 560,
      stats: [
        { path: "child.ability.study", op: "gte", value: 60 },
        { path: "decisions.skills.A.learning", op: "gte", value: 5 },
      ],
    };
    s.child.ability.study = 59;
    s.decisions!.skills.A.learning = 5;
    expect(option(s, "home-daily-0-04", target.id).available).toBe(false);
    s.child.ability.study = 60;
    expect(option(s, "home-daily-0-04", target.id).available).toBe(true);
    target.cost = s.cash + 1;
    expect(option(s, "home-daily-0-04", target.id).available).toBe(false);
    target.cost = 0;
    target.stage_effect!.cost = 99999;
    const before = clone(s);
    expect(() => chooseStage(s, "home-daily-0-04", target.id)).toThrow();
    expect(s).toEqual(before);
  });
  it("イベント補正は取得直後から効き、ステージ境界で終了し、有限援助と上限を維持する", () => {
    const s = startStage();
    satisfyStage(s);
    const target = s.settings!.content.life_game!.decisions.find(
      (n) => n.id === "grandparents-visit-0-01",
    )!.options[0];
    target.stage_effect = {
      cost: 0,
      income: 0,
      effects: [],
      event_modifiers: [{ label: "支援", kind: "good", percent: 100 }],
    };
    delete target.permanent_effect;
    chooseStage(s, "grandparents-visit-0-01", "take");
    const event = {
      id: "stage-bonus",
      text: "確認",
      kind: "good" as const,
      min_age_months: 0,
      max_age_months: 234,
      probability: 100,
      conditions: [],
      modifiers: [],
      cooldown: 1,
      once: false,
      effects: [{ path: "cash" as const, delta: 10 }],
    };
    s.settings!.content.automatic_events = [event];
    const cash = s.cash;
    applyAutomaticEvents(s);
    expect(s.cash - cash).toBe(20);
    s.settings!.content.automatic_events = [];
    until(s, 8);
    s.settings!.content.automatic_events = [event];
    const next = s.cash;
    applyAutomaticEvents(s);
    expect(s.cash - next).toBe(10);
  });
  it("岐路に入る直前のゲームオーバー保存は、未到達の次ステージのルートを要求しない", () => {
    const s = startStage();
    until(s, 7);
    s.couple = 0;
    s.child.trust.A = 0;
    s.child.trust.B = 0;
    s.decisions!.crisis.separation = 1;
    advance(s);
    expect(s.n).toBe(8);
    expect(s.phase).toBe("game_over");
    expect(() => validateLifeState(s)).not.toThrow();
  });
  it("不正なステージ・ルート・効果参照・岐路の欠落を設定検査で拒否する", () => {
    for (const mutate of [
      (c: typeof defaultContent) => {
        c.life_game!.decisions[0].stages = [];
      },
      (c: typeof defaultContent) => {
        c.life_game!.decisions[0].options[0].routes = ["unknown"];
      },
      (c: typeof defaultContent) => {
        c.life_game!.crossroads![0].required_decisions.pop();
      },
      (c: typeof defaultContent) => {
        c.life_game!.decisions[0].options[0].requires = {
          history: [{ decision: "missing", option: "x", after: 0 }],
        };
      },
    ]) {
      const content = clone(defaultContent);
      mutate(content);
      expect(() => new Catalog(content, [])).toThrow();
    }
  });
  it.skip("3難易度の無操作でイージーは完走し、ノーマル・ハードは早期終了も再現できる", () => {
    for (const difficulty of ["easy", "normal", "hard"]) {
      const turns: number[] = [];
      for (let seed = 0; seed < 5; seed++) {
        const run = () => {
          const s = startDecisions("home-01", seed, new Catalog().resolve(difficulty));
          while (s.phase === "childhood") {
            satisfyStage(s);
            advance(s);
          }
          return s;
        };
        const s = run();
        turns.push(s.n);
        if (difficulty === "easy") {
          expect(s.phase).toBe("finished");
          expect(s.result!.parents.A.death_age).toBeGreaterThan(50);
        } else if (s.phase === "game_over") expect(s.game_over?.reason).toBe("bankruptcy");
        if (!seed) expect(run()).toEqual(s);
      }
      if (difficulty === "normal")
        expect(turns.filter((turn) => turn < 24).length).toBeGreaterThanOrEqual(3);
      if (difficulty === "hard") expect(turns.every((turn) => turn < 12)).toBe(true);
    }
  }, 30_000);
  it("即時確定を保存再開・再送・再生でき、改ざんした取得とルートを拒否する", async () => {
    const repo = new IndexedRepository(new GameDatabase(`stage-${crypto.randomUUID()}`));
    const service = new Service(repo);
    let r = await service.execute({
      command: "new",
      run: "stage",
      scenario: "home-01",
      seed: 3,
      difficulty: "easy",
      request_id: "new",
    });
    expect(r.public!.life!.crossroad!.missing).toEqual([]);
    expect(r.public!.forecast!.can_advance).toBe(true);
    const request = {
      command: "choose" as const,
      run: "stage",
      revision: r.revision!,
      request_id: "take",
      input: {
        event_instance: "t01:grandparents-visit-0-01",
        option_id: "grandparents-visit-0-01:take",
      },
    };
    r = await service.execute(request);
    expect(r.ok).toBe(true);
    expect((await service.execute(request)).payload!.receipt!.duplicate).toBe(true);
    const rejected = await service.execute({
      command: "reset-plan",
      run: "stage",
      revision: r.revision!,
      request_id: "cancel",
    });
    expect(rejected.ok).toBe(false);
    const contract = await service.execute({ command: "selections", run: "stage" });
    expect(contract.payload!.selections!.commands.some((c) => c.id === "reset-plan")).toBe(false);
    const saved = (await repo.read("stage"))!;
    expect(importRun(exportRun(saved))).toEqual(saved);
    expect(replayRun(saved)).toEqual(saved.state);
    expect((await new Service(repo).execute({ command: "observe", run: "stage" })).ok).toBe(true);
    for (const mutate of [
      (s: State) => {
        s.life!.history["grandparents-visit-0-01:take"].count = 2;
      },
      (s: State) => {
        s.life!.stage_routes!["0:school"] = "unknown";
      },
      (s: State) => {
        s.life!.stage_routes!["0:school"] = "private";
      },
      (s: State) => {
        s.life!.stage_routes!["1:school"] = "public";
      },
    ]) {
      const bad = clone(saved);
      mutate(bad.state);
      bad.digest = digest(bad.state);
      expect(() => validateRun(bad)).toThrow();
    }
    r = await service.execute({
      command: "advance",
      run: "stage",
      revision: r.revision!,
      request_id: "advance",
    });
    expect(r.ok).toBe(true);
    for (let n = 1; n < 8; n++) {
      r = await service.execute({
        command: "advance",
        run: "stage",
        revision: r.revision!,
        request_id: `advance-${n}`,
      });
      expect(r.ok).toBe(true);
    }
    expect(r.public!.life!.crossroad!.missing).toEqual([]);
    expect(r.public!.life!.crossroad!.changeable).toHaveLength(5);
    const inherited = (await repo.read("stage"))!;
    expect(importRun(exportRun(inherited))).toEqual(inherited);
    expect(replayRun(inherited)).toEqual(inherited.state);
    const acquisition = r.choices.find(
      (c) =>
        !c.route_choice &&
        c.menu === "education" &&
        c.options.some((o) => o.available && o.routes?.length === 1),
    );
    expect(acquisition).toBeDefined();
    const acquired = acquisition!.options.find((o) => o.available && o.routes?.length === 1)!;
    r = await service.execute({
      command: "choose",
      run: "stage",
      revision: r.revision!,
      request_id: "before-switch",
      input: { event_instance: acquisition!.instance_id, option_id: acquired.option_id },
    });
    expect(r.ok).toBe(true);
    r = await service.execute({
      command: "choose",
      run: "stage",
      revision: r.revision!,
      request_id: "switch",
      input: { event_instance: "t09:crossroad-school", option_id: "crossroad-school:private" },
    });
    expect(r.ok).toBe(true);
    expect(r.public!.life!.crossroad!.changeable).toHaveLength(4);
    const advanced = (await repo.read("stage"))!;
    expect(importRun(exportRun(advanced))).toEqual(advanced);
    expect(advanced.state.life!.history[acquired.option_id]).toBeDefined();
    expect(replayRun(advanced)).toEqual(advanced.state);
    repo.db.close();
  }, 20_000);
});
