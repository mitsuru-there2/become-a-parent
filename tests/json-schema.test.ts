import eventsJsonSchema from "../config/schemas/events.schema.json";
import events from "../config/events.json";
import { describe, it, expect } from "vite-plus/test";
import { getLanguageService, TextDocument } from "vscode-json-languageservice";
import base from "../config/base.json";
import legacy from "../config/legacy-data-1.json";
import sample from "../config/examples/community.json";
import associations from "../.vscode/settings.json";
import contentJsonSchema from "../config/schemas/content.schema.json";
import packJsonSchema from "../config/schemas/pack.schema.json";
import packsJsonSchema from "../config/schemas/packs.schema.json";
import { clone } from "../src/engine/shared";
import { generateJsonSchemas } from "../scripts/lib/json-schemas";

const generated = {
  "events.schema.json": eventsJsonSchema,
  "content.schema.json": contentJsonSchema,
  "pack.schema.json": packJsonSchema,
  "packs.schema.json": packsJsonSchema,
};
function service() {
  const language = getLanguageService({});
  language.configure({
    validate: true,
    schemas: associations["json.schemas"].map(({ fileMatch, url }) => ({
      fileMatch,
      uri: "file:///workspace/" + url.slice(2),
      schema: generated[url.split("/").at(-1)! as keyof typeof generated],
    })),
  });
  return language;
}
const document = (path: string, value: unknown) =>
  TextDocument.create("file:///workspace/" + path, "json", 1, JSON.stringify(value, null, 2));
describe("JSONファイルの補完と検査", () => {
  it("生成ファイルがValibotスキーマと一致する", () => {
    expect(generated).toEqual(generateJsonSchemas());
  });
  it("ファイル関連付けを使い本編・互換データ・追加パックを検査する", async () => {
    const language = service();
    for (const [path, value] of [
      ["config/base.json", base],
      ["config/events.json", events],
      ["config/legacy-data-1.json", legacy],
      ["config/examples/community.json", sample],
      ["config/packs.json", [sample]],
    ] as const) {
      const doc = document(path, value);
      expect(await language.doValidation(doc, language.parseJSONDocument(doc))).toEqual([]);
    }
  });
  it("数値の型・確率範囲・未知キー・必須項目をエディタで診断する", async () => {
    const language = service();
    for (const change of [
      (value: typeof base) => {
        value.events["E-01"].options[0].cost = "4" as never;
      },
      (value: typeof base) => {
        value.events["E-01"].trigger.probability = 101;
      },
      (value: typeof base) => {
        Object.assign(value.events["E-01"], { unknown: true });
      },
      (value: typeof base) => {
        Reflect.deleteProperty(value.events["E-01"], "text");
      },
    ]) {
      const value = clone(base);
      change(value);
      const doc = document("config/base.json", value);
      expect(
        (await language.doValidation(doc, language.parseJSONDocument(doc))).length,
      ).toBeGreaterThan(0);
    }
    const doc = document("config/packs.json", sample);
    expect(
      (await language.doValidation(doc, language.parseJSONDocument(doc))).length,
    ).toBeGreaterThan(0);
  });
  it("項目名と列挙値の補完を返す", async () => {
    const language = service();
    const text = '{"events":{"E-01":{"target":""}}}';
    const doc = TextDocument.create("file:///workspace/config/base.json", "json", 1, text);
    const completion = await language.doComplete(
      doc,
      doc.positionAt(text.indexOf('"target":"') + '"target":"'.length),
      language.parseJSONDocument(doc),
    );
    expect(completion!.items.map((item) => item.label)).toEqual(
      expect.arrayContaining(['"study"', '"craft"', '"previous_activity"', '"interest"']),
    );
    const empty = document("config/base.json", {});
    const fields = await language.doComplete(
      empty,
      empty.positionAt(1),
      language.parseJSONDocument(empty),
    );
    expect(fields!.items.map((item) => item.label)).toContain("difficulties");
  });
});
