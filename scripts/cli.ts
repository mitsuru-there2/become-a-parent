import { Service, exportRun, importRun, type Request } from "../src/service/service";
import { FileRepository } from "../src/storage/file";
import { Failure } from "../src/service/contract";
import { createInterface } from "node:readline";
const argv = process.argv.slice(2),
  command = argv.shift();
const flags: Record<string, string> = {};
for (let i = 0; i < argv.length; i += 2) {
  if (!argv[i].startsWith("--") || argv[i + 1] === undefined) {
    console.error("引数は --名前 値 で指定します。");
    process.exit(2);
  }
  flags[argv[i].slice(2).replaceAll("-", "_")] = argv[i + 1];
}
const repo = new FileRepository(flags.dir ?? ".saves"),
  service = new Service(repo);
if (!command || command === "--help") {
  console.log(
    "親伝説 — Become a Parent\nbun run cli <command> --run ID [--dir .saves] [--revision N --request-id ID --input JSON]\ncommands: scenarios new observe actions forecast plan choose reset-plan advance history result replay debug-state serve export import\nnew: --scenario home-01 --seed 0 --request-id start\nserve: JSON Linesで共通の公開操作を実行\nexport/import: --run ID --file PATH（importはファイル内のIDを使用）",
  );
  process.exit(0);
}
const exitCode = (code: string) =>
  ["INVALID_INPUT", "UNKNOWN_COMMAND", "UNKNOWN_ACTION"].includes(code)
    ? 2
    : ["RESOURCE_LIMIT", "ANSWER_REQUIRED", "FINISHED", "NOT_FINISHED"].includes(code)
      ? 3
      : ["STALE_REVISION", "REQUEST_ID_CONFLICT", "RUN_EXISTS", "RUN_LOCKED"].includes(code)
        ? 4
        : code === "REPLAY_MISMATCH"
          ? 6
          : 5;
async function execute(req: Request) {
  const response = await service.execute(req);
  return { response, exit_code: response.ok ? 0 : exitCode(response.error!.code) };
}
try {
  if (command === "serve") {
    const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
    for await (const line of lines) {
      try {
        if (Buffer.byteLength(line) > 65536) throw new Error("要求は64KiBまでです");
        console.log(JSON.stringify(await execute(JSON.parse(line))));
      } catch {
        console.log(
          JSON.stringify({
            response: {
              ok: false,
              error: { code: "INVALID_INPUT", message: "有効なJSON要求が必要です" },
            },
            exit_code: 2,
          }),
        );
      }
    }
  } else if (command === "export") {
    const run = await repo.read(flags.run);
    if (!run) throw new Error("保存が見つかりません");
    await Bun.write(flags.file, exportRun(run));
    console.log(JSON.stringify({ ok: true, file: flags.file }));
  } else if (command === "import") {
    const run = importRun(await Bun.file(flags.file).text());
    await repo.transact(run.id, (existing) => {
      if (existing) throw new Failure("RUN_EXISTS", "既存保存は上書きできません");
      return { run, value: null };
    });
    console.log(JSON.stringify({ ok: true, run_id: run.id }));
  } else {
    const req: Record<string, unknown> = { command };
    for (const [key, value] of Object.entries(flags)) {
      if (key === "dir") continue;
      req[key] = ["seed", "revision", "offset", "limit"].includes(key)
        ? Number(value)
        : key === "input"
          ? JSON.parse(value)
          : value;
    }
    const result = await execute(req as unknown as Request);
    console.log(JSON.stringify(result.response));
    process.exitCode = result.exit_code;
  }
} catch (e) {
  console.log(
    JSON.stringify({
      ok: false,
      error: {
        code: e instanceof Failure ? e.code : "INVALID_INPUT",
        message: e instanceof Error ? e.message : String(e),
      },
    }),
  );
  process.exitCode = 2;
}
