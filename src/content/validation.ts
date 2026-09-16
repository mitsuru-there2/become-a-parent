import * as v from "valibot";
import legacyData from "../../config/legacy-data-1.json";
import type { Content, ContentPack, Condition, Settings } from "./types";
import { contentSchema, contentPackSchema, settingsSchema } from "./schemas";
import { canonical, hash } from "../engine/shared";
import { integer } from "../validation/primitives";
export class ContentError extends Error {}
function ensure(ok: unknown, path: string): asserts ok {
  if (!ok) throw new ContentError(`設定が不正です: ${path}`);
}
function validateShape<T extends v.GenericSchema>(
  schema: T,
  value: unknown,
): asserts value is v.InferOutput<T> {
  const result = v.safeParse(schema, value, { abortEarly: true });
  if (!result.success) {
    const issue = result.issues[0];
    throw new ContentError(
      `設定が不正です: ${v.getDotPath(issue) ?? "content"} (${issue.message})`,
    );
  }
}
const numericConditionPaths = [
  "cash",
  "n",
  "couple",
  "child.stress",
  "child.autonomy",
  "grandparents.health",
  "grandparents.relation",
  "grandparents.funds",
  ...["A", "B"].flatMap((p) => [
    `child.trust.${p}`,
    ...["stress", "health", "fulfillment", "social", "regret"].map((k) => `parents.${p}.${k}`),
  ]),
  ...["study", "craft"].flatMap((d) => [`child.interest.${d}`, `child.ability.${d}`]),
];
function condition(c: Condition, content: Content) {
  if (numericConditionPaths.includes(c.path)) ensure(v.is(integer(-99999), c.value), c.path);
  else if (c.path === "grandparents.network")
    ensure(c.op === "eq" && typeof c.value === "boolean", c.path);
  else if (["plan.extra_action", "previous_plan.extra_action"].includes(c.path))
    ensure(
      c.op === "eq" &&
        typeof c.value === "string" &&
        (c.value === "none" || Object.hasOwn(content.actions, c.value)),
      c.path,
    );
  else ensure(false, c.path);
}
// 型検査後に、パック合成やゲーム規則に依存する参照整合性を検査する。
function references(c: Content) {
  if (
    c.automatic_events?.some((e) =>
      [...e.conditions, ...e.modifiers.map((m) => m.condition), ...e.effects].some((item) =>
        item.path.startsWith("grandparents.members."),
      ),
    )
  )
    ensure(c.decision_game?.initial_grandparents, "decision_game.initial_grandparents");
  if (c.decision_game) {
    const game = c.decision_game;
    ensure(
      new Set([...game.themes, ...game.events].map((t) => t.id)).size ===
        game.themes.length + game.events.length,
      "decision_game.ids",
    );
    ensure(
      game.themes.every((t) => t.slot >= 0 && t.options.every((o) => !o.end)) &&
        game.events.every((t) => t.slot === -1),
      "decision_game.slots",
    );
    for (let turn = 1; turn <= 40; turn++) {
      for (const slot of [-1, 0, 1, 2]) {
        const pool = slot < 0 ? game.events : game.themes;
        ensure(
          pool.some(
            (t) =>
              t.slot === slot &&
              t.condition === "always" &&
              t.min_turn <= turn &&
              t.max_turn >= turn,
          ),
          `decision_game.coverage.${turn}.${slot}`,
        );
      }
    }
    ensure(
      game.income >=
        Math.max(...Object.values(c.difficulties).map((d) => d.living_cost)) +
          Math.max(...c.stages.map((s) => s.cost)),
      "decision_game.income",
    );
  }
  const visual = (id: string | null) => id === null || Object.hasOwn(c.visuals, id);
  for (const [id, action] of Object.entries(c.actions))
    ensure(visual(action.visual), `actions.${id}.visual`);
  for (const [id, event] of Object.entries(c.events)) {
    ensure(visual(event.visual), `events.${id}.visual`);
    [...event.trigger.all, ...event.trigger.any].forEach((value) => condition(value, c));
  }
  for (const oddity of c.oddities)
    ensure(!Object.hasOwn(c.events, oddity.id), `oddities.${oddity.id}`);
  ensure(
    Object.keys(legacyData.text).every((key) => Object.hasOwn(c.text, key)),
    "text",
  );
  ensure(Object.hasOwn(c.visuals, "hero"), "visuals.hero");
  ensure(
    c.stages.every((stage) => Object.hasOwn(c.scenes, stage.id)),
    "scenes",
  );
  for (const [id, scene] of Object.entries(c.scenes))
    ensure(visual(scene.visual), `scenes.${id}.visual`);
}
export function validateContent(value: unknown): asserts value is Content {
  validateShape(contentSchema, value);
  references(value);
}
export function validatePack(value: unknown): asserts value is ContentPack {
  validateShape(contentPackSchema, value);
}
export function validateSettings(value: unknown): asserts value is Settings {
  validateShape(settingsSchema, value);
  references(value.content);
  const { fingerprint, ...data } = value;
  ensure(fingerprint === hash(canonical(data)), "settings.fingerprint");
}
