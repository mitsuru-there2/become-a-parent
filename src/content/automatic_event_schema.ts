import * as v from "valibot";
import { integer, contentIdSchema } from "../validation/primitives";

// 明示した数値だけを読み書きし、任意の状態パスは受け付けない。
export const eventStatPaths = [
  "cash",
  "couple",
  "child.stress",
  "child.autonomy",
  "child.trust.A",
  "child.trust.B",
  "child.interest.study",
  "child.interest.craft",
  "child.ability.study",
  "child.ability.craft",
  "parents.A.stress",
  "parents.A.health",
  "parents.A.fulfillment",
  "parents.A.social",
  "parents.A.regret",
  "parents.B.stress",
  "parents.B.health",
  "parents.B.fulfillment",
  "parents.B.social",
  "parents.B.regret",
  "decisions.fatigue.A",
  "decisions.fatigue.B",
  "decisions.skills.A.dialogue",
  "decisions.skills.A.planning",
  "decisions.skills.A.learning",
  "decisions.skills.B.dialogue",
  "decisions.skills.B.planning",
  "decisions.skills.B.learning",
  "grandparents.members.grandfather.health",
  "grandparents.members.grandfather.relation",
  "grandparents.members.grandfather.funds",
  "grandparents.members.grandmother.health",
  "grandparents.members.grandmother.relation",
  "grandparents.members.grandmother.funds",
  "grandparents.health",
  "grandparents.relation",
  "grandparents.funds",
] as const;
export const eventConditionSchema = v.strictObject({
  path: v.picklist([...eventStatPaths, "parents.A.age_months", "parents.B.age_months"]),
  op: v.picklist(["eq", "lt", "gte"]),
  value: integer(-99999, 99999),
});
export const automaticEventSchema = v.pipe(
  v.strictObject({
    id: contentIdSchema,
    text: v.pipe(v.string(), v.minLength(1)),
    kind: v.picklist(["good", "bad"]),
    min_age_months: integer(0, 239),
    max_age_months: integer(0, 239),
    probability: integer(0, 100),
    conditions: v.array(eventConditionSchema),
    modifiers: v.array(
      v.strictObject({ condition: eventConditionSchema, add: integer(-100, 100) }),
    ),
    cooldown: integer(1, 40),
    once: v.boolean(),
    effects: v.pipe(
      v.array(v.strictObject({ path: v.picklist(eventStatPaths), delta: integer(-99999, 99999) })),
      v.minLength(1),
    ),
  }),
  v.check((e) => e.min_age_months <= e.max_age_months, "対象月齢が逆です"),
);
export const automaticEventsSchema = v.pipe(
  v.array(automaticEventSchema),
  v.check(
    (events) => new Set(events.map((e) => e.id)).size === events.length,
    "イベントIDが重複しています",
  ),
);
export type AutomaticEvent = v.InferOutput<typeof automaticEventSchema>;
