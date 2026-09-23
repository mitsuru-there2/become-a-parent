import "fake-indexeddb/auto";
import oldLife from "./fixtures/life-data-8.json";
import oldEvents from "./fixtures/life-events-8.json";
import { describe, expect, it } from "vite-plus/test";
import { Catalog, defaultContent } from "../src/content/catalog";
import currentPacks from "../src/content/packs.gen";
import oldPackDecisions from "./fixtures/life-pack-decisions-8.json";
const directoryPacks = currentPacks.map((pack) => ({ ...pack, decisions: oldPackDecisions }));
import type { ContentPack } from "../src/content/types";
import { clone } from "../src/engine/shared";
import { startDecisions, chooseDecision } from "../src/engine/decisions";
import { advance, publicView, stage } from "../src/engine/simulation";
import { openLife } from "../src/engine/life";
import {
  Service,
  replayRun,
  exportRun,
  importRun,
  validateRun,
  digest,
  type Request,
} from "../src/service/service";
import { GameDatabase, IndexedRepository } from "../src/storage/indexeddb";
import type { State } from "../src/engine/types";

const content = () => ({
  ...clone(defaultContent),
  life_game: clone(oldLife) as typeof defaultContent.life_game,
  automatic_events: [],
});
const start = (age = 0) => {
  const s = startDecisions("home-01", 0, new Catalog(content(), []).resolve());
  s.n = age / 6;
  openLife(s);
  return s;
};
const choices = (s: State) => publicView(s).choices;
const choose = (s: State, id: string, option: string) => {
  const c = choices(s).find((c) => c.event_id === id)!;
  chooseDecision(s, c.instance_id, `${id}:${option}`);
};

