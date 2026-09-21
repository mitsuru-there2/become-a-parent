import "fake-indexeddb/auto";
import { describe, it, expect } from "vite-plus/test";
import currentBase from "../config/base.json";
// 旧方式の保存済み設定を引き続き検証する。
const base = { ...currentBase, decision_game: undefined };
delete (base as Partial<typeof base>).decision_game;
import sample from "../config/examples/community.json";
import { Catalog } from "../src/content/catalog";
import { start, publicView, advance, openTurn } from "../src/engine/simulation";
import { clone } from "../src/engine/shared";
import { GameDatabase, IndexedRepository } from "../src/storage/indexeddb";
import { Service, exportRun, importRun, replayRun, type Request } from "../src/service/service";
import { preset } from "../src/service/presets";
const initial: Request = {
  command: "new",
  run: "config",
  scenario: "home-01",
  seed: 7,
  request_id: "start",
};
const create = (catalog = new Catalog(base)) => {
  const repo = new IndexedRepository(new GameDatabase("config-" + crypto.randomUUID()));
  return { repo, service: new Service(repo, catalog) };
};
describe("S-015 設定と追加パック（内部検証）", () => {
  it("標準の数値を保ち、難易度を家計に反映する", () => {
    const catalog = new Catalog();
    for (const [difficulty, cash, cost] of [
      ["easy", 200, 210],
      ["normal", 120, 220],
      ["hard", 80, 230],
    ] as const) {
      const state = start("home-01", 0, catalog.resolve(difficulty));
      expect(state.cash).toBe(cash);
      expect(publicView(state).public.forecast!.cost).toBe(cost);
    }
  });
  it("イベント確率0/100、行動条件・費用・時間・効果・再発間隔", () => {
    const pack = clone(sample);
    pack.events["community-exhibition"].trigger.probability = 100;
    const catalog = new Catalog(base, [pack]);
    const state = start("community-home", 0, catalog.resolve("normal", ["community"]));
    expect(state.child.adaptation).toBe(2);
    expect(publicView(state).public.extra_selections[0].available).toBe(false);
    state.n = 6;
    state.plan = preset(publicView(state).public, "1");
    state.plan.extra_selection = "community-workshop";
    openTurn(state);
    const without = clone(state);
    without.plan.extra_selection = "none";
    const forecast = publicView(state).public.forecast!;
    expect(forecast.cost - publicView(without).public.forecast!.cost).toBe(4);
    expect(forecast.time_used.A - publicView(without).public.forecast!.time_used.A).toBe(1);
    state.answers = Object.fromEntries(
      publicView(state).choices.map((e) => [
        e.instance_id,
        e.options.find((o) => o.cost === 0)!.option_id,
      ]),
    );
    without.answers = clone(state.answers);
    advance(state, 99);
    advance(without, 99);
    expect(state.child.ability.craft - without.child.ability.craft).toBe(2);
    expect(state.history[0].selections?.plan.extra_selection).toBe("community-workshop");
    expect(state.events.some((e) => e.event_id === "community-exhibition")).toBe(true);
    state.n = 8;
    openTurn(state);
    expect(state.events.some((e) => e.event_id === "community-exhibition")).toBe(false);
    state.n = 11;
    openTurn(state);
    expect(state.events.some((e) => e.event_id === "community-exhibition")).toBe(true);
    const zeroPack = clone(pack);
    zeroPack.events["community-exhibition"].trigger.probability = 0;
    const zero = start(
      "home-01",
      0,
      new Catalog(base, [zeroPack]).resolve("normal", ["community"]),
    );
    zero.n = 8;
    zero.previous_plan.extra_selection = "community-workshop";
    openTurn(zero);
    expect(zero.events.some((e) => e.event_id === "community-exhibition")).toBe(false);
  });
  it("不正設定・重複・衝突・依存不足と循環を拒否", () => {
    for (const mutate of [
      (p: typeof sample) => {
        p.events["community-exhibition"].trigger.probability = 101;
      },
      (p: typeof sample) => {
        p.events["community-exhibition"].trigger.probability = 1.5;
      },
      (p: typeof sample) => {
        p.events["community-exhibition"].options[0].effects = { typo: 1 } as never;
      },
      (p: typeof sample) => {
        p.selections["community-workshop"].visual = "missing" as never;
      },
      (p: typeof sample) => {
        p.events["community-exhibition"].trigger.all[0].path = "__proto__.evil";
      },
      (p: typeof sample) => {
        p.events["E-01" as keyof typeof p.events] = p.events["community-exhibition"];
      },
      (p: typeof sample) => {
        p.scenarios[0].id = "home-01";
      },
      (p: typeof sample) => {
        p.dependencies = ["missing"] as never;
      },
      (p: typeof sample) => {
        p.dependencies = ["community"] as never;
      },
      (p: typeof sample) => {
        p.requires_data = "future";
      },
    ]) {
      const p = clone(sample);
      mutate(p);
      expect(() => new Catalog(base, [p])).toThrow();
    }
    const bad = clone(base);
    bad.oddities[0].probability = 100;
    expect(() => new Catalog(bad)).toThrow();
    const c = new Catalog(base, [sample]);
    expect(() => c.resolve("normal", ["community", "community"])).toThrow();
    expect(() => c.resolve("normal", ["missing"])).toThrow();
  });
  it("追加の抽選が既存の抽選値に影響しない", () => {
    const c = new Catalog(base, [sample]);
    const a = start("home-01", 10),
      b = start("home-01", 10, c.resolve("normal", ["community"]));
    b.previous_plan.extra_selection = "community-workshop";
    for (const s of [a, b]) {
      s.n = 7;
      openTurn(s);
      s.answers = Object.fromEntries(
        publicView(s).choices.map((e) => [e.instance_id, e.options[0].option_id]),
      );
      advance(s);
    }
    expect(b.draws.filter((d) => d.slot === "oddity")).toEqual(
      a.draws.filter((d) => d.slot === "oddity"),
    );
  });
});
describe("S-015 共通公開操作", () => {
  it("不明な開始条件と未選択行動を拒否し、保存を変更しない", async () => {
    const { repo, service } = create(new Catalog(base, [sample]));
    for (const patch of [
      { difficulty: "unknown" },
      { packs: ["missing"] },
      { packs: ["community", "community"] },
      { scenario: "community-home" },
    ]) {
      expect((await service.execute({ ...initial, ...patch })).ok).toBe(false);
      expect(await repo.read("config")).toBeUndefined();
    }
    await service.execute(initial);
    const before = await repo.read("config");
    expect(
      (
        await service.execute({
          command: "plan",
          run: "config",
          revision: 0,
          request_id: "edit",
          input: { extra_selection: "community-workshop" },
        })
      ).ok,
    ).toBe(false);
    expect(
      (await service.execute({ command: "observe", run: "config", difficulty: "easy" })).ok,
    ).toBe(false);
    expect(await repo.read("config")).toEqual(before);
    repo.db.close();
  });
  for (const difficulty of ["easy", "normal", "hard"])
    it(`${difficulty}：公開操作で追加パック付き40期・成人後を完走し、設定更新後も再生`, async () => {
      const { repo, service } = create(new Catalog(base, [sample]));
      let response = await service.execute({
        ...initial,
        difficulty,
        packs: ["community"],
        scenario: "community-home",
      });
      let sequence = 0;
      const run = async (command: Request["command"], input?: unknown) => {
        const request = {
          command,
          run: "config",
          revision: response.revision!,
          request_id: "r" + sequence++,
          ...(input ? { input } : {}),
        };
        response = await service.execute(request);
        expect(response.ok, JSON.stringify(response.error)).toBe(true);
        return request;
      };
      for (let t = 0; t < 40; t++) {
        const plan = preset(response.public!, "1");
        plan.extra_selection = response.public!.extra_selections[0].available
          ? "community-workshop"
          : "none";
        await run("plan", plan);
        for (const event of response.choices)
          await run("choose", {
            event_instance: event.instance_id,
            option_id: event.options.find((o) => o.cost === 0)!.option_id,
          });
        expect(response.public!.forecast!.can_advance).toBe(true);
        const request = await run("advance");
        const repeated = await service.execute(request);
        expect(repeated.payload!.receipt!.duplicate).toBe(true);
        expect(repeated.public).toEqual(response.public);
      }
      expect(response.phase).toBe("finished");
      const saved = (await repo.read("config"))!;
      expect(replayRun(saved).result).toEqual(saved.state.result);
      expect(importRun(exportRun(saved))).toEqual(saved);
      const changed = clone(base);
      changed.difficulties.normal.living_cost = 250;
      changed.events["E-01"].text = "変更後の文章";
      const restarted = new Service(repo, new Catalog(changed, []));
      expect((await restarted.execute({ command: "replay", run: "config" })).payload!.matched).toBe(
        true,
      );
      expect((await restarted.execute({ command: "observe", run: "config" })).public).toEqual(
        response.public,
      );
      repo.db.close();
    });
});

