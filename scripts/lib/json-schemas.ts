import { toJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
import {
  contentSchema,
  contentPackSchema,
  eventSchema,
  extraActionSchema,
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
        Action: extraActionSchema,
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
    "content.schema.json": convert(contentSchema, "親伝説：本編のゲーム設定"),
    "pack.schema.json": convert(contentPackSchema, "親伝説：追加シナリオパック"),
    "packs.schema.json": convert(v.array(contentPackSchema), "親伝説：追加パックの登録一覧"),
  };
}
