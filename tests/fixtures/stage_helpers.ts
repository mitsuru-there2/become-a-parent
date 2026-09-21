import { Catalog, defaultContent } from "../../src/content/catalog";
import { clone } from "../../src/engine/shared";
import { startDecisions, chooseDecision } from "../../src/engine/decisions";
import { advance, publicView } from "../../src/engine/simulation";
import type { State } from "../../src/engine/types";
export const startStage = () => {
  const content = clone(defaultContent);
  content.automatic_events = [];
  return startDecisions("home-01", 2, new Catalog(content, []).resolve());
};
export const chooseStage = (s: State, id: string, option: string) =>
  chooseDecision(s, `t${String(s.n + 1).padStart(2, "0")}:${id}`, `${id}:${option}`);
export const satisfyStage = (s: State) => {
  for (const choice of publicView(s).choices.filter(
    (c) => c.route_choice && c.crossroad_required,
  )) {
    const group = publicView(s).public.life!.route_groups!.find((g) => g.menu === choice.menu)!;
    const option = choice.options.find((o) => o.route === (group.previous ?? group.routes[0].id))!;
    chooseDecision(s, choice.instance_id, option.option_id);
  }
};
export const stageOption = (s: State, id: string, value: string) =>
  publicView(s)
    .choices.find((c) => c.event_id === id)!
    .options.find((o) => o.option_id === `${id}:${value}`)!;
export const until = (s: State, turn: number) => {
  while (s.n < turn) {
    satisfyStage(s);
    advance(s);
  }
};
