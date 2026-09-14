import { atom, computed } from "nanostores";
import { IndexedRepository } from "../storage/indexeddb";
import { Service, exportRun, type Response, type Payload } from "../service/service";
import type { Command } from "../service/contract";
import type { Plan } from "../engine/types";
import { clone, canonical } from "../engine/shared";
export const repository = new IndexedRepository();
const service = new Service(repository);
export const $response = atom<Response | null>(null);
export const $busy = atom(false);
export const $error = atom("");
export const $notice = atom("");
export const $draft = atom<Plan | null>(null);
export const $extra = atom<Payload>({});
export const $dirty = computed(
  [$draft, $response],
  (draft, response) => !!draft && canonical(draft) !== canonical(response?.public?.plan),
);
let generation = 0;
export async function loadRun(runId: string) {
  const loadGeneration = ++generation;
  $busy.set(true);
  $error.set("");
  try {
    const response = await service.execute({ command: "observe", run: runId });
    // 別の保存へ移動した後に届いた、古い読み込み結果を捨てる。
    if (loadGeneration !== generation) return;
    $response.set(response);
    $draft.set(clone(response.public?.plan ?? null));
    $extra.set({});
    if (!response.ok) $error.set(response.error!.message);
  } finally {
    if (loadGeneration === generation) $busy.set(false);
  }
}
export async function update(command: Command, input?: unknown) {
  if ($busy.get()) return false;
  const current = $response.get();
  if (!current?.run_id) return false;
  $busy.set(true);
  $error.set("");
  $notice.set("");
  try {
    const response = await service.execute({
      command,
      run: current.run_id,
      revision: current.revision!,
      request_id: crypto.randomUUID(),
      ...(input === undefined ? {} : { input }),
    });
    if (!response.ok) {
      $error.set(
        response.error!.message +
          response.error!.details.map((detail) => " " + detail.reason).join(""),
      );
      return false;
    }
    $response.set(response);
    // 出来事への回答は、まだ保存していない方針の編集案を上書きしない。
    if (command !== "choose") $draft.set(clone(response.public?.plan ?? null));
    $notice.set("このブラウザに保存しました");
    if (response.phase === "finished") {
      const result = await service.execute({ command: "result", run: current.run_id });
      $extra.set(result.payload ?? {});
    }
    return true;
  } finally {
    $busy.set(false);
  }
}
export async function readExtra(command: "history" | "result") {
  const runId = $response.get()?.run_id;
  if (!runId) return;
  const response = await service.execute({
    command,
    run: runId,
    ...(command === "history" ? { limit: 200 } : {}),
  });
  if (response.ok) $extra.set(response.payload ?? {});
  else $error.set(response.error!.message);
}
export async function createRun(scenario: string, seed: number) {
  if ($busy.get()) return null;
  $busy.set(true);
  $error.set("");
  try {
    const runId = crypto.randomUUID();
    const response = await service.execute({
      command: "new",
      run: runId,
      scenario,
      seed,
      request_id: crypto.randomUUID(),
    });
    if (!response.ok) {
      $error.set(response.error!.message);
      return null;
    }
    $response.set(response);
    $draft.set(clone(response.public!.plan));
    return runId;
  } finally {
    $busy.set(false);
  }
}
export async function downloadSave(runId: string) {
  try {
    const run = await repository.read(runId);
    if (!run) throw new Error("保存が見つかりません");
    const blob = new Blob([exportRun(run)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `parent-${runId}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    $error.set(error instanceof Error ? error.message : "書き出せませんでした");
  }
}
