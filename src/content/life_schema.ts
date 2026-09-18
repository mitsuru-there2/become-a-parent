import { grandparentSchema } from "./decision_schema";
import * as v from "valibot";
import { contentIdSchema, integer } from "../validation/primitives";
import { eventStatPaths } from "./stat_schema";

const text = v.pipe(v.string(), v.minLength(1));
export { type LifeRequirement } from "./life_requirements_schema";
import { lifeRequirementSchema } from "./life_requirements_schema";
// 家計はcost/incomeだけで計算し、予測と実際の二重計上を防ぐ。
export const lifeEffectsSchema = v.array(
  v.strictObject({
    path: v.picklist(eventStatPaths.filter((path) => path !== "cash")),
    delta: integer(-100, 100),
  }),
);
const lifeOptionSchema = v.strictObject({
  id: contentIdSchema,
  repair: v.optional(v.boolean()),
  label: text,
  description: text,
  cost: integer(),
  income: integer(),
  setup_cost: integer(),
  effects: lifeEffectsSchema,
  requires: v.optional(lifeRequirementSchema),
  maintains: v.optional(lifeRequirementSchema),
  skill: v.optional(
    v.strictObject({
      parent: v.picklist(["A", "B"]),
      ability: v.picklist(["dialogue", "planning", "learning"]),
      target: v.picklist([
        "child.trust.A",
        "child.trust.B",
        "child.ability.study",
        "child.ability.craft",
      ]),
      gain: integer(0, 10),
    }),
  ),
});
export const lifeDecisionSchema = v.pipe(
  v.strictObject({
    id: contentIdSchema,
    menu: contentIdSchema,
    title: text,
    reason: text,
    kind: v.picklist(["policy", "action"]),
    min_age_months: integer(0, 234),
    max_age_months: integer(0, 239),
    requires: v.optional(lifeRequirementSchema),
    default_option: v.nullable(contentIdSchema),
    once: v.boolean(),
    cooldown: integer(1, 40),
    options: v.pipe(v.array(lifeOptionSchema), v.minLength(1)),
  }),
  v.check((d) => d.min_age_months <= d.max_age_months, "対象月齢が逆です"),
);
export const lifeDecisionsSchema = v.array(lifeDecisionSchema);
export const lifeGameSchema = v.strictObject({
  initial_grandparents: v.strictObject({
    grandfather: grandparentSchema,
    grandmother: grandparentSchema,
  }),
  schema_version: v.literal(1),
  max_actions: integer(1, 5),
  income: integer(),
  standard_effects: lifeEffectsSchema,
  menus: v.pipe(
    v.array(v.strictObject({ id: contentIdSchema, label: text, description: text })),
    v.minLength(1),
  ),
  decisions: lifeDecisionsSchema,
});
export type LifeDecision = v.InferOutput<typeof lifeDecisionSchema>;
export type LifeOption = LifeDecision["options"][number];
export type LifeGame = v.InferOutput<typeof lifeGameSchema>;
