import { Service, exportRun, importRun, type Request } from "../src/service/service";
import { FileRepository } from "../src/storage/file";
import { Failure } from "../src/service/contract";
import { createInterface } from "node:readline";
const argv = process.argv.slice(2);
const command = argv.shift();
const flags: Record<string, string> = {};
for (let index = 0; index < argv.length; index += 2) {
  if (!argv[index].startsWith("--") || argv[index + 1] === undefined) {
    console.error("引数は --名前 値 で指定します。");
    process.exit(2);
  }
  flags[argv[index].slice(2).replaceAll("-", "_")] = argv[index + 1];
}
const repository = new FileRepository(flags.dir ?? ".saves");
const service = new Service(repository);
if (!command || command === "--help") {
  console.log(
    "親伝説 — Become a Parent\nbun run cli <command> --run ID [--dir .saves] [--revision N --request-id ID --input JSON]\ncommands: scenarios new observe actions forecast plan choose reset-plan advance history result replay debug-state serve export import\nnew: --scenario home-01 --seed 0 --request-id start\nserve: JSON Linesで共通の公開操作を実行\nexport/import: --run ID --file PATH（importはファイル内のIDを使用）",
  );
  process.exit(0);
}
function exitCode(code: string) {
  switch (code) {
    case "INVALID_INPUT":
    case "UNKNOWN_COMMAND":
    case "UNKNOWN_ACTION":
      return 2;
    case "RESOURCE_LIMIT":
    case "ANSWER_REQUIRED":
    case "FINISHED":
    case "NOT_FINISHED":
      return 3;
    case "STALE_REVISION":
    case "REQUEST_ID_CONFLICT":
    case "RUN_EXISTS":
    case "RUN_LOCKED":
      return 4;
    case "REPLAY_MISMATCH":
      return 6;
    default:
      return 5;
  }
}
async function execute(request: Request) {
  const response = await service.execute(request);
  return { response, exit_code: response.ok ? 0 : exitCode(response.error!.code) };
}
try {
  switch (command) {
    case "serve": {
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
      break;
    }
    case "export": {
      const run = await repository.read(flags.run);
      if (!run) throw new Error("保存が見つかりません");
      await Bun.write(flags.file, exportRun(run));
      console.log(JSON.stringify({ ok: true, file: flags.file }));
      break;
    }
    case "import": {
      const run = importRun(await Bun.file(flags.file).text());
      await repository.transact(run.id, (existing) => {
        if (existing) throw new Failure("RUN_EXISTS", "既存保存は上書きできません");
        return { run, value: null };
      });
      console.log(JSON.stringify({ ok: true, run_id: run.id }));
      break;
    }
    default: {
      const request: Record<string, unknown> = { command };
      for (const [key, value] of Object.entries(flags)) {
        if (key === "dir") continue;
        request[key] = ["seed", "revision", "offset", "limit"].includes(key)
          ? Number(value)
          : key === "input"
            ? JSON.parse(value)
            : value;
      }
      const result = await execute(request as unknown as Request);
      console.log(JSON.stringify(result.response));
      process.exitCode = result.exit_code;
    }
  }
} catch (error) {
  console.log(
    JSON.stringify({
      ok: false,
      error: {
        code: error instanceof Failure ? error.code : "INVALID_INPUT",
        message: error instanceof Error ? error.message : String(error),
      },
    }),
  );
  process.exitCode = 2;
}
