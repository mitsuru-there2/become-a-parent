import { lifeGameSchema, lifeDecisionsSchema } from "../../src/content/life_schema";
import { decisionGameSchema } from "../../src/content/decision_schema";
import { automaticEventsSchema } from "../../src/content/automatic_event_schema";
import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
import {
  contentSchema,
  contentPackSchema,
  eventSchema,
  extraSelectionSchema,
  visualSchema,
  scenarioSchema,
} from "../../src/content/schemas";

export function generateJsonSchemas() {
  const convert = (schema: v.GenericSchema, title: string) => ({
    ...toJsonSchema(schema, {
      target: "draft-07",
      // 辞書のunknown→record検査では、最後のrecordがJSONの構造を表す。
      typeMode: "output",
      // 関数による独自checkはJSON Schemaへ移せない。その他の変換失敗はエラーにする。
      overrideAction: ({ valibotAction, jsonSchema }) =>
        valibotAction.type === "check" ? jsonSchema : undefined,
      definitions: {
        Event: eventSchema,
        Selection: extraSelectionSchema,
        Visual: visualSchema,
        Scenario: scenarioSchema,
      },
    }),
    title,
    description:
      "Valibotから自動生成。参照・依存・独自条件の検査には bun run check:content を実行してください。",
    $comment:
      "生成元: src/content/schemas.ts。変更後は bun run schema:generate。手で編集しないでください。",
  });
  return {
    "decisions.schema.json": convert(lifeGameSchema, "親伝説：生活メニューと分岐"),
    "decision-pack.schema.json": convert(lifeDecisionsSchema, "親伝説：追加ディシジョン"),
    "legacy-decisions.schema.json": convert(decisionGameSchema, "親伝説：旧判断の互換設定"),
    "events.schema.json": convert(automaticEventsSchema, "親伝説：自動イベント"),
    "content.schema.json": convert(contentSchema, "親伝説：本編のゲーム設定"),
    "pack.schema.json": convert(contentPackSchema, "親伝説：追加シナリオパック"),
    "packs.schema.json": convert(v.array(contentPackSchema), "親伝説：追加パックの登録一覧"),
  };
}
