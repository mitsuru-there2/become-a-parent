import { mkdir, readFile, rename, writeFile, rm, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Repository, Run } from "../service/service";
import { Failure, requestId } from "../service/contract";
export class FileRepository implements Repository {
  constructor(private directory: string) {}
  private path(runId: string) {
    requestId(runId);
    return join(this.directory, runId + ".json");
  }
  async read(runId: string): Promise<Run | undefined> {
    try {
      return JSON.parse(await readFile(this.path(runId), "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw new Failure("CORRUPT_SAVE", "保存ファイルを読み込めません。");
    }
  }
  async transact<T>(
    runId: string,
    applyTransaction: (run: Run | undefined) => { run: Run; value: T },
  ): Promise<T> {
    await mkdir(this.directory, { recursive: true });
    const path = this.path(runId);
    const lockDirectory = path + ".lock";
    const temporaryPath = path + "." + crypto.randomUUID() + ".tmp";
    try {
      await mkdir(lockDirectory);
    } catch {
      throw new Failure("RUN_LOCKED", "別の操作が保存中です。");
    }
    try {
      const result = applyTransaction(await this.read(runId));
      await writeFile(temporaryPath, JSON.stringify(result.run), { mode: 0o600 });
      // 同じディレクトリ内のrenameで、読者に書きかけのJSONを見せない。
      await rename(temporaryPath, path);
      return result.value;
    } finally {
      await rm(temporaryPath, { force: true });
      await rm(lockDirectory, { recursive: true, force: true });
    }
  }
  async list() {
    await mkdir(this.directory, { recursive: true });
    const runs = await Promise.all(
      (await readdir(this.directory))
        .filter((filename) => filename.endsWith(".json"))
        .map((filename) => this.read(filename.slice(0, -5))),
    );
    return runs
      .filter((run): run is Run => !!run)
      .map((run) => ({
        id: run.id,
        revision: run.revision,
        turn: run.state.n,
        phase: run.state.phase,
        updated_at: run.updated_at,
      }));
  }
}
