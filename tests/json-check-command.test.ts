import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { afterEach, expect, it } from "vite-plus/test";
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

it("関連付けの全JSONを検査し、追加ファイル・構文・型違反を行列付きで返す", async () => {
  const root = await mkdtemp(join(tmpdir(), "json check 日本語 "));
  directories.push(root);
  await mkdir(join(root, ".vscode"));
  await mkdir(join(root, "config"));
  await writeFile(
    join(root, ".vscode/settings.json"),
    JSON.stringify({ "json.schemas": [{ fileMatch: ["/config/*.json"], url: "./schema.json" }] }),
  );
  await writeFile(
    join(root, "schema.json"),
    JSON.stringify({
      type: "object",
      required: ["count"],
      properties: { count: { type: "integer", minimum: 0 } },
      additionalProperties: false,
    }),
  );
  await writeFile(join(root, "config/valid.json"), '{"count": 1}');
  const script = fileURLToPath(new URL("../scripts/check-json.ts", import.meta.url));
  const check = () =>
    JSON.parse(
      execFileSync(
        "bun",
        [
          "-e",
          `import { checkJson } from ${JSON.stringify(script)}; console.log(JSON.stringify(await checkJson(process.argv[1])));`,
          root,
        ],
        { encoding: "utf8" },
      ),
    ) as { files: number; errors: string[] };
  expect(check()).toEqual({ files: 1, errors: [] });
  await writeFile(join(root, "config/added.json"), '{"count": "wrong"}');
  expect(check().files).toBe(2);
  expect(check().errors).toEqual([expect.stringMatching(/^config\/added.json:1:\d+ /)]);
  await writeFile(join(root, "config/added.json"), '{"count":');
  expect(check().errors.length).toBeGreaterThan(0);
  await writeFile(join(root, "config/added.json"), '{"count": 2,}');
  expect(check().errors.length).toBeGreaterThan(0);
});
