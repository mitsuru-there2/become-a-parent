import type { Plan, Choice } from "../engine/types";
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
export const ENUMS: Record<string, string[]> = {
  work: ["reduced", "normal", "heavy"],
  domain: ["none", "study", "craft"],
  sponsor: ["A", "B"],
  style: ["respect", "coach", "push"],
  help: ["none", "grand", "paid"],
};
export const RANGES: Record<string, [number, number]> = {
  care: [0, 6],
  bond: [0, 2],
  rest: [0, 3],
  self: [0, 2],
  level: [0, 2],
};
export function bounded(
  value: unknown,
  minimum: number,
  maximum: number,
  path: string,
): asserts value is number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum)
    invalid(`${minimum}〜${maximum}の整数が必要です`, path);
}
export function object(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    invalid("オブジェクトが必要です");
}
export function requestId(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(value))
    invalid("IDは英数字・下線・ハイフンの1〜64文字です", "request_id");
}
export function mergePlan(plan: Plan, patch: unknown): Plan {
  const validatePatch = (candidate: unknown, allowed: string[], path: string) => {
    object(candidate);
    if (!Object.keys(candidate).length) invalid("空の編集はできません", path);
    for (const [key, value] of Object.entries(candidate)) {
      const fieldPath = path ? path + "." + key : key;
      if (!allowed.includes(key)) invalid("未知の項目です", fieldPath);
      switch (key) {
        case "parents":
          validatePatch(value, ["A", "B"], fieldPath);
          break;
        case "A":
        case "B":
          validatePatch(value, ["work", "care", "bond", "rest", "self"], fieldPath);
          break;
        case "activity":
          validatePatch(value, ["domain", "level", "sponsor"], fieldPath);
          break;
        default:
          if (ENUMS[key]) {
            if (typeof value !== "string" || !ENUMS[key].includes(value))
              invalid("選択値が不正です", fieldPath);
          } else bounded(value, ...RANGES[key], fieldPath);
      }
    }
  };
  validatePatch(patch, ["parents", "activity", "style", "help"], "");
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
    invalid("活動なしは強度0、活動ありは強度1か2です", "activity");
  return result;
}
export function validateChoice(
  value: unknown,
): asserts value is { event_instance: string; option_id: string } {
  object(value);
  if (
    Object.keys(value).sort().join(",") !== "event_instance,option_id" ||
    typeof value.event_instance !== "string" ||
    typeof value.option_id !== "string"
  )
    invalid("event_instanceとoption_idの2文字列が必要です");
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

export function actions(choices: Choice[]) {
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
      return {
        path,
        type: ENUMS[key] ? "string" : "integer",
        enum: ENUMS[key] ?? null,
        min: RANGES[key]?.[0] ?? null,
        max: RANGES[key]?.[1] ?? null,
      };
    }),
    input_examples: {
      plan: { parents: { A: { rest: 2 } } },
      choose: choices[0]
        ? { event_instance: choices[0].instance_id, option_id: choices[0].options[0].option_id }
        : null,
    },
  };
}
