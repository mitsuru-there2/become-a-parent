import Dexie, { type Table } from "dexie";
import type { Repository, Run } from "../service/service";
import { importRun } from "../service/service";
import { Failure } from "../service/contract";
export class GameDatabase extends Dexie {
  runs!: Table<Run, string>;
  constructor(name = "become-a-parent") {
    super(name);
    this.version(1).stores({ runs: "id,updated_at" });
  }
}
export class IndexedRepository implements Repository {
  constructor(public db = new GameDatabase()) {}
  read(id: string) {
    return this.db.runs.get(id);
  }
  transact<T>(id: string, fn: (run: Run | undefined) => { run: Run; value: T }): Promise<T> {
    return this.db.transaction("rw", this.db.runs, async () => {
      const result = fn(await this.db.runs.get(id));
      await this.db.runs.put(result.run);
      return result.value;
    });
  }
  async list() {
    return (await this.db.runs.orderBy("updated_at").reverse().toArray()).map((r) => ({
      id: r.id,
      revision: r.revision,
      turn: r.state.n,
      phase: r.state.phase,
      updated_at: r.updated_at,
    }));
  }
  async restore(text: string) {
    const run = importRun(text);
    await this.transact(run.id, (existing) => {
      if (existing)
        throw new Failure("RUN_EXISTS", "同じ保存がすでにあります。別のブラウザへ取り込めます。");
      return { run, value: null };
    });
    return run.id;
  }
}
