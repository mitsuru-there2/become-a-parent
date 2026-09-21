import "fake-indexeddb/auto";
import { describe, expect, it } from "vite-plus/test";
import { Catalog } from "../src/content/catalog";
import {
  startDecisions,
  chooseDecision,
  openDecisionTurn,
  familyStatus,
} from "../src/engine/decisions";
import { advance, publicView } from "../src/engine/simulation";
import { clone } from "../src/engine/shared";
import {
  Service,
  exportRun,
  importRun,
  replayRun,
  type Request,
  type Run,
  digest,
} from "../src/service/service";
import { GameDatabase, IndexedRepository } from "../src/storage/indexeddb";
import type { State } from "../src/engine/types";
import sample from "../config/examples/community.json";
import base from "./fixtures/legacy_content";
import { parentFields } from "../src/engine/stat_scale";
const start = (seed = 0) => startDecisions("home-01", seed, new Catalog().resolve(), "rules-5");
function answerSpecial(state: State, suffix = ":together") {
  const event = publicView(state).choices[0];
  const option = event.options.find((o) => o.option_id.endsWith(suffix)) ?? event.options[0];
  chooseDecision(state, event.instance_id, option.option_id);
}
function answerAll(state: State, last = false) {
  for (const theme of publicView(state).choices)
    chooseDecision(
      state,
      theme.instance_id,
      theme.options[last ? theme.options.length - 1 : 0].option_id,
    );
}
describe("S-016 選択中心の共通エンジン", () => {
  it("特殊イベントを飛ばせず、通常3件の未回答と何もしないを区別する", () => {
    const state = start();
    const before = clone(state);
    expect(publicView(state).choices).toHaveLength(1);
    expect(() => advance(state)).toThrow();
    expect(state).toEqual(before);
    const special = publicView(state).choices[0];
    answerSpecial(state);
    expect(publicView(state).choices).toHaveLength(3);
    expect(() =>
      chooseDecision(state, special.instance_id, special.options[0].option_id),
    ).toThrow();
    for (const [i, theme] of publicView(state).choices.entries()) {
      expect(publicView(state).public.forecast!.can_advance).toBe(false);
      chooseDecision(state, theme.instance_id, theme.options.at(-1)!.option_id);
      expect(Object.keys(state.decisions!.selections)).toHaveLength(i + 1);
    }
    expect(publicView(state).public.forecast!.can_advance).toBe(true);
    advance(state);
    expect(state.n).toBe(1);
    expect(state.decisions!.special_answer).toBeNull();
    expect(state.decisions!.selections).toEqual({});
  });
  it("同じ選択でも関連能力と疲労で成果が変わり、継続費用を計上する", () => {
    const low = start();
    low.n = 6;
    openDecisionTurn(low);
    answerSpecial(low);
    const high = clone(low);
    low.decisions!.skills.A.dialogue = 0;
    high.decisions!.skills.A.dialogue = 10;
    answerAll(low);
    answerAll(high);
    advance(low);
    advance(high);
    expect(high.child.trust.A).toBeGreaterThan(low.child.trust.A);
    expect(high.decisions!.contract?.cost).toBe(24);
    answerSpecial(high);
    expect(publicView(high).public.forecast!.cost).toBe(248);
    const education = publicView(high).choices[0];
    chooseDecision(high, education.instance_id, education.options.at(-1)!.option_id);
    expect(publicView(high).public.forecast!.cost).toBe(224);
  });
  it("5段階と危機からの回復、離婚・一家離散の2期条件、40期目の優先", () => {
    for (const [score, level] of [
      [90, 5],
      [60, 4],
      [40, 3],
      [20, 2],
      [10, 1],
    ]) {
      const state = start();
      state.couple = score / 10;
      state.child.trust = { A: score, B: score };
      state.parents.A.stress = state.parents.B.stress = 0;
      state.decisions!.fatigue = { A: 0, B: 0 };
      expect(familyStatus(state).level).toBe(level);
      expect(state.phase).toBe("childhood");
    }
    for (const reason of ["divorce", "separation"] as const) {
      const state = start();
      state.n = 38;
      state.couple = 0;
      state.parents.A.stress = state.parents.B.stress = 9;
      if (reason === "separation") state.child.trust = { A: 5, B: 5 };
      openDecisionTurn(state);
      // 内部境界試験：イベントで改善しても終了条件内になる状態を固定する。
      for (let i = 0; i < 2; i++) {
        answerSpecial(state);
        state.couple = 0;
        state.parents.A.stress = state.parents.B.stress = 9;
        if (reason === "separation") state.child.trust = { A: 5, B: 5 };
        answerAll(state, true);
        advance(state);
        expect(state.phase).toBe(i === 0 ? "childhood" : "game_over");
      }
      expect(state.game_over?.reason).toBe(reason);
      expect(state.result).toBeNull();
      expect(state.history.some((h) => h.kind === "adult")).toBe(false);
    }
    const recovery = start();
    recovery.couple = 0;
    recovery.child.trust = { A: 5, B: 5 };
    recovery.decisions!.crisis = { divorce: 1, separation: 1 };
    openDecisionTurn(recovery);
    answerSpecial(recovery);
    answerAll(recovery);
    advance(recovery);
    expect(recovery.phase).toBe("childhood");
    expect(recovery.decisions!.crisis).toEqual({ divorce: 0, separation: 0 });
  });
  it("危機のイベントから明示的に終了し、その後の選択はできない", () => {
    for (const reason of ["divorce", "separation"] as const) {
      const state = start();
      state.couple = 0;
      state.child.trust = { A: 0, B: 0 };
      openDecisionTurn(state);
      answerSpecial(state, `:${reason}`);
      expect(state.game_over?.reason).toBe(reason);
      expect(state.n).toBe(0);
      expect(publicView(state).choices).toEqual([]);
      expect(() => advance(state)).toThrow();
    }
  });
});
describe("S-016 保存・公開CLI契約", () => {
  for (const difficulty of ["easy", "normal", "hard"])
    it(`${difficulty}: 公開選択で40期・老後、途中保存、再送、再生、パック`, async () => {
      const repo = new IndexedRepository(new GameDatabase(`decisions-${crypto.randomUUID()}`));
      const service = new Service(repo, new Catalog(base, [sample]));
      let r = await service.execute({
        command: "new",
        run: "test",
        scenario: "home-01",
        seed: 7,
        difficulty,
        packs: ["community"],
        request_id: "new",
      });
      let sequence = 0;
      const call = async (command: Request["command"], input?: unknown) => {
        const req = {
          command,
          run: "test",
          revision: r.revision!,
          request_id: `r${sequence++}`,
          ...(input ? { input } : {}),
        };
        r = await service.execute(req);
        expect(r.ok, JSON.stringify(r.error)).toBe(true);
        return req;
      };
      const selections = await service.execute({ command: "selections", run: "test" });
      expect(selections.payload!.selections!.plan_fields).toEqual([]);
      for (let t = 0; t < 40; t++) {
        expect(r.choices).toHaveLength(1);
        const special = r.choices[0];
        const request = await call("choose", {
          event_instance: special.instance_id,
          option_id: special.options.find(
            (o) => o.available && !o.description?.includes("ゲームオーバー"),
          )!.option_id,
        });
        const repeat = await service.execute(request);
        expect(repeat.payload!.receipt!.duplicate).toBe(true);
        expect(repeat.public).toEqual(r.public);
        expect(r.choices).toHaveLength(3);
        const themes = r.choices;
        for (const theme of themes) {
          await call("choose", {
            event_instance: theme.instance_id,
            option_id: theme.options[0].option_id,
          });
          if (t === 0) {
            const saved = (await repo.read("test"))!;
            expect(importRun(exportRun(saved))).toEqual(saved);
            expect(
              (
                await new Service(repo, new Catalog(base)).execute({
                  command: "observe",
                  run: "test",
                })
              ).public,
            ).toEqual(r.public);
          }
        }
        await call("advance");
        expect(r.public!.time.completed_turns).toBe(t + 1);
        for (const p of ["A", "B"] as const) {
          const values = [
            ...parentFields.map((key) => r.public!.parents[p][key]),
            r.public!.decision_turn!.fatigue[p],
            ...Object.values(r.public!.decision_turn!.skills[p]),
          ];
          for (const value of values) {
            expect(Number.isInteger(value)).toBe(true);
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThanOrEqual(10);
          }
        }
        for (const value of [
          r.public!.couple,
          r.public!.grandparents.health,
          r.public!.grandparents.relation,
        ]) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(10);
        }
      }
      expect(r.phase).toBe("finished");
      const saved = (await repo.read("test"))!;
      expect(replayRun(saved)).toEqual(saved.state);
      expect(importRun(exportRun(saved))).toEqual(saved);
      expect(saved.state.result?.parents.A.death_age).toBeGreaterThan(50);
      repo.db.close();
    }, 30000);
});

