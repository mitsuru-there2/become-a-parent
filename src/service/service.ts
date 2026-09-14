import type { State, Plan, PublicState, Choice, History, Result } from "../engine/types";
import { advance, start, publicView } from "../engine/simulation";
import { canonical, hash, clone } from "../engine/shared";
import {
  Failure,
  invalid,
  bounded,
  requestId,
  mergePlan,
  validateChoice,
  actions,
  COMMANDS,
  UPDATES,
  type Command,
  object,
} from "./contract";
export interface Response {
  api_version: "cli-2";
  ok: boolean;
  command: string;
  run_id: string | null;
  revision: number | null;
  phase: State["phase"] | null;
  public: PublicState | null;
  choices: Choice[];
  payload: Payload | null;
  error: { code: string; message: string; details: { path: string; reason: string }[] } | null;
}
export interface Payload {
  receipt?: { request_id: string; applied_revision: number; duplicate: boolean };
  history_added?: History[];
  items?: History[];
  total?: number;
  next_offset?: number | null;
  result?: Result;
  scenarios?: typeof SCENARIOS;
  actions?: ReturnType<typeof actions>;
  matched?: boolean;
  compared_turns?: number;
  debug_only?: boolean;
  state?: State;
}
export interface Request {
  command: Command;
  run?: string;
  scenario?: string;
  seed?: number;
  revision?: number;
  request_id?: string;
  input?: unknown;
  offset?: number;
  limit?: number;
}
export interface Commit {
  turn: number;
  plan: Plan;
  answers: State["answers"];
  digest: string;
}
export interface Run {
  id: string;
  revision: number;
  state: State;
  digest: string;
  commits: Commit[];
  receipts: Record<string, { request: string; response: Response }>;
  updated_at: string;
}
export interface Repository {
  read(runId: string): Promise<Run | undefined>;
  transact<T>(
    runId: string,
    applyTransaction: (run: Run | undefined) => { run: Run; value: T },
  ): Promise<T>;
  list(): Promise<
    { id: string; revision: number; turn: number; phase: string; updated_at: string }[]
  >;
}
export const SCENARIOS = [
  { id: "home-01", label: "基本の家庭", description: "子ども1人の人生を通す" },
  { id: "home-02", label: "もう一つの家庭", description: "子ども1人の人生を通す" },
];
export const digest = (state: State) => hash(canonical(state));
export function validateRun(run: Run) {
  if (!run || typeof run !== "object" || !run.state || typeof run.state !== "object")
    throw new Failure("CORRUPT_SAVE", "保存を読み込めません。");
  if (
    run.state.versions?.save !== "save-2" ||
    run.state.versions.rules !== "rules-1" ||
    run.state.versions.data !== "data-1"
  )
    throw new Failure("VERSION_MISMATCH", "この保存の版には対応していません。");
  if (
    run.digest !== digest(run.state) ||
    !Array.isArray(run.commits) ||
    !run.receipts ||
    !Number.isInteger(run.revision)
  )
    throw new Failure("CORRUPT_SAVE", "保存の整合性を確認できません。");
}
function envelope(
  command: string,
  run?: Run,
  payload: Payload | null = {},
  error: Response["error"] = null,
): Response {
  const view = run ? publicView(run.state) : null;
  return {
    api_version: "cli-2",
    ok: !error,
    command,
    run_id: run?.id ?? null,
    revision: run?.revision ?? null,
    phase: run?.state.phase ?? null,
    public: view?.public ?? null,
    choices: view?.choices ?? [],
    payload: error ? null : payload,
    error,
  };
}
export function replayRun(run: Run) {
  validateRun(run);
  const state = start(run.state.scenario, run.state.seed);
  for (const commit of run.commits) {
    state.plan = clone(commit.plan);
    state.answers = clone(commit.answers);
    if (!publicView(state).public.forecast?.can_advance)
      throw new Failure("REPLAY_MISMATCH", "確定条件が一致しません。");
    advance(state);
    if (state.n !== commit.turn || digest(state) !== commit.digest)
      throw new Failure("REPLAY_MISMATCH", "確定列の再生が一致しません。");
  }
  return state;
}
export class Service {
  constructor(private repo: Repository) {}
  async execute(request: Request): Promise<Response> {
    let context: Run | undefined;
    const command = typeof request?.command === "string" ? request.command : "";
    try {
      object(request);
      const allowed = [
        "command",
        "run",
        "scenario",
        "seed",
        "revision",
        "request_id",
        "input",
        "offset",
        "limit",
      ];
      if (Object.keys(request).some((key) => !allowed.includes(key))) invalid("未知の要求項目です");
      if (!COMMANDS.includes(request.command))
        throw new Failure("UNKNOWN_COMMAND", "不明な操作です。");
      if (request.command === "scenarios")
        return envelope(request.command, undefined, { scenarios: SCENARIOS });
      requestId(request.run);
      const runId = request.run;
      if (request.command === "history") {
        bounded(request.offset ?? 0, 0, 2147483647, "offset");
        bounded(request.limit ?? 50, 1, 200, "limit");
      }
      const updating =
        (UPDATES as readonly string[]).includes(request.command) || request.command === "new";
      if (updating) {
        requestId(request.request_id);
        if (request.command !== "new")
          bounded(request.revision, 0, Number.MAX_SAFE_INTEGER, "revision");
        else {
          bounded(request.seed, 0, 4294967295, "seed");
          if (!SCENARIOS.some((scenario) => scenario.id === request.scenario))
            invalid("家庭を選んでください", "scenario");
        }
      }
      if (request.command === "choose") validateChoice(request.input);
      if (updating)
        return await this.repo.transact(runId, (existing) => {
          if (existing) {
            validateRun(existing);
            context = clone(existing);
          }
          const normalized = canonical(request);
          const receipt =
            existing && Object.hasOwn(existing.receipts, request.request_id!)
              ? existing.receipts[request.request_id!]
              : undefined;
          // 再送は古いrevisionでも元の応答を返すため、revision検査より先に照合する。
          if (receipt) {
            if (receipt.request !== normalized)
              throw new Failure("REQUEST_ID_CONFLICT", "同じIDが別の入力に使用されています。");
            const response = clone(receipt.response);
            response.payload!.receipt!.duplicate = true;
            return { run: existing!, value: response };
          }
          let run: Run;
          if (request.command === "new") {
            if (existing) throw new Failure("RUN_EXISTS", "この保存は存在しています。");
            const state = start(request.scenario!, request.seed!);
            run = {
              id: runId,
              revision: 0,
              state,
              digest: digest(state),
              commits: [],
              receipts: {},
              updated_at: new Date().toISOString(),
            };
          } else {
            if (!existing) throw new Failure("RUN_NOT_FOUND", "保存が見つかりません。");
            run = clone(existing);
            if (request.revision !== run.revision)
              throw new Failure(
                "STALE_REVISION",
                "別の画面で更新されました。最新の保存を読み直してください。",
              );
            if (run.state.phase === "finished")
              throw new Failure("FINISHED", "この人生は終了しています。");
          }
          // 検証・更新・応答の記録まで同じ保存トランザクションで行う。例外時は確定しない。
          const previousHistoryLength = run.state.history.length;
          const state = run.state;
          switch (request.command) {
            case "plan":
              state.plan = mergePlan(state.plan, request.input);
              break;
            case "choose": {
              validateChoice(request.input);
              const choice = request.input;
              if (
                !publicView(state).choices.some(
                  (event) =>
                    event.instance_id === choice.event_instance &&
                    event.options.some((option) => option.option_id === choice.option_id),
                )
              )
                throw new Failure("UNKNOWN_ACTION", "現在の出来事と選択肢を指定してください。");
              state.answers[choice.event_instance] = choice.option_id;
              break;
            }
            case "reset-plan":
              state.plan = clone(state.previous_plan);
              break;
            case "advance": {
              const projection = publicView(state).public.forecast!;
              if (!projection.can_advance)
                throw new Failure(
                  projection.reasons.some((reason) => reason.code === "ANSWER_REQUIRED")
                    ? "ANSWER_REQUIRED"
                    : "RESOURCE_LIMIT",
                  "回答・方針の配分を確認してください。",
                  projection.reasons.map((reason) => ({
                    path: reason.path,
                    reason: reason.message,
                  })),
                );
              const plan = clone(state.plan);
              const answers = clone(state.answers);
              advance(state);
              run.commits.push({ turn: state.n, plan, answers, digest: digest(state) });
              break;
            }
            // newは上で初期状態を作成済み。
            case "new":
              break;
          }
          if (request.command !== "new") run.revision++;
          run.digest = digest(state);
          run.updated_at = new Date().toISOString();
          const response = envelope(request.command, run, {
            receipt: {
              request_id: request.request_id!,
              applied_revision: run.revision,
              duplicate: false,
            },
            history_added: state.history.slice(previousHistoryLength),
          });
          run.receipts = {
            ...run.receipts,
            [request.request_id!]: { request: normalized, response: clone(response) },
          };
          return { run, value: response };
        });
      context = await this.repo.read(runId);
      if (!context) throw new Failure("RUN_NOT_FOUND", "保存が見つかりません。");
      validateRun(context);
      let payload: Payload = {};
      const state = context.state;
      switch (request.command) {
        case "actions":
          payload = { actions: actions(publicView(state).choices) };
          break;
        case "history": {
          const offset = request.offset ?? 0;
          const limit = request.limit ?? 50;
          payload = {
            items: state.history.slice(offset, offset + limit),
            total: state.history.length,
            next_offset: offset + limit < state.history.length ? offset + limit : null,
          };
          break;
        }
        case "result": {
          if (!state.result) throw new Failure("NOT_FINISHED", "まだ育児編の途中です。");
          payload = { result: clone(state.result) };
          break;
        }
        case "replay": {
          const replayed = replayRun(context);
          payload = { matched: true, compared_turns: replayed.n };
          break;
        }
        case "debug-state":
          payload = { debug_only: true, state: clone(state) };
          break;
        // observe / forecastは共通の公開応答だけを返す。
      }
      return envelope(request.command, context, payload);
    } catch (error) {
      const failure =
        error instanceof Failure
          ? error
          : new Failure(
              "IO_ERROR",
              "保存または読み込みに失敗しました。保存済みの状態から再開できます。",
            );
      let safe: Run | undefined;
      try {
        if (context) {
          validateRun(context);
          safe = context;
        }
      } catch {
        /* 壊れたsnapshotは、エラー応答の公開状態にも使用しない。 */
      }
      return envelope(command, safe, null, {
        code: failure.code,
        message: failure.message,
        details: failure.details,
      });
    }
  }
}
export function exportRun(run: Run) {
  validateRun(run);
  return canonical({ format: "parent-save-2", run, checksum: hash(canonical(run)) });
}
export function importRun(text: string): Run {
  try {
    const parsed = JSON.parse(text);
    if (parsed.format !== "parent-save-2")
      throw new Failure("VERSION_MISMATCH", "対応していない書き出し形式です。");
    if (hash(canonical(parsed.run)) !== parsed.checksum)
      throw new Failure("CORRUPT_SAVE", "書き出しデータが破損しています。");
    const run = parsed.run as Run;
    validateRun(run);
    requestId(run.id);
    bounded(run.state.seed, 0, 4294967295, "seed");
    if (!SCENARIOS.some((scenario) => scenario.id === run.state.scenario))
      invalid("不明な家庭です");
    replayRun(run);
    publicView(run.state);
    return run;
  } catch (error) {
    if (error instanceof Failure) throw error;
    throw new Failure("CORRUPT_SAVE", "保存ファイルを読み込めません。");
  }
}
