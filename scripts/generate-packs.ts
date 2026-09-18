import { readdir, readFile, writeFile } from "node:fs/promises";
const dirs = (await readdir("config/packs", { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const lines = [
  "// scripts/generate-packs.tsで自動生成。config/packs/<id>/の3つのJSONを編集してください。",
];
for (const [i, dir] of dirs.entries()) {
  if (!/^[a-zA-Z0-9_-]+$/.test(dir)) throw new Error(`パックのディレクトリ名が不正です: ${dir}`);
  const manifest = JSON.parse(await readFile(`config/packs/${dir}/manifest.json`, "utf8"));
  if (manifest.id !== dir || "automatic_events" in manifest || "decisions" in manifest)
    throw new Error(
      `manifestのIDはフォルダ名と一致させ、イベントと判断は別ファイルに置いてください: ${dir}`,
    );
  for (const name of ["manifest", "events", "decisions"]) {
    await readFile(`config/packs/${dir}/${name}.json`, "utf8");
    lines.push(`import ${name}${i} from "../../config/packs/${dir}/${name}.json";`);
  }
}
lines.push(
  "export default [",
  ...dirs.map(
    (_, i) =>
      `  {\n    ...manifest${i},\n    automatic_events: events${i},\n    decisions: decisions${i},\n  },`,
  ),
  "];",
  "",
);
const output = lines.join("\n");
const path = "src/content/packs.gen.ts";
if (process.argv.includes("--check")) {
  if ((await readFile(path, "utf8").catch(() => "")) !== output)
    throw new Error("パック一覧を bun run packs:generate で更新してください");
} else await writeFile(path, output);
