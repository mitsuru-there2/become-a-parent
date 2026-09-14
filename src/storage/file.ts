import { mkdir, readFile, rename, writeFile, rm, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Repository, Run } from "../service/service";
import { Failure, requestId } from "../service/contract";
export class FileRepository implements Repository {
  constructor(private directory: string) {}
  private path(id: string) {
    requestId(id);
    return join(this.directory, id + ".json");
  }
  async read(id: string): Promise<Run | undefined> {
    try {
      return JSON.parse(await readFile(this.path(id), "utf8"));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw new Failure("CORRUPT_SAVE", "保存ファイルを読み込めません。");
    }
  }
  async transact<T>(id: string, fn: (run: Run | undefined) => { run: Run; value: T }): Promise<T> {
    await mkdir(this.directory, { recursive: true });
    const path = this.path(id),
      lock = path + ".lock",
      temp = path + "." + crypto.randomUUID() + ".tmp";
    try {
      await mkdir(lock);
    } catch {
      throw new Failure("RUN_LOCKED", "別の操作が保存中です。");
    }
    try {
      const result = fn(await this.read(id));
      await writeFile(temp, JSON.stringify(result.run), { mode: 0o600 });
      await rename(temp, path);
      return result.value;
    } finally {
      await rm(temp, { force: true });
      await rm(lock, { recursive: true, force: true });
    }
  }
  async list() {
    await mkdir(this.directory, { recursive: true });
    const runs = await Promise.all(
      (await readdir(this.directory))
        .filter((p) => p.endsWith(".json"))
        .map((p) => this.read(p.slice(0, -5))),
    );
    return runs
      .filter((r): r is Run => !!r)
      .map((r) => ({
        id: r.id,
        revision: r.revision,
        turn: r.state.n,
        phase: r.state.phase,
        updated_at: r.updated_at,
      }));
  }
}
