import { LifeMenus } from "./life_menus";
import { EventDialogs } from "./event_dialogs";
import { CashForecast } from "./cash_forecast";
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useStore } from "@nanostores/react";
import type { Choice, PublicState } from "../../engine/types";
import type { Response } from "../../service/service";
import { $busy, $error, $notice, $extra, update, readExtra, downloadSave } from "../../stores/game";
import { Family } from "./family";
import { PartyStatus } from "./party_status";
import { ChildStatus } from "./child_status";
import { StatusDetail } from "./status_detail";
import { Timeline } from "./timeline";
import { Ending } from "./ending";
import familyRoom from "../../../assets/scenes/family-room.png";

function DockIcon({
  kind,
}: {
  kind: "play" | "family" | "history" | "help" | "events" | "advance";
}) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  if (kind === "play")
    return (
      <svg {...common}>
        <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10Z" />
        <path d="M9 21v-7h6v7" />
      </svg>
    );
  if (kind === "family")
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="2.5" />
        <circle cx="16" cy="8" r="2.5" />
        <path d="M2.5 19v-2a5.5 5.5 0 0 1 11 0v2M10.5 19v-2a5.5 5.5 0 0 1 11 0v2" />
      </svg>
    );
  if (kind === "history")
    return (
      <svg {...common}>
        <path d="M12 6c-2.4-1.5-5.5-1.6-9-.6V20c3.5-1 6.6-.9 9 .6 2.4-1.5 5.5-1.6 9-.6V5.4c-3.5-1-6.6-.9-9 .6Z" />
        <path d="M12 6v14.6" />
      </svg>
    );
  if (kind === "help")
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2.5-2.5 4.5M12 17h.01" />
      </svg>
    );
  if (kind === "events")
    return (
      <svg {...common}>
        <path d="M4 5h16v15H4zM8 3v4M16 3v4M4 9h16" />
        <path d="m12 12 .8 1.8 2 .2-1.5 1.3.5 2-1.8-1-1.8 1 .5-2-1.5-1.3 2-.2z" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M5 12h13M13 7l5 5-5 5" />
      <path d="M4 5v14" />
    </svg>
  );
}

