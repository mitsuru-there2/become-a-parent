import type { State } from "./types";
import type { Condition } from "../content/types";
import { contentFor } from "../content/catalog";
export function matches(state: State, c: Condition) {
  let value: unknown = state;
  for (const key of c.path.split(".")) value = (value as Record<string, unknown>)?.[key];
  if (c.path.endsWith(".extra_selection")) value ??= "none";
  const legacyFamilyThreshold =
    state.versions.rules === "rules-14" &&
    /^(parents\.[AB]\.(stress|health|fulfillment|social|regret)|decisions\.fatigue\.[AB]|couple|grandparents\.(health|relation))$/.test(
      c.path,
    );
  const target = legacyFamilyThreshold && typeof c.value === "number" ? c.value * 10 : c.value;
  return c.op === "eq"
    ? value === target
    : c.op === "lt"
      ? Number(value) < Number(target)
      : Number(value) >= Number(target);
}
export const findEventOption = (state: State, eventId: string, optionId: string) =>
  contentFor(state).events[eventId].options.find(
    (option) => `${eventId}:${option.id}` === optionId,
  )!;
