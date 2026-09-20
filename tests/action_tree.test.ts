import "fake-indexeddb/auto";
import { describe, expect, it } from "vite-plus/test";
import { Catalog, defaultContent } from "../src/content/catalog";
import { clone } from "../src/engine/shared";
import { startDecisions, chooseDecision, openDecisionTurn } from "../src/engine/decisions";
import { advance, publicView } from "../src/engine/simulation";
import { openLife } from "../src/engine/life";
import { activeTreeEffects, modifiedDelta } from "../src/engine/tree_effects";
import { applyAutomaticEvents } from "../src/engine/automatic_events";
import { annualIncome } from "../src/engine/life_requirements";
import { Service, replayRun, exportRun, importRun } from "../src/service/service";
import { GameDatabase, IndexedRepository } from "../src/storage/indexeddb";
import type { State } from "../src/engine/types";
const start = (age = 0) => {
  const content = clone(defaultContent);
  content.automatic_events = [];
  const s = startDecisions("home-01", 2, new Catalog(content, []).resolve());
  s.n = age / 6;
  openLife(s);
  return s;
};
const choices = (s: State) => publicView(s).choices;
const option = (s: State, id: string, value: string) =>
  choices(s)
    .find((c) => c.event_id === id)!
    .options.find((o) => o.option_id === `${id}:${value}`)!;
const choose = (s: State, id: string, value: string) =>
  chooseDecision(s, choices(s).find((c) => c.event_id === id)!.instance_id, `${id}:${value}`);

