import * as v from "valibot";
import { decisionGameSchema } from "./decision_schema";
import { integer, contentIdSchema, dictionary, unique } from "../validation/primitives";
export const difficultyIdSchema = v.picklist(["easy", "normal", "hard"]);
const domain = v.picklist(["study", "craft"]);
const visualId = v.nullable(contentIdSchema);
const numericEffects = [
  "S",
  "F",
  "G",
  "T",
  "X",
  "U",
  "N",
  "adapt",
  "GM",
  "GR",
  "B_study",
  "B_craft",
  "B_target",
  "I_study",
  "I_craft",
  "I_target",
];
const effectValues = dictionary(v.union([integer(-100), v.string()]));
export const effectsSchema = v.pipe(
  effectValues,
  v.check(
    (effects) =>
      Object.entries(effects).every(
        ([key, value]) => numericEffects.includes(key) && v.is(integer(-100, 100), value),
      ),
    "効果キーまたは値が不正です",
  ),
);
export const eventEffectsSchema = v.pipe(
  effectValues,
  v.check(
    (effects) =>
      Object.entries(effects).every(([key, value]) =>
        key === "delay"
          ? value === "L-01" || value === "L-02"
          : key === "income"
            ? v.is(integer(), value)
            : numericEffects.includes(key) && v.is(integer(-100, 100), value),
      ),
    "イベント効果のキーまたは値が不正です",
  ),
);
export const conditionSchema = v.strictObject({
  path: v.string(),
  op: v.picklist(["eq", "lt", "gte"]),
  value: v.union([v.string(), integer(-99999), v.boolean()]),
});
export const triggerSchema = v.pipe(
  v.strictObject({
    turns: v.pipe(v.array(integer(1, 40)), unique<number>()),
    min_turn: integer(1, 40),
    max_turn: integer(1, 40),
    cooldown: integer(1, 40),
    once: v.boolean(),
    probability: integer(0, 100),
    priority: integer(),
    group: v.string(),
    all: v.array(conditionSchema),
    any: v.array(conditionSchema),
  }),
  v.check((t) => t.min_turn <= t.max_turn, "対象期間の開始と終了が逆です"),
);
export const visualSchema = v.strictObject({
  src: v.pipe(
    v.string(),
    v.regex(/^\/assets\/[A-Za-z0-9_./-]+\.(png|jpg|jpeg|webp|gif|svg)$/),
    v.check((src) => !src.includes(".."), "画像のパスが不正です"),
  ),
  alt: v.string(),
});
export const eventSchema = v.pipe(
  v.strictObject({
    text: v.string(),
    options: v.pipe(
      v.array(
        v.strictObject({
          id: contentIdSchema,
          label: v.string(),
          cost: integer(),
          effects: eventEffectsSchema,
        }),
      ),
      v.minLength(1),
      v.check(
        (options) => new Set(options.map((o) => o.id)).size === options.length,
        "選択肢IDが重複しています",
      ),
      v.check((options) => options.some((o) => o.cost === 0), "費用0の選択肢が必要です"),
    ),
    trigger: triggerSchema,
    target: v.picklist(["study", "craft", "previous_activity", "interest"]),
    target_suffix: v.string(),
    visual: visualId,
  }),
  v.check(
    (e) =>
      !e.options.some((o) => o.effects.delay) ||
      (e.trigger.turns.length > 0
        ? e.trigger.turns.every((t) => t <= 38)
        : e.trigger.max_turn <= 38),
    "遅延効果のあるイベントは38期までです",
  ),
);
export const extraActionSchema = v.pipe(
  v.strictObject({
    label: v.string(),
    description: v.string(),
    cost: integer(),
    time: integer(0, 12),
    parent: v.picklist(["A", "B"]),
    min_turn: integer(1, 40),
    max_turn: integer(1, 40),
    target: domain,
    effects: effectsSchema,
    visual: visualId,
  }),
  v.check((a) => a.min_turn <= a.max_turn, "対象期間の開始と終了が逆です"),
);
export const scenarioSchema = v.strictObject({
  id: contentIdSchema,
  label: v.string(),
  description: v.string(),
  adaptation: integer(0, 10),
});
const scenariosSchema = v.pipe(
  v.array(scenarioSchema),
  v.check(
    (items) => new Set(items.map((s) => s.id)).size === items.length,
    "家庭IDが重複しています",
  ),
);
const difficultySchema = v.strictObject({
  label: v.string(),
  description: v.string(),
  initial_cash: integer(),
  living_cost: integer(),
});
const workSchema = v.strictObject({
  income: integer(),
  time: integer(0, 12),
  stress: integer(-100, 100),
  fulfillment: integer(-100, 100),
});
const stageSchema = v.strictObject({
  id: v.string(),
  until_age: integer(),
  care: integer(0, 6),
  cost: integer(),
  school: v.string(),
});
const stagesSchema = v.pipe(
  v.array(stageSchema),
  v.check(
    (stages) =>
      stages.map((s) => s.id).join() === "baby,preschool,primary,junior,senior,launch" &&
      stages.every((s, i) => s.until_age === [3, 6, 12, 15, 18, 100][i]),
    "年代のID・順番・境界が不正です",
  ),
);
const odditiesSchema = v.pipe(
  v.array(
    v.strictObject({
      id: contentIdSchema,
      probability: integer(0, 100),
      text: v.string(),
      income: integer(),
      cost: integer(),
      effects: effectsSchema,
      memory: v.boolean(),
    }),
  ),
  v.check(
    (items) => new Set(items.map((o) => o.id)).size === items.length,
    "珍事IDが重複しています",
  ),
  v.check(
    (items) => items.reduce((sum, o) => sum + o.probability, 0) <= 100,
    "珍事の確率合計は100%以下です",
  ),
);
// 構造と値域のスキーマ。参照先の実在等はvalidation.tsで合成後に検査する。
export const contentSchema = v.strictObject({
  decision_game: v.optional(decisionGameSchema),
  schema_version: v.literal(1),
  data_version: v.literal("data-2"),
  scenarios: v.pipe(scenariosSchema, v.minLength(1)),
  difficulties: v.strictObject({
    easy: difficultySchema,
    normal: difficultySchema,
    hard: difficultySchema,
  }),
  work: v.strictObject({ reduced: workSchema, normal: workSchema, heavy: workSchema }),
  stages: stagesSchema,
  balance: v.strictObject({
    activity_cost: v.pipe(v.array(integer()), v.length(3)),
    paid_help_cost: integer(),
    self_cost: integer(),
    time_limit: v.literal(12),
    help_care: integer(0, 6),
  }),
  oddities: odditiesSchema,
  adult: v.pipe(
    v.strictObject({
      career_low_probability: integer(0, 100),
      career_high_probability: integer(0, 100),
      distance_success_probability: integer(0, 100),
      distance_other_probability: integer(0, 100),
      health_probability: integer(0, 100),
    }),
    v.check(
      (a) => a.career_low_probability + a.career_high_probability <= 100,
      "進路の確率合計は100%以下です",
    ),
  ),
  events: dictionary(eventSchema),
  actions: dictionary(extraActionSchema),
  scenes: dictionary(v.strictObject({ title: v.string(), text: v.string(), visual: visualId })),
  visuals: dictionary(visualSchema),
  text: dictionary(v.string(), false),
});
export const contentPackSchema = v.strictObject({
  schema_version: v.literal(1),
  id: contentIdSchema,
  version: v.pipe(v.string(), v.minLength(1)),
  label: v.string(),
  requires_data: v.string(),
  dependencies: v.pipe(v.array(contentIdSchema), unique<string>()),
  scenarios: scenariosSchema,
  events: dictionary(eventSchema),
  actions: dictionary(extraActionSchema),
  visuals: dictionary(visualSchema),
});
export const settingsSchema = v.strictObject({
  difficulty: difficultyIdSchema,
  packs: v.pipe(
    v.array(v.strictObject({ id: contentIdSchema, version: v.string(), label: v.string() })),
    v.check(
      (packs) => new Set(packs.map((p) => p.id)).size === packs.length,
      "パックIDが重複しています",
    ),
  ),
  content: contentSchema,
  fingerprint: v.string(),
});
