import { atom, computed } from "nanostores";
import { IndexedRepository } from "../storage/indexeddb";
import { Service, exportRun, type Response, type Payload } from "../service/service";
import type { Command } from "../service/contract";
import type { Plan } from "../engine/types";
import { clone, canonical } from "../engine/shared";
export const repository = new IndexedRepository();
const service = new Service(repository);
export const $response = atom<Response | null>(null),
  $busy = atom(false),
  $error = atom(""),
  $notice = atom(""),
  $draft = atom<Plan | null>(null),
  $extra = atom<Payload>({});
export const $dirty = computed(
  [$draft, $response],
  (draft, response) => !!draft && canonical(draft) !== canonical(response?.public?.plan),
);
let generation = 0;
export async function loadRun(id: string) {
  const token = ++generation;
  $busy.set(true);
  $error.set("");
  try {
    const response = await service.execute({ command: "observe", run: id });
    if (token !== generation) return;
    $response.set(response);
    $draft.set(clone(response.public?.plan ?? null));
    $extra.set({});
    if (!response.ok) $error.set(response.error!.message);
  } finally {
    if (token === generation) $busy.set(false);
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
        response.error!.message + response.error!.details.map((d) => " " + d.reason).join(""),
      );
      return false;
    }
    $response.set(response);
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
  const id = $response.get()?.run_id;
  if (!id) return;
  const response = await service.execute({
    command,
    run: id,
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
    const id = crypto.randomUUID(),
      r = await service.execute({
        command: "new",
        run: id,
        scenario,
        seed,
        request_id: crypto.randomUUID(),
      });
    if (!r.ok) {
      $error.set(r.error!.message);
      return null;
    }
    $response.set(r);
    $draft.set(clone(r.public!.plan));
    return id;
  } finally {
    $busy.set(false);
  }
}
export async function downloadSave(id: string) {
  try {
    const run = await repository.read(id);
    if (!run) throw new Error("保存が見つかりません");
    const blob = new Blob([exportRun(run)], { type: "application/json" }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `parent-${id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    $error.set(e instanceof Error ? e.message : "書き出せませんでした");
  }
}
