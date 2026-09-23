import { expect, it } from "vite-plus/test";
import { Catalog, defaultContent } from "../src/content/catalog";
import { startDecisions, chooseDecision } from "../src/engine/decisions";
import { applyStat } from "../src/engine/automatic_events";
import { publicView } from "../src/engine/simulation";
import { clone } from "../src/engine/shared";

it("新しい人生は状態を100%尺度、子と親の能力を0点から始める", () => {
  const content = clone(defaultContent);
  content.automatic_events = [];
  const state = startDecisions("home-01", 2, new Catalog(content, []).resolve());
  expect(state.versions).toEqual({ rules: "rules-14", data: "data-15", save: "save-15" });
  expect(state.child.ability).toEqual({ study: 0, craft: 0 });
  expect(state.decisions!.skills.A).toEqual({ dialogue: 0, planning: 0, learning: 0 });
  expect(state.grandparents).toMatchObject({ health: 80, relation: 60, funds: 100 });
  expect(publicView(state).public.life).toMatchObject({ study_score: 0, craft_score: 0 });

  expect(applyStat(state, { path: "parents.A.health", delta: -2 })).toEqual({
    previous: 80,
    current: 70,
  });
  expect(applyStat(state, { path: "grandparents.health", delta: 3 })).toEqual({
    previous: 80,
    current: 95,
  });
  expect(applyStat(state, { path: "child.ability.study", delta: 120 })).toEqual({
    previous: 0,
    current: 100,
  });

  expect(publicView(state).public.life!.crossroad!.missing).toEqual([]);
  const choice = publicView(state).choices.find(
    (item) => item.event_id === "education-public-0-01",
  )!;
  chooseDecision(state, choice.instance_id, choice.options[0].option_id);
  expect(state.decisions!.skills.A.learning + state.decisions!.skills.B.learning).toBeGreaterThan(
    0,
  );
  const beforeLearning = state.decisions!.skills.A.learning + state.decisions!.skills.B.learning;
  const play = publicView(state).choices.find(
    (item) => item.event_id === "afterschool-maker-0-01",
  )!;
  state.cash = 1000;
  chooseDecision(state, play.instance_id, play.options[0].option_id);
  expect(state.decisions!.skills.A.learning + state.decisions!.skills.B.learning).toBeGreaterThan(
    beforeLearning,
  );
});

it("旧ルールの開始値と10点制を維持する", () => {
  const state = startDecisions("home-01", 2, new Catalog().resolve(), "rules-13");
  expect(state.versions).toEqual({ rules: "rules-13", data: "data-14", save: "save-14" });
  expect(state.child.ability).toEqual({ study: 10, craft: 10 });
  expect(state.parents.A.health).toBe(8);
  expect(state.grandparents.health).toBe(8);
  expect(state.decisions!.skills.A.learning).toBeGreaterThan(0);
});
