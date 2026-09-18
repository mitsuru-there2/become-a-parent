import { useEffect, useRef, useState } from "react";
import { useStore } from "@nanostores/react";
import type { Choice, PublicState } from "../../engine/types";
import { $busy, update } from "../../stores/game";

function MenuIcon({ id }: { id: string }) {
  const paths: Record<string, string> = {
    education: "M3 5h7l2 2 2-2h7v15h-7l-2 2-2-2H3z M12 7v15",
    home: "M2 11 12 3l10 8 M5 9v12h14V9 M9 21v-7h6v7",
    grandparents: "M12 3 4 12h4l-5 6h7v4h4v-4h7l-5-6h4z",
    afterschool:
      "M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h4a4 4 0 0 0 4-4c0-4-5-6-9-6 M7 9h.1 M10 6h.1 M16 7h.1 M6 14h.1",
    work: "M3 7h18v14H3z M8 7V3h8v4 M3 12l9 3 9-3 M12 12v5",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[id] ?? paths.home} />
    </svg>
  );
}

function graphPositions(choices: Choice[]) {
  const map = new Map(choices.map((c) => [c.event_id, c]));
  const levels = new Map<string, number>();
  function level(id: string, seen = new Set<string>()): number {
    if (seen.has(id)) return 0;
    if (levels.has(id)) return levels.get(id)!;
    const parents = map.get(id)?.tree?.parents.filter((p) => map.has(p.id)) ?? [];
    const depth = parents.length
      ? 1 + Math.max(...parents.map((p) => level(p.id, new Set(seen).add(id))))
      : 0;
    levels.set(id, depth);
    return depth;
  }
  const rows = new Map<number, number>();
  return choices.map((choice) => {
    const column = level(choice.event_id);
    const row = rows.get(column) ?? 0;
    rows.set(column, row + 1);
    return { choice, x: column * 240 + 16, y: row * 116 + 16 };
  });
}

