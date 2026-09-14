/** Deterministic policy using only CLI responses. No save or engine inspection. */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdir, appendFile, writeFile, readdir } from "node:fs/promises";
import type { Response, Request } from "../src/service/service";
import type { Plan, Work, PublicState } from "../src/engine/types";
const out = process.argv[2] ?? "/tmp/parent-public-" + Date.now(),
  seeds = Number(process.argv[3] ?? 3);
if (!Number.isInteger(seeds) || seeds < 1 || seeds > 100) throw new Error("seedsは1〜100");
await mkdir(out, { recursive: true });
if ((await readdir(out)).length) throw new Error("空の出力先を指定してください");
const processCli = spawn("bun", ["scripts/cli.ts", "serve", "--dir", out + "/saves"], {
  stdio: ["pipe", "pipe", "inherit"],
});
const lines = createInterface({ input: processCli.stdout });
const iterator = lines[Symbol.asyncIterator]();
const results: unknown[] = [];
async function play(pattern: string, seed: number, variant = "standard", expected?: string) {
  const run = `${pattern}-${seed}-${variant}`,
    log = out + "/" + run + ".jsonl";
  let response: Response | null = null,
    calls = 0,
    changed = false,
    paused = false;
  const started = new Date().toISOString();
  async function call(command: Request["command"], reason: string, input?: unknown) {
    if (++calls > 600) throw new Error("operation_limit");
    const request: Request = {
      command,
      run,
      ...(["new", "plan", "choose", "advance"].includes(command)
        ? { request_id: crypto.randomUUID() }
        : {}),
      ...(["plan", "choose", "advance"].includes(command) ? { revision: response!.revision! } : {}),
      ...(command === "new" ? { scenario: pattern === "BP-05" ? "home-02" : "home-01", seed } : {}),
      ...(input ? { input } : {}),
    };
    processCli.stdin.write(JSON.stringify(request) + "\n");
    const line = await iterator.next();
    if (line.done) throw new Error("CLI interrupted");
    const result = JSON.parse(line.value) as { response: Response; exit_code: number };
    await appendFile(
      log,
      JSON.stringify({
        time: new Date().toISOString(),
        input: request,
        output: result.response,
        exit_code: result.exit_code,
        reason,
        observed_ids: response?.public?.observations.map((o) => o.code) ?? [],
      }) + "\n",
    );
    response = result.response;
    if (!response.ok) throw new Error(response.error!.code);
    return response;
  }
  await call("new", "指定の家庭とシードで開始する。");
  const discovered = await call("actions", "操作の項目・値域を公開契約から取得する。");
  if (!discovered.payload?.actions?.plan_fields.some((f) => f.path === "parents.A.care"))
    throw new Error("actions missing");
  while ((response as unknown as Response).phase !== "finished") {
    const pub = (response as unknown as Response).public as PublicState,
      plan = structuredClone(pub.forecast!.fallback_plan),
      obs = Object.fromEntries(pub.observations.map((o) => [o.code, o.text])),
      tired =
        obs.energy !== "余裕がありそう" ||
        Math.max(pub.parents.A.stress, pub.parents.B.stress) >= 70;
    if (pattern === "BP-03" && tired) changed = true;
    const goal = pattern === "BP-02" || (pattern === "BP-03" && !changed),
      own = pattern === "BP-04";
    const layout: [Work, number, number, number][] = goal
      ? [
          ["heavy", 0, 1, 0],
          ["normal", 1, 1, 0],
        ]
      : own
        ? [
            ["heavy", 0, 1, 2],
            ["normal", 0, 1, 2],
          ]
        : [
            ["normal", 1, 2, 1],
            ["normal", 1, 2, 1],
          ];
    for (const [i, p] of (["A", "B"] as const).entries()) {
      const [work, bond, rest, self] = layout[i];
      Object.assign(plan.parents[p], { work, bond, rest, self });
    }
    let active = pub.time.stage !== "baby" && !own;
    if (pattern === "BP-03" && changed && tired) {
      active = false;
      plan.parents.A.rest = 3;
      plan.parents.B.rest = 3;
    }
    if (["BP-01", "BP-05"].includes(pattern) && obs.settling && !paused) {
      active = false;
      paused = true;
    }
    plan.activity = {
      domain: active ? "craft" : "none",
      level: active ? (goal ? 2 : 1) : 0,
      sponsor: goal ? "B" : "A",
    };
    plan.style = goal && pub.time.stage !== "baby" ? "coach" : "respect";
    if (variant === "quiet") for (const p of ["A", "B"] as const) plan.parents[p].bond = 0;
    if (variant === "distance") for (const p of ["A", "B"] as const) plan.parents[p].self = 0;
    const planned = await call(
      "plan",
      "必要な世話と公開された疲れの観察に応じて配分する。",
      plan as Plan,
    );
    for (const e of planned.choices) {
      const choice: Record<string, string> = {
        "E-01": "watch",
        "E-02": goal || ["BP-01", "BP-05"].includes(pattern) ? "dive" : "gradual",
        "E-03": goal ? "lessons" : "play",
        "E-04": goal ? "drill" : "cheer",
        "E-05": goal ? "continue" : "listen",
        "E-06": goal ? "back" : "pace",
        "E-07": goal ? "suggest" : "ask",
        "E-08": goal ? "prepare" : "send",
        "E-09": goal ? "accept" : "coordinate",
        "E-10": goal ? "defer" : "repair",
      };
      const option = e.options.find((o) => o.option_id === e.event_id + ":" + choice[e.event_id])!;
      await call("choose", `表示された「${option.label}」を比較方針に合わせて選ぶ。`, {
        event_instance: e.instance_id,
        option_id: option.option_id,
      });
    }
    if (!(response as unknown as Response).public!.forecast!.can_advance)
      throw new Error("公開の予測で確定不能");
    await call("advance", "公開予測が成立しているため半年を確定する。");
  }
  const result = (await call("result", "親子の幸福と結末を振り返る。")).payload!.result!;
  await call("history", "完走後の公開履歴を記録する。");
  const replay = await call("replay", "完走後、共通サービスで確定列の再生一致を検証する。");
  if (!replay.payload!.matched) throw new Error("replay mismatch");
  if (expected && expected !== result.ending.id)
    throw new Error(`ending ${expected} != ${result.ending.id}`);
  const summary = {
    kind: expected
      ? "targeted_ending_coverage_not_blind_play"
      : "public_cli_automated_policy_not_blind_llm_play",
    run,
    pattern,
    seed,
    variant,
    started,
    finished: new Date().toISOString(),
    calls,
    turns: 40,
    matched: true,
    result,
  };
  results.push(summary);
  console.log(run, result.ending.id, calls);
}
try {
  for (const pattern of ["BP-01", "BP-02", "BP-03", "BP-04", "BP-05"])
    for (let seed = 0; seed < seeds; seed++) await play(pattern, seed);
  for (const [expected, pattern, seed, variant] of [
    ["EN-01", "BP-02", 0, "quiet"],
    ["EN-02", "BP-03", 0, "standard"],
    ["EN-03", "BP-04", 0, "standard"],
    ["EN-04", "BP-01", 1, "distance"],
    ["EN-05", "BP-02", 0, "standard"],
  ] as const) {
    if (variant === "standard") {
      const r = results.find((x) => {
        const v = x as { pattern: string; seed: number; variant: string };
        return v.pattern === pattern && v.seed === seed && v.variant === variant;
      }) as { result: { ending: { id: string } } };
      if (r.result.ending.id !== expected) throw new Error("結末が一致しません");
    } else await play(pattern, seed, variant, expected);
  }
  await writeFile(
    out + "/summary.json",
    JSON.stringify({ kind: "typescript_cli_validation", results }, null, 2),
  );
  console.log("All completed:", results.length);
} finally {
  processCli.stdin.end();
  lines.close();
}
