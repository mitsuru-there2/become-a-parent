import { useEffect, useRef, useState } from "react";
import { useStore } from "@nanostores/react";
import type { Choice, PublicState } from "../../engine/types";
import { $busy, update } from "../../stores/game";
import { ContentImage } from "./content_image";
import { ActionMap, markerPosition } from "./action_map";

type ActionNode = {
  choice: Choice;
  option: Choice["options"][number];
};

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

function graphPositions(actions: ActionNode[]) {
  const map = new Map(actions.map((action) => [action.option.option_id, action]));
  const levels = new Map<string, number>();
  function level(id: string, seen = new Set<string>()): number {
    if (seen.has(id)) return 0;
    if (levels.has(id)) return levels.get(id)!;
    const parents = map.get(id)?.option.parents?.filter((p) => map.has(p.option_id)) ?? [];
    const depth = parents.length
      ? 1 + Math.max(...parents.map((p) => level(p.option_id, new Set(seen).add(id))))
      : 0;
    levels.set(id, depth);
    return depth;
  }
  const rows = new Map<number, number>();
  return actions.map((action) => {
    const column = level(action.option.option_id);
    const row = rows.get(column) ?? 0;
    rows.set(column, row + 1);
    return { ...action, x: column * 240 + 16, y: row * 116 + 16 };
  });
}

