import { publicHistory, publicStateHistory } from "../engine/public_history";
import { stageModel } from "../engine/stage_state";
import { validateLifeState } from "../engine/life_save";
import * as v from "valibot";
import { grandparentSchema } from "../content/decision_schema";
import { syncGrandparents } from "../engine/grandparents";
import { startDecisions, chooseDecision } from "../engine/decisions";
import { Catalog, catalog, contentFor } from "../content/catalog";
import { ContentError, validateSettings } from "../content/validation";
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
  selections,
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
  game_over?: State["game_over"];
  scenarios?: ReturnType<Catalog["list"]>["scenarios"];
  difficulties?: ReturnType<Catalog["list"]>["difficulties"];
  packs?: ReturnType<Catalog["list"]>["packs"];
  selections?: ReturnType<typeof selections>;
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
  difficulty?: string;
  packs?: string[];
  revision?: number;
  request_id?: string;
  input?: unknown;
  offset?: number;
  limit?: number;
}
export interface Commit {
  kind?: "special";
  choice?: { event_instance: string; option_id: string };
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
export const SCENARIOS = catalog.list().scenarios;
export const digest = (state: State) => hash(canonical(state));
export function validateRun(run: Run) {
  if (!run || typeof run !== "object" || !run.state || typeof run.state !== "object")
    throw new Failure("CORRUPT_SAVE", "保存を読み込めません。");
  const version = run.state.versions;
  const legacy =
    version?.save === "save-2" && version.rules === "rules-1" && version.data === "data-1";
  const current =
    version?.save === "save-3" && version.rules === "rules-2" && version.data === "data-2";
  const decisions =
    (version?.save === "save-4" && version.rules === "rules-3" && version.data === "data-3") ||
    (version?.save === "save-5" && version.rules === "rules-4" && version.data === "data-4") ||
    (version?.save === "save-6" && version.rules === "rules-5" && version.data === "data-5") ||
    (version?.save === "save-7" && version.rules === "rules-6" && version.data === "data-6") ||
    (version?.save === "save-8" && version.rules === "rules-7" && version.data === "data-7") ||
    (version?.save === "save-9" && version.rules === "rules-8" && version.data === "data-8") ||
    (version?.save === "save-10" && version.rules === "rules-9" && version.data === "data-9") ||
    (version?.save === "save-11" && version.rules === "rules-10" && version.data === "data-10") ||
    (version?.save === "save-12" && version.rules === "rules-11" && version.data === "data-11") ||
    (version?.save === "save-13" && version.rules === "rules-12" && version.data === "data-12") ||
    (version?.save === "save-14" &&
      version.rules === "rules-13" &&
      version.data ===
        (run.state.settings?.content?.life_game?.judgment_catalog ? "data-14" : "data-13"));
  if (!legacy && !current && !decisions)
    throw new Failure("VERSION_MISMATCH", "このバージョンの保存データには対応していません。");
  try {
    if (current || decisions) {
      validateSettings(run.state.settings);
      if (["rules-7", "rules-8"].includes(version.rules)) {
        const group = run.state.grandparents;
        if (
          !run.state.settings!.content.decision_game?.initial_grandparents ||
          !group.members ||
          !v.is(grandparentSchema, group.members.grandfather) ||
          !v.is(grandparentSchema, group.members.grandmother)
        )
          throw new Error("祖父・祖母の状態が不正です");
        const expected = clone(group);
        syncGrandparents(expected);
        if (canonical(expected) !== canonical(group)) throw new Error("祖父母の集計が一致しません");
      }
      if (
        ["rules-8", "rules-9", "rules-10", "rules-11", "rules-12", "rules-13"].includes(
          version.rules,
        ) &&
        (!run.state.life || !run.state.settings!.content.life_game)
      )
        throw new Error("生活メニューの状態がありません");
      if (
        ["rules-8", "rules-9", "rules-10", "rules-11", "rules-12", "rules-13"].includes(
          version.rules,
        )
      )
        validateLifeState(run.state);
      if (
        ["rules-9", "rules-10", "rules-11", "rules-12", "rules-13"].includes(version.rules) &&
        (!v.is(grandparentSchema, run.state.grandparents) ||
          !run.state.settings!.content.life_game?.selection_tree ||
          !run.state.settings!.content.life_game?.initial_family_home)
      )
        throw new Error("実家の状態が不正です");
      if (
        ["rules-10", "rules-11", "rules-12", "rules-13"].includes(version.rules) &&
        !run.state.settings!.content.life_game?.route_groups?.length
      )
        throw new Error("長期ルートの設定がありません");
      if (
        ["rules-11", "rules-12", "rules-13"].includes(version.rules) &&
        run.state.settings!.content.life_game?.route_groups?.length !== 5
      )
        throw new Error("5分類のルート設定がありません");
      if (
        version.rules === "rules-12" &&
        !run.state.settings!.content.life_game?.crossroads?.length
      )
        throw new Error("岐路の設定がありません");
      if (stageModel(run.state) && !run.state.settings!.content.life_game?.stage_model)
        throw new Error("ステージ設定がありません");
      if (decisions && (!run.state.settings!.content.decision_game || !run.state.decisions))
        throw new Error("選択ゲームの状態がありません");
      if (
        [
          "rules-6",
          "rules-7",
          "rules-8",
          "rules-9",
          "rules-10",
          "rules-11",
          "rules-12",
          "rules-13",
        ].includes(version.rules) &&
        !run.state.settings!.content.automatic_events
      )
        throw new Error("自動イベント設定がありません");
    } else if (run.state.settings !== undefined) throw new Error("旧保存に設定があります");
  } catch {
    throw new Failure("CORRUPT_SAVE", "保存された設定が不正です。");
  }
  if (
    run.digest !== digest(run.state) ||
    !Array.isArray(run.commits) ||
    !run.receipts ||
    !Number.isInteger(run.revision)
  )
    throw new Failure("CORRUPT_SAVE", "保存の整合性を確認できません。");
}
function publicPayload(payload: Payload | null, state: PublicState | null): Payload | null {
  if (!payload) return payload;
  const studyPublic = state?.life?.study_score !== undefined;
  return {
    ...payload,
    ...(payload.items
      ? { items: payload.items.map((entry) => publicHistory(entry, studyPublic)) }
      : {}),
    ...(payload.history_added
      ? { history_added: payload.history_added.map((entry) => publicHistory(entry, studyPublic)) }
      : {}),
  };
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
    payload: error ? null : publicPayload(payload, view?.public ?? null),
    error,
  };
}
export function replayRun(run: Run) {
  validateRun(run);
  const state = run.state.decisions
    ? startDecisions(
        run.state.scenario,
        run.state.seed,
        run.state.settings!,
        run.state.versions.rules,
      )
    : start(run.state.scenario, run.state.seed, run.state.settings ?? null);
  for (const commit of run.commits) {
    if (commit.kind === "special") {
      if (!commit.choice) throw new Failure("REPLAY_MISMATCH", "イベントの記録がありません。");
      chooseDecision(state, commit.choice.event_instance, commit.choice.option_id);
      if (digest(state) !== commit.digest)
        throw new Failure("REPLAY_MISMATCH", "イベントの再生が一致しません。");
      continue;
    }
    state.plan = clone(commit.plan);
    if (state.decisions) state.decisions.selections = clone(commit.answers);
    else state.answers = clone(commit.answers);
    if (!publicView(state).public.forecast?.can_advance)
      throw new Failure("REPLAY_MISMATCH", "確定条件が一致しません。");
    advance(state);
    if (state.n !== commit.turn || digest(state) !== commit.digest)
      throw new Failure("REPLAY_MISMATCH", "確定列の再生が一致しません。");
  }
  return state;
}
export class Service {
  constructor(
    private repo: Repository,
    private contentCatalog: Catalog = catalog,
  ) {}
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
        "difficulty",
        "packs",
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
        return envelope(request.command, undefined, this.contentCatalog.list());
      if (
        request.command !== "new" &&
        (request.difficulty !== undefined || request.packs !== undefined)
      )
        invalid("難易度とパックは開始時だけ指定できます");
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
            if (response.public) response.public = publicStateHistory(response.public);
            response.payload = publicPayload(response.payload, response.public);
            response.payload!.receipt!.duplicate = true;
            return { run: existing!, value: response };
          }
          let run: Run;
          if (request.command === "new") {
            if (existing) throw new Failure("RUN_EXISTS", "同じ保存データがすでにあります。");
            const settings = this.contentCatalog.resolve(request.difficulty, request.packs);
            if (!settings.content.scenarios.some((s) => s.id === request.scenario))
              invalid("家庭を選んでください", "scenario");
            const state = settings.content.decision_game
              ? startDecisions(request.scenario!, request.seed!, settings)
              : start(request.scenario!, request.seed!, settings);
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
            if (run.state.phase !== "childhood")
              throw new Failure("FINISHED", "この人生は終了しています。");
          }
          // 検証・更新・応答の記録まで同じ保存トランザクションで行う。例外時は確定しない。
          const previousHistoryLength = run.state.history.length;
          const state = run.state;
          switch (request.command) {
            case "plan":
              if (state.decisions)
                throw new Failure("UNKNOWN_SELECTION", "今期の3件の判断に回答してください。");
              state.plan = mergePlan(
                state.plan,
                request.input,
                publicView(state).public.extra_selections.map((a) => a.id),
              );
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
                throw new Failure("UNKNOWN_SELECTION", "現在の出来事と選択肢を指定してください。");
              if (state.decisions) {
                const option = publicView(state)
                  .choices.find((e) => e.instance_id === choice.event_instance)!
                  .options.find((o) => o.option_id === choice.option_id)!;
                if (!option.available)
                  throw new Failure("RESOURCE_LIMIT", option.reasons[0].message);
                const special = stageModel(state) || !state.decisions.special_answer;
                chooseDecision(state, choice.event_instance, choice.option_id);
                if (special)
                  run.commits.push({
                    kind: "special",
                    choice: clone(choice),
                    turn: state.n,
                    plan: clone(state.plan),
                    answers: {},
                    digest: digest(state),
                  });
              } else state.answers[choice.event_instance] = choice.option_id;
              break;
            }
            case "reset-plan":
              if (stageModel(state))
                throw new Failure(
                  "UNKNOWN_SELECTION",
                  "確定済みのルートと取得した選択は取り消せません。",
                );
              if (state.life) {
                state.decisions!.selections = {};
                break;
              }
              if (state.decisions)
                throw new Failure("UNKNOWN_SELECTION", "今期の3件の判断を選び直してください。");
              state.plan = clone(state.previous_plan);
              break;
            case "advance": {
              const projection = publicView(state).public.forecast!;
              if (!projection.can_advance)
                throw new Failure(
                  projection.reasons.some((reason) => reason.code === "ANSWER_REQUIRED")
                    ? "ANSWER_REQUIRED"
                    : "RESOURCE_LIMIT",
                  state.life
                    ? "今期の予定と、半年の支出を確認してください。"
                    : state.decisions
                      ? "必須の回答と、半年の支出を確認してください。"
                      : "出来事への対応と、方針の時間・お金の配分を確認してください。",
                  projection.reasons.map((reason) => ({
                    path: reason.path,
                    reason: reason.message,
                  })),
                );
              const plan = clone(state.plan);
              const answers = clone(state.decisions?.selections ?? state.answers);
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
        case "selections":
          payload = {
            selections: selections(
              publicView(state).choices,
              publicView(state).public.extra_selections,
              !!state.decisions,
              !!state.life,
              stageModel(state),
            ),
          };
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
          if (state.game_over) {
            payload = { game_over: clone(state.game_over) };
            break;
          }
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
        error instanceof ContentError
          ? new Failure("INVALID_CONTENT", error.message)
          : error instanceof Failure
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
  return canonical({
    format: `parent-${run.state.versions.save}`,
    run,
    checksum: hash(canonical(run)),
  });
}
export function importRun(text: string): Run {
  try {
    const parsed = JSON.parse(text);
    if (
      ![
        "parent-save-2",
        "parent-save-3",
        "parent-save-4",
        "parent-save-5",
        "parent-save-6",
        "parent-save-7",
        "parent-save-8",
        "parent-save-9",
        "parent-save-10",
        "parent-save-11",
        "parent-save-12",
        "parent-save-13",
        "parent-save-14",
      ].includes(parsed.format)
    )
      throw new Failure("VERSION_MISMATCH", "対応していない書き出し形式です。");
    if (hash(canonical(parsed.run)) !== parsed.checksum)
      throw new Failure("CORRUPT_SAVE", "書き出しデータが破損しています。");
    const run = parsed.run as Run;
    validateRun(run);
    if (parsed.format !== `parent-${run.state.versions.save}`)
      throw new Failure("VERSION_MISMATCH", "書き出し形式と保存データのバージョンが一致しません。");
    requestId(run.id);
    bounded(run.state.seed, 0, 4294967295, "seed");
    if (!contentFor(run.state).scenarios.some((scenario) => scenario.id === run.state.scenario))
      invalid("不明な家庭です");
    replayRun(run);
    publicView(run.state);
    return run;
  } catch (error) {
    if (error instanceof Failure) throw error;
    throw new Failure("CORRUPT_SAVE", "保存ファイルを読み込めません。");
  }
}
