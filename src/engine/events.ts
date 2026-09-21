import type { State } from "./types";
import type { Condition } from "../content/types";
import { contentFor } from "../content/catalog";
export function matches(state: State, c: Condition) {
  let value: unknown = state;
  for (const key of c.path.split(".")) value = (value as Record<string, unknown>)?.[key];
  if (c.path.endsWith(".extra_selection")) value ??= "none";
  return c.op === "eq"
    ? value === c.value
    : c.op === "lt"
      ? Number(value) < Number(c.value)
      : Number(value) >= Number(c.value);
}
export const findEventOption = (state: State, eventId: string, optionId: string) =>
  contentFor(state).events[eventId].options.find(
    (option) => `${eventId}:${option.id}` === optionId,
  )!;