export function ActionTree({ state, choices }: { state: PublicState; choices: Choice[] }) {
  const [menu, setMenu] = useState<string | null>("education");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const treeRegion = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selectedId) detailHeading.current?.focus();
  }, [selectedId]);
  const busy = useStore($busy);
  const life = state.life!;
  const visible = menu ? choices.filter((c) => c.menu === menu) : choices;
  const nodes = graphPositions(visible);
  const selected = visible.find((c) => c.event_id === selectedId);
  const scheduled = choices.filter((c) => c.selected_option);
  const width = Math.max(240, ...nodes.map((n) => n.x + 220));
  const height = Math.max(140, ...nodes.map((n) => n.y + 112));
  return (
    <section className="life-content action-tree-content" aria-label="アクションツリー">
      <div className="tree-intro">
        <div>
          <span className="tree-eyebrow">FAMILY DECISIONS</span>
          <h2>この先の暮らしを、選ぼう。</h2>
        </div>
        <p>
          年収 <b>{life.annual_income}万円</b>
          <br />
          子どもの成績 <b>{life.study_score} / 100</b>
        </p>
      </div>
      <nav className="action-menu-icons" aria-label="暮らしの分類">
        {life.menus.map((item) => (
          <button
            key={item.id}
            aria-label={item.label}
            aria-pressed={menu === item.id}
            onClick={() => {
              setMenu(item.id);
              setSelectedId(null);
            }}
          >
            <MenuIcon id={item.id} />
            <strong>{item.label}</strong>
            <small>{choices.filter((c) => c.menu === item.id).length}のアクション</small>
          </button>
        ))}
      </nav>
      <div className="tree-toolbar">
        <h3>{life.menus.find((m) => m.id === menu)?.label ?? "すべてのアクション"}</h3>
        <button
          aria-pressed={menu === null}
          onClick={() => {
            setMenu(null);
            setSelectedId(null);
          }}
        >
          ツリー全体を見る
        </button>
      </div>
      <p className="tree-legend">
        ○ 選択可能　✓ 取得済み　◇ 条件待ち{" "}
        <span>未解放の枝もタップして計画できます。横・縦にスクロール →</span>
      </p>
      <div
        ref={treeRegion}
        className="tree-scroll"
        tabIndex={0}
        role="region"
        aria-label="アクションのつながり"
      >
        <div className="tree-canvas" style={{ width, height }}>
          <svg className="tree-edges" width={width} height={height} aria-hidden="true">
            {nodes.flatMap((node) =>
              node.choice.tree!.parents.map((parent) => {
                const from = nodes.find((n) => n.choice.event_id === parent.id);
                return from ? (
                  <path
                    key={`${parent.id}:${node.choice.event_id}`}
                    d={`M ${from.x + 204} ${from.y + 46} C ${from.x + 230} ${from.y + 46}, ${node.x - 25} ${node.y + 46}, ${node.x} ${node.y + 46}`}
                  />
                ) : null;
              }),
            )}
          </svg>
          {nodes.map(({ choice, x, y }) => {
            const options = choice.options.filter((o) => !o.option_id.endsWith(":cancel"));
            const acquired = options.some((o) => o.acquired);
            const current = life.policies.some((p) => p.id === choice.event_id);
            const available = options.some(
              (o) => o.available && o.option_id !== choice.current_option,
            );
            return (
              <button
                className={`tree-node ${acquired || current ? "is-acquired" : available ? "is-available" : "is-locked"}`}
                key={choice.event_id}
                aria-label={choice.text}
                style={{ left: x, top: y }}
                aria-pressed={selected?.event_id === choice.event_id}
                onClick={() => setSelectedId(choice.event_id)}
              >
                <span className="tree-node-top">
                  <MenuIcon id={choice.menu!} />
                  <span>{choice.tree!.min_age_months / 12}歳〜</span>
                  <b>
                    {choice.selected_option
                      ? "予定中"
                      : current
                        ? "継続中"
                        : acquired
                          ? "✓ 取得済み"
                          : available
                            ? "○ 選択可能"
                            : "◇ 条件待ち"}
                  </b>
                </span>
                <strong>{choice.text}</strong>
                <small>
                  {choice.decision_kind === "policy" ? "継続する方針" : "取得するアクション"}
                  {choice.fresh ? " · 解放！" : ""}
                </small>
              </button>
            );
          })}
        </div>
      </div>
      {selected ? (
        <article className="tree-detail life-decision" aria-label={selected.text}>
          <button
            className="life-cancel"
            onClick={() => {
              setSelectedId(null);
              treeRegion.current?.focus();
            }}
          >
            ← ツリーへ戻る
          </button>
          <header>
            <h3 ref={detailHeading} tabIndex={-1}>
              {selected.text}
            </h3>
            <span>
              {selected.tree!.min_age_months / 12}〜{Math.floor(selected.expires_age_months! / 12)}
              歳
            </span>
          </header>
          <p>{selected.reason}</p>
          {selected.tree!.parents.length > 0 && (
            <p>前提の枝：{selected.tree!.parents.map((p) => p.label).join(" → ")}</p>
          )}
          <p className="tree-default">
            {selected.tree!.default_label
              ? `未選択時：${selected.tree!.default_label}。同じ枝の方針は1つだけ継続します。`
              : "未選択時：見送り。今の暮らしを続けます。"}
          </p>
          <div className="tree-option-list">
            {selected.options
              .filter((o) => !o.option_id.endsWith(":cancel"))
              .map((option) => {
                const current =
                  option.option_id === selected.current_option &&
                  state.time.child_months >= selected.tree!.min_age_months &&
                  state.time.child_months <= selected.expires_age_months!;
                const planned = option.option_id === selected.selected_option;
                return (
                  <section className="tree-option" key={option.option_id}>
                    <h4>
                      {option.label}
                      <span>
                        {planned
                          ? "予定中"
                          : current
                            ? "継続中"
                            : option.acquired
                              ? "取得済み"
                              : ""}
                      </span>
                    </h4>
                    <p>{option.description}</p>
                    <p>
                      当期の支出 {option.cost}万円
                      {option.income ? ` ／ 半年後の入金 ＋${option.income}万円` : ""}
                    </p>
                    <ul className="tree-requirements">
                      {option.requirements?.map((r, i) => (
                        <li key={i} className={r.startsWith("未達") ? "is-unmet" : ""}>
                          {r}
                        </li>
                      ))}
                    </ul>
                    <div className="tree-modifiers">
                      {option.event_modifiers?.map((effect) => (
                        <span
                          key={`${effect.kind}:${effect.label}`}
                          className={
                            (effect.kind === "good" ? effect.percent > 0 : effect.percent < 0)
                              ? "buff"
                              : "debuff"
                          }
                        >
                          {effect.label}：{effect.kind === "good" ? "良い" : "悪い"}イベントの効果{" "}
                          {effect.percent > 0 ? "+" : ""}
                          {effect.percent}%
                        </span>
                      ))}
                    </div>
                    {option.event_modifiers?.length ? (
                      <small className="tree-duration">
                        {selected.decision_kind === "policy"
                          ? "確定後、継続している間だけ有効"
                          : "確定後、育児終了まで有効・再取得で重複しません"}
                      </small>
                    ) : null}
                    <button
                      className="tree-select"
                      disabled={busy || !option.available || current || planned}
                      onClick={() =>
                        void update("choose", {
                          event_instance: selected.instance_id,
                          option_id: option.option_id,
                        })
                      }
                    >
                      {planned
                        ? "予定に追加済み"
                        : current
                          ? "現在の方針"
                          : option.available
                            ? `このアクションを選ぶ · ${option.cost}万円`
                            : "条件を満たすと選べます"}
                    </button>
                  </section>
                );
              })}
          </div>
          {selected.selected_option && (
            <button
              className="life-cancel"
              disabled={busy}
              onClick={() =>
                void update("choose", {
                  event_instance: selected.instance_id,
                  option_id: `${selected.event_id}:cancel`,
                })
              }
            >
              この予定を取り消す
            </button>
          )}
        </article>
      ) : (
        <p className="tree-prompt">
          アイコンの枝を選ぶと、取得条件・費用・バフとデバフを確認できます。
        </p>
      )}
      {scheduled.length > 0 && (
        <section className="life-scheduled" aria-label="今期の予定">
          <h3>今期の予定</h3>
          {scheduled.map((c) => (
            <p key={c.event_id}>
              {c.text} → {c.options.find((o) => o.option_id === c.selected_option)?.label}
            </p>
          ))}
          <button disabled={busy} onClick={() => void update("reset-plan")}>
            今期の予定をすべて取り消す
          </button>
        </section>
      )}
      <details className="tree-current">
        <summary>現在の暮らしと取得効果（{life.active_effects?.length ?? 0}）</summary>
        {life.policies.map((p) => (
          <p key={p.id}>
            {p.title}：{p.planned_label}（{p.planned_cost}万円／半年）
          </p>
        ))}
        {life.active_effects?.map((e, i) => (
          <p key={i}>
            {e.source} · {e.label}：{e.kind === "good" ? "良い" : "悪い"}イベント{" "}
            {e.percent > 0 ? "+" : ""}
            {e.percent}%
          </p>
        ))}
      </details>
      {life.notices.map((notice) => (
        <p className="warning" key={notice}>
          {notice}
        </p>
      ))}
      <p className="tree-prompt">
        何も選ばずに半年を進められます。選択は半年を進めるまで取り消せます。
      </p>
    </section>
  );
}
