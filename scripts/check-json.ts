import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getLanguageService, TextDocument, type JSONSchema } from "vscode-json-languageservice";
import type associations from "../.vscode/settings.json";

/** エディタと同じ関連付けでJSON本体を検査する。スキーマの取得はローカルだけ。 */
export async function checkJson(root = fileURLToPath(new URL("../", import.meta.url))) {
  const settings: typeof associations = await Bun.file(
    resolve(root, ".vscode/settings.json"),
  ).json();
  const language = getLanguageService({});
  const schemas = await Promise.all(
    settings["json.schemas"].map(async ({ url, fileMatch }) => ({
      uri: pathToFileURL(resolve(root, url)).href,
      fileMatch,
      schema: (await Bun.file(resolve(root, url)).json()) as JSONSchema,
    })),
  );
  language.configure({ validate: true, schemas });
  const files = new Set<string>();
  for (const { fileMatch } of settings["json.schemas"]) {
    for (const pattern of fileMatch) {
      const matches = Array.from(
        new Bun.Glob(pattern.replace(/^\//, "")).scanSync({ cwd: root, onlyFiles: true }),
      );
      if (!matches.length) throw new Error(`JSONの検査対象がありません: ${pattern}`);
      for (const file of matches) files.add(file);
    }
  }
  const errors: string[] = [];
  for (const file of [...files].sort()) {
    const path = resolve(root, file);
    const document = TextDocument.create(
      pathToFileURL(path).href,
      "json",
      1,
      await Bun.file(path).text(),
    );
    const diagnostics = await language.doValidation(
      document,
      language.parseJSONDocument(document),
      {
        comments: "error",
        trailingCommas: "error",
        schemaValidation: "error",
      },
    );
    for (const diagnostic of diagnostics) {
      const { line, character } = diagnostic.range.start;
      const message =
        typeof diagnostic.message === "string" ? diagnostic.message : diagnostic.message.value;
      errors.push(`${file}:${line + 1}:${character + 1} ${message}`);
    }
  }
  return { files: files.size, errors };
}

if (import.meta.main) {
  const result = await checkJson();
  if (result.errors.length) {
    console.error(result.errors.join("\n"));
    process.exitCode = 1;
  } else console.log(`JSON Schema検査: ${result.files}ファイル成功`);
}
