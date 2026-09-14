import * as v from "valibot";
import { integer } from "../validation/primitives";
// 公開actionsの選択肢・値域にも同じ定義を使う。
export const ENUMS = {
  work: ["reduced", "normal", "heavy"],
  domain: ["none", "study", "craft"],
  sponsor: ["A", "B"],
  style: ["respect", "coach", "push"],
  help: ["none", "grand", "paid"],
} as const;
export const RANGES = {
  care: [0, 6],
  bond: [0, 2],
  rest: [0, 3],
  self: [0, 2],
  level: [0, 2],
} as const;
const nonemptyPatch = <T extends v.ObjectEntries>(entries: T) =>
  v.pipe(
    v.partial(v.strictObject(entries)),
    v.check(
      (value) =>
        Object.keys(value).length > 0 && Object.values(value).every((item) => item !== undefined),
      "空の編集や未定義の値は指定できません",
    ),
  );
const allocationPatch = nonemptyPatch({
  work: v.picklist(ENUMS.work),
  care: integer(...RANGES.care),
  bond: integer(...RANGES.bond),
  rest: integer(...RANGES.rest),
  self: integer(...RANGES.self),
});
export const planPatchSchema = (extraIds: string[]) =>
  nonemptyPatch({
    parents: nonemptyPatch({ A: allocationPatch, B: allocationPatch }),
    activity: nonemptyPatch({
      domain: v.picklist(ENUMS.domain),
      level: integer(...RANGES.level),
      sponsor: v.picklist(ENUMS.sponsor),
    }),
    style: v.picklist(ENUMS.style),
    help: v.picklist(ENUMS.help),
    extra_action: v.picklist(["none", ...extraIds]),
  });
export const choiceSchema = v.strictObject({ event_instance: v.string(), option_id: v.string() });