describe("S-016 境界と保存整合性", () => {
  it("お金のない期首でも無料で回答でき、過大な支出は確定しない", () => {
    const state = start();
    state.cash = 0;
    const expensive = publicView(state).choices[0];
    const before = clone(state);
    expect(() =>
      chooseDecision(state, expensive.instance_id, expensive.options[1].option_id),
    ).toThrow();
    expect(state).toEqual(before);
    answerSpecial(state);
    answerAll(state);
    state.decisions!.themes[0].options[0].cost = 9999;
    expect(publicView(state).public.forecast!.can_advance).toBe(false);
    const rejected = clone(state);
    expect(() => advance(state)).toThrow();
    expect(state).toEqual(rejected);
    const theme = publicView(state).choices[0];
    chooseDecision(state, theme.instance_id, theme.options.at(-1)!.option_id);
    expect(publicView(state).public.forecast!.can_advance).toBe(true);
  });
  it("同じシードの提示と結果は一致し、疲労が高いと能力の成果が落ちる", () => {
    const a = start();
    const b = start();
    answerSpecial(a);
    answerSpecial(b);
    expect(a).toEqual(b);
    const tired = clone(a);
    tired.decisions!.fatigue.A = 9;
    answerAll(a);
    answerAll(tired);
    advance(a);
    advance(tired);
    expect(a.child.trust.A).toBeGreaterThan(tired.child.trust.A);
    expect(tired.decisions!.fatigue.A).toBeGreaterThan(a.decisions!.fatigue.A);
  });
  it("不正操作を保存せず、ゲームオーバーも書出し・取込・再生できる", async () => {
    const repo = new IndexedRepository(new GameDatabase(`boundary-${crypto.randomUUID()}`));
    const service = new Service(repo, new Catalog(base));
    let r = await service.execute({
      command: "new",
      run: "test",
      scenario: "home-01",
      seed: 0,
      request_id: "start",
    });
    let index = 0;
    const call = async (command: Request["command"], input?: unknown) =>
      service.execute({
        command,
        run: "test",
        revision: r.revision!,
        request_id: `r${index++}`,
        ...(input ? { input } : {}),
      });
    const initial = await repo.read("test");
    for (const command of ["plan", "reset-plan", "advance"] as const)
      expect(
        (await call(command, command === "plan" ? { parents: { A: { care: 3 } } } : undefined)).ok,
      ).toBe(false);
    expect(await repo.read("test")).toEqual(initial);
    while (r.phase === "childhood") {
      const special = r.choices[0];
      const leave =
        special.options.find((o) => o.option_id.endsWith(":leave")) ?? special.options[0];
      r = await call("choose", { event_instance: special.instance_id, option_id: leave.option_id });
      expect(r.ok).toBe(true);
      for (const theme of r.choices) {
        r = await call("choose", {
          event_instance: theme.instance_id,
          option_id: theme.options.at(-1)!.option_id,
        });
        expect(r.ok).toBe(true);
      }
      r = await call("advance");
      expect(r.ok).toBe(true);
    }
    expect(r.phase).toBe("game_over");
    expect(r.public!.game_over?.reason).toBe("divorce");
    const saved = (await repo.read("test"))!;
    expect(importRun(exportRun(saved))).toEqual(saved);
    expect(replayRun(saved)).toEqual(saved.state);
    expect((await call("advance")).error?.code).toBe("FINISHED");
    expect(await repo.read("test")).toEqual(saved);
    repo.db.close();
  }, 30000);
});

