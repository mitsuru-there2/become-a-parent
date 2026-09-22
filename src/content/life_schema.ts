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
const eventModifiersSchema = v.array(
  v.strictObject({
    label: text,
    kind: v.picklist(["good", "bad"]),
    percent: integer(-80, 200),
  }),
);
export const ongoingLifeEffectSchema = v.strictObject({
  effects: lifeEffectsSchema,
  cost: integer(),
  income: integer(),
  income_reduction: v.optional(integer()),
  event_modifiers: v.optional(eventModifiersSchema),
});
const lifeOptionSchema = v.strictObject({
  hidden_effects: v.optional(
    v.array(
      v.strictObject({
        path: v.picklist(eventStatPaths.filter((path) => path.startsWith("child.profile."))),
        delta: integer(-20, 20),
      }),
    ),
  ),
  routes: v.optional(v.pipe(v.array(contentIdSchema), v.minLength(1))),
  stage_effect: v.optional(ongoingLifeEffectSchema),
  permanent_effect: v.optional(ongoingLifeEffectSchema),
  visual: v.optional(contentIdSchema),
  route: v.optional(contentIdSchema),
  tree_route: v.optional(contentIdSchema),
  switch_to: v.optional(contentIdSchema),
  income_reduction: v.optional(integer()),
  event_modifiers: v.optional(
    v.array(
      v.strictObject({
        label: text,
        kind: v.picklist(["good", "bad"]),
        percent: integer(-80, 200),
      }),
    ),
  ),
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
    stages: v.optional(v.pipe(v.array(integer(0, 4)), v.minLength(1))),
    route_group: v.optional(contentIdSchema),
    route_stage: v.optional(integer(0, 10)),
    route: v.optional(contentIdSchema),
    tree_route: v.optional(contentIdSchema),
    title: text,
    reason: text,
    kind: v.picklist(["policy", "selection"]),
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
const difficultyProfileSchema = v.strictObject({
  label: text,
  description: text,
  initial_cash: integer(0),
  living_cost: integer(0),
  parent_start_age: integer(18, 60),
  family_home_funds: integer(0),
  base_income: integer(0),
  income_growth_per_stage: integer(0),
  good_event_probability: integer(0, 300),
  bad_event_probability: integer(0, 300),
  positive_effect: integer(0, 300),
  negative_effect: integer(0, 300),
  income_effect: integer(0, 300),
});
export const lifeGameSchema = v.strictObject({
  difficulty_profiles: v.optional(
    v.strictObject({
      easy: difficultyProfileSchema,
      normal: difficultyProfileSchema,
      hard: difficultyProfileSchema,
    }),
  ),
  child_identity: v.optional(v.boolean()),
  judgment_catalog: v.optional(v.literal("routes-10")),
  selection_tree: v.optional(v.boolean()),
  stage_model: v.optional(v.boolean()),
  crossroads: v.optional(
    v.array(
      v.strictObject({
        age_months: integer(0, 234),
        label: text,
        required_decisions: v.pipe(v.array(contentIdSchema), v.minLength(1)),
      }),
    ),
  ),
  route_groups: v.optional(
    v.array(
      v.strictObject({
        id: contentIdSchema,
        label: text,
        menu: contentIdSchema,
        switch_decision: v.optional(contentIdSchema),
        switch_cost: v.optional(integer()),
        switch_effects: v.optional(lifeEffectsSchema),
        layout: v.optional(v.picklist(["staged", "branches"])),
        stage_labels: v.optional(v.array(text)),
        routes: v.pipe(
          v.array(v.strictObject({ id: contentIdSchema, label: text })),
          v.minLength(2),
        ),
      }),
    ),
  ),
  initial_family_home: v.optional(grandparentSchema),
  initial_grandparents: v.optional(
    v.strictObject({
      grandfather: grandparentSchema,
      grandmother: grandparentSchema,
    }),
  ),
  schema_version: v.literal(1),
  max_selections: integer(0, 5),
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
