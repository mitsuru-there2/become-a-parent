import "fake-indexeddb/auto";
import { describe, it, expect } from "vite-plus/test";
import { GameDatabase, IndexedRepository } from "../src/storage/indexeddb";
import { Service, exportRun, importRun, digest, type Request } from "../src/service/service";
import { clone } from "../src/engine/shared";
import { preset } from "../src/service/presets";
const create = () => {
  const repo = new IndexedRepository(new GameDatabase("test-" + crypto.randomUUID()));
  return { repo, service: new Service(repo) };
};
const initial: Request = {
  command: "new",
  run: "test",
  scenario: "home-01",
  seed: 0,
  request_id: "new",
};
describe("保存と共通操作", () => {
  it("特殊なID・未知の要求・書込み後の中断を安全に扱う", async () => {
    const { repo, service } = create();
    const request = { ...initial, request_id: "__proto__" };
    expect((await service.execute(request)).ok).toBe(true);
    expect((await service.execute(request)).payload?.receipt?.duplicate).toBe(true);
    expect((await service.execute(null as unknown as Request)).error?.code).toBe("INVALID_INPUT");
    expect((await service.execute({ ...initial, unknown: true } as Request)).error?.code).toBe(
      "INVALID_INPUT",
    );
    const before = await repo.read("test");
    await expect(
      repo.db.transaction("rw", repo.db.runs, async () => {
        const run = (await repo.db.runs.get("test"))!;
        run.state.cash = 0;
        await repo.db.runs.put(run);
        throw new Error("トランザクション完了前に中断");
      }),
    ).rejects.toThrow();
    expect(await repo.read("test")).toEqual(before);
    repo.db.close();
  });
  it("IndexedDB再開・重複要求・同ID競合・revision競合", async () => {
    const { repo, service } = create();
    const first = await service.execute(initial);
    expect(first.ok).toBe(true);
    expect((await service.execute(initial)).payload?.receipt?.duplicate).toBe(true);
    const restarted = new Service(new IndexedRepository(new GameDatabase(repo.db.name)));
    expect((await restarted.execute({ command: "observe", run: "test" })).public).toEqual(
      first.public,
    );
    const req: Request = {
      command: "choose",
      run: "test",
      revision: 0,
      request_id: "choice",
      input: { event_instance: "t01:E-01", option_id: "E-01:watch" },
    };
    const [a, b] = await Promise.all([
      service.execute(req),
      restarted.execute({ ...req, request_id: "another" }),
    ]);
    expect([a, b].filter((r) => r.ok)).toHaveLength(1);
    expect([a, b].find((r) => !r.ok)?.error?.code).toBe("STALE_REVISION");
    expect((await service.execute(req)).payload?.receipt?.duplicate).toBe(true);
    expect(
      (
        await service.execute({
          ...req,
          input: { event_instance: "t01:E-01", option_id: "E-01:cuddle" },
        })
      ).error?.code,
    ).toBe("REQUEST_ID_CONFLICT");
    repo.db.close();
  });
  it("無効入力・未回答・資源不足・保存失敗は確定しない", async () => {
    const { repo, service } = create();
    await service.execute(initial);
    for (const input of [
      { parents: { A: { rest: 1.2 } } },
      { parents: { A: { care: true } } },
      { activity: { level: 2 } },
      { evil: 1 },
      null,
    ])
      expect(
        (
          await service.execute({
            command: "plan",
            run: "test",
            revision: 0,
            request_id: "invalid",
            input,
          })
        ).ok,
      ).toBe(false);
    expect(
      (
        await service.execute({
          command: "advance",
          run: "test",
          revision: 0,
          request_id: "advance",
        })
      ).error?.code,
    ).toBe("ANSWER_REQUIRED");
    const before = await repo.read("test");
    await expect(
      repo.transact("test", (r) => {
        r!.state.cash = 0;
        throw new Error("書込直前の失敗");
      }),
    ).rejects.toThrow();
    expect(await repo.read("test")).toEqual(before);
    await service.execute({
      command: "choose",
      run: "test",
      revision: 0,
      request_id: "choose",
      input: { event_instance: "t01:E-01", option_id: "E-01:watch" },
    });
    await service.execute({
      command: "plan",
      run: "test",
      revision: 1,
      request_id: "over",
      input: { parents: { A: { care: 6 } } },
    });
    expect(
      (
        await service.execute({
          command: "advance",
          run: "test",
          revision: 2,
          request_id: "over-advance",
        })
      ).error?.code,
    ).toBe("RESOURCE_LIMIT");
    expect((await repo.read("test"))!.state.n).toBe(0);
    repo.db.close();
  });
  it("公開情報だけで40期・老後まで完走、再生、書出し・取込", async () => {
    const { repo, service } = create();
    let response = await service.execute(initial),
      i = 0;
    for (let t = 0; t < 40; t++) {
      const run = (command: Request["command"], input?: unknown) =>
        service.execute({
          command,
          run: "test",
          revision: response.revision!,
          request_id: "r" + i++,
          ...(input ? { input } : {}),
        });
      response = await run("plan", preset(response.public!, "1"));
      expect(response.ok).toBe(true);
      for (const e of response.choices) {
        response = await run("choose", {
          event_instance: e.instance_id,
          option_id: e.options.find((o) => o.available)?.option_id ?? e.options[0].option_id,
        });
        expect(response.ok).toBe(true);
      }
      response = await run("advance");
      expect(response.ok).toBe(true);
      expect(response.public!.time.completed_turns).toBe(t + 1);
    }
    expect(response.phase).toBe("finished");
    expect(
      response.payload?.history_added?.filter((h) => h.kind === "adult").length,
    ).toBeGreaterThan(0);
    expect((await service.execute({ command: "replay", run: "test" })).payload?.matched).toBe(true);
    expect(
      (await service.execute({ command: "result", run: "test" })).payload?.result?.ending.id,
    ).toMatch(/^EN-/);
    expect(
      (
        await service.execute({
          command: "advance",
          run: "test",
          revision: response.revision!,
          request_id: "finished",
        })
      ).error?.code,
    ).toBe("FINISHED");
    const saved = (await repo.read("test"))!,
      text = exportRun(saved);
    expect(importRun(text)).toEqual(saved);
    const other = create();
    await other.repo.restore(text);
    expect((await other.service.execute({ command: "result", run: "test" })).payload).toEqual(
      (await service.execute({ command: "result", run: "test" })).payload,
    );
    await expect(other.repo.restore(text)).rejects.toThrow();
    repo.db.close();
    other.repo.db.close();
  });
  it("途中の編集は再生せず、確定済みの操作だけを照合する", async () => {
    const { repo, service } = create();
    await service.execute(initial);
    await service.execute({
      command: "plan",
      run: "test",
      revision: 0,
      request_id: "edit",
      input: { parents: { A: { rest: 3 } } },
    });
    expect((await service.execute({ command: "replay", run: "test" })).payload).toEqual({
      matched: true,
      compared_turns: 0,
    });
    repo.db.close();
  });
  it("破損と未知の保存版を変更せず拒否", async () => {
    const { repo, service } = create();
    await service.execute(initial);
    const good = (await repo.read("test"))!;
    for (const unknown of [false, true]) {
      const bad = clone(good);
      if (unknown) {
        bad.state.versions.save = "future";
        bad.digest = digest(bad.state);
      } else bad.state.cash++;
      await repo.db.runs.put(bad);
      expect((await service.execute({ command: "observe", run: "test" })).error?.code).toBe(
        unknown ? "VERSION_MISMATCH" : "CORRUPT_SAVE",
      );
      expect(await repo.read("test")).toEqual(bad);
    }
    expect(() => importRun(exportRun(good).replace("parent-save-3", "future-save"))).toThrow();
    repo.db.close();
  });
});
