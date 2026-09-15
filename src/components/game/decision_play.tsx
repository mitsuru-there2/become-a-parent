import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Dialog } from "radix-ui";
import { useStore } from "@nanostores/react";
import type { Choice, PublicState } from "../../engine/types";
import type { Response } from "../../service/service";
import { $busy, $error, $notice, $extra, update, readExtra, downloadSave } from "../../stores/game";
import { Family } from "./family";
import { Timeline } from "./timeline";
import { Ending } from "./ending";
import { Button } from "../ui/8bit/button";
import { labels } from "../../lib/labels";

function Options({ choice, state }: { choice: Choice; state: PublicState }) {
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
            onClick={() =>
              void update("choose", {
                event_instance: choice.instance_id,
                option_id: option.option_id,
              })
            }
          >
            <span className="choice-number">
              {selected ? "✓" : String(index + 1).padStart(2, "0")}
            </span>
            <span>
              <strong>{option.label}</strong>
              <small>
                費用 {option.cost}万円{option.income ? ` ／ 入金 ${option.income}万円` : ""}
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
  const [tab, setTab] = useState<"play" | "history" | "help">("play");
  const special = response.choices.find((c) => c.kind === "special");
  const projection = state.forecast;
  const ended = response.phase !== "childhood";
  const recap = turn.previous_result;
  useEffect(() => {
    if (response.phase === "finished" && tab === "play" && !extra.result) void readExtra("result");
  }, [response.phase, tab, extra.result]);
  return (
    <>
      <div className="game-nav">
        <div>
          <span className="eyebrow">FAMILY FILE</span>
          <span className="run-id">
            {response.run_id!.slice(0, 8)} · {state.content.difficulty_label}
          </span>
        </div>
        <nav aria-label="ゲーム内">
          <button aria-current={tab === "play" ? "page" : undefined} onClick={() => setTab("play")}>
            {ended ? "人生の結末" : "いまの暮らし"}
          </button>
          <button
            aria-current={tab === "history" ? "page" : undefined}
            onClick={() => {
              setTab("history");
              void readExtra("history");
            }}
          >
            家族の記録
          </button>
          <button aria-current={tab === "help" ? "page" : undefined} onClick={() => setTab("help")}>
            遊び方
          </button>
          <button disabled={busy} onClick={() => void downloadSave(response.run_id!)}>
            書き出し
          </button>
        </nav>
      </div>
      <main id="main" className="game decision-game">
        {!special && error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <p role="status" className="save-notice">
          {notice}
        </p>
        {tab === "history" ? (
          <Timeline items={extra.items ?? []} />
        ) : tab === "help" ? (
          <section className="help">
            <span className="eyebrow">HOW TO PLAY</span>
            <h1>半年ごとに、3つの判断。</h1>
            <ol>
              <li>最初に、その期の特殊イベントへの対応を選びます。対応はその場で確定します。</li>
              <li>
                子どもの年齢や家族の状況に合わせて、3つの判断が出ます。それぞれ1つずつ選んでください。
              </li>
              <li>「何もしない」も回答のひとつ。3つとも回答すると「半年を進める」を押せます。</li>
            </ol>
            <p>
              父と母の得意なことや疲労によって、同じ選択でも成果が変わります。各選択の費用や負担と、半年後の家計を確かめましょう。通常の判断は半年を進めるまで選び直せます。
            </p>
            <p>
              入園先などは継続費用がかかります。新たな行動をしなくても、生活費と継続費用は発生します。
            </p>
            <p>
              家族の様子は5段階。危機の間は修復できますが、離婚・一家離散が起きるとゲームオーバーです。家族の記録から、それまでの選択を振り返れます。
            </p>
            <p>
              育児は0歳から20歳までの40期。その後は父母の老後から最期までを自動でたどります。選択は自動保存され、中断したところから再開できます。
            </p>
          </section>
        ) : state.game_over ? (
          <section className="ending game-over">
            <span className="eyebrow">END OF THIS FAMILY STORY</span>
            <h1>ゲームオーバー — {state.game_over.title}</h1>
            <p className="ending-story">{state.game_over.text}</p>
            <p>第{state.game_over.turn}期までの選択は「家族の記録」に残っています。</p>
            <button
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
        ) : (
          <>
            <div className="timebar">
              <div>
                <span className="eyebrow">LIFE, SIX MONTHS AT A TIME</span>
                <h1>
                  {Math.floor(state.time.child_months / 12)}
                  <small>歳{state.time.child_months % 12 ? "6か月" : ""}</small>
                  <span>{state.time.season}</span>
                </h1>
              </div>
              <div className="progress">
                <span>
                  第 {state.time.next_turn} 期 / 40 <b>{state.time.school_label}</b>
                </span>
                <progress value={state.time.completed_turns} max={40} aria-label="育児の進捗" />
              </div>
            </div>
            <div className="game-columns">
              <div className="play-main">
                <section className="scene">
                  <span className="eyebrow">TODAY, AT HOME</span>
                  <h2>{state.scene?.title}</h2>
                  <p className="scene-text">{state.scene?.text}</p>
                  <details className="child-observations">
                    <summary>子どもの様子を読む</summary>
                    {state.observations.map((o) => (
                      <p key={o.code}>
                        {labels[o.subject] ? `${labels[o.subject]}へ：` : ""}
                        {o.text}
                      </p>
                    ))}
                  </details>
                </section>
                {recap && (
                  <section className="recap">
                    <h3>前の半年の振り返り</h3>
                    {recap.text.map((line, i) => (
                      <p key={i}>{line}</p>
                    ))}
                  </section>
                )}
                {turn.event_result.length > 0 && (
                  <details className="special-result">
                    <summary>今期の特殊イベントへの対応</summary>
                    {turn.event_result.map((line, i) => (
                      <p key={i}>{line}</p>
                    ))}
                  </details>
                )}
                <section className="decision-list" aria-label="今期の3つの判断">
                  <div className="decision-heading">
                    <div>
                      <span className="eyebrow">THREE DECISIONS</span>
                      <h2>この半年、どう過ごす？</h2>
                    </div>
                    <b aria-live="polite">{turn.answered} / 3 回答済み</b>
                  </div>
                  {special ? (
                    <p>特殊イベントに対応すると、今期の3つの判断が届きます。</p>
                  ) : (
                    response.choices.map((choice, index) => (
                      <article className="decision-card" key={choice.instance_id}>
                        <span className="eyebrow">
                          判断 {String(index + 1).padStart(2, "0")} · 必須
                        </span>
                        <h3>{choice.text}</h3>
                        <Options choice={choice} state={state} />
                      </article>
                    ))
                  )}
                </section>
              </div>
              <div className="decision-sidebar">
                <Family publicState={state} />
                {projection && (
                  <section className="forecast">
                    <span className="eyebrow">HOUSEHOLD BUDGET</span>
                    <h2>半年の見通し</h2>
                    <dl>
                      <div>
                        <dt>いまの資金</dt>
                        <dd>{state.cash}万円</dd>
                      </div>
                      <div>
                        <dt>収入</dt>
                        <dd>＋{projection.income}万円</dd>
                      </div>
                      <div>
                        <dt>支出</dt>
                        <dd>−{projection.cost}万円</dd>
                      </div>
                      <div className="balance">
                        <dt>半年後の資金</dt>
                        <dd>
                          {projection.projected_cash}
                          <small> 万円</small>
                        </dd>
                      </div>
                    </dl>
                    {turn.contract && (
                      <p className="fine">
                        現在の継続：{turn.contract.label}（{turn.contract.cost}万円／半年）
                      </p>
                    )}
                    <p className="fine">
                      支出には生活費と、選択後の継続費用を含みます。未回答の行動の費用は含みません。
                    </p>
                    {projection.reasons.map((r) => (
                      <p className="warning" key={r.path}>
                        {r.message}
                      </p>
                    ))}
                    <Button
                      className="advance"
                      size="lg"
                      disabled={busy || !projection.can_advance}
                      onClick={() => void update("advance")}
                    >
                      {busy ? "保存しています…" : "半年を進める →"}
                    </Button>
                  </section>
                )}
              </div>
            </div>
          </>
        )}
      </main>
      <footer className="game-footer">
        <Link to="/">← 保存一覧</Link>
        <span>選択は、このブラウザに自動保存されます。</span>
      </footer>
      <Dialog.Root open={!!special}>
        <Dialog.Portal>
          <Dialog.Overlay className="event-overlay" />
          <Dialog.Content
            className="event-dialog"
            onEscapeKeyDown={(e) => e.preventDefault()}
            onPointerDownOutside={(e) => e.preventDefault()}
            onInteractOutside={(e) => e.preventDefault()}
          >
            <span className="eyebrow">A LITTLE UNEXPECTED · 第{state.time.next_turn}期</span>
            <Dialog.Title>今期の特殊イベント</Dialog.Title>
            <Dialog.Description>{special?.text}</Dialog.Description>
            <p className="fine">対応を1つ選んでください。選択すると、その場で結果が確定します。</p>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            {special && <Options choice={special} state={state} />}
            <Link to="/" className="event-pause">
              中断して保存一覧へ戻る
            </Link>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