export function ActionTree({ state, choices }: { state: PublicState; choices: Choice[] }) {
  const [menu, setMenu] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const categoryHeading = useRef<HTMLHeadingElement>(null);
  const mapButtons = useRef<Record<string, HTMLButtonElement | null>>({});
  const previousMenu = useRef<string | null>(null);
  useEffect(() => {
    if (menu) categoryHeading.current?.focus();
    else if (previousMenu.current) mapButtons.current[previousMenu.current]?.focus();
    previousMenu.current = menu;
  }, [menu]);
  useEffect(() => {
    if (selectedId && dialog.current && !dialog.current.open) {
      dialog.current.showModal();
      detailHeading.current?.focus();
    }
  }, [selectedId]);
  const busy = useStore($busy);
  const life = state.life!;
  const selectedMenu = life.menus.find((item) => item.id === menu);
  const visible = menu ? choices.filter((c) => c.menu === menu) : choices;
  const nodes = graphPositions(
    visible.flatMap((choice) =>
      choice.options
        .filter((option) => !option.option_id.endsWith(":cancel"))
        .map((option) => ({ choice, option })),
    ),
  );
  const selected = nodes.find((node) => node.option.option_id === selectedId);
  const scheduled = choices.filter((c) => c.selected_option);
  const width = Math.max(240, ...nodes.map((n) => n.x + 220));
  const height = Math.max(140, ...nodes.map((n) => n.y + 112));
  return (
    <section
      className={`life-content action-tree-content ${selectedMenu ? "is-category" : "is-map"}`}
      aria-label={selectedMenu ? "アクションツリー" : "アクションマップ"}
    >
      {selectedMenu ? (
        <>
          <div className="tree-category-heading">
            <button
              className="tree-back"
              onClick={() => {
                setSelectedId(null);
                setMenu(null);
              }}
            >
              ← マップに戻る
            </button>
            <div>
              <span className="tree-eyebrow">ACTION CATEGORY</span>
              <h2 ref={categoryHeading} tabIndex={-1}>
                <MenuIcon id={selectedMenu.id} />
                {selectedMenu.label}
              </h2>
              <p>{selectedMenu.description}</p>
            </div>
            <span className="tree-category-count">{nodes.length} アクション</span>
          </div>
          <p className="tree-legend">
            ○ 選択可能　✓ 取得済み　◇ 条件待ち{" "}
            <span>未解放の枝もタップして詳細を確認できます。横・縦にスクロール →</span>
          </p>
          <div className="tree-scroll" tabIndex={0} role="region" aria-label="アクションのつながり">
            <div className="tree-canvas" style={{ width, height }}>
              <svg className="tree-edges" width={width} height={height} aria-hidden="true">
                {nodes.flatMap((node) =>
                  (node.option.parents ?? []).map((parent) => {
                    const from = nodes.find((n) => n.option.option_id === parent.option_id);
                    return from ? (
                      <path
                        key={`${parent.option_id}:${node.option.option_id}`}
                        d={`M ${from.x + 204} ${from.y + 46} C ${from.x + 230} ${from.y + 46}, ${node.x - 25} ${node.y + 46}, ${node.x} ${node.y + 46}`}
                      />
                    ) : null;
                  }),
                )}
              </svg>
              {nodes.map(({ choice, option, x, y }) => {
                const acquired = option.acquired;
                const current = option.option_id === choice.current_option;
                const planned = option.option_id === choice.selected_option;
                const available = option.available && !current && !planned;
                return (
                  <button
                    className={`tree-node ${acquired || current ? "is-acquired" : available ? "is-available" : "is-locked"}`}
                    key={option.option_id}
                    aria-label={`${choice.text}：${option.label}`}
                    style={{ left: x, top: y }}
                    onClick={() => setSelectedId(option.option_id)}
                  >
                    <span className="tree-node-top">
                      <MenuIcon id={choice.menu!} />
                      <span>{choice.tree!.min_age_months / 12}歳〜</span>
                      <b>
                        {planned
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
                    <strong>{option.label}</strong>
                    <small>
                      {choice.text}
                      {choice.fresh ? " · 解放！" : ""}
                    </small>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <>
          <ActionMap>
            {life.menus.map((item) => (
              <button
                ref={(element) => {
                  mapButtons.current[item.id] = element;
                }}
                key={item.id}
                className="map-marker"
                data-menu={item.id}
                style={markerPosition(item.id)}
                onClick={() => setMenu(item.id)}
              >
                <span className="map-marker-icon">
                  <MenuIcon id={item.id} />
                </span>
                <strong>{item.label}</strong>
                <small>
                  {choices.some((choice) => choice.menu === item.id && choice.selected_option)
                    ? "予定中"
                    : `${choices
                        .filter((choice) => choice.menu === item.id)
                        .reduce((count, choice) => count + choice.options.length - 1, 0)}件`}
                </small>
              </button>
            ))}
          </ActionMap>
        </>
      )}
      {selected && (
        <dialog
          ref={dialog}
          className="tree-detail"
          aria-labelledby="tree-detail-title"
          onCancel={(event) => {
            event.preventDefault();
            setSelectedId(null);
          }}
        >
          <div className="tree-detail-body">
            {selected.option.visual && <ContentImage visual={selected.option.visual} />}
            <div className="tree-detail-copy">
              <span className="tree-eyebrow">{selected.choice.text}</span>
              <header>
                <h3 id="tree-detail-title" ref={detailHeading} tabIndex={-1}>
                  {selected.option.label}
                </h3>
                <span>
                  {selected.choice.tree!.min_age_months / 12}〜
                  {Math.floor(selected.choice.expires_age_months! / 12)}歳
                </span>
              </header>
              <p>{selected.choice.reason}</p>
              <p>{selected.option.description}</p>
              {(selected.option.parents?.length ?? 0) > 0 && (
                <p>前提の枝：{selected.option.parents!.map((p) => p.label).join(" → ")}</p>
              )}
              <p className="tree-default">
                {selected.choice.tree!.default_label
                  ? `未選択時：${selected.choice.tree!.default_label}。同じ枝の方針は1つだけ継続します。`
                  : "未選択時：見送り。今の暮らしを続けます。"}
              </p>
              <p>
                当期の支出 {selected.option.cost}万円
                {selected.option.income ? ` ／ 半年後の入金 ＋${selected.option.income}万円` : ""}
              </p>
              <ul className="tree-requirements">
                {selected.option.requirements?.map((requirement, index) => (
                  <li key={index} className={requirement.startsWith("未達") ? "is-unmet" : ""}>
                    {requirement}
                  </li>
                ))}
              </ul>
              <div className="tree-modifiers">
                {selected.option.event_modifiers?.map((effect) => (
                  <span
                    key={`${effect.kind}:${effect.label}`}
                    className={
                      effect.kind === "good"
                        ? effect.percent > 0
                          ? "buff"
                          : "debuff"
                        : effect.percent < 0
                          ? "buff"
                          : "debuff"
                    }
                  >
                    {effect.label}：{effect.kind === "good" ? "良い" : "悪い"}
                    イベントの効果 {effect.percent > 0 ? "+" : ""}
                    {effect.percent}%
                  </span>
                ))}
              </div>
              {!!selected.option.event_modifiers?.length && (
                <small className="tree-duration">
                  {selected.choice.decision_kind === "policy"
                    ? "確定後、継続している間だけ有効"
                    : "確定後、育児終了まで有効・再取得で重複しません"}
                </small>
              )}
            </div>
          </div>
          <div className="tree-dialog-actions">
            <button onClick={() => setSelectedId(null)}>キャンセル</button>
            {selected.choice.selected_option === selected.option.option_id ? (
              <button
                className="tree-select"
                disabled={busy}
                onClick={async () => {
                  if (
                    await update("choose", {
                      event_instance: selected.choice.instance_id,
                      option_id: `${selected.choice.event_id}:cancel`,
                    })
                  )
                    setSelectedId(null);
                }}
              >
                予定を取り消す
              </button>
            ) : (
              <button
                className="tree-select"
                disabled={
                  busy ||
                  !selected.option.available ||
                  selected.option.option_id === selected.choice.current_option
                }
                onClick={async () => {
                  if (
                    await update("choose", {
                      event_instance: selected.choice.instance_id,
                      option_id: selected.option.option_id,
                    })
                  )
                    setSelectedId(null);
                }}
              >
                {selected.option.option_id === selected.choice.current_option
                  ? "現在の方針"
                  : selected.option.available
                    ? "このアクションを確定"
                    : "条件を満たすと選べます"}
              </button>
            )}
          </div>
        </dialog>
      )}
      {!selectedMenu && scheduled.length > 0 && (
        <div className="map-footer">
          <section aria-label="今期の予定">
            <strong>今期の予定 {scheduled.length}件</strong>
            <span>
              {scheduled
                .map((choice) =>
                  choice.options.find((option) => option.option_id === choice.selected_option),
                )
                .map((option) => option?.label)
                .join("・")}
            </span>
            <button disabled={busy} onClick={() => void update("reset-plan")}>
              すべて取り消す
            </button>
          </section>
        </div>
      )}
    </section>
  );
}
