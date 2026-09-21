import "fake-indexeddb/auto";
import { describe, expect, it } from "vite-plus/test";
import { Catalog, defaultContent } from "../src/content/catalog";
import { clone } from "../src/engine/shared";
import { startDecisions, chooseDecision } from "../src/engine/decisions";
import { advance, publicView, stage } from "../src/engine/simulation";
import { openLife } from "../src/engine/life";
import { applyAutomaticEvents } from "../src/engine/automatic_events";
import { Service, replayRun, exportRun, importRun } from "../src/service/service";
import { GameDatabase, IndexedRepository } from "../src/storage/indexeddb";
import type { State } from "../src/engine/types";

const start = (age = 0) => {
  const content = clone(defaultContent);
  content.automatic_events = [];
  const s = startDecisions("home-01", 0, new Catalog(content, []).resolve());
  s.n = age / 6;
  openLife(s);
  return s;
};
const option = (s: State, id: string, value: string) =>
  publicView(s)
    .choices.find((c) => c.event_id === id)!
    .options.find((o) => o.option_id === `${id}:${value}`)!;
const choose = (s: State, id: string, value: string) =>
  chooseDecision(
    s,
    publicView(s).choices.find((c) => c.event_id === id)!.instance_id,
    `${id}:${value}`,
  );

