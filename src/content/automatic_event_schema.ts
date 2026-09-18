import * as v from "valibot";
import { integer, contentIdSchema } from "../validation/primitives";

import { eventConditionSchema, eventStatPaths } from "./stat_schema";
import { lifeRequirementSchema } from "./life_requirements_schema";
export const automaticEventSchema = v.pipe(
  v.strictObject({
    requires: v.optional(lifeRequirementSchema),
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