describe("S-017 生活メニューと分岐", () => {
  it.skip("標準生活のまま40期・成人後・父母の最期へ進める", () => {
    for (const difficulty of ["easy", "normal", "hard"]) {
      for (let seed = 0; seed < 3; seed++) {
        const s = startDecisions(
          "home-01",
          seed,
          new Catalog({ ...content(), automatic_events: oldEvents }, []).resolve(difficulty),
        );
        expect(s.versions.rules).toBe("rules-8");
        while (s.phase === "childhood") {
          expect(publicView(s).public.forecast!.can_advance).toBe(true);
          advance(s);
        }
        expect(s.n).toBe(40);
        expect(s.phase).toBe("finished");
        expect(s.result?.parents.A.death_age).toBeGreaterThan(50);
        expect(s.result?.parents.B.death_age).toBeGreaterThan(50);
      }
    }
  });
  it("予定や取消では分岐せず、確定の次期に入会が現れる。休会・再開・退会で費用と候補が変わる", () => {
    const s = start(48);
    expect(choices(s).some((c) => c.event_id === "base-craft")).toBe(false);
    const cash = s.cash;
    choose(s, "base-craft-trial", "try");
    expect(s.cash).toBe(cash);
    expect(choices(s).some((c) => c.event_id === "base-craft")).toBe(false);
    choose(s, "base-craft-trial", "cancel");
    advance(s);
    expect(choices(s).some((c) => c.event_id === "base-craft")).toBe(false);
    choose(s, "base-craft-trial", "try");
    advance(s);
    expect(choices(s).find((c) => c.event_id === "base-craft")?.fresh).toBe(true);
    expect(choices(s).some((c) => c.event_id === "base-craft-trial")).toBe(false);
    const cost = publicView(s).public.forecast!.cost;
    choose(s, "base-craft", "enrolled");
    expect(publicView(s).public.forecast!.cost).toBe(cost + 28);
    advance(s);
    expect(s.life!.policies["base-craft"]).toBe("enrolled");
    expect(publicView(s).public.forecast!.cost).toBe(cost + 24);
    expect(s.decisions!.selections).toEqual({});
    advance(s);
    expect(choices(s).some((c) => c.event_id === "base-craft-show")).toBe(true);
    choose(s, "base-craft", "paused");
    advance(s);
    expect(choices(s).some((c) => c.event_id === "base-craft-show")).toBe(false);
    expect(publicView(s).public.forecast!.cost).toBe(
      s.settings!.content.difficulties.normal.living_cost + stage(s.n, s).cost,
    );
    choose(s, "base-craft", "enrolled");
    advance(s);
    expect(s.life!.policies["base-craft"]).toBe("enrolled");
    choose(s, "base-craft", "standard");
    advance(s);
    expect(s.life!.history["base-craft-trial:try"]).toBeDefined();
    expect(s.life!.policies["base-craft"]).toBe("standard");
  });
  it("5分類で後続メニューが変わり、実家の支援が仕事の分岐につながる", () => {
    const s = start(48);
    choose(s, "base-school-visit", "visit");
    choose(s, "base-help-trial", "trial");
    advance(s);
    expect(choices(s).some((c) => c.event_id === "base-help")).toBe(true);
    expect(
      choices(s)
        .find((c) => c.event_id === "base-school")
        ?.options.some((o) => o.option_id.endsWith(":enrolled")),
    ).toBe(true);
    choose(s, "base-school", "enrolled");
    choose(s, "base-grand-consult", "talk");
    choose(s, "base-work-consult", "talk");
    advance(s);
    expect(choices(s).some((c) => c.event_id === "base-school-meeting")).toBe(true);
    expect(choices(s).some((c) => c.event_id === "base-grand-care")).toBe(true);
    expect(
      choices(s)
        .find((c) => c.event_id === "base-work")
        ?.options.some((o) => o.option_id.endsWith(":heavy")),
    ).toBe(false);
    choose(s, "base-grand-care", "supported");
    advance(s);
    expect(
      choices(s)
        .find((c) => c.event_id === "base-work")
        ?.options.some((o) => o.option_id.endsWith(":heavy")),
    ).toBe(true);
    choose(s, "base-work", "heavy");
    advance(s);
    choose(s, "base-grand-care", "standard");
    expect(publicView(s).public.life!.notices.join()).toContain("父の働き方");
    advance(s);
    expect(s.life!.policies["base-work"]).toBe("standard");
  });
  it("支援者の体力低下と年代境界で契約を終了し、費用を残さない", () => {
    const s = start(48);
    choose(s, "base-grand-consult", "talk");
    advance(s);
    choose(s, "base-grand-care", "supported");
    advance(s);
    s.grandparents.members!.grandfather.health = 3;
    openLife(s);
    expect(s.life!.policies["base-grand-care"]).toBe("standard");
    expect(publicView(s).public.life!.notices.length).toBeGreaterThan(0);
    choose(s, "base-school-visit", "visit");
    advance(s);
    choose(s, "base-school", "enrolled");
    advance(s);
    s.n = 12;
    openLife(s);
    expect(s.life!.policies["base-school"]).toBe("standard");
    expect(choices(s).some((c) => c.event_id === "base-school")).toBe(false);
  });
  it("行動枠超過・合計資金不足を確定前に拒否し、取消で回復できる", () => {
    const s = start(48);
    for (const [id, o] of [
      ["base-craft-trial", "try"],
      ["base-school-visit", "visit"],
      ["base-help-trial", "trial"],
    ])
      choose(s, id, o);
    const before = clone(s);
    expect(() => advance(s)).toThrow();
    expect(s).toEqual(before);
    choose(s, "base-school-visit", "cancel");
    expect(publicView(s).public.forecast!.can_advance).toBe(true);
    const node = s.settings!.content.life_game!.decisions.find((d) => d.id === "base-help-trial")!;
    node.options[0].cost = 99999;
    expect(publicView(s).public.forecast!.can_advance).toBe(false);
    choose(s, "base-help-trial", "cancel");
    expect(publicView(s).public.forecast!.can_advance).toBe(true);
  });
  it("能力と疲れが成果に反映され、回復方針と途中終了も機能する", () => {
    const low = start(72);
    const high = clone(low);
    low.decisions!.skills.A.learning = 0;
    high.decisions!.skills.A.learning = 10;
    choose(low, "base-learning", "together");
    choose(high, "base-learning", "together");
    advance(low);
    advance(high);
    expect(high.child.ability.study).toBeGreaterThan(low.child.ability.study);
    const s = start();
    s.couple = 0;
    s.child.trust = { A: 0, B: 0 };
    advance(s);
    advance(s);
    expect(s.phase).toBe("game_over");
    expect(s.n).toBe(2);
    expect(s.game_over!.turn).toBe(2);
    const repair = start();
    repair.couple = 1;
    repair.child.trust = { A: 16, B: 16 };
    choose(repair, "base-home", "talk");
    advance(repair);
    advance(repair);
    expect(repair.phase).toBe("childhood");
    expect(repair.couple).toBeGreaterThan(1);
  });
});

