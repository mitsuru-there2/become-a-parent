import { LifeMenus, LifeAdvance } from "./life_menus";
import { useEffect, useRef, useState, type RefObject } from "react";
import { Link } from "@tanstack/react-router";
import { useStore } from "@nanostores/react";
import type { AutomaticEventResult, Choice, PublicState } from "../../engine/types";
import type { Response } from "../../service/service";
import { $busy, $error, $notice, $extra, update, readExtra, downloadSave } from "../../stores/game";
import { Family } from "./family";
import { PartyStatus } from "./party_status";
import { Timeline } from "./timeline";
import { Ending } from "./ending";
import familyRoom from "../../../assets/scenes/family-room.png";
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

function EventDialog({
  events,
  legacyLines,
  nextLabel,
  onContinue,
  headingRef,
}: {
  events: AutomaticEventResult[];
  legacyLines: string[];
  nextLabel: string;
  onContinue: () => void;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <>
      <div className="event-overlay" aria-hidden="true" />
      <section
        className="event-dialog turn-event-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="turn-event-title"
        onKeyDown={(event) => {
          if (event.key === "Tab") {
            event.preventDefault();
            event.currentTarget.querySelector("button")?.focus();
          }
        }}
      >
        <div className="turn-event-illustration">
          <img src={familyRoom} alt="家族に起きた出来事を表す仮の挿絵" />
          <span>TURN EVENT</span>
        </div>
        <div className="turn-event-heading">
          <p>この半年のはじまり</p>
          <h2 id="turn-event-title" ref={headingRef} tabIndex={-1}>
            今期の出来事
          </h2>
          {events.length > 0 && <span>{events.length}件発生</span>}
        </div>
        <div className="turn-event-list">
          {events.length > 0 ? (
            events.map((event) => (
              <article
                key={event.event_id}
                className={`turn-event-card turn-event-card--${event.kind}`}
              >
                <span className="turn-event-kind">
                  {event.kind === "good" ? "良い出来事" : "困った出来事"}
                </span>
                <p>{event.text}</p>
                {event.changes.length > 0 && (
                  <ul aria-label="パラメータの変更">
                    {event.changes.map((change) => (
                      <li key={change}>{change}</li>
                    ))}
                  </ul>
                )}
              </article>
            ))
          ) : legacyLines.length > 0 ? (
            <div className="turn-event-card turn-event-card--neutral">
              {legacyLines.map((line, index) => (
                <p key={index}>{line}</p>
              ))}
            </div>
          ) : (
            <p className="turn-event-empty">今期は特別な出来事はありません。</p>
          )}
        </div>
        <button className="rpg-action" onClick={onContinue}>
          {nextLabel}
        </button>
      </section>
    </>
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
  const eventTurn = `${response.run_id}:${state.time.next_turn}`;
  const automaticResult =
    ["rules-6", "rules-7", "rules-8"].includes(state.versions.rules) &&
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
    <div className={`rpg-shell${life ? " life-shell" : ""}`}>
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
          <div className="rpg-family-status">
            <span>家族の様子</span>
            <strong>{state.family_status?.label}</strong>
          </div>
          <div className="rpg-cash">
            <span>いまの資金</span>
            <strong>
              {state.cash}
              <small> 万円</small>
            </strong>
          </div>
        </div>
        <PartyStatus state={state} />
        <div className="rpg-stage">
          <div className="rpg-scenery" aria-hidden="true">
            <img src={familyRoom} alt="" fetchPriority="high" />
          </div>
          <div className="rpg-caption">
            <span>第 {state.time.next_turn} 期 / 40</span>
            <p>{state.scene?.title}</p>
          </div>
          <section className="rpg-window" aria-label="家族の物語">
            <div className="rpg-window-bar">
              <span>
                {tab === "play"
                  ? ended
                    ? "人生の結末"
                    : life
                      ? "暮らしのメニュー"
                      : special
                        ? "今期の特殊イベント"
                        : choice
                          ? `判断 ${decisions.indexOf(choice) + 1} / 3`
                          : "この半年の確認"
                  : tab === "family"
                    ? "家族の様子"
                    : tab === "history"
                      ? "家族の記録"
                      : "遊び方"}
              </span>
              <span>
                {life
                  ? `今期だけの予定 ${state.life!.action_count}件`
                  : `${turn.answered} / 3 回答済み`}
              </span>
            </div>
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
                      {["rules-6", "rules-7", "rules-8"].includes(state.versions.rules)
                        ? "出来事は自動で発生し、資金や家族の状態に反映されます。"
                        : "特殊イベントへの対応を選びます。その場で確定します。"}
                    </li>
                    <li>
                      {life
                        ? "生活メニューから継続する方針や今期だけの行動を選べます。何も選ばなくても進められます。"
                        : "3つの判断に、ひとつずつ回答します。「何もしない」も回答です。"}
                    </li>
                    <li>
                      {life
                        ? `選択を確定すると、次期から新しい機会が現れます。今期だけの行動は全分類合計${state.life!.max_actions}件までです。`
                        : "最後に選択と家計を確認し、「半年を進める」を押します。"}
                    </li>
                  </ol>
                  <p>
                    {life
                      ? "方針は変更するまで継続し、単発行動は繰り返しません。半年を進める前は予定を取り消せます。費用と家族の負担を確認して進めましょう。"
                      : "下の「判断1〜3」から、半年を進める前なら選び直せます。家族の様子では父母の能力・疲労と子どもの観察、前の半年の結果を確認できます。"}
                  </p>
                  <p>
                    20歳までの40期と、その後の人生をたどります。家族の危機は修復できますが、離婚・一家離散が起きるとゲームオーバーです。
                  </p>
                  <button
                    className="rpg-action"
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
                    className="rpg-action"
                    onClick={() => {
                      setTab("history");
                      void readExtra("history");
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
                      <button
                        className="rpg-action"
                        disabled={busy || !projection.can_advance}
                        onClick={() => void update("advance")}
                      >
                        半年を進める →
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
            {tab === "play" && !ended && life && (
              <LifeAdvance state={state} onEvents={() => setEventResult(true)} />
            )}
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
      <nav className="rpg-menu" aria-label="ゲーム内" inert={showingResult}>
        {(["play", "family", "history", "help"] as const).map((item) => (
          <button
            key={item}
            aria-current={tab === item ? "page" : undefined}
            onClick={() => {
              setTab(item);
              if (item === "history") void readExtra("history");
            }}
          >
            {item === "play"
              ? ended
                ? "人生の結末"
                : "いまの暮らし"
              : item === "family"
                ? "家族の様子"
                : item === "history"
                  ? "家族の記録"
                  : "遊び方"}
          </button>
        ))}
      </nav>
      {showingResult && (
        <EventDialog
          events={turn.event_results}
          legacyLines={turn.event_result}
          headingRef={eventHeading}
          nextLabel={
            life
              ? "暮らしのメニューへ →"
              : turn.answered === 3 && !choice
                ? "半年の確認へ →"
                : "3つの判断へ →"
          }
          onContinue={() => {
            setEventResult(false);
            setReadEventTurn(eventTurn);
          }}
        />
      )}
    </div>
  );
}
