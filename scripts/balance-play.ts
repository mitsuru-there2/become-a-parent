/** CLIと同じ公開状態を使う、難易度別の再現可能な高速プレイ。 */
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { catalog } from "../src/content/catalog";
import { startDecisions, chooseDecision, advanceDecisions } from "../src/engine/decisions";
import { publicView } from "../src/engine/simulation";

const out = process.argv[2] ?? `/tmp/parent-balance-${Date.now()}`;
const seeds = Number(process.argv[3] ?? 5);
const selectedDifficulty = process.argv[4];
const selectedPolicy = process.argv[5];
if (!Number.isInteger(seeds) || seeds < 1 || seeds > 30) throw new Error("seedsは1〜30");
if (selectedDifficulty && !["easy", "normal", "hard"].includes(selectedDifficulty))
  throw new Error("難易度はeasy / normal / hardから選んでください");
if (selectedPolicy && !["quiet", "novice", "informed", "expert"].includes(selectedPolicy))
  throw new Error("方針はquiet / novice / informed / expertから選んでください");
await mkdir(out, { recursive: true });
if ((await readdir(out)).length) throw new Error("空の出力先を指定してください");
// CLIと同じテキストモードのエンジンと公開状態を使い、保存I/Oを省く。
const results = [];
for (const difficulty of ["easy", "normal", "hard"] as const)
  for (const policy of ["quiet", "novice", "informed", "expert"] as const)
    for (let seed = 0; seed < seeds; seed++) {
      if (selectedDifficulty && selectedDifficulty !== difficulty) continue;
      if (selectedPolicy && selectedPolicy !== policy) continue;
      const run = `${difficulty}-${policy}-${seed}`;
      const actions: { turn: number; id: string; cash: number; forecast: number }[] = [];
      const state = startDecisions("home-01", seed, catalog.resolve(difficulty));
      function call(
        command: "new" | "choose" | "advance",
        input?: { event_instance: string; option_id: string },
      ) {
        if (command === "choose") chooseDecision(state, input!.event_instance, input!.option_id);
        if (command === "advance") advanceDecisions(state);
        return { phase: state.phase, ...publicView(state) };
      }
      let r = call("new");
      while (r.phase === "childhood") {
        const turn = r.public!.time.completed_turns;
        for (const missing of r.public!.life!.crossroad?.missing ?? []) {
          const choice = r.choices.find((c) => c.event_id === missing.decision_id)!;
          const group = r.public!.life!.route_groups!.find((g) => g.menu === choice.menu)!;
          const desired =
            policy === "quiet" || policy === "novice"
              ? (group.previous ?? group.routes[0].id)
              : choice.menu === "work"
                ? "career"
                : (group.previous ?? group.routes[0].id);
          const option = choice.options.find((o) => o.route === desired)!;
          r = call("choose", { event_instance: choice.instance_id, option_id: option.option_id });
        }
        if (policy !== "quiet") {
          const stage = Math.floor(turn / 8);
          const slot = (n: string) =>
            `work-${policy === "novice" ? "balance" : "career"}-${stage}-${n}`;
          const targets =
            policy === "novice"
              ? [slot("01"), slot("06"), `home-daily-${stage}-01`]
              : policy === "informed"
                ? [slot("06"), slot("01"), slot("04"), slot("07")]
                : [
                    slot("06"),
                    slot("01"),
                    slot("04"),
                    slot("07"),
                    slot("10"),
                    `home-daily-${stage}-07`,
                    `home-daily-${stage}-01`,
                    `home-daily-${stage}-04`,
                  ];
          for (const id of targets) {
            const choice = r.choices.find((c) => c.event_id === id);
            const option = choice?.options[0];
            if (!choice || !option?.available || option.acquired) continue;
            // 初見は予測残高の余裕を残さず購入。学習後は次期の生活費を確保する。
            if (
              policy !== "novice" &&
              option.cost > 0 &&
              r.public!.forecast!.projected_cash - option.cost + option.income <
                (policy === "expert" ? (difficulty === "hard" ? 30 : 80) : 0)
            )
              continue;
            r = call("choose", {
              event_instance: choice.instance_id,
              option_id: option.option_id,
            });
            actions.push({
              turn,
              id,
              cash: state.cash,
              forecast: r.public!.forecast!.projected_cash,
            });
          }
        }
        r = call("advance");
      }
      const events = state.history.flatMap((entry) => entry.event_results ?? []);
      results.push({
        difficulty,
        policy,
        seed,
        turns: r.public!.time.completed_turns,
        reason: r.public!.game_over?.reason ?? "complete",
        cash: state.cash,
        events: events.length,
        good_events: events.filter((event) => event.kind === "good").length,
        bad_events: events.filter((event) => event.kind === "bad").length,
        choices: actions.length,
        parent_a: {
          health: state.parents.A.health,
          stress: state.parents.A.stress,
          fatigue: state.decisions!.fatigue.A,
        },
        couple: state.couple,
        result: state.game_over ? { game_over: state.game_over } : { result: state.result },
      });
      await writeFile(
        `${out}/${run}.json`,
        JSON.stringify({ run, actions, result: results.at(-1) }, null, 2),
      );
    }
await writeFile(`${out}/summary.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify({ out, results: results.map(({ result: _result, ...rest }) => rest) }));
