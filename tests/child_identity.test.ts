import "fake-indexeddb/auto";
import { describe, expect, it } from "vite-plus/test";
import { Catalog, defaultContent } from "../src/content/catalog";
import { applyAutomaticEvents } from "../src/engine/automatic_events";
import {
  applyHiddenJudgment,
  awardChildTitles,
  initializeChildIdentity,
  validChildIdentity,
} from "../src/engine/child_identity";
import { startDecisions } from "../src/engine/decisions";
import { publicView } from "../src/engine/simulation";
import { clone } from "../src/engine/shared";
import { Service, exportRun, importRun, replayRun } from "../src/service/service";
import { GameDatabase, IndexedRepository } from "../src/storage/indexeddb";

const start = () => {
  const content = clone(defaultContent);
  content.automatic_events = [];
  return startDecisions("home-01", 11, new Catalog(content, []).resolve());
};

describe("子どもの隠し特性と称号", () => {
  it("17ルートの判断がそれぞれの隠し値を伸ばし、公開判断には変化量を出さない", () => {
    const state = start();
    const game = state.settings!.content.life_game!;
    for (const group of game.route_groups!) {
      for (const route of group.routes) {
        const node = game.decisions.find(
          (item) =>
            item.route_group === group.id &&
            item.stages?.[0] === 0 &&
            item.options[0].routes?.includes(route.id),
        );
        expect(node).toBeDefined();
        const before = { ...state.child.profile! };
        applyHiddenJudgment(state, node!, node!.options[0]);
        expect(state.child.profile).not.toEqual(before);
      }
    }
    expect(game.decisions).toHaveLength(850);
    for (const node of game.decisions) {
      initializeChildIdentity(state);
      applyHiddenJudgment(state, node, node.options[0]);
      expect(Object.values(state.child.profile!).some((value) => value > 0)).toBe(true);
    }
    const view = publicView(state).public;
    expect(JSON.stringify(view)).not.toContain("profile");
    expect(JSON.stringify(view)).not.toContain("hidden_effects");
    expect(view.child_identity?.feature.label).toBeTruthy();
  });

  it("称号は境界で一度だけ獲得し、値が下がっても残る。代表状態は最高値に追従する", () => {
    const state = start();
    state.child.profile!.music = 44;
    awardChildTitles(state);
    expect(state.child.titles).toEqual([]);
    state.child.profile!.music = 45;
    awardChildTitles(state);
    awardChildTitles(state);
    expect(state.child.titles).toEqual(["pianist"]);
    expect(publicView(state).public.child_identity?.latest_titles).toEqual([
      { id: "pianist", label: "天才ピアニスト" },
    ]);
    expect(publicView(state).public.child_identity?.feature.label).toBe("音楽家");
    state.child.profile!.music = 79;
    awardChildTitles(state);
    expect(state.child.titles).not.toContain("virtuoso");
    state.child.profile!.music = 80;
    awardChildTitles(state);
    expect(state.child.titles).toContain("virtuoso");
    state.child.profile!.music = 0;
    state.child.profile!.making = 50;
    awardChildTitles(state);
    expect(state.child.titles).toContain("pianist");
    expect(publicView(state).public.child_identity?.feature.label).toBe("発明家");
    expect(validChildIdentity(state.child)).toBe(true);
    state.child.profile!.making = 101;
    expect(validChildIdentity(state.child)).toBe(false);
  });

  it("隠し値がイベントの発生を左右し、イベントの増減数値は公開しない", () => {
    const state = start();
    state.n = 12;
    state.settings!.content.automatic_events = [
      {
        id: "profile-test",
        text: "音楽の出来事",
        kind: "good",
        min_age_months: 72,
        max_age_months: 234,
        probability: 100,
        conditions: [{ path: "child.profile.music", op: "gte", value: 25 }],
        modifiers: [],
        cooldown: 1,
        once: false,
        effects: [{ path: "child.profile.music", delta: 5 }],
      },
    ];
    state.child.profile!.music = 24;
    expect(applyAutomaticEvents(state)).toBeNull();
    state.child.profile!.music = 25;
    const event = applyAutomaticEvents(state);
    expect(event?.events[0].event_id).toBe("profile-test");
    expect(state.child.profile!.music).toBe(30);
    expect(event?.event_results?.[0].changes).toEqual([]);
    expect(JSON.stringify(publicView(state).public)).not.toContain("child.profile");
  });

  it("保存済みの旧コンテンツでは隠し特性を後付けせず、再生時の状態を保つ", () => {
    const content = clone(defaultContent);
    delete content.life_game!.child_identity;
    content.automatic_events = [];
    const state = startDecisions("home-01", 11, new Catalog(content, []).resolve());
    expect(state.child.profile).toBeUndefined();
    expect(publicView(state).public.child_identity).toBeUndefined();
  });

  it("取得・保存再開・再生で隠し特性と称号の記録が一致する", async () => {
    const repo = new IndexedRepository(new GameDatabase(`identity-${crypto.randomUUID()}`));
    const service = new Service(repo);
    let response = await service.execute({
      command: "new",
      run: "identity",
      scenario: "home-01",
      seed: 4,
      request_id: "new",
    });
    for (const route of response.choices.filter((choice) => choice.route_choice)) {
      response = await service.execute({
        command: "choose",
        run: "identity",
        revision: response.revision!,
        request_id: route.event_id,
        input: { event_instance: route.instance_id, option_id: route.options[0].option_id },
      });
      expect(response.ok).toBe(true);
    }
    const decision = response.choices.find((choice) => choice.event_id === "home-daily-0-01")!;
    response = await service.execute({
      command: "choose",
      run: "identity",
      revision: response.revision!,
      request_id: "judgment",
      input: { event_instance: decision.instance_id, option_id: decision.options[0].option_id },
    });
    expect(response.ok).toBe(true);
    const saved = (await repo.read("identity"))!;
    expect(saved.state.child.profile!.responsibility).toBeGreaterThan(0);
    expect(importRun(exportRun(saved))).toEqual(saved);
    expect(replayRun(saved)).toEqual(saved.state);
    repo.db.close();
  });
});
