import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { generateJsonSchemas } from "./lib/json-schemas";
import { canonical } from "../src/engine/shared";
const check = process.argv.includes("--check");
const directory = fileURLToPath(new URL("../config/schemas/", import.meta.url));
if (!check) await mkdir(directory, { recursive: true });
for (const [name, schema] of Object.entries(generateJsonSchemas())) {
  const file = Bun.file(`${directory}/${name}`);
  if (check) {
    if (!(await file.exists()) || canonical(await file.json()) !== canonical(schema)) {
      throw new Error(
        `${name}が生成元と一致しません。bun run schema:generate を実行してください。`,
      );
    }
  } else await Bun.write(file, JSON.stringify(schema, null, 2) + "\n");
}
console.log(check ? "JSON Schemaは生成元と一致しています。" : "JSON Schemaを生成しました。");
