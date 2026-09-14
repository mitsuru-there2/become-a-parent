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
export function bounded(v: unknown, lo: number, hi: number, path: string): asserts v is number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < lo || v > hi)
    invalid(`${lo}〜${hi}の整数が必要です`, path);
}
export function object(v: unknown): asserts v is Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) invalid("オブジェクトが必要です");
}
export function requestId(v: unknown): asserts v is string {
  if (typeof v !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(v))
    invalid("IDは英数字・下線・ハイフンの1〜64文字です", "request_id");
}
export function mergePlan(plan: Plan, patch: unknown): Plan {
  const walk = (obj: unknown, allowed: string[], path: string) => {
    object(obj);
    if (!Object.keys(obj).length) invalid("空の編集はできません", path);
    for (const [k, v] of Object.entries(obj)) {
      const loc = path ? path + "." + k : k;
      if (!allowed.includes(k)) invalid("未知の項目です", loc);
      if (k === "parents") walk(v, ["A", "B"], loc);
      else if (k === "A" || k === "B") walk(v, ["work", "care", "bond", "rest", "self"], loc);
      else if (k === "activity") walk(v, ["domain", "level", "sponsor"], loc);
      else if (ENUMS[k]) {
        if (typeof v !== "string" || !ENUMS[k].includes(v)) invalid("選択値が不正です", loc);
      } else bounded(v, ...RANGES[k], loc);
    }
  };
  walk(patch, ["parents", "activity", "style", "help"], "");
  const result = clone(plan);
  const merge = (dst: Record<string, unknown>, src: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(src)) {
      if (v && typeof v === "object")
        merge(dst[k] as Record<string, unknown>, v as Record<string, unknown>);
      else dst[k] = v;
    }
  };
  merge(result as unknown as Record<string, unknown>, patch as Record<string, unknown>);
  if ((result.activity.domain === "none") !== (result.activity.level === 0))
    invalid("活動なしは強度0、活動ありは強度1か2です", "activity");
  return result;
}
export function validateChoice(
  v: unknown,
): asserts v is { event_instance: string; option_id: string } {
  object(v);
  if (
    Object.keys(v).sort().join(",") !== "event_instance,option_id" ||
    typeof v.event_instance !== "string" ||
    typeof v.option_id !== "string"
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
export function actions(choices: Choice[]) {
  const paths = ["A", "B"]
    .flatMap((p) => ["work", "care", "bond", "rest", "self"].map((k) => `parents.${p}.${k}`))
    .concat(["activity.domain", "activity.level", "activity.sponsor", "style", "help"]);
  return {
    commands: COMMANDS.map((id) => ({
      id,
      required_args:
        id === "scenarios"
          ? []
          : id === "new"
            ? ["run", "scenario", "seed", "request_id"]
            : (UPDATES as readonly string[]).includes(id)
              ? [
                  "run",
                  "revision",
                  "request_id",
                  ...(["plan", "choose"].includes(id) ? ["input"] : []),
                ]
              : ["run"],
    })),
    plan_fields: paths.map((path) => {
      const k = path.split(".").at(-1)!;
      return {
        path,
        type: ENUMS[k] ? "string" : "integer",
        enum: ENUMS[k] ?? null,
        min: RANGES[k]?.[0] ?? null,
        max: RANGES[k]?.[1] ?? null,
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
