/** 公開CLIの応答だけで操作する。保存の内部状態は参照しない。 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdir, appendFile, writeFile, readdir } from "node:fs/promises";
import type { Response, Request } from "../src/service/service";
const out = process.argv[2] ?? `/tmp/parent-public-${Date.now()}`;
const seeds = Number(process.argv[3] ?? 3);
if (!Number.isInteger(seeds) || seeds < 1 || seeds > 100) throw new Error("seedsは1〜100");
await mkdir(out, { recursive: true });
if ((await readdir(out)).length) throw new Error("空の出力先を指定してください");
const cli = spawn("bun", ["scripts/cli.ts", "serve", "--dir", out + "/saves"], {
  stdio: ["pipe", "pipe", "inherit"],
});
const lines = createInterface({ input: cli.stdout });
const iterator = lines[Symbol.asyncIterator]();
const results: unknown[] = [];
try {
  for (const policy of ["support", "pressure", "recovery", "quiet", "adaptation"])
    for (let seed = 0; seed < seeds; seed++) {
      const run = `${policy}-${seed}`;
      let response: Response | undefined;
      let count = 0;
      async function call(command: Request["command"], reason: string, input?: unknown) {
        if (++count > 300) throw new Error("操作回数上限");
        const request: Request = {
          command,
          run,
          ...(["new", "choose", "advance"].includes(command) ? { request_id: `r${count}` } : {}),
          ...(["choose", "advance"].includes(command) ? { revision: response!.revision! } : {}),
          ...(command === "new"
            ? { scenario: policy === "adaptation" ? "home-02" : "home-01", seed }
            : {}),
          ...(input ? { input } : {}),
        };
        cli.stdin.write(JSON.stringify(request) + "\n");
        const line = await iterator.next();
        if (line.done) throw new Error("CLI中断");
        response = (JSON.parse(line.value) as { response: Response }).response;
        await appendFile(
          `${out}/${run}.jsonl`,
          JSON.stringify({ request, response, reason }) + "\n",
        );
        if (!response.ok) throw new Error(JSON.stringify(response.error));
        return response;
      }
      let r = await call("new", "家庭とシードを指定して開始。");
      const actions = await call("actions", "公開契約から選択操作を確認。");
      if (actions.payload!.actions!.plan_fields.length)
        throw new Error("新方式で配分操作が公開されています");
      while (r.phase === "childhood") {
        const special = r.choices[0];
        if (special.kind !== "special") throw new Error("期首イベントがありません");
        const recover =
          policy === "recovery" &&
          (r.public!.family_status!.level <= 3 || r.public!.parents.A.stress >= 60);
        const supportive = ["support", "adaptation"].includes(policy) || recover;
        const eventOption = supportive
          ? special.options[0]
          : (special.options.find((o) => o.option_id.endsWith(":leave")) ?? special.options[0]);
        r = await call("choose", supportive ? "家族で相談して対応。" : "今回は様子を見る。", {
          event_instance: special.instance_id,
          option_id: eventOption.option_id,
        });
        if (r.choices.length !== 3) throw new Error("判断が3件ではありません");
        for (const [index, theme] of r.choices.entries()) {
          const option = supportive
            ? theme.options[0]
            : policy === "pressure" && index === 1
              ? (theme.options.find((o) => o.option_id.endsWith(":press")) ?? theme.options.at(-1)!)
              : theme.options.at(-1)!;
          r = await call(
            "choose",
            supportive
              ? "得意を生かし、家族の関係と休息を支える。"
              : "現在の暮らしを維持し、必要な場面で親の考えを優先。",
            { event_instance: theme.instance_id, option_id: option.option_id },
          );
        }
        if (!r.public!.forecast!.can_advance)
          throw new Error(JSON.stringify(r.public!.forecast!.reasons));
        r = await call("advance", "3件の回答と家計を確認して半年を進める。");
      }
      const terminal = r;
      const result = await call("result", "完走またはゲームオーバーの結果を取得。");
      const replay = await call("replay", "同じ確定操作の再生一致を確認。");
      if (!replay.payload!.matched) throw new Error("再生不一致");
      results.push({
        run,
        policy,
        seed,
        versions: terminal.public!.versions,
        phase: terminal.phase,
        turns: terminal.public!.time.completed_turns,
        result: result.payload,
        replay: true,
        calls: count,
      });
    }
  await writeFile(out + "/results.json", JSON.stringify({ mode: "public-cli", results }, null, 2));
  console.log(JSON.stringify({ ok: true, runs: results.length, artifacts: out }));
} finally {
  cli.stdin.end();
  lines.close();
}