function Options({
  choice,
  state,
  onChosen,
}: {
  choice: Choice;
  state: PublicState;
  onChosen: () => void;
}) {
  const busy = useStore($busy);
  return (
    <div className="choices decision-options">
      {choice.options.map((option, index) => {
        const selected = state.answers.some(
          (a) => a.event_instance === choice.instance_id && a.option_id === option.option_id,
        );
        return (
          <button
            key={option.option_id}
            disabled={busy || !option.available}
            aria-pressed={choice.kind === "decision" ? selected : undefined}
            onClick={async () => {
              const saved = await update("choose", {
                event_instance: choice.instance_id,
                option_id: option.option_id,
              });
              if (saved) onChosen();
            }}
          >
            <span className="choice-number">
              {selected ? "✓" : String(index + 1).padStart(2, "0")}
            </span>
            <span>
              <strong>{option.label}</strong>
              <small>
                費用 {option.cost}万円
                {option.income
                  ? ` ／ ${choice.kind === "special" ? "今すぐ" : "半年後"}入金 ＋${option.income}万円`
                  : ""}
              </small>
              <small className="decision-effects">{option.description}</small>
              {option.reasons.map((reason) => (
                <small key={reason.code}>{reason.message}</small>
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function DecisionPlay({ response }: { response: Response }) {
  const state = response.public!;
  const turn = state.decision_turn!;
  const busy = useStore($busy);
  const error = useStore($error);
  const notice = useStore($notice);
  const extra = useStore($extra);
  const [tab, setTab] = useState<"play" | "family" | "history" | "help">("play");
  const [editing, setEditing] = useState<string | null>(null);
  const [showAdvanceReason, setShowAdvanceReason] = useState(false);
  const [eventResult, setEventResult] = useState(false);
  const [readEventTurn, setReadEventTurn] = useState<string | null>(null);
  const special = response.choices.find((choice) => choice.kind === "special");
  const decisions = response.choices.filter((choice) => choice.kind === "decision");
  const answered = (choice: Choice) =>
    state.answers.some((answer) => answer.event_instance === choice.instance_id);
  const choice =
    special ??
    decisions.find((item) => item.instance_id === editing) ??
    decisions.find((item) => !answered(item));
  const projection = state.forecast;
  const ended = response.phase !== "childhood";
  const advanceBlocked =
    !!special || !projection?.can_advance || (!state.life && turn.answered < 3);
  const crossroadBlocked = !!state.life?.crossroad?.missing.length;
  const eventTurn = `${response.run_id}:${state.time.next_turn}`;
  const automaticResult =
    [
      "rules-6",
      "rules-7",
      "rules-8",
      "rules-9",
      "rules-10",
      "rules-11",
      "rules-12",
      "rules-13",
    ].includes(state.versions.rules) &&
    turn.event_result.length > 0 &&
    turn.answered === 0 &&
    readEventTurn !== eventTurn;
  const showingResult = (eventResult || automaticResult) && !special && !ended;
  const life = !!state.life;
  const stageKey = life
    ? `${tab}:${state.time.next_turn}:${response.phase}`
    : `${tab}:${state.time.next_turn}:${ended ? response.phase : showingResult ? "result" : (choice?.instance_id ?? "review")}`;
  const heading = useRef<HTMLHeadingElement>(null);
  const eventHeading = useRef<HTMLHeadingElement>(null);
  const changeTab = (next: typeof tab) => {
    setTab(next);
    if (next === "history") void readExtra("history");
  };
  useEffect(() => {
    // 予定を持つ保存から再開した期は、全取消しても出来事を自動再表示しない。
    if (turn.answered > 0) setReadEventTurn(eventTurn);
  }, [eventTurn, turn.answered]);
  useEffect(() => {
    if (showingResult) eventHeading.current?.focus({ preventScroll: true });
    else heading.current?.focus({ preventScroll: true });
  }, [stageKey, showingResult]);
  useEffect(() => {
    if (response.phase === "finished" && tab === "play" && !extra.result) void readExtra("result");
  }, [response.phase, tab, extra.result]);
  return (
    <div
      className={`rpg-shell status-shell${life ? " life-shell" : ""}${state.life?.selection_tree ? " tree-shell" : ""}`}
    >
      <header className="rpg-header" inert={showingResult}>
        <Link to="/" className="brand">
          親伝説 <span>BECOME A PARENT</span>
        </Link>
        <span className="rpg-save" role="status">
          {busy ? "保存中…" : notice ? "保存済み" : "自動保存"}
        </span>
        <Link to="/" className="rpg-exit" aria-label="← 保存一覧">
          保存一覧 ↗
        </Link>
      </header>
      <main id="main" className="rpg-main" inert={showingResult}>
        <div className="rpg-hud">
          <div className="rpg-age">
            <strong>
              {Math.floor(state.time.child_months / 12)}
              <small>歳{state.time.child_months % 12 ? "6か月" : ""}</small>
            </strong>
            <span>
              {state.time.season} · {state.time.school_label}
            </span>
          </div>
          <div
            className={`rpg-hud-right${life && !ended && projection ? " has-money-summary" : ""}`}
          >
            <div
              className="rpg-family-status"
              aria-label={`家族の状態 ${state.family_status?.label}`}
            >
              <strong>{state.family_status?.label}</strong>
            </div>
            {life && !ended && projection ? (
              <CashForecast cash={state.cash!} forecast={projection} />
            ) : (
              <div className="rpg-cash" aria-label={`現在の資金 ${state.cash}万円`}>
                <strong>
                  {state.cash}
                  <small> 万円</small>
                </strong>
              </div>
            )}
          </div>
        </div>
        <ChildStatus state={state} />
        <div className="rpg-stage">
          {!state.life?.selection_tree && (
            <div className="rpg-scenery" aria-hidden="true">
              <img src={familyRoom} alt="" fetchPriority="high" />
            </div>
          )}
          <div className="rpg-caption">
            <span>第 {state.time.next_turn} 期 / 40</span>
            <p>{state.scene?.title}</p>
          </div>
          <section className="rpg-window" aria-label="家族の物語">
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <div className="rpg-window-body" key={stageKey}>
              {tab === "family" ? (
                <>
                  <h2 ref={heading} tabIndex={-1}>
                    いまの家族
                  </h2>
                  <Family publicState={state} />
                  <section className="rpg-observations">
                    <h3>子どもの様子</h3>
                    <p>{state.scene?.text}</p>
                    {state.observations.map((item) => (
                      <p key={item.code}>{item.text}</p>
                    ))}
                    {turn.previous_result && (
                      <>
                        <h3>前の半年の振り返り</h3>
                        {turn.previous_result.text.map((line, index) => (
                          <p key={index}>{line}</p>
                        ))}
                      </>
                    )}
                    {turn.event_result.length > 0 && (
                      <>
                        <h3>今期の出来事</h3>
                        {turn.event_result.map((line, index) => (
                          <p key={index}>{line}</p>
                        ))}
                      </>
                    )}
                  </section>
                </>
              ) : tab === "history" ? (
                <>
                  <h2 ref={heading} tabIndex={-1}>
                    家族の記録
                  </h2>
                  <Timeline items={extra.items ?? []} />
                </>
              ) : tab === "help" ? (
                <section className="rpg-help">
                  <h2 ref={heading} tabIndex={-1}>
                    {life ? "普段はそのまま、必要なときだけ。" : "半年ごとに、3つの判断。"}
                  </h2>
                  <ol>
                    <li>
                      {[
                        "rules-6",
                        "rules-7",
                        "rules-8",
                        "rules-9",
                        "rules-10",
                        "rules-11",
                        "rules-12",
                        "rules-13",
                      ].includes(state.versions.rules)
                        ? "出来事は自動で発生し、資金や家族の状態に反映されます。"
                        : "特殊イベントへの対応を選びます。その場で確定します。"}
                    </li>
                    <li>
                      {life
                        ? state.life?.stage_model
                          ? "岐路では、5つの判断カテゴリでルートを確定します。変更するとペナルティが発生し、次の岐路までルートは固定されます。"
                          : state.life?.selection_tree
                            ? "地図のカテゴリーを開き、ツリーの選択を詳細から確定します。岐路では、表示された方針をすべて選ぶと進めます。"
                            : "生活メニューから継続する方針や今期だけの行動を選べます。何も選ばなくても進められます。"
                        : "3つの判断に、ひとつずつ回答します。「何もしない」も回答です。"}
                    </li>
                    <li>
                      {state.life?.stage_model
                        ? "ルートを選んだら、条件を満たす選択をステージ中いつでも取得できます。取得は即時で、一度限り。件数の上限はありません。"
                        : life
                          ? `選択を確定すると、次期から新しい機会が現れます。今期だけの選択は全分類合計${state.life!.max_selections}件までです。`
                          : "最後に選択と家計を確認し、「半年を進める」を押します。"}
                    </li>
                  </ol>
                  <p>
                    {state.life?.stage_model
                      ? "効果は取得時のみ・このステージ中・恒久の3種類です。ステージ効果は次の岐路で終了します。詳細の費用と持続期間を確認して取得してください。確定後の取消はできません。"
                      : life
                        ? "方針は変更するまで継続し、単発の選択は繰り返しません。半年を進める前は予定を取り消せます。費用と家族の負担を確認して進めましょう。"
                        : "下の「判断1〜3」から、半年を進める前なら選び直せます。家族の様子では父母の能力・疲労と子どもの観察、前の半年の結果を確認できます。"}
                  </p>
                  <p>
                    20歳までの40期と、その後の人生をたどります。家族の危機は修復できますが、離婚・一家離散が起きるとゲームオーバーです。
                  </p>
                  <button
                    className="rpg-button"
                    disabled={busy}
                    onClick={() => void downloadSave(response.run_id!)}
                  >
                    書き出し
                  </button>
                </section>
              ) : state.game_over ? (
                <section className="ending game-over">
                  <h1 ref={heading} tabIndex={-1}>
                    ゲームオーバー — {state.game_over.title}
                  </h1>
                  <p>{state.game_over.text}</p>
                  <button
                    className="rpg-button"
                    onClick={() => {
                      changeTab("history");
                    }}
                  >
                    家族の記録を振り返る
                  </button>
                  <Link to="/">新しい人生をはじめる →</Link>
                </section>
              ) : ended ? (
                extra.result ? (
                  <Ending result={extra.result} />
                ) : (
                  <p>人生を振り返っています…</p>
                )
              ) : life ? (
                <LifeMenus state={state} choices={decisions} />
              ) : choice ? (
                <>
                  <h2 ref={heading} tabIndex={-1}>
                    {choice.text}
                  </h2>
                  <Options
                    choice={choice}
                    state={state}
                    onChosen={() => {
                      setEditing(null);
                      if (special) setEventResult(true);
                    }}
                  />
                  <p className="rpg-hint">
                    {special
                      ? "選ぶと、その場で確定します。"
                      : "選択は自動保存。半年を進めるまでは選び直せます。"}
                  </p>
                </>
              ) : (
                <>
                  <h2 ref={heading} tabIndex={-1}>
                    この半年、これでいこう。
                  </h2>
                  <div className="rpg-review">
                    {decisions.map((item, index) => (
                      <button key={item.instance_id} onClick={() => setEditing(item.instance_id)}>
                        <span>判断 {index + 1}</span>
                        <strong>
                          {
                            item.options.find((option) =>
                              state.answers.some(
                                (answer) =>
                                  answer.event_instance === item.instance_id &&
                                  answer.option_id === option.option_id,
                              ),
                            )?.label
                          }
                        </strong>
                        <span>変更 ↗</span>
                      </button>
                    ))}
                  </div>
                  {projection && (
                    <>
                      <div className="rpg-budget">
                        <span>
                          収入 ＋{projection.income}万円 / 支出 −{projection.cost}万円
                        </span>
                        <strong>
                          半年後 {projection.projected_cash}万円（
                          {projection.projected_cash >= state.cash! ? "+" : ""}
                          {projection.projected_cash - state.cash!}万円）
                        </strong>
                      </div>
                      {turn.contract && (
                        <p className="rpg-hint">
                          継続：{turn.contract.label}（{turn.contract.cost}万円／半年）
                        </p>
                      )}
                      <p className="rpg-hint">支出には生活費と選択後の継続費用を含みます。</p>
                      {projection.reasons.map((reason) => (
                        <p className="warning" key={reason.path}>
                          {reason.message}
                        </p>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
            {tab === "play" && !ended && !life && (
              <nav className="rpg-steps" aria-label="今期の進行">
                <button
                  disabled={busy}
                  aria-current={special || showingResult ? "step" : undefined}
                  onClick={() => setEventResult(true)}
                >
                  出来事
                </button>
                {[0, 1, 2].map((index) => (
                  <button
                    key={index}
                    disabled={busy || !!special || !decisions[index]}
                    aria-current={
                      choice === decisions[index] && !showingResult ? "step" : undefined
                    }
                    onClick={() => {
                      setEventResult(false);
                      setReadEventTurn(eventTurn);
                      setEditing(decisions[index].instance_id);
                    }}
                  >
                    {decisions[index] && answered(decisions[index]) ? "✓ " : ""}判断{index + 1}
                  </button>
                ))}
                <button
                  disabled={busy || !!special || turn.answered < 3}
                  aria-current={!choice && !showingResult ? "step" : undefined}
                  onClick={() => {
                    setEventResult(false);
                    setReadEventTurn(eventTurn);
                    setEditing(null);
                  }}
                >
                  確認
                </button>
              </nav>
            )}
          </section>
        </div>
      </main>
      <footer className="rpg-bottom" inert={showingResult}>
        <PartyStatus state={state} />
        <div className="rpg-dock">
          <nav className="rpg-dock-controls" aria-label="ゲーム内">
            {(["play", "family", "history", "help"] as const).map((item) => (
              <button
                key={item}
                className="rpg-dock-tab"
                data-dock={item}
                aria-label={
                  item === "play"
                    ? ended
                      ? "人生の結末"
                      : "いまの暮らし"
                    : item === "family"
                      ? "家族の様子"
                      : item === "history"
                        ? "家族の記録"
                        : "遊び方"
                }
                aria-current={tab === item ? "page" : undefined}
                onClick={() => changeTab(item)}
              >
                <DockIcon kind={item} />
                <span className="dock-label">
                  {item === "play"
                    ? ended
                      ? "結末"
                      : state.life?.selection_tree
                        ? "マップ"
                        : "暮らし"
                    : item === "family"
                      ? "家族"
                      : item === "history"
                        ? "記録"
                        : "ヘルプ"}
                </span>
              </button>
            ))}
            {life && !ended && (
              <button
                className="rpg-dock-events"
                aria-label="今期の出来事 ↗"
                disabled={busy}
                onClick={() => setEventResult(true)}
              >
                <DockIcon kind="events" />
                <span className="dock-label">出来事</span>
              </button>
            )}
            <button
              className="rpg-dock-advance"
              aria-label={life ? "この暮らしで半年進める →" : "半年を進める →"}
              disabled={busy || ended || crossroadBlocked}
              data-blocked={advanceBlocked || undefined}
              title={crossroadBlocked ? "マップで残りのルートを選んでください" : undefined}
              aria-haspopup={advanceBlocked && !crossroadBlocked ? "dialog" : undefined}
              aria-describedby={advanceBlocked && !ended ? "advance-blocked-hint" : undefined}
              onClick={() => {
                if (advanceBlocked) setShowAdvanceReason(true);
                else void update("advance");
              }}
            >
              <span className="rpg-dock-advance-icon">
                <DockIcon kind="advance" />
              </span>
              <span className="dock-label">{busy ? "保存中…" : "半年進める"}</span>
            </button>
          </nav>
          {advanceBlocked && !ended && (
            <span id="advance-blocked-hint" className="sr-only">
              {crossroadBlocked
                ? "いまは進行できません。マップで残りのルートを選んでください。"
                : "いまは進行できません。押すと理由を確認できます。"}
            </span>
          )}
        </div>
      </footer>
      {showAdvanceReason && (
        <StatusDetail title="半年を進める前に" onClose={() => setShowAdvanceReason(false)}>
          {special && <p>今期の出来事への対応を選んでください。</p>}
          {!life && turn.answered < 3 && <p>今期の判断をすべて選んでください。</p>}
          {projection?.reasons.map((reason) => (
            <p key={`${reason.path}:${reason.code}`}>{reason.message}</p>
          ))}
          {!projection && <p>半年の見通しを確認してください。</p>}
        </StatusDetail>
      )}
      {showingResult && (
        <EventDialogs
          events={turn.event_results}
          legacyLines={turn.event_result}
          headingRef={eventHeading}
          stagger={automaticResult && !eventResult}
          onClose={() => {
            setEventResult(false);
            setReadEventTurn(eventTurn);
          }}
        />
      )}
    </div>
  );
}