describe("S-018-F〜H 年代と選択で育つ物語", () => {
  it("幼児期の選択が18歳の別々の振り返りにつながり、取消・年齢・一度限りを守る", () => {
    const s = start();
    choose(s, "story-keepsake", "capsule");
    choose(s, "story-keepsake", "cancel");
    advance(s);
    expect(s.life!.history["story-keepsake:capsule"]).toBeUndefined();
    for (const [keepsake, reunion, other] of [
      ["capsule", "open", "screen"],
      ["album", "screen", "open"],
    ]) {
      const branch = clone(s);
      choose(branch, "story-keepsake", keepsake);
      advance(branch);
      expect(option(branch, "story-keepsake", keepsake).available).toBe(false);
      branch.n = 35;
      openLife(branch);
      expect(option(branch, "story-reunion", reunion).available).toBe(false);
      advance(branch);
      expect(option(branch, "story-reunion", reunion).available).toBe(true);
      expect(option(branch, "story-reunion", other).available).toBe(false);
      choose(branch, "story-reunion", reunion);
      advance(branch);
      expect(option(branch, "story-reunion", reunion).available).toBe(false);
    }
  });

  it("確定前は音楽の後続を解放せず、休止では専用イベントと舞台を止め、18歳で継続費を終了する", () => {
    const s = start(48);
    choose(s, "story-music-trial", "try");
    expect(option(s, "story-music", "stage").available).toBe(false);
    advance(s);
    choose(s, "story-music", "stage");
    advance(s);
    const event = clone(
      defaultContent.automatic_events!.find((e) => e.id === "story-amp-trouble")!,
    );
    event.probability = 100;
    s.settings!.content.automatic_events = [event];
    expect(applyAutomaticEvents(s)?.events[0].event_id).toBe(event.id);
    choose(s, "story-music", "standard");
    advance(s);
    s.n = 16;
    openLife(s);
    delete s.seen[`automatic:${event.id}`];
    expect(applyAutomaticEvents(s)).toBeNull();
    expect(option(s, "story-festival", "national").available).toBe(false);
    expect(s.life!.history["story-music:stage"]).toBeDefined();
    choose(s, "story-music", "casual");
    advance(s);
    expect(option(s, "story-festival", "local").available).toBe(true);
    expect(option(s, "story-festival", "national").available).toBe(false);
    s.n = 35;
    advance(s);
    expect(s.life!.policies["story-music"]).toBe("standard");
    expect(publicView(s).public.life!.policies.some((p) => p.id === "story-music")).toBe(false);
    expect(publicView(s).public.forecast!.cost).toBe(
      s.settings!.content.difficulties.normal.living_cost + stage(s.n, s).cost,
    );
  });

  it("新イベントの全件が両年齢境界・前提・一度限り・再発間隔を守る", () => {
    for (const original of defaultContent.automatic_events!.filter((e) =>
      e.id.startsWith("story-"),
    )) {
      const event = { ...clone(original), probability: 100 };
      const s = start(event.min_age_months);
      s.settings!.content.automatic_events = [event];
      for (const r of event.requires?.history ?? [])
        s.life!.history[`${r.decision}:${r.option}`] = { first_turn: 1, last_turn: 1, count: 1 };
      for (const r of event.requires?.policies ?? []) s.life!.policies[r.decision] = r.option;
      const beforeAge = clone(s);
      beforeAge.n = event.min_age_months / 6 - 1;
      expect(applyAutomaticEvents(beforeAge), event.id).toBeNull();
      const late = clone(s);
      late.n = Math.floor(event.max_age_months / 6) + 1;
      expect(applyAutomaticEvents(late), event.id).toBeNull();
      const last = clone(s);
      last.n = Math.floor(event.max_age_months / 6);
      expect(
        applyAutomaticEvents(last)?.events.map((e) => e.event_id),
        event.id,
      ).toEqual([event.id]);
      if (event.requires) {
        const unrelated = clone(s);
        unrelated.life!.history = {};
        for (const key of Object.keys(unrelated.life!.policies))
          unrelated.life!.policies[key] = "standard";
        expect(applyAutomaticEvents(unrelated), event.id).toBeNull();
      }
      expect(
        applyAutomaticEvents(s)?.events.map((e) => e.event_id),
        event.id,
      ).toEqual([event.id]);
      expect(applyAutomaticEvents(s), event.id).toBeNull();
      s.n++;
      expect(applyAutomaticEvents(s), event.id).toBeNull();
      if (s.n * 6 + event.cooldown * 6 <= event.max_age_months) {
        s.n += event.cooldown;
        expect(applyAutomaticEvents(s)?.events.map((e) => e.event_id) ?? [], event.id).toEqual(
          event.once ? [] : [event.id],
        );
      }
    }
  });

  it("新しい店の費用・収入は予測と一致し、休業後は開業専用イベントが起きない", () => {
    const s = start(72);
    choose(s, "story-market", "sell");
    choose(s, "base-work-consult", "talk");
    advance(s);
    advance(s);
    choose(s, "story-venture", "launch");
    const forecast = publicView(s).public.forecast!;
    expect(forecast.income).toBe(355);
    const predicted = forecast.projected_cash;
    advance(s);
    expect(s.cash).toBe(predicted);
    choose(s, "story-venture", "standard");
    advance(s);
    const event = clone(defaultContent.automatic_events!.find((e) => e.id === "story-big-order")!);
    event.probability = 100;
    s.settings!.content.automatic_events = [event];
    expect(applyAutomaticEvents(s)).toBeNull();
    expect(publicView(s).public.forecast!.income).toBe(280);
  });

  it("標準生活は全難易度・10シードで完走し、平均1〜3件/期で年代別に違う出来事が届く", () => {
    const signatures = new Set<string>();
    for (const difficulty of ["easy", "normal", "hard"]) {
      let count = 0;
      const stories = new Set<string>();
      for (let seed = 0; seed < 10; seed++) {
        const s = startDecisions("home-01", seed, new Catalog().resolve(difficulty));
        while (s.phase === "childhood") advance(s);
        expect(s.n).toBe(40);
        expect(s.phase).toBe("finished");
        expect(s.result!.parents.A.death_age).toBeGreaterThan(50);
        expect(s.result!.parents.B.death_age).toBeGreaterThan(50);
        expect(
          s.history.every((entry) => entry.kind !== "special" || entry.events.length <= 3),
        ).toBe(true);
        const events = s.history.flatMap((h) =>
          h.kind === "special" ? h.events.map((e) => e.event_id) : [],
        );
        count += events.length;
        for (const id of events.filter((id) => id.startsWith("story-"))) stories.add(id);
        signatures.add(events.join());
      }
      expect(count / 400).toBeGreaterThanOrEqual(1);
      expect(count / 400).toBeLessThanOrEqual(3);
      expect(stories.size).toBeGreaterThanOrEqual(15);
    }
    expect(signatures.size).toBeGreaterThanOrEqual(10);
  }, 30000);

  it("新しい選択の予定・取消・再送・保存・再生が一致し、カタログが変わっても保存へ混入しない", async () => {
    const repo = new IndexedRepository(new GameDatabase(`story-${crypto.randomUUID()}`));
    try {
      const service = new Service(repo);
      let r = await service.execute({
        command: "new",
        run: "story",
        scenario: "home-01",
        seed: 7,
        request_id: "new",
      });
      const choice = r.choices.find((c) => c.event_id === "story-keepsake")!;
      const request = {
        command: "choose" as const,
        run: "story",
        revision: r.revision!,
        request_id: "capsule",
        input: { event_instance: choice.instance_id, option_id: "story-keepsake:capsule" },
      };
      r = await service.execute(request);
      expect(r.ok).toBe(true);
      expect((await service.execute(request)).payload!.receipt!.duplicate).toBe(true);
      const planned = (await repo.read("story"))!;
      expect(importRun(exportRun(planned))).toEqual(planned);
      r = await service.execute({
        command: "advance",
        run: "story",
        revision: r.revision!,
        request_id: "advance",
      });
      expect(r.ok).toBe(true);
      const saved = (await repo.read("story"))!;
      expect(importRun(exportRun(saved))).toEqual(saved);
      expect(replayRun(saved)).toEqual(saved.state);
      const otherContent = clone(defaultContent);
      otherContent.life_game!.decisions.find((d) => d.id === "story-keepsake")!.options[0].cost =
        99999;
      otherContent.automatic_events = [];
      const reopened = await new Service(repo, new Catalog(otherContent, [])).execute({
        command: "observe",
        run: "story",
      });
      expect(reopened.public).toEqual(r.public);
      expect(reopened.choices).toEqual(r.choices);
      expect((await repo.read("story"))!.state.settings).toEqual(saved.state.settings);
    } finally {
      repo.db.close();
    }
  });
});