describe("S-018 アクションツリー", () => {
  it("資金予測の内訳は、予定を追加した後も収入・支出の合計と一致する", () => {
    const s = start();
    const incomeChoice = choices(s)
      .flatMap((choice) => choice.options.map((option) => ({ choice, option })))
      .find(({ option }) => option.available && option.income > 0)!;
    chooseDecision(s, incomeChoice.choice.instance_id, incomeChoice.option.option_id);
    const forecast = publicView(s).public.forecast!;
    expect(forecast.cash_flow?.reduce((sum, line) => sum + (line.income ?? 0), 0)).toBe(
      forecast.income,
    );
    expect(forecast.cash_flow?.reduce((sum, line) => sum + (line.cost ?? 0), 0)).toBe(
      forecast.cost,
    );
    expect(forecast.cash_flow?.some((line) => line.income === incomeChoice.option.income)).toBe(
      true,
    );
    expect(forecast.projected_cash).toBe(s.cash + forecast.income - forecast.cost);
  });
  it("各実行案へ画像を設定でき、未設定時は共通の仮画像を公開する", () => {
    const s = start();
    const action = option(s, "base-extra-work", "accept");
    expect(action.visual).toEqual(s.settings!.content.visuals.hero);
    const content = clone(defaultContent);
    content.visuals.custom = { src: "/assets/test/custom.webp", alt: "個別のアクション画像" };
    content.life_game!.decisions.find((d) => d.id === "base-extra-work")!.options[0].visual =
      "custom";
    const custom = startDecisions("home-01", 2, new Catalog(content, []).resolve());
    expect(option(custom, "base-extra-work", "accept").visual).toEqual(content.visuals.custom);
    content.life_game!.decisions.find((d) => d.id === "base-extra-work")!.options[0].visual =
      "missing";
    expect(() => new Catalog(content, []).resolve()).toThrow("base-extra-work.accept.visual");
  });
  it("全ノードを公開し、未取得と同一期の連続取得を拒否。取消では履歴・効果を残さない", () => {
    const s = start(48);
    expect(choices(s)).toHaveLength(s.settings!.content.life_game!.decisions.length);
    expect(option(s, "base-craft", "enrolled").available).toBe(false);
    expect(option(s, "tree-university", "challenge").requirements!.join()).toContain("成績");
    expect(() => choose(s, "base-craft", "enrolled")).toThrow();
    choose(s, "base-craft-trial", "try");
    expect(option(s, "base-craft", "enrolled").available).toBe(false);
    expect(activeTreeEffects(s)).toEqual([]);
    choose(s, "base-craft-trial", "cancel");
    advance(s);
    expect(activeTreeEffects(s)).toEqual([]);
    choose(s, "base-craft-trial", "try");
    advance(s);
    expect(option(s, "base-craft", "enrolled").available).toBe(true);
    expect(option(s, "base-craft-trial", "try").acquired).toBe(true);
    expect(option(s, "base-craft-trial", "try").available).toBe(false);
    const effects = activeTreeEffects(s);
    choose(s, "base-craft", "enrolled");
    advance(s);
    expect(activeTreeEffects(s).length).toBeGreaterThan(effects.length);
    choose(s, "base-craft", "standard");
    advance(s);
    expect(activeTreeEffects(s)).toEqual(effects);
  });
  it("年収・成績・親能力・資金の境界は共通の取得判定で扱う", () => {
    const s = start(72);
    s.life!.history["base-school-visit:visit"] = { first_turn: 5, last_turn: 5, count: 1 };
    const school = s.settings!.content.life_game!.decisions.find((d) => d.id === "tree-primary")!;
    const requirements = school.options.find((o) => o.id === "private")!.requires!;
    requirements.annual_income = annualIncome(s) + 1;
    s.child.ability.study = 20;
    expect(option(s, school.id, "private").available).toBe(false);
    requirements.annual_income = annualIncome(s);
    s.child.ability.study = 19;
    expect(option(s, school.id, "private").available).toBe(false);
    s.child.ability.study = 20;
    s.cash = 71;
    expect(option(s, school.id, "private").available).toBe(false);
    s.cash = 72;
    expect(option(s, school.id, "private").available).toBe(true);
    const international = school.options.find((o) => o.id === "international")!;
    international.requires!.annual_income = annualIncome(s);
    s.cash = 108;
    s.decisions!.skills.B.dialogue = 4;
    expect(option(s, school.id, "international").available).toBe(false);
    s.decisions!.skills.B.dialogue = 5;
    expect(option(s, school.id, "international").available).toBe(true);
    choose(s, "base-work", "reduced");
    expect(annualIncome(s)).toBe(560);
    advance(s);
    expect(annualIncome(s)).toBe(500);
  });
  it("4歳の保育所・6歳の公立を既定とし、卒業後は費用・効果を終了", () => {
    const s = start(42);
    expect(publicView(s).public.life!.policies.some((p) => p.id === "base-school")).toBe(false);
    advance(s);
    expect(publicView(s).public.life!.policies.find((p) => p.id === "base-school")!.label).toBe(
      "保育所に通う",
    );
    s.n = 11;
    advance(s);
    expect(publicView(s).public.life!.policies.find((p) => p.id === "tree-primary")!.label).toBe(
      "公立小学校",
    );
    s.life!.history["base-school-visit:visit"] = { first_turn: 5, last_turn: 5, count: 1 };
    s.settings!.content.life_game!.decisions.find(
      (d) => d.id === "tree-primary",
    )!.options[1].requires!.annual_income = 560;
    s.child.ability.study = 50;
    choose(s, "tree-primary", "private");
    advance(s);
    expect(s.life!.policies["tree-primary"]).toBe("private");
    expect(activeTreeEffects(s).some((e) => e.source.includes("私立"))).toBe(true);
    s.n = 24;
    openLife(s);
    expect(s.life!.policies["tree-primary"]).toBe("public");
    expect(activeTreeEffects(s).some((e) => e.source.includes("私立"))).toBe(false);
    expect(publicView(s).public.life!.policies.some((p) => p.id === "tree-primary")).toBe(false);
  });
  it("取得補正を善悪別に適用し、援助は実家の有限資金から正確に移転する", () => {
    const s = start();
    choose(s, "base-extra-work", "accept");
    advance(s);
    const baseEvent = {
      id: "test",
      text: "確認",
      kind: "good" as const,
      min_age_months: 0,
      max_age_months: 234,
      probability: 100,
      conditions: [],
      modifiers: [],
      cooldown: 1,
      once: false,
    };
    s.settings!.content.automatic_events = [
      { ...baseEvent, effects: [{ path: "cash", delta: 100 }] },
    ];
    const before = s.cash;
    const result = applyAutomaticEvents(s)!;
    expect(s.cash - before).toBe(110);
    expect(result.event_results![0].changes.join()).toContain("取得効果");
    s.settings!.content.automatic_events = [
      { ...baseEvent, id: "bad", kind: "bad", effects: [{ path: "cash", delta: -100 }] },
    ];
    const nextCash = s.cash;
    applyAutomaticEvents(s);
    expect(nextCash - s.cash).toBe(110);
    const gift = clone(defaultContent.automatic_events!.find((e) => e.id === "family-home-gift")!);
    gift.probability = 100;
    gift.cooldown = 1;
    s.settings!.content.automatic_events = [gift];
    const cash = s.cash;
    for (let i = 0; i < 3; i++) {
      s.n++;
      openDecisionTurn(s);
    }
    expect(s.cash - cash).toBe(100);
    expect(s.grandparents.funds).toBe(0);
    expect(s.grandparents.members).toBeUndefined();
    expect(modifiedDelta(-1, 20)).toBe(-2);
    expect(modifiedDelta(-1, -20)).toBe(-0);
    const deeper = s.settings!.content.life_game!.decisions.find((d) => d.id === "tree-university")!
      .options[0].event_modifiers!;
    expect(deeper[0].percent).toBeGreaterThan(activeTreeEffects(s)[0].percent);
  });
  it("補正は重複取得せず、上限・下限とパラメータの上下限に収まる", () => {
    const s = start();
    const nodes = s.settings!.content.life_game!.decisions;
    const node = nodes.find((d) => d.id === "base-extra-work")!;
    node.options[0].event_modifiers = [{ label: "強い成果", kind: "good", percent: 200 }];
    const other = nodes.find((d) => d.id === "base-extra-work-mother")!;
    other.options[0].event_modifiers = [{ label: "強い成果", kind: "good", percent: 200 }];
    choose(s, node.id, "accept");
    choose(s, other.id, "accept");
    advance(s);
    choose(s, node.id, "accept");
    advance(s);
    expect(activeTreeEffects(s)).toHaveLength(2);
    const event = {
      id: "cap",
      text: "確認",
      kind: "good" as const,
      min_age_months: 0,
      max_age_months: 234,
      probability: 100,
      conditions: [],
      modifiers: [],
      cooldown: 1,
      once: false,
      effects: [
        { path: "cash" as const, delta: 100 },
        { path: "parents.A.health" as const, delta: 10 },
      ],
    };
    s.settings!.content.automatic_events = [event];
    const cash = s.cash;
    applyAutomaticEvents(s);
    expect(s.cash - cash).toBe(300);
    expect(s.parents.A.health).toBe(10);
    node.options[0].event_modifiers[0].percent = -80;
    other.options[0].event_modifiers[0].percent = -80;
    event.id = "floor";
    const nextCash = s.cash;
    applyAutomaticEvents(s);
    expect(s.cash - nextCash).toBe(20);
  });
  it("新規ゲームは3難易度・複数シードで40期と成人後を完走する", () => {
    for (const difficulty of ["easy", "normal", "hard"])
      for (let seed = 0; seed < 3; seed++) {
        const s = startDecisions("home-01", seed, new Catalog().resolve(difficulty));
        expect(s.versions.rules).toBe("rules-9");
        while (s.phase === "childhood") advance(s);
        expect(s.n).toBe(40);
        expect(s.phase).toBe("finished");
        expect(s.result!.parents.A.death_age).toBeGreaterThan(50);
      }
  });
  it("予定・取得の保存再開、再送、操作再生が一致する", async () => {
    const repo = new IndexedRepository(new GameDatabase(`tree-${crypto.randomUUID()}`));
    const service = new Service(repo);
    let r = await service.execute({
      command: "new",
      run: "tree",
      scenario: "home-01",
      seed: 3,
      request_id: "new",
    });
    const choice = r.choices.find((c) => c.event_id === "base-extra-work")!;
    const request = {
      command: "choose" as const,
      run: "tree",
      revision: r.revision!,
      request_id: "choose",
      input: { event_instance: choice.instance_id, option_id: "base-extra-work:accept" },
    };
    r = await service.execute(request);
    expect(r.ok).toBe(true);
    expect((await service.execute(request)).payload!.receipt!.duplicate).toBe(true);
    const planned = (await repo.read("tree"))!;
    expect(importRun(exportRun(planned))).toEqual(planned);
    r = await service.execute({
      command: "advance",
      run: "tree",
      revision: r.revision!,
      request_id: "advance",
    });
    expect(r.ok).toBe(true);
    const saved = (await repo.read("tree"))!;
    expect(importRun(exportRun(saved))).toEqual(saved);
    expect(replayRun(saved)).toEqual(saved.state);
    repo.db.close();
  });
});
