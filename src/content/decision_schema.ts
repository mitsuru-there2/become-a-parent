import * as v from "valibot";
import { integer, contentIdSchema } from "../validation/primitives";
const effect = integer(-100, 100);
export const decisionOptionSchema = v.strictObject({
  id: contentIdSchema,
  label: v.string(),
  cost: integer(),
  effects: v.strictObject({
    fatigue: v.optional(effect),
    stress: v.optional(effect),
    trust: v.optional(effect),
    couple: v.optional(effect),
    child_stress: v.optional(effect),
    autonomy: v.optional(effect),
  }),
  parent: v.nullable(v.picklist(["A", "B", "both"])),
  skill: v.nullable(v.picklist(["dialogue", "planning", "learning"])),
  gain: integer(0, 20),
  domain: v.nullable(v.picklist(["study", "craft"])),
  contract: v.nullable(v.strictObject({ label: v.string(), cost: integer() })),
  end: v.nullable(v.picklist(["divorce", "separation"])),
});
export const decisionThemeSchema = v.pipe(
  v.strictObject({
    id: contentIdSchema,
    title: v.string(),
    slot: integer(-1, 2),
    min_turn: integer(1, 40),
    max_turn: integer(1, 40),
    condition: v.picklist(["always", "tired", "strained", "crisis"]),
    options: v.pipe(
      v.array(decisionOptionSchema),
      v.minLength(2),
      v.check(
        (options) =>
          new Set(options.map((o) => o.id)).size === options.length &&
          options.some((o) => o.cost === 0 && !o.end && (!o.contract || o.contract.cost === 0)),
        "重複しない選択肢と、無料で継続できる選択肢が必要です",
      ),
    ),
  }),
  v.check((t) => t.min_turn <= t.max_turn, "対象期間が逆です"),
);
export const decisionGameSchema = v.strictObject({
  themes: v.array(decisionThemeSchema),
  events: v.array(decisionThemeSchema),
  income: integer(),
  fatigue_per_turn: effect,
  stress_per_turn: effect,
  couple_per_turn: effect,
  trust_per_turn: effect,
});
export type DecisionOption = v.InferOutput<typeof decisionOptionSchema>;
export type DecisionTheme = v.InferOutput<typeof decisionThemeSchema>;
export type DecisionGame = v.InferOutput<typeof decisionGameSchema>;
