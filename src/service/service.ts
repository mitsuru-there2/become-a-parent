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
  read(id: string): Promise<Run | undefined>;
  transact<T>(id: string, fn: (run: Run | undefined) => { run: Run; value: T }): Promise<T>;
  list(): Promise<
    { id: string; revision: number; turn: number; phase: string; updated_at: string }[]
  >;
}
export const SCENARIOS = [
  { id: "home-01", label: "基本の家庭", description: "子ども1人の人生を通す" },
  { id: "home-02", label: "もう一つの家庭", description: "子ども1人の人生を通す" },
];
export const digest = (s: State) => hash(canonical(s));
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
  async execute(req: Request): Promise<Response> {
    let context: Run | undefined;
    const command = typeof req?.command === "string" ? req.command : "";
    try {
      object(req);
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
      if (Object.keys(req).some((key) => !allowed.includes(key))) invalid("未知の要求項目です");
      if (!COMMANDS.includes(req.command)) throw new Failure("UNKNOWN_COMMAND", "不明な操作です。");
      if (req.command === "scenarios")
        return envelope(req.command, undefined, { scenarios: SCENARIOS });
      requestId(req.run);
      const id = req.run;
      if (req.command === "history") {
        bounded(req.offset ?? 0, 0, 2147483647, "offset");
        bounded(req.limit ?? 50, 1, 200, "limit");
      }
      const updating =
        (UPDATES as readonly string[]).includes(req.command) || req.command === "new";
      if (updating) {
        requestId(req.request_id);
        if (req.command !== "new") bounded(req.revision, 0, Number.MAX_SAFE_INTEGER, "revision");
        else {
          bounded(req.seed, 0, 4294967295, "seed");
          if (!SCENARIOS.some((s) => s.id === req.scenario))
            invalid("家庭を選んでください", "scenario");
        }
      }
      if (req.command === "choose") validateChoice(req.input);
      if (updating)
        return await this.repo.transact(id, (existing) => {
          if (existing) {
            validateRun(existing);
            context = clone(existing);
          }
          const normalized = canonical(req),
            receipt =
              existing && Object.hasOwn(existing.receipts, req.request_id!)
                ? existing.receipts[req.request_id!]
                : undefined;
          if (receipt) {
            if (receipt.request !== normalized)
              throw new Failure("REQUEST_ID_CONFLICT", "同じIDが別の入力に使用されています。");
            const response = clone(receipt.response);
            response.payload!.receipt!.duplicate = true;
            return { run: existing!, value: response };
          }
          let run: Run;
          if (req.command === "new") {
            if (existing) throw new Failure("RUN_EXISTS", "この保存は存在しています。");
            const state = start(req.scenario!, req.seed!);
            run = {
              id,
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
            if (req.revision !== run.revision)
              throw new Failure(
                "STALE_REVISION",
                "別の画面で更新されました。最新の保存を読み直してください。",
              );
            if (run.state.phase === "finished")
              throw new Failure("FINISHED", "この人生は終了しています。");
          }
          const oldCount = run.state.history.length,
            s = run.state;
          if (req.command === "plan") s.plan = mergePlan(s.plan, req.input);
          if (req.command === "choose") {
            validateChoice(req.input);
            const choice = req.input;
            if (
              !publicView(s).choices.some(
                (e) =>
                  e.instance_id === choice.event_instance &&
                  e.options.some((o) => o.option_id === choice.option_id),
              )
            )
              throw new Failure("UNKNOWN_ACTION", "現在の出来事と選択肢を指定してください。");
            s.answers[choice.event_instance] = choice.option_id;
          }
          if (req.command === "reset-plan") s.plan = clone(s.previous_plan);
          if (req.command === "advance") {
            const f = publicView(s).public.forecast!;
            if (!f.can_advance)
              throw new Failure(
                f.reasons.some((r) => r.code === "ANSWER_REQUIRED")
                  ? "ANSWER_REQUIRED"
                  : "RESOURCE_LIMIT",
                "回答・方針の配分を確認してください。",
                f.reasons.map((r) => ({ path: r.path, reason: r.message })),
              );
            const plan = clone(s.plan),
              answers = clone(s.answers);
            advance(s);
            run.commits.push({ turn: s.n, plan, answers, digest: digest(s) });
          }
          if (req.command !== "new") run.revision++;
          run.digest = digest(s);
          run.updated_at = new Date().toISOString();
          const response = envelope(req.command, run, {
            receipt: {
              request_id: req.request_id!,
              applied_revision: run.revision,
              duplicate: false,
            },
            history_added: s.history.slice(oldCount),
          });
          run.receipts = {
            ...run.receipts,
            [req.request_id!]: { request: normalized, response: clone(response) },
          };
          return { run, value: response };
        });
      context = await this.repo.read(id);
      if (!context) throw new Failure("RUN_NOT_FOUND", "保存が見つかりません。");
      validateRun(context);
      let payload: Payload = {};
      const s = context.state;
      if (req.command === "actions") payload = { actions: actions(publicView(s).choices) };
      if (req.command === "history") {
        const offset = req.offset ?? 0,
          limit = req.limit ?? 50;
        payload = {
          items: s.history.slice(offset, offset + limit),
          total: s.history.length,
          next_offset: offset + limit < s.history.length ? offset + limit : null,
        };
      }
      if (req.command === "result") {
        if (!s.result) throw new Failure("NOT_FINISHED", "まだ育児編の途中です。");
        payload = { result: clone(s.result) };
      }
      if (req.command === "replay") {
        const replayed = replayRun(context);
        payload = { matched: true, compared_turns: replayed.n };
      }
      if (req.command === "debug-state") payload = { debug_only: true, state: clone(s) };
      return envelope(req.command, context, payload);
    } catch (e) {
      const failure =
        e instanceof Failure
          ? e
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
        /* A corrupt snapshot must never be exposed. */
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
    if (!SCENARIOS.some((s) => s.id === run.state.scenario)) invalid("不明な家庭です");
    replayRun(run);
    publicView(run.state);
    return run;
  } catch (e) {
    if (e instanceof Failure) throw e;
    throw new Failure("CORRUPT_SAVE", "保存ファイルを読み込めません。");
  }
}
