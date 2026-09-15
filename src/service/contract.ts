import * as v from "valibot";
import { integer, requestIdSchema } from "../validation/primitives";
import { ENUMS, RANGES, planPatchSchema, choiceSchema } from "./schemas";
export { ENUMS, RANGES } from "./schemas";
import type { Plan, Choice, PublicState } from "../engine/types";
import { clone } from "../engine/shared";
export class Failure extends Error {
  constructor(
    public code: string,
    message: string,
    public details: { path: string; reason: string }[] = [],
  ) {
    super(message);
  }
}
export const invalid = (message: string, path = "input"): never => {
  throw new Failure("INVALID_INPUT", message, [{ path, reason: message }]);
};
export function bounded(
  value: unknown,
  minimum: number,
  maximum: number,
  path: string,
): asserts value is number {
  if (!v.is(integer(minimum, maximum), value))
    invalid(`${minimum}〜${maximum}の整数が必要です`, path);
}
export function object(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    invalid("オブジェクトが必要です");
}
export function requestId(value: unknown): asserts value is string {
  if (!v.is(requestIdSchema, value))
    invalid("IDは英数字・下線・ハイフンの1〜64文字です", "request_id");
}
export function mergePlan(plan: Plan, patch: unknown, extraIds: string[] = []): Plan {
  const parsed = v.safeParse(planPatchSchema(extraIds), patch, { abortEarly: true });
  if (!parsed.success) {
    const issue = parsed.issues[0];
    invalid(`編集内容が不正です: ${issue.message}`, v.getDotPath(issue) ?? "input");
  }
  const result = clone(plan);
  const mergeFields = (destination: Record<string, unknown>, source: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(source)) {
      if (value && typeof value === "object")
        mergeFields(destination[key] as Record<string, unknown>, value as Record<string, unknown>);
      else destination[key] = value;
    }
  };
  mergeFields(result as unknown as Record<string, unknown>, patch as Record<string, unknown>);
  if ((result.activity.domain === "none") !== (result.activity.level === 0))
    invalid(
      "活動を「なし」にする場合は取り組み方を0、活動を選ぶ場合は1か2にしてください",
      "activity",
    );
  return result;
}
export function validateChoice(
  value: unknown,
): asserts value is { event_instance: string; option_id: string } {
  if (!v.is(choiceSchema, value)) invalid("event_instanceとoption_idの2文字列が必要です");
}
export const UPDATES = ["plan", "choose", "reset-plan", "advance"] as const;
export const COMMANDS = [
  "new",
  "scenarios",
  "observe",
  "actions",
  "forecast",
  "plan",
  "choose",
  "reset-plan",
  "advance",
  "history",
  "result",
  "replay",
  "debug-state",
] as const;
export type Command = (typeof COMMANDS)[number];
function requiredArguments(command: Command): string[] {
  switch (command) {
    case "scenarios":
      return [];
    case "new":
      return ["run", "scenario", "seed", "request_id"];
    case "plan":
    case "choose":
      return ["run", "revision", "request_id", "input"];
    case "reset-plan":
    case "advance":
      return ["run", "revision", "request_id"];
    default:
      return ["run"];
  }
}

export function actions(choices: Choice[], extraActions: PublicState["extra_actions"] = []) {
  const paths = ["A", "B"]
    .flatMap((parentId) =>
      ["work", "care", "bond", "rest", "self"].map((key) => `parents.${parentId}.${key}`),
    )
    .concat(["activity.domain", "activity.level", "activity.sponsor", "style", "help"]);
  return {
    commands: COMMANDS.map((id) => ({
      id,
      required_args: requiredArguments(id),
    })),
    plan_fields: paths.map((path) => {
      const key = path.split(".").at(-1)!;
      const enums = ENUMS as Record<string, readonly string[]>;
      const ranges = RANGES as Record<string, readonly [number, number]>;
      return {
        path,
        type: enums[key] ? "string" : "integer",
        enum: enums[key] ?? null,
        min: ranges[key]?.[0] ?? null,
        max: ranges[key]?.[1] ?? null,
      };
    }),
    extra_actions: extraActions,
    input_examples: {
      plan: { parents: { A: { rest: 2 } } },
      choose: choices[0]
        ? { event_instance: choices[0].instance_id, option_id: choices[0].options[0].option_id }
        : null,
    },
  };
}