describe("S-017 DLC・検査・保存", () => {
  it("未選択では出ず、DLCの判断からイベントへ接続する", () => {
    const pack = clone(directoryPacks[0]) as ContentPack;
    pack.automatic_events![0].probability = 100;
    const c = new Catalog(content(), [pack]);
    expect(
      c.resolve().content.life_game!.decisions.some((d) => d.id === "community-life-workshop"),
    ).toBe(false);
    const s = startDecisions("home-01", 0, c.resolve("normal", [pack.id]));
    s.n = 8;
    openLife(s);
    expect(choices(s).some((d) => d.event_id === "community-life-workshop")).toBe(false);
    choose(s, "base-craft-trial", "try");
    advance(s);
    expect(choices(s).some((d) => d.event_id === "community-life-workshop")).toBe(true);
    choose(s, "community-life-workshop", "join");
    advance(s);
    expect(
      s.decisions!.event_history?.events.some((e) => e.event_id === "community-life-exhibition"),
    ).toBe(true);
  });
  it("ID衝突、参照漏れ、循環、依存不足を拒否し、宣言した他パックへの依存は許す", () => {
    const base = content();
    const pack = clone(directoryPacks[0]) as ContentPack;
    const collision = clone(pack);
    collision.decisions![0].id = "base-craft-trial";
    expect(() => new Catalog(base, [collision])).toThrow(/衝突/);
    const missing = clone(pack);
    missing.decisions![0].requires!.history![0].decision = "missing";
    expect(() => new Catalog(base, [missing])).toThrow(/reference/);
    const cycle = clone(pack);
    cycle.decisions![0].requires!.history = [
      { decision: cycle.decisions![0].id, option: "join", after: 0 },
    ];
    expect(() => new Catalog(base, [cycle])).toThrow(/unreachable/);
    const dependent = clone(pack);
    dependent.id = "second";
    dependent.automatic_events = [];
    dependent.decisions![0].id = "second-activity";
    dependent.decisions![0].requires!.history = [
      { decision: "community-life-workshop", option: "join", after: 0 },
    ];
    expect(() => new Catalog(base, [pack, dependent])).toThrow();
    dependent.dependencies = [pack.id];
    const c = new Catalog(base, [dependent, pack]);
    expect(() => c.resolve("normal", [dependent.id])).toThrow(/依存/);
    expect(c.resolve("normal", [dependent.id, pack.id])).toEqual(
      c.resolve("normal", [pack.id, dependent.id]),
    );
    const bad = content();
    bad.life_game!.decisions[0].options[0].cost = 1;
    expect(() => new Catalog(bad, [])).toThrow(/default_option/);
    const poor = content();
    poor.life_game!.income = 0;
    expect(() => new Catalog(poor, [])).toThrow(/life_game.income/);
  });
  it.skip("操作の再送・予定の再開・全取消・DLC削除後の再生・40期の書き出しが一致する", async () => {
    const repo = new IndexedRepository(new GameDatabase(`life-${crypto.randomUUID()}`));
    const service = new Service(
      repo,
      new Catalog({ ...content(), automatic_events: oldEvents }, directoryPacks),
    );
    let r = await service.execute({
      command: "new",
      run: "life",
      scenario: "home-01",
      seed: 2,
      packs: ["community-life"],
      request_id: "new",
    });
    expect(r.ok).toBe(true);
    let sequence = 0;
    const call = async (command: Request["command"], input?: unknown) => {
      const request: Request = {
        command,
        run: "life",
        revision: r.revision!,
        request_id: `r${sequence++}`,
        ...(input ? { input } : {}),
      };
      r = await service.execute(request);
      expect(r.ok, JSON.stringify(r.error)).toBe(true);
      return request;
    };
    const c = r.choices.find((c) => c.event_id === "base-home")!;
    const request = await call("choose", {
      event_instance: c.instance_id,
      option_id: "base-home:talk",
    });
    const saved = (await repo.read("life"))!;
    expect(importRun(exportRun(saved))).toEqual(saved);
    const corrupt = clone(saved);
    corrupt.state.life!.policies["base-home"] = "missing";
    corrupt.digest = digest(corrupt.state);
    expect(() => validateRun(corrupt)).toThrow(/設定が不正/);
    expect((await service.execute(request)).payload!.receipt!.duplicate).toBe(true);
    await call("reset-plan");
    expect(r.public!.answers).toEqual([]);
    for (let t = 0; t < 40; t++) await call("advance");
    expect(r.phase).toBe("finished");
    const finished = (await repo.read("life"))!;
    expect(replayRun(finished)).toEqual(finished.state);
    expect(importRun(exportRun(finished))).toEqual(finished);
    expect(
      (
        await new Service(repo, new Catalog(content(), [])).execute({
          command: "replay",
          run: "life",
        })
      ).payload!.matched,
    ).toBe(true);
    repo.db.close();
  }, 30000);
});