describe("S-016 10点スケール", () => {
  it("一つのイベントで1点以上動き、結果に実際の差分を残し、上限・下限で止まる", () => {
    const state = start();
    state.decisions!.special.options[0].parent = "both";
    state.decisions!.special.options[0].skill = null;
    state.decisions!.special.options[0].effects = { fatigue: 6, stress: -6, couple: 6 };
    state.decisions!.fatigue = { A: 9, B: 3 };
    state.parents.A.stress = 1;
    state.parents.B.stress = 5;
    state.couple = 9;
    const special = publicView(state).choices[0];
    chooseDecision(state, special.instance_id, special.options[0].option_id);
    expect(state.decisions!.fatigue.A).toBe(10);
    expect(state.decisions!.fatigue.B).toBeGreaterThan(3);
    expect(state.parents.A.stress).toBe(0);
    expect(state.parents.B.stress).toBe(3);
    expect(state.couple).toBe(10);
    expect(state.history.at(-1)!.text.join("\n")).toContain("5→3（−2）".replace("−", "-"));
  });
  it("旧save-4を100点のまま読み込み、再生し、進行できる", () => {
    const state = startDecisions("home-01", 0, new Catalog().resolve(), "rules-3");
    expect(state.couple).toBe(60);
    expect(state.decisions!.fatigue.A).toBe(25);
    const run: Run = {
      id: "legacy",
      revision: 0,
      state,
      digest: digest(state),
      commits: [],
      receipts: {},
      updated_at: "2026-09-17",
    };
    expect(importRun(exportRun(run))).toEqual(run);
    expect(replayRun(run)).toEqual(state);
    for (let turn = 0; turn < 40; turn++) {
      const special = publicView(state).choices[0];
      const option =
        special.options.find((o) => o.option_id.endsWith(":together")) ?? special.options[0];
      answerSpecial(state);
      run.commits.push({
        kind: "special",
        choice: { event_instance: special.instance_id, option_id: option.option_id },
        turn: state.n,
        plan: clone(state.plan),
        answers: {},
        digest: digest(state),
      });
      answerAll(state);
      const answers = clone(state.decisions!.selections);
      const plan = clone(state.plan);
      advance(state);
      run.commits.push({ turn: state.n, plan, answers, digest: digest(state) });
    }
    run.digest = digest(state);
    expect(replayRun(run)).toEqual(state);
    expect(importRun(exportRun(run))).toEqual(run);
    expect(state.phase).toBe("finished");
    expect(state.versions.rules).toBe("rules-3");
  });
});
