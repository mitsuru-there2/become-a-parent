/** S-018-F/H: 公開CLIの情報だけで、新しい物語の分岐を0〜20歳まで通す。 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdir, appendFile, writeFile, readdir } from "node:fs/promises";
import type { Request, Response } from "../src/service/service";

// 公開されたID・費用・前提を使う固定プレイ。内部状態は読まない。
const routes = {
  research: {
    school: "home",
    home: "daily",
    grandparents: "visit",
    afterschool: "maker",
    work: "balance",
  },
  music: {
    school: "private",
    home: "memory",
    grandparents: "care",
    afterschool: "music",
    work: "balance",
  },
  world: {
    school: "international",
    home: "adventure",
    grandparents: "legacy",
    afterschool: "sports",
    work: "balance",
  },
  career: {
    school: "public",
    home: "daily",
    grandparents: "visit",
    afterschool: "maker",
    work: "career",
  },
  venture: {
    school: "public",
    home: "independence",
    grandparents: "legacy",
    afterschool: "maker",
    work: "venture",
  },
} as const;
const out = process.argv[2] ?? `/tmp/parent-stories-${Date.now()}`;
const seeds = Number(process.argv[3] ?? 2);
const onlyRoute = process.argv[4];
if (onlyRoute && !Object.hasOwn(routes, onlyRoute)) throw new Error("不明な経路です");
if (!Number.isInteger(seeds) || seeds < 1 || seeds > 20) throw new Error("seedsは1〜20");
await mkdir(out, { recursive: true });
if ((await readdir(out)).length) throw new Error("空の出力先を指定してください");
const cli = spawn("bun", ["scripts/cli.ts", "serve", "--dir", out + "/saves"], {
  stdio: ["pipe", "pipe", "inherit"],
});
const lines = createInterface({ input: cli.stdout });
const iterator = lines[Symbol.asyncIterator]();
const results: unknown[] = [];
const covered = new Set<string>();
try {
  for (const [route, selectedRoutes] of Object.entries(routes)) {
    if (onlyRoute && onlyRoute !== route) continue;
    for (let seed = 0; seed < seeds; seed++) {
      const run = `${route}-${seed}`;
      let response: Response;
      let calls = 0;
      let executed = 0;
      const events: string[] = [];
      async function call(command: Request["command"], reason: string, input?: unknown) {
        const request: Request = {
          command,
          run,
          ...(["new", "choose", "advance"].includes(command) ? { request_id: `r${++calls}` } : {}),
          ...(["choose", "advance"].includes(command) ? { revision: response!.revision! } : {}),
          ...(command === "new" ? { scenario: "home-01", seed } : {}),
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
        if (!response.ok) throw new Error(`${run}: ${JSON.stringify(response.error)}`);
        return response;
      }
      let r = await call("new", "公開ツリーから経路を選んで開始。");
      const versions = r.public!.versions;
      const fingerprint = r.public!.content;
      while (r.phase === "childhood") {
        const months = r.public!.time.completed_turns * 6;
        events.push(...(r.public!.decision_turn?.event_results ?? []).map((e) => e.event_id));
        for (const missing of r.public!.life!.crossroad?.missing ?? []) {
          const choice = r.choices.find((c) => c.event_id === missing.decision_id)!;
          const desired =
            selectedRoutes[
              choice.event_id.replace("crossroad-", "") as keyof typeof selectedRoutes
            ];
          const group = r.public!.life!.route_groups!.find((g) => g.menu === choice.menu)!;
          const option = choice.options.find(
            (o) => o.route === (desired ?? group.previous ?? group.routes[0].id),
          )!;
          r = await call("choose", "岐路で物語のルートを確定する。", {
            event_instance: choice.instance_id,
            option_id: option.option_id,
          });
        }
        const stage = Math.floor(months / 48);
        const phase = (months % 48) / 6;
        const id = (menu: string, branch: string, slot: string) =>
          `${menu}-${branch}-${stage}-${slot}`;
        const targets: string[] = [];
        if (phase === 0) {
          targets.push(
            id("education", selectedRoutes.school, "06"),
            id("afterschool", selectedRoutes.afterschool, "06"),
          );
          targets.push(id("work", selectedRoutes.work, "06"));
          if (route === "career" || route === "venture") {
            targets.push(
              id("work", selectedRoutes.work, "01"),
              id("work", selectedRoutes.work, "04"),
            );
          } else {
            targets.push(
              id("afterschool", selectedRoutes.afterschool, "01"),
              id("afterschool", selectedRoutes.afterschool, "04"),
            );
          }
          if (selectedRoutes.home === "daily")
            targets.push(id("home", "daily", "01"), id("home", "daily", "04"));
        }
        if (phase === 3) targets.push(id("work", selectedRoutes.work, "07"));
        if (phase === 5)
          targets.push(
            id("home", selectedRoutes.home, "07"),
            id("home", selectedRoutes.home, "10"),
          );
        if (phase === 7)
          targets.push(
            id("education", selectedRoutes.school, "01"),
            id("grandparents", selectedRoutes.grandparents, "01"),
          );
        for (const decision of targets) {
          const choice = r.choices.find((c) => c.event_id === decision)!;
          const target = choice.options[0];
          if (target.acquired) continue;
          if (!target.available)
            throw new Error(`${run}/${months}: ${decision} ${JSON.stringify(target.reasons)}`);
          r = await call("choose", `${target.label}。公開された費用・効果・負担を確認して取得。`, {
            event_instance: choice.instance_id,
            option_id: target.option_id,
          });
          covered.add(target.option_id);
          executed++;
        }
        // 公開された夫婦関係と効果を読み、高負担の仕事には回復を組み合わせる。
        if (r.public!.couple <= 4) {
          const recovery = r.choices.find(
            (choice) =>
              !choice.route_choice &&
              choice.options.some(
                (option) =>
                  option.available &&
                  option.cost === 0 &&
                  option.effect_details?.some(
                    (effect) =>
                      effect.duration === "instant" && effect.description.includes("夫婦の関係 +3"),
                  ),
              ),
          );
          if (recovery) {
            const option = recovery.options[0];
            r = await call("choose", "夫婦関係の公開値が4以下。公開効果のある対話で立て直す。", {
              event_instance: recovery.instance_id,
              option_id: option.option_id,
            });
            covered.add(option.option_id);
            executed++;
          }
        }
        if (!r.public!.forecast!.can_advance)
          throw new Error(JSON.stringify(r.public!.forecast!.reasons));
        r = await call("advance", "取得した選択とルートを維持し、半年進める。");
      }
      if (r.phase !== "finished" || r.public!.time.completed_turns !== 40)
        throw new Error(`${run}: 未完走`);
      const result = await call("result", "成人後と父母の最期を含む最終結果を確認。");
      const replay = await call("replay", "同じ選択からの再生一致を確認。");
      if (!replay.payload!.matched) throw new Error(`${run}: 再生不一致`);
      results.push({
        run,
        route,
        seed,
        versions,
        settings: fingerprint,
        events,
        executed,
        result: result.payload,
        replay: true,
        turns: 40,
      });
    }
    console.log(`${route}: ${seeds}シードで完走・再生一致`);
  }
  await writeFile(
    out + "/results.json",
    JSON.stringify({ mode: "public-cli-scripted", covered: [...covered].sort(), results }, null, 2),
  );
  console.log(
    JSON.stringify({ ok: true, runs: results.length, covered: covered.size, artifacts: out }),
  );
} finally {
  cli.stdin.end();
  lines.close();
}