describe("設定の更新と入力境界", () => {
  it("開始の再送はパックが登録から消えた後も元の応答を返す", async () => {
    const { repo, service } = create(new Catalog(base, [sample]));
    const request = { ...initial, packs: ["community"] };
    const first = await service.execute(request);
    const retry = await new Service(repo, new Catalog(base, [])).execute(request);
    expect(retry.ok).toBe(true);
    expect(retry.public).toEqual(first.public);
    expect(retry.payload!.receipt!.duplicate).toBe(true);
    repo.db.close();
  });
  it("パックの特殊なキーと必要文言の削除を拒否", () => {
    const pack = JSON.parse(JSON.stringify(sample));
    pack.selections = JSON.parse('{"__proto__": {"polluted": true}}');
    expect(() => new Catalog(base, [pack])).toThrow();
    const changed = clone(base);
    delete (changed.text as Record<string, string>).adult_048;
    expect(() => new Catalog(changed)).toThrow();
  });
  it("対象外の追加行動と時間超過を確定せず、解除して進める", async () => {
    const { repo, service } = create(new Catalog(base, [sample]));
    let r = await service.execute({ ...initial, packs: ["community"] });
    let i = 0;
    const run = async (command: Request["command"], input?: unknown) => {
      r = await service.execute({
        command,
        run: "config",
        revision: r.revision!,
        request_id: "extra-" + i++,
        ...(input ? { input } : {}),
      });
      return r;
    };
    await run("choose", { event_instance: "t01:E-01", option_id: "E-01:watch" });
    await run("plan", { extra_selection: "community-workshop" });
    expect(r.public!.forecast!.reasons.some((x) => x.code === "SELECTION_UNAVAILABLE")).toBe(true);
    const before = await repo.read("config");
    expect((await run("advance")).ok).toBe(false);
    expect(await repo.read("config")).toEqual(before);
    await run("plan", { extra_selection: "none" });
    expect((await run("advance")).ok).toBe(true);
    const state = start("home-01", 0, new Catalog(base, [sample]).resolve("normal", ["community"]));
    state.n = 6;
    state.events = [];
    state.plan = {
      parents: {
        A: { work: "heavy", care: 2, bond: 2, rest: 2, self: 0 },
        B: { work: "normal", care: 2, bond: 1, rest: 2, self: 0 },
      },
      activity: { domain: "none", level: 0, sponsor: "A" },
      style: "respect",
      help: "none",
      extra_selection: "community-workshop",
    };
    expect(publicView(state).public.forecast!.reasons.some((r) => r.code === "TIME_LIMIT")).toBe(
      true,
    );
    repo.db.close();
  });
});

describe("パックの合成順と保存設定の整合性", () => {
  it("依存先を明示選択し、指定順に依存しない設定を作る", () => {
    const dependent = {
      ...clone(sample),
      id: "community-next",
      dependencies: ["community"],
      scenarios: [],
      events: {},
      selections: {},
      visuals: {},
    };
    const c = new Catalog(base, [sample, dependent]);
    expect(() => c.resolve("normal", ["community-next"])).toThrow();
    expect(c.resolve("normal", ["community-next", "community"])).toEqual(
      c.resolve("normal", ["community", "community-next"]),
    );
  });
  it("設定の破損は表示や更新前に拒否する", async () => {
    const { repo, service } = create();
    await service.execute(initial);
    const saved = (await repo.read("config"))!;
    saved.state.settings!.content.events["E-01"].text = "破損";
    // snapshot digestが更新されていても設定ハッシュとの不一致を検出する。
    const { digest } = await import("../src/service/service");
    saved.digest = digest(saved.state);
    await repo.db.runs.put(saved);
    expect((await service.execute({ command: "observe", run: "config" })).error!.code).toBe(
      "CORRUPT_SAVE",
    );
    expect(await repo.read("config")).toEqual(saved);
    repo.db.close();
  });
});
