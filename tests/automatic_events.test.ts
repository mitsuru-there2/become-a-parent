import bundledEvents from "../config/events.json";
import "fake-indexeddb/auto";
import { describe, expect, it } from "vite-plus/test";
import { Catalog } from "../src/content/catalog";
import { startDecisions, openDecisionTurn, chooseDecision } from "../src/engine/decisions";
import { advance, publicView } from "../src/engine/simulation";
import { clone } from "../src/engine/shared";
import { validateContent } from "../src/content/validation";
import { GameDatabase, IndexedRepository } from "../src/storage/indexeddb";
import { Service, replayRun, exportRun, importRun } from "../src/service/service";
import base from "../config/base.json";
import type { AutomaticEvent } from "../src/content/automatic_event_schema";

const event = (patch: Partial<AutomaticEvent> = {}): AutomaticEvent => ({
  id: "gift",
  text: "臨時収入50万円",
  kind: "good",
  min_age_months: 0,
  max_age_months: 234,
  probability: 100,
  conditions: [],
  modifiers: [],
  cooldown: 1,
  once: false,
  effects: [{ path: "cash", delta: 50 }],
  ...patch,
});
const catalog = (events: AutomaticEvent[]) => new Catalog({ ...base, automatic_events: events });
const start = (events: AutomaticEvent[], seed = 0) =>
  startDecisions("home-01", seed, catalog(events).resolve());

