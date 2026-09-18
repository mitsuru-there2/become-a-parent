import "fake-indexeddb/auto";
import { describe, expect, it } from "vite-plus/test";
import base from "./fixtures/legacy_content";
import events from "./fixtures/life-events-8.json";
import { Catalog } from "../src/content/catalog";
import type { AutomaticEvent } from "../src/content/automatic_event_schema";
import { startDecisions, openDecisionTurn } from "../src/engine/decisions";
import { publicView } from "../src/engine/simulation";
import { GRANDPARENTS, applyGrandparentDelta, syncGrandparents } from "../src/engine/grandparents";
import { legacyEquivalent, scaleParents } from "../src/engine/stat_scale";
import { clone } from "../src/engine/shared";
import {
  Service,
  replayRun,
  exportRun,
  importRun,
  digest,
  validateRun,
} from "../src/service/service";
import { GameDatabase, IndexedRepository } from "../src/storage/indexeddb";

const catalog = (automatic_events: AutomaticEvent[] = []) =>
  new Catalog({ ...base, automatic_events });
const start = () => startDecisions("home-01", 0, catalog().resolve());
const configured = (id: string) =>
  ({ ...clone(events.find((e) => e.id === id)!), probability: 100 }) as AutomaticEvent;

describe("AC-016-P・Q 祖父と祖母", () => {
  it("初期値は別のオブジェクトで、資金総額100万円。公開値と集計が一致する", () => {
    const state = start();
    const group = state.grandparents;
    expect(group.members!.grandfather).not.toBe(group.members!.grandmother);
    expect(group.funds).toBe(100);
    expect(publicView(state).public.grandparents).toEqual(group);
    group.members!.grandmother.network = false;
    group.members!.grandmother.health = 3;
    syncGrandparents(group);
    expect(group.network).toBe(true);
    expect(group.health).toBe(6);
    const before = clone(state);
    legacyEquivalent(state);
    expect(state).toEqual(before);
    scaleParents(state, 10);
    scaleParents(state, 0.1);
    expect(state).toEqual(before);
  });
  for (const id of GRANDPARENTS) {
    const other = id === "grandfather" ? "grandmother" : "grandfather";
    it(`${id}の援助は本人から50万円だけ移し、残高不足では再発しない`, () => {
      const state = start();
      const before = clone(state.grandparents.members![other]);
      const cash = state.cash;
      state.settings!.content.automatic_events = [configured(`${id}-gift`)];
      state.n = 1;
      openDecisionTurn(state);
      expect(state.cash).toBe(cash + 50);
      expect(state.grandparents.members![id].funds).toBe(0);
      expect(state.grandparents.members![id].relation).toBe(7);
      expect(state.grandparents.members![other]).toEqual(before);
      expect(state.grandparents.funds).toBe(50);
      expect(state.history[0].text.join()).toContain(id === "grandfather" ? "祖父・" : "祖母・");
      state.n = 10;
      openDecisionTurn(state);
      expect(state.cash).toBe(cash + 50);
    });
    it(`${id}の体調不良と回復は本人だけに作用し、回復条件も本人を見る`, () => {
      const state = start();
      const before = clone(state.grandparents.members![other]);
      state.settings!.content.automatic_events = [configured(`${id}-care`)];
      state.n = 1;
      const cash = state.cash;
      openDecisionTurn(state);
      expect(state.cash).toBe(cash - 10);
      expect(state.grandparents.members![id].health).toBe(7);
      state.settings!.content.automatic_events = [configured(`${id}-recovery`)];
      state.n = 2;
      openDecisionTurn(state);
      expect(state.grandparents.members![id].health).toBe(8);
      expect(state.grandparents.members![other]).toEqual(before);
      state.n = 7;
      openDecisionTurn(state);
      expect(state.decisions!.event_history).toBeNull();
    });
  }
  it("同時援助でも合計100万円まで。各人の金額と10点尺度の上下限を守る", () => {
    const state = start();
    state.settings!.content.automatic_events = GRANDPARENTS.map((id) => configured(`${id}-gift`));
    const cash = state.cash;
    state.n = 1;
    openDecisionTurn(state);
    expect(state.cash).toBe(cash + 100);
    expect(state.grandparents.funds).toBe(0);
    const event = configured("grandfather-care");
    event.effects = [
      { path: "grandparents.members.grandfather.health", delta: -99999 },
      { path: "grandparents.members.grandfather.relation", delta: 99999 },
      { path: "grandparents.members.grandfather.funds", delta: 99999 },
    ];
    state.settings!.content.automatic_events = [event];
    state.n = 2;
    openDecisionTurn(state);
    expect(state.grandparents.members!.grandfather).toEqual({
      health: 0,
      relation: 10,
      funds: 99999,
      network: true,
    });
    expect(state.grandparents.members!.grandmother.funds).toBe(0);
  });
  it("旧共通効果は資金を増幅せず、端数・片方の残高不足も扱う", () => {
    const group = start().grandparents;
    group.members!.grandfather.funds = 0;
    syncGrandparents(group);
    applyGrandparentDelta(group, "funds", -31, 10);
    expect(group.funds).toBe(19);
    expect(group.members!.grandmother.funds).toBe(19);
    applyGrandparentDelta(group, "funds", 3, 10);
    expect(group.members!.grandfather.funds).toBe(2);
    expect(group.members!.grandmother.funds).toBe(20);
    applyGrandparentDelta(group, "relation", -20, 10);
    expect(GRANDPARENTS.map((id) => group.members![id].relation)).toEqual([0, 0]);
  });
  it("新規の個人値を保存・再開・再生し、不正な個人値や集計を拒否する", async () => {
    const db = new GameDatabase(`grand-${crypto.randomUUID()}`);
    const repo = new IndexedRepository(db);
    const service = new Service(repo, catalog([configured("grandmother-gift")]));
    const r = await service.execute({
      command: "new",
      run: "grand",
      scenario: "home-01",
      seed: 0,
      request_id: "new",
    });
    expect(r.ok).toBe(true);
    const saved = (await repo.read("grand"))!;
    expect(importRun(exportRun(saved))).toEqual(saved);
    expect(replayRun(saved)).toEqual(saved.state);
    expect((await new Service(repo).execute({ command: "observe", run: "grand" })).public).toEqual(
      r.public,
    );
    for (const damage of ["missing", "range", "summary"]) {
      const broken = clone(saved);
      if (damage === "missing") delete broken.state.grandparents.members;
      if (damage === "range") broken.state.grandparents.members!.grandmother.health = 11;
      if (damage === "summary") broken.state.grandparents.funds++;
      broken.digest = digest(broken.state);
      expect(() => validateRun(broken)).toThrow();
    }
    await db.delete();
  });
  it("rules-6保存は共通値のまま読込・再生できる", async () => {
    const old = clone(base);
    delete (old.decision_game as { initial_grandparents?: unknown }).initial_grandparents;
    const gift = configured("grandfather-gift");
    gift.conditions = [{ path: "grandparents.funds", op: "gte", value: 50 }];
    gift.modifiers = [];
    gift.effects = [
      { path: "cash", delta: 50 },
      { path: "grandparents.funds", delta: -50 },
    ];
    const db = new GameDatabase(`grand-old-${crypto.randomUUID()}`);
    const repo = new IndexedRepository(db);
    const service = new Service(repo, new Catalog({ ...old, automatic_events: [gift] }));
    const r = await service.execute({
      command: "new",
      run: "old",
      scenario: "home-01",
      seed: 0,
      request_id: "new",
    });
    expect(r.public!.versions.rules).toBe("rules-6");
    expect(r.public!.grandparents.members).toBeUndefined();
    expect(r.public!.grandparents.funds).toBe(50);
    const saved = (await repo.read("old"))!;
    expect(importRun(exportRun(saved))).toEqual(saved);
    expect(replayRun(saved)).toEqual(saved.state);
    await db.delete();
  });
});
