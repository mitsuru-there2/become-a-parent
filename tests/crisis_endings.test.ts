import "fake-indexeddb/auto";
import { describe, expect, it } from "vite-plus/test";
import { Catalog, defaultContent } from "../src/content/catalog";
import { startDecisions, openDecisionTurn } from "../src/engine/decisions";
import { advance, publicView } from "../src/engine/simulation";
import { clone } from "../src/engine/shared";
import { stageIndex } from "../src/engine/stage_state";
import { Service, exportRun, importRun, replayRun } from "../src/service/service";
import { GameDatabase, IndexedRepository } from "../src/storage/indexeddb";
import type { State } from "../src/engine/types";

const catalog = () => {
  const content = clone(defaultContent);
  content.automatic_events = [];
  return new Catalog(content, []);
};

function atAge(age: number) {
  const settings = catalog().resolve("easy");
  const state = startDecisions("home-01", 0, settings);
  state.n = age * 2;
  state.cash = 10000;
  for (const group of settings.content.life_game!.route_groups!)
    state.life!.stage_routes![`${stageIndex(state)}:${group.id}`] = group.routes[0].id;
  openDecisionTurn(state);
  return state;
}

function strainedChild(state: State) {
  state.child.stress = 100;
  state.child.trust = { A: 0, B: 0 };
  state.couple = 60;
}

describe("子どもと親の新しい途中終了", () => {
  it("家出は予兆と衝突の2期を経て発生し、回復すれば連続状態を解除する", () => {
    const recovered = atAge(12);
    strainedChild(recovered);
    advance(recovered);
    expect(recovered.phase).toBe("childhood");
    expect(recovered.decisions!.crisis.child).toEqual({ kind: "runaway", turns: 1 });
    expect(publicView(recovered).public.life!.notices.join(" ")).toContain("家を離れたい");
    recovered.child.stress = 40;
    recovered.child.trust.A = 50;
    advance(recovered);
    expect(recovered.decisions!.crisis.child).toBeNull();
    expect(recovered.phase).toBe("childhood");

    const ending = atAge(12);
    for (let i = 0; i < 3; i++) {
      strainedChild(ending);
      advance(ending);
      expect(ending.phase).toBe(i === 2 ? "game_over" : "childhood");
    }
    expect(ending.game_over?.reason).toBe("runaway");
    expect(ending.history.at(-2)?.text.join(" ")).toContain("家に帰りたくない");
    expect(ending.result).toBeNull();
    expect(() => advance(ending)).toThrow();
  });

  it("18・19歳も補導後の立て直しを経て少年院エンドに進む", () => {
    const state = atAge(18);
    for (let i = 0; i < 3; i++) {
      strainedChild(state);
      advance(state);
      if (i === 0) expect(state.decisions!.crisis.child).toEqual({ kind: "juvenile", turns: 1 });
      if (i === 1) {
        expect(state.phase).toBe("childhood");
        expect(state.history.at(-1)?.text.join(" ")).toContain("補導");
        expect(publicView(state).public.life!.notices.join(" ")).toContain("少年院");
      }
    }
    expect(state.game_over?.reason).toBe("juvenile");
    expect(state.game_over?.text).toContain("家庭裁判所");
    expect(state.result).toBeNull();
  });

  it("親の燃え尽きは健康・疲労・ストレスの3条件が2期続いたときだけ発生する", () => {
    const state = atAge(2);
    const exhaust = () => {
      state.parents.A.health = 0;
      state.parents.A.stress = 100;
      state.decisions!.fatigue.A = 100;
    };
    exhaust();
    advance(state);
    expect(state.phase).toBe("childhood");
    expect(publicView(state).public.life!.notices.join(" ")).toContain("燃え尽き");
    state.decisions!.fatigue.A = 0;
    advance(state);
    expect(state.decisions!.crisis.burnout?.A).toBe(0);
    expect(state.phase).toBe("childhood");
    exhaust();
    advance(state);
    exhaust();
    advance(state);
    expect(state.game_over?.reason).toBe("burnout");
    expect(state.game_over?.title).toContain("父");
  });

  it("40期目も少年院エンドを通常完走より優先する", () => {
    const state = atAge(19);
    state.n = 39;
    state.decisions!.crisis.child = { kind: "juvenile", turns: 2 };
    strainedChild(state);
    advance(state);
    expect(state.n).toBe(40);
    expect(state.game_over?.reason).toBe("juvenile");
    expect(state.result).toBeNull();
  });

  it("公開操作で危機を再生でき、保存の書出し・取込で結末が一致する", async () => {
    const content = clone(defaultContent);
    content.automatic_events = [
      {
        id: "aaa-child-crisis-test",
        text: "子どもが強い負担を抱え、家族に話しかけづらくなった。",
        kind: "bad",
        min_age_months: 144,
        max_age_months: 144,
        probability: 100,
        conditions: [],
        modifiers: [],
        cooldown: 1,
        once: true,
        effects: [
          { path: "child.stress", delta: 100 },
          { path: "child.trust.A", delta: -100 },
          { path: "child.trust.B", delta: -100 },
        ],
      },
    ];
    const repo = new IndexedRepository(new GameDatabase(`crisis-${crypto.randomUUID()}`));
    const service = new Service(repo, new Catalog(content, []));
    let response = await service.execute({
      command: "new",
      run: "crisis",
      scenario: "home-01",
      difficulty: "easy",
      seed: 0,
      request_id: "new",
    });
    for (const choice of response.choices.filter((item) => item.route_choice))
      response = await service.execute({
        command: "choose",
        run: "crisis",
        revision: response.revision!,
        request_id: choice.event_id,
        input: { event_instance: choice.instance_id, option_id: choice.options[0].option_id },
      });
    while (response.phase === "childhood" && response.public!.time.completed_turns < 28) {
      const completed = response.public!.time.completed_turns;
      response = await service.execute({
        command: "advance",
        run: "crisis",
        revision: response.revision!,
        request_id: `advance-${completed}`,
      });
      expect(response.ok, `${completed}: ${JSON.stringify(response.error)}`).toBe(true);
    }
    expect(response.ok).toBe(true);
    expect(response.public!.game_over?.reason).toBe("runaway");
    const saved = (await repo.read("crisis"))!;
    expect(replayRun(saved)).toEqual(saved.state);
    expect(importRun(exportRun(saved))).toEqual(saved);
    repo.db.close();
  }, 60_000);
});
