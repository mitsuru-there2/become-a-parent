/** S-018-F/H: 公開CLIの情報だけで、新しい物語の分岐を0〜20歳まで通す。 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdir, appendFile, writeFile, readdir } from "node:fs/promises";
import type { Request, Response } from "../src/service/service";

type Step = [months: number, decision: string, option: string];
const routes: Record<string, Step[]> = {
  rocket: [
    [0, "story-keepsake", "capsule"],
    [24, "story-cardboard", "build"],
    [48, "story-science-entry", "try"],
    [72, "story-science-fair", "rocket"],
    [120, "story-invention", "exhibit"],
    [216, "story-reunion", "open"],
  ],
  robot: [
    [0, "story-keepsake", "album"],
    [24, "story-cardboard", "theater"],
    [48, "base-craft-trial", "try"],
    [54, "base-other-trial", "try"],
    [72, "story-science-fair", "robot"],
    [120, "story-invention", "demo"],
    [216, "story-reunion", "screen"],
  ],
  musicTour: [
    [48, "story-music-trial", "try"],
    [54, "story-music", "stage"],
    [96, "story-festival", "national"],
    [108, "story-music", "standard"],
    [180, "story-encore", "tour"],
  ],
  musicRecord: [
    [48, "story-music-trial", "try"],
    [54, "story-music", "stage"],
    [96, "story-festival", "national"],
    [108, "story-music", "standard"],
    [180, "story-encore", "record"],
  ],
  musicLocal: [
    [48, "story-music-trial", "try"],
    [54, "story-music", "casual"],
    [96, "story-festival", "local"],
    [108, "story-music", "standard"],
  ],
  sportsNational: [
    [48, "story-sports-trial", "try"],
    [54, "story-team", "compete"],
    [108, "story-cup", "national"],
    [120, "story-team", "standard"],
    [180, "story-coach", "clinic"],
  ],
  sportsLocal: [
    [48, "story-sports-trial", "try"],
    [54, "story-team", "play"],
    [108, "story-cup", "relay"],
    [120, "story-team", "standard"],
    [180, "story-coach", "neighbors"],
  ],
  mountains: [
    [60, "story-camp", "forest"],
    [108, "story-expedition", "trek"],
    [156, "story-exchange", "outdoor"],
  ],
  railway: [
    [60, "story-camp", "city"],
    [108, "story-expedition", "rail"],
    [156, "story-exchange", "host"],
  ],
  scholarship: [
    [0, "base-learning", "together"],
    [144, "base-career-talk", "talk"],
    [150, "base-career-visit", "visit"],
    [156, "story-exchange", "study"],
    [180, "story-pathway", "scholarship"],
    [186, "base-learning", "standard"],
  ],
  apprentice: [
    [144, "base-career-talk", "talk"],
    [150, "base-career-visit", "visit"],
    [180, "story-pathway", "apprentice"],
  ],
  localCareer: [
    [144, "base-career-talk", "talk"],
    [150, "base-career-visit", "visit"],
    [180, "story-pathway", "local"],
  ],
  stall: [
    [42, "base-grand-visit", "visit"],
    [48, "story-recipe", "learn"],
    [78, "base-grand-visit", "visit"],
    [84, "story-stall", "sell"],
    [180, "story-recipe-legacy", "book"],
  ],
  feast: [
    [42, "base-grand-visit", "visit"],
    [48, "story-recipe", "learn"],
    [84, "story-stall", "feast"],
    [180, "story-recipe-legacy", "cook"],
  ],
  businessFair: [
    [66, "base-work-consult", "talk"],
    [72, "story-market", "sell"],
    [84, "story-venture", "launch"],
    [96, "story-venture-pivot", "fair"],
    [108, "story-venture", "standard"],
    [120, "story-home-project", "move"],
  ],
  businessHelp: [
    [66, "base-work-consult", "talk"],
    [72, "story-market", "sell"],
    [84, "story-venture", "launch"],
    [96, "story-venture-pivot", "delegate"],
    [108, "story-venture", "standard"],
    [120, "story-home-project", "studio"],
  ],
  smallShop: [
    [66, "base-work-consult", "talk"],
    [72, "story-market", "sell"],
    [84, "story-venture", "small"],
    [108, "story-venture", "standard"],
  ],
  sharedHome: [
    [72, "story-market", "swap"],
    [180, "story-independence", "shared"],
    [216, "story-departure", "share"],
  ],
  newHome: [
    [180, "story-independence", "budget"],
    [216, "story-departure", "move"],
  ],
};
const routeChoices: Record<string, [string, string][]> = {
  rocket: [["crossroad-home", "memory"]],
  robot: [["crossroad-home", "memory"]],
  musicTour: [["crossroad-afterschool", "music"]],
  musicRecord: [["crossroad-afterschool", "music"]],
  musicLocal: [["crossroad-afterschool", "music"]],
  sportsNational: [["crossroad-afterschool", "sports"]],
  sportsLocal: [["crossroad-afterschool", "sports"]],
  mountains: [["crossroad-home", "adventure"]],
  railway: [["crossroad-home", "adventure"]],
  stall: [["crossroad-grandparents", "legacy"]],
  feast: [["crossroad-grandparents", "legacy"]],
  businessFair: [
    ["crossroad-work", "venture"],
    ["crossroad-home", "independence"],
  ],
  businessHelp: [
    ["crossroad-work", "venture"],
    ["crossroad-home", "independence"],
  ],
  smallShop: [["crossroad-work", "venture"]],
  sharedHome: [
    ["crossroad-work", "venture"],
    ["crossroad-home", "independence"],
  ],
  newHome: [["crossroad-home", "independence"]],
};
const out = process.argv[2] ?? `/tmp/parent-stories-${Date.now()}`;
const seeds = Number(process.argv[3] ?? 2);
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
  for (const [route, steps] of Object.entries(routes)) {
    const seenSteps = new Set<string>();
    const routeSteps = steps.filter(([, decision, option]) => {
      const key = `${decision}:${option}`;
      if (option === "standard" || seenSteps.has(key)) return false;
      seenSteps.add(key);
      return true;
    });
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
          const desired = routeChoices[route]?.find(([id]) => id === choice.event_id)?.[1];
          const group = r.public!.life!.route_groups!.find((g) => g.menu === choice.menu)!;
          const option = choice.options.find(
            (o) => o.route === (desired ?? group.previous ?? group.routes[0].id),
          )!;
          r = await call("choose", "岐路で物語のルートを確定する。", {
            event_instance: choice.instance_id,
            option_id: option.option_id,
          });
        }
        for (const [, decision, option] of routeSteps.filter(([age]) => age === months)) {
          const choice = r.choices.find((c) => c.event_id === decision)!;
          const target = choice.options.find((o) => o.option_id === `${decision}:${option}`)!;
          if (!target?.available)
            throw new Error(
              `${run}/${months}: ${decision}:${option} ${JSON.stringify(target?.reasons)}`,
            );
          r = await call(
            "choose",
            `${choice.text}：${target.label}。公開された条件と費用を確認。`,
            { event_instance: choice.instance_id, option_id: target.option_id },
          );
          covered.add(target.option_id);
          executed++;
        }
        if (!r.public!.forecast!.can_advance)
          throw new Error(JSON.stringify(r.public!.forecast!.reasons));
        r = await call("advance", "取得した選択とルートを維持し、半年進める。");
      }
      if (
        r.phase !== "finished" ||
        r.public!.time.completed_turns !== 40 ||
        executed !== routeSteps.length
      )
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
