import { StrictMode, useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  Outlet,
  Link,
  useNavigate,
} from "@tanstack/react-router";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { useStore } from "@nanostores/react";
import { Button } from "./components/ui/8bit/button";
import {
  $response,
  $busy,
  $error,
  $notice,
  $draft,
  $dirty,
  $extra,
  loadRun,
  update,
  createRun,
  readExtra,
  downloadSave,
  repository,
} from "./stores/game";
import { SCENARIOS } from "./service/service";
import { actions } from "./service/contract";
import { preset, PRESETS } from "./service/presets";
import type { PublicState, History, Result } from "./engine/types";
import { clone, PEOPLE } from "./engine/shared";
import { sceneFor } from "./lib/scene";
import hero from "../assets/marketing/hero.png";
import "./styles.css";
const labels: Record<string, string> = {
  work: "仕事",
  care: "世話",
  bond: "関わり",
  rest: "休息",
  self: "自分の時間",
  domain: "活動",
  level: "活動の強度",
  sponsor: "活動の担当",
  style: "関わり方",
  help: "支援",
  normal: "通常勤務",
  reduced: "短時間勤務",
  heavy: "多めに働く",
  none: "なし",
  study: "学習",
  craft: "創作",
  respect: "意思を尊重する",
  coach: "一緒に目標を立てる",
  push: "強く促す",
  grand: "祖父母に頼む",
  paid: "有料の支援",
  A: "親A",
  B: "親B",
  stress: "疲れ",
  health: "健康",
  fulfillment: "充実",
  social: "交流",
  regret: "後悔",
  relationship: "関係",
  security: "暮らしの安心",
  child_assurance: "子への安心",
};
function Root() {
  const dirty = useStore($dirty);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  return (
    <MotionConfig reducedMotion="user">
      <a className="skip" href="#main">
        本文へ
      </a>
      <Outlet />
    </MotionConfig>
  );
}
function Header() {
  return (
    <header className="header">
      <Link
        to="/"
        className="brand"
        onClick={(e) => {
          if ($dirty.get()) {
            e.preventDefault();
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
  const error = useStore($error),
    notice = useStore($notice);
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
function Home() {
  const nav = useNavigate(),
    busy = useStore($busy);
  const [saves, setSaves] = useState<Awaited<ReturnType<typeof repository.list>>>([]),
    [scenario, setScenario] = useState("home-01"),
    [seed, setSeed] = useState("0");
  useEffect(() => {
    $error.set("");
    $notice.set("");
    repository
      .list()
      .then(setSaves)
      .catch(() => {
        $error.set("保存領域を開けません。ブラウザのストレージ設定をご確認ください。");
      });
  }, []);
  async function begin(e: FormEvent) {
    e.preventDefault();
    const id = await createRun(scenario, seed.trim() === "" ? NaN : Number(seed));
    if (id) await nav({ to: "/play/$runId", params: { runId: id } });
  }
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
          <img
            src={hero}
            alt="親伝説。洗濯物の山と小さな家族を描いた、白黒の育児デスクトップ。"
            fetchPriority="high"
          />
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
            <form onSubmit={begin}>
              <div className="start-fields">
                <label>
                  家庭
                  <select value={scenario} onChange={(e) => setScenario(e.target.value)}>
                    {SCENARIOS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  人生のシード
                  <input
                    type="number"
                    min="0"
                    max="4294967295"
                    step="1"
                    value={seed}
                    onChange={(e) => setSeed(e.target.value)}
                    required
                  />
                </label>
              </div>
              <Button type="submit" size="lg" disabled={busy}>
                新しい人生をはじめる <span aria-hidden="true">↗</span>
              </Button>
            </form>
            <p className="fine">途中の選択は、このブラウザに保存されます。</p>
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
                {saves.map((s, i) => (
                  <li key={s.id}>
                    <Link to="/play/$runId" params={{ runId: s.id }}>
                      <span>人生の記録 {saves.length - i}</span>
                      <strong>
                        {s.phase === "finished"
                          ? "人生を振り返る"
                          : `${Math.floor(s.turn / 2)}歳${s.turn % 2 ? "6か月" : ""}から再開`}{" "}
                        →
                      </strong>
                      <small>{new Date(s.updated_at).toLocaleString("ja-JP")}</small>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <label className="import">
              保存ファイルを取り込む
              <input
                type="file"
                accept="application/json,.json"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    if (file.size > 25_000_000) throw new Error("保存ファイルは25MBまでです。");
                    const id = await repository.restore(await file.text());
                    await nav({ to: "/play/$runId", params: { runId: id } });
                  } catch (err) {
                    $error.set(err instanceof Error ? err.message : "読み込めませんでした");
                  }
                  e.target.value = "";
                }}
              />
            </label>
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
function PlanEditor({ pub }: { pub: PublicState }) {
  const draft = useStore($draft),
    busy = useStore($busy),
    dirty = useStore($dirty);
  if (!draft) return null;
  const fields = actions([]).plan_fields;
  const get = (path: string) =>
    path.split(".").reduce((obj, key) => (obj as Record<string, unknown>)[key], draft as unknown);
  function set(path: string, value: string | number) {
    const next = clone(draft!);
    const keys = path.split(".");
    let obj = next as unknown as Record<string, unknown>;
    for (const k of keys.slice(0, -1)) obj = obj[k] as Record<string, unknown>;
    obj[keys.at(-1)!] = value;
    if (path === "activity.domain")
      next.activity.level = value === "none" ? 0 : Math.max(1, next.activity.level);
    if (path === "activity.level") {
      if (value === 0) next.activity.domain = "none";
      else if (next.activity.domain === "none") next.activity.domain = "craft";
    }
    $draft.set(next);
  }
  return (
    <section className="plan-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">PLAN THE NEXT SIX MONTHS</span>
          <h2>今期の方針</h2>
        </div>
        <span className="muted">
          {dirty ? "未保存の編集があります" : "前期の方針を引き継ぎます"}
        </span>
      </div>
      <fieldset disabled={busy}>
        <legend className="sr-only">方針を編集</legend>
        <div className="presets">
          {Object.entries(PRESETS).map(([id, label]) => (
            <button key={id} onClick={() => $draft.set(preset(pub, id as keyof typeof PRESETS))}>
              {label}
            </button>
          ))}
        </div>
        <div className="allocations">
          {PEOPLE.map((p) => (
            <div key={p}>
              <h3>
                親{p}
                <span>使える時間：12単位</span>
              </h3>
              <div className="fields">
                {fields
                  .filter((f) => f.path.startsWith(`parents.${p}`))
                  .map((f) => (
                    <label key={f.path}>
                      {labels[f.path.split(".").at(-1)!]}
                      {f.enum ? (
                        <select
                          value={String(get(f.path))}
                          onChange={(e) => set(f.path, e.target.value)}
                        >
                          {f.enum.map((v) => (
                            <option key={v} value={v}>
                              {labels[v]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="number"
                          min={f.min!}
                          max={f.max!}
                          step="1"
                          value={Number.isFinite(Number(get(f.path))) ? Number(get(f.path)) : ""}
                          onChange={(e) =>
                            set(f.path, e.target.value === "" ? NaN : Number(e.target.value))
                          }
                        />
                      )}
                    </label>
                  ))}
              </div>
            </div>
          ))}
        </div>
        <div className="activity-fields">
          {fields
            .filter((f) => !f.path.startsWith("parents"))
            .map((f) => (
              <label key={f.path}>
                {labels[f.path.split(".").at(-1)!]}
                {f.enum ? (
                  <select value={String(get(f.path))} onChange={(e) => set(f.path, e.target.value)}>
                    {f.enum.map((v) => (
                      <option key={v} value={v}>
                        {labels[v] ?? v}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={Number(get(f.path))}
                    onChange={(e) => set(f.path, Number(e.target.value))}
                  >
                    {[0, 1, 2].map((v) => (
                      <option key={v} value={v}>
                        {v === 0 ? "なし" : v === 1 ? "ゆるやかに" : "しっかり"}
                      </option>
                    ))}
                  </select>
                )}
              </label>
            ))}
        </div>
        <div className="plan-tools">
          <button
            onClick={() => {
              const next = clone(draft);
              const care = pub.forecast!.care_required;
              next.parents.A.care = Math.ceil(care / 2);
              next.parents.B.care = Math.floor(care / 2);
              $draft.set(next);
            }}
          >
            世話の配分を合わせる
          </button>
          <button onClick={() => $draft.set(clone(pub.forecast!.fallback_plan))}>
            無理のない案
          </button>
          <button onClick={() => void update("reset-plan")}>前期の方針に戻す</button>
        </div>
        <div className="plan-save">
          <Button disabled={!dirty || busy} onClick={() => void update("plan", draft)}>
            方針を保存
          </Button>
          {dirty && <button onClick={() => $draft.set(clone(pub.plan))}>編集を取り消す</button>}
        </div>
      </fieldset>
    </section>
  );
}
function Family({ pub }: { pub: PublicState }) {
  return (
    <aside className="family">
      <span className="eyebrow">OUR FAMILY</span>
      <h2>家族のようす</h2>
      {PEOPLE.map((p) => (
        <div className="parent" key={p}>
          <h3>
            親{p}
            <span>{Math.floor(pub.parents[p].age_months / 12)}歳</span>
          </h3>
          {(["stress", "health", "fulfillment", "social", "regret"] as const).map((k) => (
            <div className="stat" key={k}>
              <span>{labels[k]}</span>
              <meter
                min="0"
                max="100"
                value={pub.parents[p][k]}
                aria-label={`親${p}の${labels[k]}`}
              />
              <b>{pub.parents[p][k]}</b>
            </div>
          ))}
        </div>
      ))}
      <div className="family-detail">
        <span>夫婦の関係</span>
        <strong>{pub.couple}</strong>
        <span>祖父母の体力</span>
        <strong>{pub.grandparents.health}</strong>
        <span>祖父母との関係</span>
        <strong>{pub.grandparents.relation}</strong>
        <span>援助の余裕</span>
        <strong>{pub.grandparents.funds}万円</strong>
        <span>地域とのつながり</span>
        <strong>{pub.grandparents.network ? "あり" : "なし"}</strong>
      </div>
    </aside>
  );
}
function Timeline({ items }: { items: History[] }) {
  return (
    <section className="timeline">
      <span className="eyebrow">FAMILY ARCHIVE</span>
      <h1>家族の記録</h1>
      {!items.length && <p>最初の半年を終えると、ここに記録が残ります。</p>}
      {items.map((h) => (
        <article key={h.index}>
          <div className="date">
            {Math.floor(h.ages.child_months / 12)}歳{h.ages.child_months % 12 ? "6か月" : ""}
            <small>{h.kind === "turn" ? `第${h.turn}期` : "成人後の節目"}</small>
          </div>
          <div>
            {h.events.map((e) => (
              <p key={e.instance_id}>{e.text}</p>
            ))}
            {h.text.map((text, i) => (
              <p key={i} className="muted">
                {text}
              </p>
            ))}
            {h.money.map((m) => (
              <p className="ledger" key={m.scope}>
                {m.scope === "household" ? "家計" : `親${m.scope}`}：{m.before} ＋ {m.income} −{" "}
                {m.expense}
                {m.cap_overflow ? ` − 計上外${m.cap_overflow}` : ""} ＝ {m.after}万円
              </p>
            ))}
            {h.observations.length > 0 && (
              <details>
                <summary>この頃のようすと方針</summary>
                {h.observations.map((o) => (
                  <p key={o.code}>{o.text}</p>
                ))}
                {h.actions &&
                  PEOPLE.map((p) => (
                    <p key={p}>
                      親{p}：
                      {Object.entries(h.actions!.plan.parents[p])
                        .map(([k, v]) => `${labels[k]} ${labels[String(v)] ?? v}`)
                        .join(" ／ ")}
                    </p>
                  ))}
              </details>
            )}
            {h.related.length > 0 && (
              <p className="fine">以前の選択とのつながり：{h.related.join("、")}</p>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}
function Ending({ result }: { result: Result }) {
  return (
    <motion.section
      className="ending"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <span className="eyebrow">LIFE GOES ON · {result.ending.id}</span>
      <h1>{result.ending.title}</h1>
      <p className="ending-story">{result.ending.text}</p>
      <div className="results">
        {PEOPLE.map((p) => {
          const v = result.parents[p];
          return (
            <div key={p}>
              <span className="eyebrow">
                親{p}の人生 · {v.death_age}歳
              </span>
              <h2>
                幸福 <strong>{v.happiness}</strong>
                <small> / 100</small>
              </h2>
              <p>{v.label}</p>
              <dl>
                {Object.entries(v.axes).map(([k, n]) => (
                  <div key={k}>
                    <dt>{labels[k]}</dt>
                    <dd>{n}</dd>
                  </div>
                ))}
                <div>
                  <dt>残った資金</dt>
                  <dd>{v.cash}万円</dd>
                </div>
              </dl>
            </div>
          );
        })}
        <div>
          <span className="eyebrow">子どもの人生 · {result.child.age}歳</span>
          <h2>
            幸福 <strong>{result.child.happiness}</strong>
            <small> / 100</small>
          </h2>
          <p>{result.child.residence === "far" ? "遠くの街で暮らす" : "近くで暮らす"}</p>
          <dl>
            <div>
              <dt>主体性</dt>
              <dd>{result.child.autonomy}</dd>
            </div>
            <div>
              <dt>社会的成果</dt>
              <dd>{result.child.social_success}</dd>
            </div>
          </dl>
        </div>
      </div>
      <div className="story-lines">
        {result.story.map((s, i) => (
          <p key={i}>{s}</p>
        ))}
      </div>
      <p className="fine">家族それぞれの幸せを振り返る、このゲームの評価です。</p>
    </motion.section>
  );
}
function Play() {
  const { runId } = playRoute.useParams(),
    response = useStore($response),
    busy = useStore($busy),
    dirty = useStore($dirty),
    extra = useStore($extra),
    error = useStore($error);
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
  const pub = response?.run_id === runId ? response.public : null;
  const changeTab = (next: typeof tab) => {
    setTab(next);
    if (next === "history") void readExtra("history");
    if (next === "play" && response?.phase === "finished") void readExtra("result");
  };
  if (!pub)
    return (
      <>
        <Header />
        <main id="main" className="loading">
          <p>{busy ? "予定表を開いています…" : "保存を開けませんでした。"}</p>
          <ErrorNotice />
          <Link to="/">保存一覧へ戻る</Link>
        </main>
      </>
    );
  const f = pub.forecast,
    scene = sceneFor(pub.time),
    last = response?.payload?.history_added?.find((h) => h.kind === "turn");
  return (
    <>
      <Header />
      <div className="game-nav">
        <div>
          <span className="eyebrow">FAMILY FILE</span>
          <span className="run-id">{runId.slice(0, 8)}</span>
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
              <li>出来事に回答する。確定するまでは選び直せる。</li>
              <li>収支と時間を確認し「半年を進める」。</li>
            </ol>
            <p>
              各親の時間は12単位。世話は必要量ちょうどに配分します。年代が変わると必要な世話も変わります。活動は3歳から始められます。
            </p>
            <p>
              40期で20歳になり、その後は老後と親ごとの最期まで自動で進みます。「家族の記録」で全期間を振り返れます。
            </p>
            <p>
              方針・回答・確定はこのブラウザへ保存されます。ブラウザのデータ削除で保存も消えます。別の端末やブラウザへ移る場合は、書き出したファイルを保存一覧から取り込んでください。同じ保存の上書きは行いません。
            </p>
            <p>
              同じシードと同じ選択で、同じ人生を再現できます。親の幸福、子どもの幸福、社会的な成果は、それぞれ別に振り返ります。
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
        ) : (
          <>
            <div className="timebar">
              <div>
                <span className="eyebrow">
                  CHAPTER {String(Math.floor(pub.time.completed_turns / 2) + 1).padStart(2, "0")}
                </span>
                <h1>
                  {Math.floor(pub.time.child_months / 12)}
                  <small>歳{pub.time.child_months % 12 ? "6か月" : ""}</small>
                  <span>{pub.time.season}</span>
                </h1>
              </div>
              <div className="progress">
                <span>
                  第 {pub.time.next_turn} 期 / 40 <b>{pub.time.school_label}</b>
                </span>
                <progress value={pub.time.completed_turns} max="40" aria-label="育児の進捗" />
              </div>
            </div>
            <div className="game-columns">
              <div className="play-main">
                <AnimatePresence mode="wait">
                  <motion.section
                    key={pub.time.completed_turns}
                    className="scene"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.22 }}
                  >
                    <span className="eyebrow">TODAY, AT HOME</span>
                    <h2>{scene.title}</h2>
                    <p className="scene-text">{scene.text}</p>
                    <p className="season">{scene.season}</p>
                    <div className="observations">
                      {pub.observations.map((o) => (
                        <p key={o.code}>
                          <span aria-hidden="true">·</span>{" "}
                          {o.subject === "A" || o.subject === "B" ? `親${o.subject}へ：` : ""}
                          {o.text}
                        </p>
                      ))}
                    </div>
                  </motion.section>
                </AnimatePresence>
                {last && (
                  <section className="recap">
                    <h3>ひとつ前の半年</h3>
                    {last.text.map((line, i) => (
                      <p key={i}>{line}</p>
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
                    response!.choices.map((e) => (
                      <article key={e.instance_id}>
                        <p className="event-text">{e.text}</p>
                        <div className="choices">
                          {e.options.map((o, i) => {
                            const selected = pub.answers.some(
                              (a) =>
                                a.option_id === o.option_id && a.event_instance === e.instance_id,
                            );
                            return (
                              <motion.button
                                key={o.option_id}
                                disabled={busy}
                                aria-pressed={selected}
                                whileHover={{ x: 3 }}
                                onClick={() =>
                                  void update("choose", {
                                    event_instance: e.instance_id,
                                    option_id: o.option_id,
                                  })
                                }
                              >
                                <span className="choice-number">
                                  {selected ? "✓" : String(i + 1).padStart(2, "0")}
                                </span>
                                <span>
                                  {o.label}
                                  <small>
                                    費用 {o.cost}万円{o.income ? ` ／ 入金 ${o.income}万円` : ""}
                                    {!o.available ? " ／ 配分の調整が必要" : ""}
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
                <PlanEditor pub={pub} />
              </div>
              <div>
                <Family pub={pub} />
                {f && (
                  <section className="forecast">
                    <span className="eyebrow">HOUSEHOLD BUDGET</span>
                    <h2>半年の見通し</h2>
                    <dl>
                      <div>
                        <dt>いまの資金</dt>
                        <dd>{pub.cash}万円</dd>
                      </div>
                      <div>
                        <dt>入ってくるお金</dt>
                        <dd>＋{f.income}万円</dd>
                      </div>
                      <div>
                        <dt>使うお金</dt>
                        <dd>−{f.cost}万円</dd>
                      </div>
                      <div className="balance">
                        <dt>予測残金</dt>
                        <dd>
                          {f.projected_cash}
                          <small> 万円</small>
                        </dd>
                      </div>
                    </dl>
                    <p>
                      時間：親A {f.time_used.A}/12 · 親B {f.time_used.B}/12
                    </p>
                    <p>
                      世話：{f.care_allocated} / 必要 {f.care_required}単位
                    </p>
                    <p className="fine">
                      予期せぬ出費は最大{f.uncertain_expense_cap}
                      万円。未回答の出来事の費用は未計上。
                    </p>
                    {dirty && (
                      <p className="warning">編集中の方針を保存すると、見通しを更新します。</p>
                    )}
                    {f.reasons.map((r, i) => (
                      <p className="warning" key={i}>
                        {r.message}
                      </p>
                    ))}
                    <Button
                      className="advance"
                      size="lg"
                      disabled={busy || dirty || !f.can_advance}
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
        <Link
          to="/"
          onClick={(e) => {
            if (dirty) {
              e.preventDefault();
              $error.set("方針を保存するか編集を取り消してください。");
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
const rootRoute = createRootRoute({
  component: Root,
  notFoundComponent: () => (
    <main className="loading">
      <h1>ページが見つかりません。</h1>
      <Link to="/">保存一覧へ</Link>
    </main>
  ),
});
const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Home });
const playRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/play/$runId",
  component: Play,
});
const router = createRouter({ routeTree: rootRoute.addChildren([homeRoute, playRoute]) });
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
