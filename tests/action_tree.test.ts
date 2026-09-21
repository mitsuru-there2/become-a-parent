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
import { Service, replayRun, exportRun, importRun, digest } from "../src/service/service";
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
    advance(s);
    s.n = 11;
    choose(s, "school-switch", "private");
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
    expect(s.life!.policies["tree-secondary"]).toBe("advanced");
    expect(activeTreeEffects(s).some((e) => e.source.includes("小学校の進路 / 私立"))).toBe(false);
    expect(publicView(s).public.life!.policies.some((p) => p.id === "tree-primary")).toBe(false);
  });
  it("学校の4ルートを園から高校まで公開し、転換準備の翌期だけ別ルートを選べる", () => {
    const s = start(48);
    const school = s.settings!.content.life_game!.decisions;
    const stages = school.filter(
      (node) =>
        node.route_group === "school" &&
        node.kind === "policy" &&
        node.options.some((item) => item.route),
    );
    expect(stages.map((node) => node.route_stage)).toEqual([0, 1, 2, 3]);
    expect(
      choices(start()).find((choice) => choice.event_id === "base-school")?.current_option,
    ).toBeUndefined();
    for (const stage of stages)
      expect(stage.options.map((item) => item.route).sort((a, b) => a!.localeCompare(b!))).toEqual([
        "home",
        "international",
        "private",
        "public",
      ]);
    advance(s);
    expect(option(s, "base-school", "home").available).toBe(false);
    expect(option(s, "school-switch", "home").available).toBe(true);
    choose(s, "school-switch", "home");
    expect(publicView(s).public.forecast!.cash_flow?.some((line) => line.cost === 80)).toBe(true);
    choose(s, "school-switch", "cancel");
    expect(publicView(s).public.forecast!.cash_flow?.some((line) => line.cost === 80)).toBe(false);
    expect(s.life!.history["school-switch:home"]).toBeUndefined();
    choose(s, "school-switch", "home");
    advance(s);
    expect(s.life!.history["school-switch:home"]?.last_turn).toBe(s.n);
    expect(option(s, "base-school", "home").available).toBe(true);
    choose(s, "base-school", "home");
    advance(s);
    expect(s.life!.policies["base-school"]).toBe("home");
    expect(option(s, "base-school", "enrolled").available).toBe(false);
    s.n = 12;
    openLife(s);
    expect(s.life!.policies["tree-primary"]).toBe("home");
    expect(publicView(s).public.life!.route_groups?.[0].current).toBe("home");
    advance(s);
    s.n = 24;
    openLife(s);
    expect(s.life!.policies["tree-secondary"]).toBe("home");
    advance(s);
    s.n = 30;
    openLife(s);
    expect(s.life!.policies["tree-high"]).toBe("home");
    advance(s);
    s.n = 36;
    openLife(s);
    expect(option(s, "school-future-home", "plan").available).toBe(true);
  });
  it("教育の全アクションは年代と表示レーンを持ち、共通領域へ落ちない", () => {
    const game = defaultContent.life_game!;
    const group = game.route_groups!.find((item) => item.id === "school")!;
    expect(group.stage_labels).toHaveLength(5);
    const nodes = game.decisions.filter(
      (node) => node.route_group === "school" && node.id !== group.switch_decision,
    );
    expect(nodes.length).toBeGreaterThan(0);
    for (const node of nodes) {
      expect(node.route_stage).toBeTypeOf("number");
      for (const item of node.options)
        expect(item.route ?? item.tree_route ?? node.route ?? node.tree_route).toBeTruthy();
    }
  });
  it("同じ学校ルートへの進級は開始費なしで引き継ぎ、継続条件を失えば無料経路へ戻る", () => {
    const s = start(48);
    s.life!.history["base-school-visit:visit"] = { first_turn: 5, last_turn: 5, count: 1 };
    choose(s, "base-school", "enrolled");
    advance(s);
    s.n = 12;
    const primary = s.settings!.content.life_game!.decisions.find(
      (node) => node.id === "tree-primary",
    )!;
    primary.options.find((item) => item.id === "private")!.requires!.annual_income = 560;
    s.child.ability.study = 50;
    s.cash = 500;
    openLife(s);
    expect(s.life!.policies["tree-primary"]).toBe("private");
    expect(
      publicView(s).public.forecast!.cash_flow?.some(
        (line) => line.label.includes("開始費") && line.cost === 24,
      ),
    ).toBe(false);
    s.n = 24;
    s.child.ability.study = 0;
    openLife(s);
    expect(s.life!.policies["tree-secondary"]).toBe("public");
    expect(s.life!.notices.join()).toContain("継続条件");
    expect(
      publicView(s).public.forecast!.cash_flow?.some((line) => line.label.includes("切替")),
    ).toBe(false);
  });
  it("切替準備は資金不足なら取れず、実行後に進路を選ばなければ翌々期に失効する", () => {
    const s = start(48);
    advance(s);
    s.cash = 79;
    expect(option(s, "school-switch", "home").available).toBe(false);
    s.cash = 80;
    expect(option(s, "school-switch", "home").available).toBe(true);
    choose(s, "school-switch", "home");
    advance(s);
    expect(option(s, "base-school", "home").available).toBe(true);
    advance(s);
    expect(option(s, "base-school", "home").available).toBe(false);
    expect(s.life!.policies["base-school"]).toBe("standard");
  });
  it("全5分類に大方針があり、別枝への移行は前期の準備を要する", () => {
    const s = start();
    const groups = publicView(s).public.life!.route_groups!;
    expect(groups.map((group) => group.id)).toEqual([
      "school",
      "home",
      "grandparents",
      "afterschool",
      "work",
    ]);
    expect(groups.filter((group) => group.layout === "branches")).toHaveLength(4);
    expect(option(s, "story-keepsake", "capsule").available).toBe(false);
    choose(s, "route-home", "memory");
    expect(option(s, "story-keepsake", "capsule").available).toBe(true);
    advance(s);
    expect(
      publicView(s).public.life!.route_groups?.find((group) => group.id === "home")?.current,
    ).toBe("memory");
    s.n = 10;
    openLife(s);
    expect(option(s, "story-camp", "forest").available).toBe(false);
    expect(option(s, "route-home", "adventure").available).toBe(false);
    expect(option(s, "route-home-switch", "adventure").available).toBe(true);
    choose(s, "route-home-switch", "adventure");
    expect(publicView(s).public.forecast!.cash_flow?.some((line) => line.cost === 70)).toBe(true);
    advance(s);
    expect(option(s, "route-home", "adventure").available).toBe(true);
    choose(s, "route-home", "adventure");
    expect(option(s, "story-camp", "forest").available).toBe(true);
    advance(s);
    expect(option(s, "base-help-trial", "trial").available).toBe(false);
  });
  it("学校だけのrules-10設定は新しい分類ルートなしで保存・再開できる", () => {
    const content = clone(defaultContent);
    content.automatic_events = [];
    const game = content.life_game!;
    game.route_groups = game.route_groups!.filter((group) => group.id === "school");
    game.decisions = game.decisions.filter((node) => !node.id.startsWith("route-"));
    for (const node of game.decisions.filter((item) => item.menu !== "education")) {
      delete node.route_group;
      delete node.route_stage;
      delete node.route;
    }
    const s = startDecisions("home-01", 2, new Catalog(content, []).resolve());
    expect(s.versions).toEqual({ rules: "rules-10", data: "data-10", save: "save-11" });
    advance(s);
    const run = {
      id: "school-only",
      revision: 0,
      state: s,
      digest: digest(s),
      commits: [],
      receipts: {},
      updated_at: "2026-09-21T00:00:00.000Z",
    };
    expect(importRun(exportRun(run)).state.versions.rules).toBe("rules-10");
  });
  it("遊びの大方針を転換すると旧ルート専用の継続方針が終了する", () => {
    const s = start(48);
    choose(s, "route-afterschool", "music");
    choose(s, "story-music-trial", "try");
    advance(s);
    choose(s, "story-music", "stage");
    advance(s);
    expect(s.life!.policies["story-music"]).toBe("stage");
    s.cash = 500;
    choose(s, "route-afterschool-switch", "sports");
    advance(s);
    choose(s, "route-afterschool", "sports");
    advance(s);
    expect(s.life!.policies["story-music"]).toBe("standard");
    expect(option(s, "story-music", "stage").available).toBe(false);
  });
  it("学校ルート導入前のrules-9設定は従来の選択と保存形式を維持する", () => {
    const content = clone(defaultContent);
    content.automatic_events = [];
    const game = content.life_game!;
    delete game.route_groups;
    game.decisions = game.decisions.filter(
      (node) =>
        !node.id.startsWith("route-") &&
        (node.route_group !== "school" ||
          node.tree_route ||
          node.options.some((item) => item.tree_route) ||
          ["base-school", "tree-primary", "tree-secondary"].includes(node.id)),
    );
    for (const node of game.decisions) {
      delete node.route_group;
      delete node.route_stage;
      delete node.route;
      delete node.tree_route;
      for (const item of node.options) {
        delete item.route;
        delete item.tree_route;
        delete item.switch_to;
      }
    }
    game.decisions
      .find((node) => node.id === "tree-primary")!
      .options.find((item) => item.id === "private")!.requires!.annual_income = 560;
    const s = startDecisions("home-01", 2, new Catalog(content, []).resolve());
    expect(s.versions).toEqual({ rules: "rules-9", data: "data-9", save: "save-10" });
    expect(s.life!.route_stage_resolved).toBeUndefined();
    for (let turn = 0; turn < 12; turn++) advance(s);
    s.child.ability.study = 20;
    s.cash = 200;
    s.life!.history["base-school-visit:visit"] = { first_turn: 5, last_turn: 5, count: 1 };
    expect(option(s, "tree-primary", "private").available).toBe(true);
    const run = {
      id: "legacy-tree",
      revision: 0,
      state: s,
      digest: digest(s),
      commits: [],
      receipts: {},
      updated_at: "2026-09-21T00:00:00.000Z",
    };
    expect(importRun(exportRun(run)).state.versions.rules).toBe("rules-9");
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
        expect(s.versions.rules).toBe("rules-11");
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
