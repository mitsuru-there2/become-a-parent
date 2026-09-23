import "fake-indexeddb/auto";
import { describe, expect, it } from "vite-plus/test";
import { Catalog, defaultContent } from "../src/content/catalog";
import { startDecisions, chooseDecision } from "../src/engine/decisions";
import { publicView } from "../src/engine/simulation";
import { clone } from "../src/engine/shared";
import { applyAutomaticEvents } from "../src/engine/automatic_events";
import type { AutomaticEvent } from "../src/content/automatic_event_schema";
import { Service, exportRun, importRun, replayRun } from "../src/service/service";
import { GameDatabase, IndexedRepository } from "../src/storage/indexeddb";

const catalog = () => {
  const content = clone(defaultContent);
  content.automatic_events = [];
  return new Catalog(content, []);
};

describe("現行ステージ制の難易度", () => {
  it("家庭背景、開始年齢、基本収支を難易度ごとに設定する", () => {
    const settings = catalog();
    for (const [id, cash, age, homeFunds, income, cost] of [
      ["easy", 800, 30, 800, 390, 210],
      ["normal", 200, 28, 100, 250, 270],
      ["hard", 150, 25, 30, 210, 230],
    ] as const) {
      const state = startDecisions("home-01", 0, settings.resolve(id));
      expect(state.cash).toBe(cash);
      expect(state.parents.A.age_months).toBe(age * 12);
      expect(state.parents.B.age_months).toBe(age * 12);
      expect(state.grandparents.funds).toBe(homeFunds);
      expect(publicView(state).public.forecast).toMatchObject({ income, cost });
    }
  });

  it("同じ判断の収入と不利な効果を難易度で変え、公開値と実際の入金を一致させる", () => {
    const settings = catalog();
    const results = (["easy", "normal", "hard"] as const).map((id) => {
      const state = startDecisions("home-01", 0, settings.resolve(id));
      const route = publicView(state).choices.find(
        (choice) => choice.event_id === "crossroad-work",
      )!;
      chooseDecision(
        state,
        route.instance_id,
        route.options.find((option) => option.route === "career")!.option_id,
      );
      const choice = publicView(state).choices.find(
        (item) => item.event_id === "work-career-0-06",
      )!;
      const income = choice.options[0].income;
      const before = state.cash;
      chooseDecision(state, choice.instance_id, choice.options[0].option_id);
      expect(state.cash - before).toBe(income);
      expect(state.history.at(-1)!.money[0].income).toBe(income);
      return { income, stress: state.parents.A.stress };
    });
    expect(results.map((result) => result.income)).toEqual([250, 150, 120]);
    expect(results[0].stress).toBeLessThan(results[1].stress);
    expect(results[1].stress).toBeLessThanOrEqual(results[2].stress);
  });

  it("仕事の無料休息はストレスの予兆後に開き、継続回復の費用を公開する", () => {
    const state = startDecisions("home-01", 0, catalog().resolve("normal"));
    const route = publicView(state).choices.find((choice) => choice.event_id === "crossroad-work")!;
    chooseDecision(
      state,
      route.instance_id,
      route.options.find((option) => option.route === "career")!.option_id,
    );
    const rest = () =>
      publicView(state).choices.find((choice) => choice.event_id === "work-career-0-07")!
        .options[0];
    expect(rest().available).toBe(false);
    expect(rest().reasons.some((reason) => reason.message.includes("40%"))).toBe(true);
    state.parents.A.stress = 40;
    expect(rest().available).toBe(true);
    const recovery = state.settings!.content.life_game!.decisions.find(
      (choice) => choice.id === "home-daily-0-04",
    )!.options[0];
    expect(recovery.cost).toBe(30);
    expect(recovery.stage_effect!.cost).toBe(25);
  });

  it("良い出来事を減らし、悪い出来事を増やす", () => {
    const settings = catalog();
    const events: AutomaticEvent[] = [
      {
        id: "difficulty-good",
        text: "うれしい出来事",
        kind: "good",
        min_age_months: 0,
        max_age_months: 234,
        probability: 50,
        conditions: [],
        modifiers: [],
        cooldown: 1,
        once: false,
        effects: [{ path: "cash", delta: 10 }],
      },
      {
        id: "difficulty-bad",
        text: "困った出来事",
        kind: "bad",
        min_age_months: 0,
        max_age_months: 234,
        probability: 50,
        conditions: [],
        modifiers: [],
        cooldown: 1,
        once: false,
        effects: [{ path: "cash", delta: -10 }],
      },
    ];
    const counts = (["easy", "normal", "hard"] as const).map((id) => {
      const found = { good: 0, bad: 0 };
      for (let seed = 0; seed < 40; seed++) {
        const state = startDecisions("home-01", seed, settings.resolve(id));
        state.settings!.content.automatic_events = events;
        const result = applyAutomaticEvents(state);
        for (const event of result?.event_results ?? []) found[event.kind]++;
      }
      return found;
    });
    expect(counts[0].good).toBeGreaterThan(counts[1].good);
    expect(counts[1].good).toBeGreaterThan(counts[2].good);
    expect(counts[0].bad).toBeLessThan(counts[1].bad);
    expect(counts[1].bad).toBeLessThan(counts[2].bad);
  }, 20_000);

  it("資金難を予告して終了し、履歴・保存・再生で一致する", async () => {
    const repo = new IndexedRepository(new GameDatabase(`difficulty-${crypto.randomUUID()}`));
    const service = new Service(repo);
    let response = await service.execute({
      command: "new",
      run: "shortage",
      scenario: "home-01",
      difficulty: "hard",
      seed: 0,
      request_id: "new",
    });
    expect(response.public!.life!.crossroad!.missing).toEqual([]);
    let warned = false;
    while (response.phase === "childhood") {
      if (response.public!.forecast!.projected_cash < 0) {
        warned = true;
        expect(response.public!.forecast!.can_advance).toBe(true);
        expect(response.public!.forecast!.reasons[0].message).toContain("ゲームオーバー");
      }
      response = await service.execute({
        command: "advance",
        run: "shortage",
        revision: response.revision!,
        request_id: `advance-${response.public!.time.completed_turns}`,
      });
      expect(response.ok).toBe(true);
    }
    expect(warned).toBe(true);
    expect(response.public!.game_over?.reason).toBe("bankruptcy");
    const saved = (await repo.read("shortage"))!;
    const money = saved.state.history.at(-1)!.money[0];
    expect(money.before + money.income - money.expense - money.cap_overflow).toBe(money.after);
    expect(replayRun(saved)).toEqual(saved.state);
    expect(importRun(exportRun(saved))).toEqual(saved);
    repo.db.close();
  }, 20_000);
});
