import type { InferOutput } from "valibot";
import type {
  difficultyIdSchema,
  conditionSchema,
  triggerSchema,
  eventEffectsSchema,
  visualSchema,
  eventSchema,
  extraActionSchema,
  scenarioSchema,
  contentSchema,
  contentPackSchema,
  settingsSchema,
} from "./schemas";
export type DifficultyId = InferOutput<typeof difficultyIdSchema>;
export type Condition = InferOutput<typeof conditionSchema>;
export type Trigger = InferOutput<typeof triggerSchema>;
export type Effects = InferOutput<typeof eventEffectsSchema>;
export type Visual = InferOutput<typeof visualSchema>;
export type EventDefinition = InferOutput<typeof eventSchema>;
export type ExtraAction = InferOutput<typeof extraActionSchema>;
export type Scenario = InferOutput<typeof scenarioSchema>;
export type Content = InferOutput<typeof contentSchema>;
export type ContentPack = InferOutput<typeof contentPackSchema>;
export type Settings = InferOutput<typeof settingsSchema>;
