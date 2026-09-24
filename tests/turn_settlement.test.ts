import "fake-indexeddb/auto";
import { expect, it } from "vite-plus/test";
import { Catalog, defaultContent } from "../src/content/catalog";
import {
  startDecisions,
  advanceDecisions,
  chooseDecision,
  undoDecision,
} from "../src/engine/decisions";
import { clone } from "../src/engine/shared";
import { publicView } from "../src/engine/simulation";
import { GameDatabase, IndexedRepository } from "../src/storage/indexeddb";
import { Service, replayRun } from "../src/service/service";

it("今期の判断は予測に入り、取消と再取得を経て期末に一度だけ反映する", async () => {
  const repo = new IndexedRepository(new GameDatabase(`settlement-${crypto.randomUUID()}`));
  const service = new Service(repo);
  let response = await service.execute({
    command: "new",
    run: "settlement",
    scenario: "home-01",
    seed: 2,
    request_id: "new",
  });
  expect(response.ok, JSON.stringify(response.error)).toBe(true);
  const choice = response.choices.find((item) => item.event_id === "home-daily-0-01")!;
  const option = choice.options.find((item) => item.available)!;
  const beforeCash = response.public!.cash!;
  const beforeStudy = response.public!.life!.study_score!;
  const original = response.public!.forecast!;
  response = await service.execute({
    command: "choose",
    run: "settlement",
    revision: response.revision!,
    request_id: "choose-1",
    input: { event_instance: choice.instance_id, option_id: option.option_id },
  });
  expect(response.ok).toBe(true);
  expect(response.public!.cash).toBe(beforeCash);
  expect(response.public!.life!.study_score).toBe(beforeStudy);
  expect(response.public!.life!.pending).toEqual([option.option_id]);
  expect(response.public!.forecast!.cost - original.cost).toBe(option.cost);
  expect(response.public!.forecast!.income - original.income).toBe(option.income);
  response = await service.execute({
    command: "undo",
    run: "settlement",
    revision: response.revision!,
    request_id: "undo-1",
    input: { option_id: option.option_id },
  });
  expect(response.ok).toBe(true);
  expect(response.public!.life!.pending).toEqual([]);
  expect(response.public!.forecast).toMatchObject({ income: original.income, cost: original.cost });
  response = await service.execute({
    command: "choose",
    run: "settlement",
    revision: response.revision!,
    request_id: "choose-2",
    input: { event_instance: choice.instance_id, option_id: option.option_id },
  });
  response = await service.execute({
    command: "advance",
    run: "settlement",
    revision: response.revision!,
    request_id: "advance-1",
  });
  expect(response.ok).toBe(true);
  expect(response.public!.life!.pending).toEqual([]);
  expect(response.public!.life!.turn_result).toMatchObject({
    turn: 1,
    before: { cash: beforeCash, "child.study": beforeStudy },
  });
  expect(response.public!.life!.turn_result!.after.cash).toBe(
    (await repo.read("settlement"))!.state.history.findLast((entry) => entry.kind === "turn")!
      .money[0].after,
  );
  expect(replayRun((await repo.read("settlement"))!)).toEqual(
    (await repo.read("settlement"))!.state,
  );
  repo.db.close();
}, 20_000);

it("資金が初めてマイナスになった期は続き、次の期末もマイナスなら終了する", () => {
  const content = clone(defaultContent);
  content.automatic_events = [];
  const state = startDecisions("home-01", 1, new Catalog(content, []).resolve());
  state.cash = 1;
  state.life!.turn_start_cash = 1;
  advanceDecisions(state);
  expect(state.phase).toBe("childhood");
  expect(state.cash).toBeLessThan(0);
  expect(state.life!.turn_start_cash).toBeLessThan(0);
  const recovery = clone(state);
  recovery.cash = 10000;
  advanceDecisions(recovery);
  expect(recovery.phase).toBe("childhood");
  advanceDecisions(state);
  expect(state.phase).toBe("game_over");
  expect(state.game_over?.reason).toBe("bankruptcy");
});

it("家族の主要値が危機に近づくと、公開状態に危険の理由を出す", () => {
  const state = startDecisions("home-01", 3, new Catalog().resolve());
  state.parents.A.health = 30;
  state.parents.A.stress = 80;
  state.decisions!.fatigue.A = 80;
  expect(publicView(state).public.life!.danger).toContain("父の燃え尽きが近づいています。");
});

it("前提の判断を取り消すと、同じ期の後続取得も取り消す", () => {
  const state = startDecisions("home-01", 4, new Catalog().resolve());
  const dependent = state.settings!.content.life_game!.decisions.find(
    (item) => item.id === "home-daily-0-02",
  )!;
  dependent.requires = { history: [{ decision: "home-daily-0-01", option: "take", after: 0 }] };
  const first = publicView(state).choices.find((item) => item.event_id === "home-daily-0-01")!;
  const firstOption = first.options.find((item) => item.available)!;
  dependent.requires.history![0].option = firstOption.option_id.split(":")[1];
  chooseDecision(state, first.instance_id, firstOption.option_id);
  const second = publicView(state).choices.find((item) => item.event_id === dependent.id)!;
  const secondOption = second.options[0];
  expect(secondOption.reasons).toEqual([]);
  chooseDecision(state, second.instance_id, secondOption.option_id);
  undoDecision(state, firstOption.option_id);
  expect(state.life!.pending).toEqual([]);
  expect(state.life!.history[firstOption.option_id]).toBeUndefined();
  expect(state.life!.history[secondOption.option_id]).toBeUndefined();
});
