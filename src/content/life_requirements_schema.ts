import * as v from "valibot";
import { contentIdSchema, integer } from "../validation/primitives";
import { eventConditionSchema } from "./stat_schema";
export const lifeRequirementSchema = v.strictObject({
  history: v.optional(
    v.array(
      v.strictObject({ decision: contentIdSchema, option: contentIdSchema, after: integer(0, 40) }),
    ),
  ),
  policies: v.optional(
    v.array(v.strictObject({ decision: contentIdSchema, option: contentIdSchema })),
  ),
  stats: v.optional(v.array(eventConditionSchema)),
});
export type LifeRequirement = v.InferOutput<typeof lifeRequirementSchema>;
