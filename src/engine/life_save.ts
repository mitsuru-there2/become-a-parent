import * as v from "valibot";
import { dictionary, integer, contentIdSchema } from "../validation/primitives";
import type { State } from "./types";
import { contentFor } from "../content/catalog";
const lifeStateSchema = v.strictObject({
  policies: dictionary(contentIdSchema),
  history: dictionary(
    v.strictObject({
      first_turn: integer(1, 40),
      last_turn: integer(1, 40),
      count: integer(1, 40),
    }),
    false,
  ),
  visible: v.array(v.string()),
  fresh: v.array(contentIdSchema),
  notices: v.array(v.string()),
});
export function validateLifeState(state: State) {
  if (!v.is(lifeStateSchema, state.life)) throw new Error("生活状態の構造が不正です");
  const nodes = contentFor(state).life_game!.decisions;
  const policies = nodes.filter((d) => d.kind === "policy");
  if (
    Object.keys(state.life.policies).length !== policies.length ||
    policies.some((d) => !d.options.some((o) => o.id === state.life!.policies[d.id]))
  )
    throw new Error("生活方針が不正です");
  const optionIds = new Set(nodes.flatMap((d) => d.options.map((o) => `${d.id}:${o.id}`)));
  if (
    state.life.visible.some((id) => !optionIds.has(id)) ||
    state.life.fresh.some((id) => !nodes.some((d) => d.id === id))
  )
    throw new Error("表示した判断が不正です");
  for (const [id, history] of Object.entries(state.life.history))
    if (
      !optionIds.has(id) ||
      history.first_turn > history.last_turn ||
      history.last_turn > state.n ||
      history.count > history.last_turn - history.first_turn + 1
    )
      throw new Error("判断履歴が不正です");
  for (const [instance, option] of Object.entries(state.decisions!.selections)) {
    if (
      !optionIds.has(option) ||
      instance !== `t${String(state.n + 1).padStart(2, "0")}:${option.split(":")[0]}`
    )
      // 最終期に確定した予定は旧方式と同様に終了snapshotへ残す。
      if (
        !(
          state.phase !== "childhood" &&
          optionIds.has(option) &&
          instance === `t${String(state.n).padStart(2, "0")}:${option.split(":")[0]}`
        )
      )
        throw new Error("保存された予定が不正です");
  }
}
