import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { useStore } from "@nanostores/react";
import { Button } from "../../components/ui/8bit/button";
import {
  $response,
  $busy,
  $error,
  $notice,
  $dirty,
  $extra,
  loadRun,
  update,
  readExtra,
  downloadSave,
  repository,
} from "../../stores/game";
import { defaultContent } from "../../content/catalog";
import { ContentImage } from "../../components/game/content_image";
import { StartForm } from "../../components/game/start_form";
import { ImportForm } from "../../components/game/import_form";
import { sceneFor } from "../../lib/scene";

import { PlanEditor } from "../../components/game/plan_editor";
import { Family } from "../../components/game/family";
import { Timeline } from "../../components/game/timeline";
import { Ending } from "../../components/game/ending";
export function GameLayout({ children }: { children: ReactNode }) {
  const dirty = useStore($dirty);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  return (
    <MotionConfig reducedMotion="user">
      <a className="skip" href="#main">
        本文へ
      </a>
      {children}
    </MotionConfig>
  );
}
function Header() {
  return (
    <header className="header">
      <Link
        to="/"
        className="brand"
        onClick={(event) => {
          if ($dirty.get()) {
            event.preventDefault();
            $error.set("方針を保存するか、編集を取り消してから一覧へ戻ってください。");
          }
        }}
      >
        親伝説 <span>BECOME A PARENT</span>
      </Link>
      <span className="edition">BROWSER EDITION · 01</span>
    </header>
  );
}
function ErrorNotice() {
  const error = useStore($error);
  const notice = useStore($notice);
  return (
    <>
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      <div className="save-notice" role="status">
        {notice}
      </div>
    </>
  );
}
export function Home() {
  const navigate = useNavigate();
  const [saves, setSaves] = useState<Awaited<ReturnType<typeof repository.list>>>([]);
  useEffect(() => {
    $error.set("");
    $notice.set("");
    repository
      .list()
      .then(setSaves)
      .catch(() => {
        $error.set(
          "保存データを開けません。ブラウザでデータの保存が許可されているか確認してください。",
        );
      });
  }, []);
  return (
    <>
      <Header />
      <main id="main" className="home">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="poster"
        >
          <ContentImage visual={defaultContent.visuals.hero} priority />
          <p className="tagline">半年ずつ、親になっていく。</p>
        </motion.div>
        <section className="start-area">
          <div>
            <span className="eyebrow">NEW LIFE</span>
            <h1>はじめまして、親です。</h1>
            <p className="muted">
              子育て20年。その先の人生まで。
              <br />
              予定どおりにいかない毎日を、あなたの選択で。
            </p>
            <StartForm
              onCreated={async (id) => {
                await navigate({ to: "/play/$runId", params: { runId: id } });
              }}
            />
            <p className="fine">ゲームの進み具合は、このブラウザに自動保存されます。</p>
          </div>
          <div className="continue">
            <span className="eyebrow">YOUR STORIES</span>
            <h2>つづきから</h2>
            {saves.length === 0 ? (
              <p className="muted">
                まだ、まっさらな予定表。
                <br />
                最初の人生をはじめましょう。
              </p>
            ) : (
              <ul className="save-list">
                {saves.map((savedRun, index) => (
                  <li key={savedRun.id}>
                    <Link to="/play/$runId" params={{ runId: savedRun.id }}>
                      <span>人生の記録 {saves.length - index}</span>
                      <strong>
                        {savedRun.phase === "finished"
                          ? "人生を振り返る"
                          : `${Math.floor(savedRun.turn / 2)}歳${savedRun.turn % 2 ? "6か月" : ""}から再開`}{" "}
                        →
                      </strong>
                      <small>{new Date(savedRun.updated_at).toLocaleString("ja-JP")}</small>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <ImportForm
              onImported={async (id) => {
                await navigate({ to: "/play/$runId", params: { runId: id } });
              }}
            />
          </div>
        </section>
        <ErrorNotice />
        <footer>
          一人の子ども、二人の親、いくつもの幸せ。
          <span>この作品は、架空の育児シミュレーションです。</span>
        </footer>
      </main>
    </>
  );
}
export function Play({ runId }: { runId: string }) {
  const response = useStore($response);
  const busy = useStore($busy);
  const dirty = useStore($dirty);
  const extra = useStore($extra);
  const error = useStore($error);
  const [tab, setTab] = useState<"play" | "history" | "help">("play");
  useEffect(() => {
    setTab("play");
    void loadRun(runId);
  }, [runId]);
  useEffect(() => {
    if (
      response?.run_id === runId &&
      response.phase === "finished" &&
      !extra.result &&
      tab === "play"
    )
      void readExtra("result");
  }, [response?.phase, response?.run_id, runId, tab, extra.result]);
  const publicState = response?.run_id === runId ? response.public : null;
  const changeTab = (next: typeof tab) => {
    setTab(next);
    if (next === "history") void readExtra("history");
    if (next === "play" && response?.phase === "finished") void readExtra("result");
  };
  if (!publicState)
    return (
      <>
        <Header />
        <main id="main" className="loading">
          <p>{busy ? "予定表を開いています…" : "保存データを開けませんでした。"}</p>
          <ErrorNotice />
          <Link to="/">保存一覧へ戻る</Link>
        </main>
      </>
    );
  const projection = publicState.forecast;
  const scene = sceneFor(publicState);
  const last = response?.payload?.history_added?.find((entry) => entry.kind === "turn");
  return (
    <>
      <Header />
      <div className="game-nav">
        <div>
          <span className="eyebrow">FAMILY FILE</span>
          <span className="run-id">
            {runId.slice(0, 8)} · {publicState.content.difficulty_label}
            {publicState.content.packs.map((p) => ` · ${p.label}`).join("")}
          </span>
        </div>
        <nav aria-label="ゲーム内">
          <button
            aria-current={tab === "play" ? "page" : undefined}
            onClick={() => changeTab("play")}
          >
            {response?.phase === "finished" ? "人生の結末" : "いまの暮らし"}
          </button>
          <button
            aria-current={tab === "history" ? "page" : undefined}
            onClick={() => changeTab("history")}
          >
            家族の記録
          </button>
          <button
            aria-current={tab === "help" ? "page" : undefined}
            onClick={() => changeTab("help")}
          >
            遊び方
          </button>
          <button onClick={() => void downloadSave(runId)} disabled={busy || dirty}>
            書き出し
          </button>
        </nav>
      </div>
      <main id="main" className="game">
        <ErrorNotice />
        {error && (
          <button
            className="refresh"
            onClick={() => {
              if (!dirty) void loadRun(runId);
              else $error.set("編集を取り消してから最新の保存を読み直してください。");
            }}
          >
            最新の保存を読み直す
          </button>
        )}
        {tab === "help" ? (
          <section className="help">
            <span className="eyebrow">HOW TO PLAY</span>
            <h1>半年ずつ、選んでいこう。</h1>
            <ol>
              <li>子どもと家族のようすを読む。</li>
              <li>仕事、世話、休息などの方針を決めて保存する。</li>
              <li>出来事への対応を選ぶ。半年を進めるまでは選び直せる。</li>
              <li>収支と時間を確認し「半年を進める」。</li>
            </ol>
            <p>
              親一人につき、半年で使える時間は12単位です。世話の時間は、支援でまかなう分も含めて必要な単位数に合わせます。子どもの年齢によって、必要な世話の時間は変わります。学習や創作の活動は3歳から始められます。
            </p>
            <p>
              半年を40回進めると子どもが20歳になり、その後は親の老後から、それぞれの最期まで自動で進みます。「家族の記録」で全期間を振り返れます。
            </p>
            <p>
              方針や出来事への対応、半年ごとの結果は、このブラウザに保存されます。ブラウザのデータを削除すると、ゲームの保存データも消えます。別の端末やブラウザへ移る場合は、書き出したファイルを保存一覧から取り込んでください。同じ保存データがすでにある場合は取り込めません。
            </p>
            <p>
              シードは、偶然の出来事を決めるための番号です。家庭・難易度・追加パック・シードが同じなら、同じ選択で同じ人生を再現できます。親の幸福、子どもの幸福、社会的な成果は、それぞれ別に振り返ります。
            </p>
          </section>
        ) : tab === "history" ? (
          <Timeline items={extra.items ?? []} />
        ) : response?.phase === "finished" ? (
          extra.result ? (
            <Ending result={extra.result} />
          ) : (
            <p>人生を振り返っています…</p>
          )
        ) : null}
        {response?.phase !== "finished" && (
          <div hidden={tab !== "play"}>
            <div className="timebar">
              <div>
                <span className="eyebrow">
                  CHAPTER{" "}
                  {String(Math.floor(publicState.time.completed_turns / 2) + 1).padStart(2, "0")}
                </span>
                <h1>
                  {Math.floor(publicState.time.child_months / 12)}
                  <small>歳{publicState.time.child_months % 12 ? "6か月" : ""}</small>
                  <span>{publicState.time.season}</span>
                </h1>
              </div>
              <div className="progress">
                <span>
                  第 {publicState.time.next_turn} 期 / 40 <b>{publicState.time.school_label}</b>
                </span>
                <progress
                  value={publicState.time.completed_turns}
                  max="40"
                  aria-label="育児の進捗"
                />
              </div>
            </div>
            <div className="game-columns">
              <div className="play-main">
                <AnimatePresence mode="wait">
                  <motion.section
                    key={publicState.time.completed_turns}
                    className="scene"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.22 }}
                  >
                    <span className="eyebrow">TODAY, AT HOME</span>
                    <h2>{scene.title}</h2>
                    {scene.visual && <ContentImage visual={scene.visual} />}
                    <p className="scene-text">{scene.text}</p>
                    <p className="season">{scene.season}</p>
                    <div className="observations">
                      {publicState.observations.map((observation) => (
                        <p key={observation.code}>
                          <span aria-hidden="true">·</span>{" "}
                          {observation.subject === "A" || observation.subject === "B"
                            ? `親${observation.subject}へ：`
                            : ""}
                          {observation.text}
                        </p>
                      ))}
                    </div>
                  </motion.section>
                </AnimatePresence>
                {last && (
                  <section className="recap">
                    <h3>前の半年の振り返り</h3>
                    {last.text.map((line, index) => (
                      <p key={index}>{line}</p>
                    ))}
                    <p className="fine">
                      家計 {last.money[0].before} → {last.money[0].after}万円
                    </p>
                  </section>
                )}
                <section className="events">
                  <span className="eyebrow">A LITTLE UNEXPECTED</span>
                  <h2>今期の出来事</h2>
                  {response!.choices.length === 0 ? (
                    <p className="muted">大きな出来事はない。いつもの日々を、大切に。</p>
                  ) : (
                    response!.choices.map((event) => (
                      <article key={event.instance_id}>
                        <p className="event-text">{event.text}</p>
                        {event.visual && <ContentImage visual={event.visual} />}
                        <div className="choices">
                          {event.options.map((option, index) => {
                            const selected = publicState.answers.some(
                              (answer) =>
                                answer.option_id === option.option_id &&
                                answer.event_instance === event.instance_id,
                            );
                            return (
                              <motion.button
                                key={option.option_id}
                                disabled={busy}
                                aria-pressed={selected}
                                whileHover={{ x: 3 }}
                                onClick={() =>
                                  void update("choose", {
                                    event_instance: event.instance_id,
                                    option_id: option.option_id,
                                  })
                                }
                              >
                                <span className="choice-number">
                                  {selected ? "✓" : String(index + 1).padStart(2, "0")}
                                </span>
                                <span>
                                  {option.label}
                                  <small>
                                    費用 {option.cost}万円
                                    {option.income ? ` ／ 入金 ${option.income}万円` : ""}
                                    {!option.available ? " ／ 配分の調整が必要" : ""}
                                  </small>
                                </span>
                              </motion.button>
                            );
                          })}
                        </div>
                      </article>
                    ))
                  )}
                </section>
                <PlanEditor key={runId} publicState={publicState} />
              </div>
              <div>
                <Family publicState={publicState} />
                {projection && (
                  <section className="forecast">
                    <span className="eyebrow">HOUSEHOLD BUDGET</span>
                    <h2>半年の見通し</h2>
                    <dl>
                      <div>
                        <dt>いまの資金</dt>
                        <dd>{publicState.cash}万円</dd>
                      </div>
                      <div>
                        <dt>入ってくるお金</dt>
                        <dd>＋{projection.income}万円</dd>
                      </div>
                      <div>
                        <dt>使うお金</dt>
                        <dd>−{projection.cost}万円</dd>
                      </div>
                      <div className="balance">
                        <dt>半年後に残るお金</dt>
                        <dd>
                          {projection.projected_cash}
                          <small> 万円</small>
                        </dd>
                      </div>
                    </dl>
                    <p>
                      時間：親A {projection.time_used.A}/12 · 親B {projection.time_used.B}/12
                    </p>
                    <p>
                      世話：{projection.care_allocated} / 必要 {projection.care_required}単位
                    </p>
                    <p className="fine">
                      予期せぬ出費は最大{projection.uncertain_expense_cap}
                      万円です。まだ選んでいない出来事への対応費用は含まれていません。
                    </p>
                    {dirty && (
                      <p className="warning">方針を保存すると、その内容で見通しが更新されます。</p>
                    )}
                    {projection.reasons.map((reason, index) => (
                      <p className="warning" key={index}>
                        {reason.message}
                      </p>
                    ))}
                    <Button
                      className="advance"
                      size="lg"
                      disabled={busy || dirty || !projection.can_advance}
                      onClick={() => void update("advance")}
                    >
                      {busy ? "保存しています…" : "半年を進める →"}
                    </Button>
                  </section>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
      <footer className="game-footer">
        <Link
          to="/"
          onClick={(event) => {
            if (dirty) {
              event.preventDefault();
              $error.set("方針を保存するか、編集を取り消してください。");
            }
          }}
        >
          ← 保存一覧
        </Link>
        <span>親伝説 — Become a Parent</span>
      </footer>
    </>
  );
}