describe("S-016 自動イベント", () => {
  it("複数の善悪イベントを自動適用し、3判断を直ちに公開する。再表示・再開では増えない", () => {
    const quiet = start([]);
    const state = start([
      event(),
      event({
        id: "expense",
        kind: "bad",
        effects: [
          { path: "cash", delta: -20 },
          { path: "parents.A.stress", delta: 2 },
        ],
      }),
    ]);
    expect(state.versions.rules).toBe("rules-7");
    expect(state.cash).toBe(quiet.cash + 30);
    expect(state.parents.A.stress).toBe(quiet.parents.A.stress + 2);
    expect(state.history[0].events).toHaveLength(2);
    expect(state.history[0].event_results).toEqual([
      {
        event_id: "expense",
        kind: "bad",
        text: "臨時収入50万円",
        changes: ["父・ストレス 3→5（+2）", "資金 120万円→100万円（-20万円）"],
      },
      {
        event_id: "gift",
        kind: "good",
        text: "臨時収入50万円",
        changes: ["資金 100万円→150万円（+50万円）"],
      },
    ]);
    expect(state.history[0].events.every((e) => e.option_id === null)).toBe(true);
    expect(publicView(state).choices.map((c) => c.kind)).toEqual([
      "decision",
      "decision",
      "decision",
    ]);
    expect(publicView(quiet).public.decision_turn!.event_result).toEqual([]);
    expect(publicView(state).public.decision_turn!.event_results).toEqual(
      state.history[0].event_results,
    );
    const saved = clone(state);
    publicView(state);
    openDecisionTurn(state);
    expect(state).toEqual(saved);
    expect(publicView(state).public.forecast!.can_advance).toBe(false);
  });
  it("月齢の両境界、状態条件、確率補正、0%と100%を判定する", () => {
    for (const [n, count] of [
      [0, 0],
      [1, 1],
      [2, 1],
      [3, 0],
    ]) {
      const state = start([
        event({
          min_age_months: 6,
          max_age_months: 12,
          probability: 0,
          conditions: [{ path: "child.ability.study", op: "gte", value: 30 }],
          modifiers: [
            { condition: { path: "decisions.skills.B.learning", op: "gte", value: 7 }, add: 100 },
          ],
        }),
      ]);
      state.n = n;
      state.decisions!.opened_turn = undefined;
      state.child.ability.study = 30;
      state.decisions!.skills.B.learning = 7;
      openDecisionTurn(state);
      expect(state.decisions!.event_history?.events.length ?? 0).toBe(count);
    }
    expect(start([event({ probability: 0 })]).history).toHaveLength(0);
    expect(
      start([event({ conditions: [{ path: "grandparents.funds", op: "gte", value: 99999 }] })])
        .history,
    ).toHaveLength(0);
  });
  it("判定は同一期首状態を使い、再発間隔と一度限りを守る", () => {
    const state = start([
      event({ id: "a", effects: [{ path: "parents.A.stress", delta: 10 }], cooldown: 3 }),
      event({ id: "b", conditions: [{ path: "parents.A.stress", op: "gte", value: 10 }] }),
      event({ id: "once", once: true }),
    ]);
    expect(state.history[0].events.map((e) => e.event_id)).toEqual(["a", "once"]);
    state.n = 1;
    openDecisionTurn(state);
    expect(state.decisions!.event_history!.events.map((e) => e.event_id)).toEqual(["b"]);
    state.n = 3;
    openDecisionTurn(state);
    expect(state.decisions!.event_history!.events.map((e) => e.event_id)).toEqual(["a", "b"]);
  });
  it("金額・パラメータを上下限へ収めて実額を記録し、内部値を漏らさない", () => {
    const state = start([]);
    state.settings!.content.automatic_events = [
      event({
        effects: [
          { path: "cash", delta: -99999 },
          { path: "parents.A.health", delta: -99999 },
          { path: "child.ability.study", delta: 99999 },
        ],
      }),
    ];
    state.n = 1;
    const cash = state.cash;
    openDecisionTurn(state);
    expect(state.cash).toBe(0);
    expect(state.parents.A.health).toBe(0);
    expect(state.child.ability.study).toBe(100);
    expect(state.history[0].money[0].expense).toBe(cash);
    expect(state.history[0].text.join()).not.toContain("ability");
    expect(state.history[0].event_results![0].changes).toContain("子ども・能力・学び +90");
    state.settings!.content.automatic_events = [
      event({ effects: [{ path: "cash", delta: 99999 }] }),
    ];
    state.cash = 99990;
    state.n = 2;
    openDecisionTurn(state);
    expect(state.cash).toBe(99999);
    expect(state.history[1].money[0].cap_overflow).toBe(99990);
  });
  it("同じシードで再現し、別シードで発生が変わる", () => {
    const events = [event({ probability: 50 })];
    expect(start(events, 3)).toEqual(start(events, 3));
    const outcomes = new Set(
      Array.from({ length: 40 }, (_, seed) => start(events, seed).history.length),
    );
    expect(outcomes.size).toBe(2);
  });
  it("未知のパス、不正な確率・月齢・重複IDを拒否する", () => {
    for (const events of [
      [event({ probability: 101 })],
      [event({ min_age_months: 12, max_age_months: 6 })],
      [event(), event()],
      [{ ...event(), effects: [{ path: "__proto__.x", delta: 1 }] }],
    ])
      expect(() => validateContent({ ...base, automatic_events: events })).toThrow();
  });
  it("40期と成人後、保存・再開・再送・再生で効果を一度だけ適用する", async () => {
    const repo = new IndexedRepository(new GameDatabase(`auto-${crypto.randomUUID()}`));
    const service = new Service(repo, catalog([event()]));
    let r = await service.execute({
      command: "new",
      run: "auto",
      scenario: "home-01",
      seed: 4,
      request_id: "new",
    });
    expect(r.ok, JSON.stringify(r.error)).toBe(true);
    for (let t = 0; t < 40; t++) {
      for (const theme of r.choices) {
        r = await service.execute({
          command: "choose",
          run: "auto",
          revision: r.revision!,
          request_id: `${t}-${theme.event_id}`,
          input: { event_instance: theme.instance_id, option_id: theme.options[0].option_id },
        });
        expect(r.ok, JSON.stringify(r.error)).toBe(true);
      }
      const req = {
        command: "advance" as const,
        run: "auto",
        revision: r.revision!,
        request_id: `advance-${t}`,
      };
      r = await service.execute(req);
      expect(r.ok, JSON.stringify(r.error)).toBe(true);
      expect((await service.execute(req)).public).toEqual(r.public);
      if (t === 0) {
        const saved = (await repo.read("auto"))!;
        expect(importRun(exportRun(saved))).toEqual(saved);
        expect(
          (await new Service(repo).execute({ command: "observe", run: "auto" })).public,
        ).toEqual(r.public);
      }
    }
    expect(r.phase).toBe("finished");
    const saved = (await repo.read("auto"))!;
    expect(saved.state.history.filter((h) => h.kind === "special")).toHaveLength(40);
    expect(replayRun(saved)).toEqual(saved.state);
    expect(importRun(exportRun(saved))).toEqual(saved);
    repo.db.close();
  }, 30000);
  it("本編の祖父母援助は初期資金から50万円を移し、コンテスト賞金も50万円入る", () => {
    const gift = bundledEvents.find((e) => e.id === "grandfather-gift") as AutomaticEvent;
    const quiet = start([]);
    const received = start([{ ...gift, probability: 100 }]);
    expect(received.grandparents.funds).toBe(50);
    expect(received.cash).toBe(quiet.cash + 50);
    const prize = bundledEvents.find((e) => e.id === "craft-prize") as AutomaticEvent;
    const state = start([{ ...prize, probability: 100 }]);
    expect(state.history).toHaveLength(0);
    state.n = 12;
    state.child.ability.craft = 30;
    const cash = state.cash;
    openDecisionTurn(state);
    expect(state.cash).toBe(cash + 50);
    expect(state.decisions!.event_history!.events[0].event_id).toBe("craft-prize");
  });
  it("イベントなしでも3件を回答して進める", () => {
    const state = start([]);
    for (const choice of publicView(state).choices)
      chooseDecision(state, choice.instance_id, choice.options[0].option_id);
    advance(state);
    expect(state.n).toBe(1);
  });
});
