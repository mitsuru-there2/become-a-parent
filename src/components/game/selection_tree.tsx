import { useEffect, useRef, useState } from "react";
import { useStore } from "@nanostores/react";
import type { Choice, PublicState } from "../../engine/types";
import { $busy, update } from "../../stores/game";
import { ContentImage } from "./content_image";
import { SelectionMap, markerPosition } from "./selection_map";

type SelectionNode = {
  choice: Choice;
  option: Choice["options"][number];
};
type PositionedNode = SelectionNode & { x: number; y: number };
type RouteGroup = NonNullable<NonNullable<PublicState["life"]>["route_groups"]>[number];

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

function graphPositions(selections: SelectionNode[]) {
  const map = new Map(selections.map((selection) => [selection.option.option_id, selection]));
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
  const groups = new Map<number, SelectionNode[]>();
  for (const selection of selections) {
    const depth = level(selection.option.option_id);
    groups.set(depth, [...(groups.get(depth) ?? []), selection]);
  }
  let top = 16;
  const positions: PositionedNode[] = [];
  for (const [, group] of [...groups].sort(([a], [b]) => a - b)) {
    group.forEach((selection, index) => {
      positions.push({
        ...selection,
        x: (index % 4) * 240 + 16,
        y: top + Math.floor(index / 4) * 116,
      });
    });
    top += Math.ceil(group.length / 4) * 116 + 32;
  }
  return positions;
}

const routeColumn = 320;
const routeLeft = 520;
const routeOf = ({ choice, option }: SelectionNode) => option.route ?? choice.tree?.route;
const laneOf = ({ choice, option }: SelectionNode) =>
  option.tree_route ?? choice.tree?.tree_route ?? option.switch_to ?? routeOf({ choice, option });

function routePositions(selections: SelectionNode[], group: RouteGroup) {
  const switchSelections = selections.filter((selection) => selection.option.switch_to);
  const school = selections.filter(
    ({ choice, option }) =>
      choice.tree?.route_group === group.id &&
      choice.tree.route_stage !== undefined &&
      !option.switch_to &&
      laneOf({ choice, option }),
  );
  const nodes: PositionedNode[] = switchSelections.map((selection) => ({
    ...selection,
    x: routeLeft + group.routes.findIndex((route) => route.id === laneOf(selection)) * routeColumn,
    y: 68,
  }));
  const stageTops: number[] = [];
  let top = 240;
  for (let stage = 0; stage < 5; stage++) {
    stageTops.push(top);
    const lanes = group.routes.map((route) =>
      school.filter(
        (selection) =>
          selection.choice.tree?.route_stage === stage && laneOf(selection) === route.id,
      ),
    );
    lanes.forEach((lane, index) =>
      lane.forEach((selection, row) =>
        nodes.push({ ...selection, x: routeLeft + index * routeColumn, y: top + row * 116 }),
      ),
    );
    top += Math.max(1, ...lanes.map((lane) => lane.length)) * 116 + 64;
  }
  const lowerTop = top;
  const included = new Set(nodes.map(({ option }) => option.option_id));
  nodes.push(
    ...selections
      .filter(({ option }) => !included.has(option.option_id))
      .map((selection, index) => ({
        ...selection,
        x: routeLeft + (index % group.routes.length) * routeColumn,
        y: lowerTop + Math.floor(index / group.routes.length) * 116,
      })),
  );
  return {
    nodes,
    lowerTop,
    laneLeft: routeLeft,
    laneColumn: routeColumn,
    stageTops,
    canvasMinWidth: routeLeft * 2 + (group.routes.length - 1) * routeColumn + 204,
    commonLane: false,
  };
}

function branchPositions(selections: SelectionNode[], group: RouteGroup) {
  const branch = selections.filter(
    ({ choice, option }) =>
      choice.tree?.route_group === group.id &&
      choice.tree.route_stage !== undefined &&
      !option.switch_to,
  );
  const branchIds = new Set(branch.map(({ option }) => option.option_id));
  const laneLeft = 44;
  const laneColumn = 230;
  const stageTops: number[] = [];
  const nodes: PositionedNode[] = [];
  let top = 100;
  for (let stage = 0; stage < (group.stage_labels?.length ?? 0); stage++) {
    stageTops.push(top);
    const lanes = Array.from({ length: group.routes.length + 1 }, (_, index) =>
      branch.filter(
        (selection) =>
          selection.choice.tree?.route_stage === stage &&
          (laneOf(selection)
            ? group.routes.findIndex((route) => route.id === laneOf(selection)) === index
            : index === group.routes.length),
      ),
    );
    lanes.forEach((lane, index) =>
      lane.forEach((selection, row) =>
        nodes.push({ ...selection, x: laneLeft + index * laneColumn, y: top + row * 116 }),
      ),
    );
    top += Math.max(1, ...lanes.map((lane) => lane.length)) * 116 + 52;
  }
  const lowerTop = top + 12;
  nodes.push(
    ...graphPositions(selections.filter(({ option }) => !branchIds.has(option.option_id))).map(
      (selection) => ({ ...selection, y: selection.y + lowerTop }),
    ),
  );
  return {
    nodes,
    lowerTop,
    laneLeft,
    laneColumn,
    stageTops,
    canvasMinWidth: laneLeft + group.routes.length * laneColumn + 220,
    commonLane: true,
  };
}

export function SelectionTree({ state, choices }: { state: PublicState; choices: Choice[] }) {
  const [menu, setMenu] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [crossroadTarget, setCrossroadTarget] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const treeScroll = useRef<HTMLDivElement>(null);
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
  const selections = visible.flatMap((choice) =>
    choice.options
      .filter((option) => !option.option_id.endsWith(":cancel"))
      .map((option) => ({ choice, option })),
  );
  const routeGroup = life.route_groups?.find(
    (group) => menu && selections.some(({ choice }) => choice.tree?.route_group === group.id),
  );
  const routeLayout = routeGroup
    ? routeGroup.layout === "branches"
      ? branchPositions(selections, routeGroup)
      : routePositions(selections, routeGroup)
    : null;
  const nodes = routeLayout?.nodes ?? graphPositions(selections);
  const switchNode =
    nodes.find((node) => node.option.switch_to === routeGroup?.current) ??
    nodes.find((node) => node.option.switch_to);
  const selected = nodes.find((node) => node.option.option_id === selectedId);
  const scheduled = choices.filter((c) => c.selected_option);
  const width = Math.max(routeLayout?.canvasMinWidth ?? 240, ...nodes.map((n) => n.x + 220));
  const height = Math.max(140, ...nodes.map((n) => n.y + 112));
  const routeStages =
    routeGroup?.layout !== "branches" && routeGroup
      ? [
          ...new Map(
            nodes
              .filter(
                (node) =>
                  !node.option.switch_to &&
                  laneOf(node) &&
                  node.choice.tree?.route_stage !== undefined,
              )
              .sort((a, b) =>
                a.choice.selection_kind === b.choice.selection_kind
                  ? 0
                  : a.choice.selection_kind === "policy"
                    ? 1
                    : -1,
              )
              .map((node) => [node.choice.tree!.route_stage!, node.choice]),
          ).entries(),
        ].sort(([a], [b]) => a - b)
      : [];
  const displayStages =
    routeGroup?.layout === "branches"
      ? (routeGroup.stage_labels ?? []).map((label, stage) => ({
          stage,
          label,
          top: routeLayout!.stageTops[stage],
        }))
      : routeStages.map(([stage, choice]) => ({
          stage,
          label:
            routeGroup?.stage_labels?.[stage] ??
            `${choice.tree!.min_age_months / 12}歳〜 · ${choice.text}`,
          top: routeLayout!.stageTops[stage],
        }));
  useEffect(() => {
    if (!crossroadTarget || !menu || !treeScroll.current) return;
    const target = nodes.find((node) => node.choice.event_id === crossroadTarget);
    if (!target) return;
    treeScroll.current.scrollTo({
      left: Math.max(0, target.x - 24),
      top: Math.max(0, target.y - 36),
      behavior: "smooth",
    });
    const button = treeScroll.current.querySelector<HTMLButtonElement>(
      `[data-decision="${crossroadTarget}"]`,
    );
    button?.focus({ preventScroll: true });
    setCrossroadTarget(null);
  }, [crossroadTarget, menu, nodes]);
  useEffect(() => {
    if (!routeGroup || !treeScroll.current) return;
    const current = routeStages.find(
      ([, choice]) =>
        state.time.child_months >= choice.tree!.min_age_months &&
        state.time.child_months <= choice.expires_age_months!,
    );
    const stage =
      routeGroup.layout === "branches"
        ? Math.min(4, Math.floor(state.time.child_months / 48))
        : (current?.[0] ?? 0);
    treeScroll.current.scrollTop = stage ? Math.max(0, routeLayout!.stageTops[stage] - 112) : 0;
    const currentColumn = Math.max(
      0,
      routeGroup.routes.findIndex((route) => route.id === routeGroup.current),
    );
    const routeCenter = routeLayout!.laneLeft + currentColumn * routeLayout!.laneColumn + 102;
    treeScroll.current.scrollLeft = Math.max(0, routeCenter - treeScroll.current.clientWidth / 2);
  }, [menu, routeGroup?.id, routeGroup?.current, state.time.child_months]);
  return (
    <section
      className={`life-content selection-tree-content ${selectedMenu ? "is-category" : "is-map"}`}
      aria-label={selectedMenu ? "選択ツリー" : "選択マップ"}
    >
      {life.crossroad && life.crossroad.missing.length > 0 && (
        <aside className="crossroad-alert" role="alert" aria-label="岐路の必須選択">
          <div>
            <strong>{life.crossroad.label}</strong>
            <span>方針を選ぶまで半年を進められません。</span>
          </div>
          <nav aria-label="未実施の必須選択">
            {life.crossroad.missing.map((item) => (
              <button
                key={item.decision_id}
                type="button"
                onClick={() => {
                  setMenu(item.menu);
                  setCrossroadTarget(item.decision_id);
                }}
              >
                {item.title}へ →
              </button>
            ))}
          </nav>
        </aside>
      )}
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
              <h2 ref={categoryHeading} tabIndex={-1}>
                <MenuIcon id={selectedMenu.id} />
                {selectedMenu.label}
              </h2>
              <p>{selectedMenu.description}</p>
            </div>
          </div>
          <p className="tree-legend">
            ○ 選択可能　✓ 取得済み　◇ 条件待ち{" "}
            <span>未解放の枝もタップして詳細を確認できます。下へ進み、横へ分岐します ↓</span>
          </p>
          {routeGroup && (
            <div className="tree-route-summary">
              <strong>
                {routeGroup.label}：
                {routeGroup.routes.find((route) => route.id === routeGroup.current)?.label ??
                  "ルート未選択"}
              </strong>
              <span>
                別ルートへの転換は前期の準備が必要
                {selections.find((selection) => selection.option.switch_to)?.option.cost
                  ? `・${selections.find((selection) => selection.option.switch_to)!.option.cost}万円`
                  : ""}
              </span>
              {switchNode && (
                <button
                  type="button"
                  onClick={() => {
                    treeScroll.current?.scrollTo({
                      left: Math.max(0, switchNode.x - 20),
                      top: Math.max(0, switchNode.y - 30),
                    });
                  }}
                >
                  {routeGroup.layout === "branches" ? "切替準備を見る ↓" : "切替準備を見る ↑"}
                </button>
              )}
            </div>
          )}
          <div
            ref={treeScroll}
            className={`tree-scroll ${routeGroup ? "has-route-lanes" : ""}`}
            tabIndex={0}
            role="region"
            aria-label="選択のつながり"
          >
            <div className="tree-canvas" style={{ width, height }}>
              {routeGroup && routeLayout && (
                <>
                  {[
                    ...routeGroup.routes,
                    ...(routeLayout.commonLane ? [{ id: "common", label: "共通の行動" }] : []),
                  ].map((route, index) => (
                    <div
                      key={route.id}
                      className={`tree-route-lane ${routeGroup.current === route.id ? "is-current" : ""} ${route.id === "common" ? "is-common" : ""}`}
                      style={{
                        left: routeLayout.laneLeft - 12 + index * routeLayout.laneColumn,
                        height: routeLayout.lowerTop - 50,
                      }}
                      aria-hidden="true"
                    >
                      <span>{route.label}</span>
                    </div>
                  ))}
                  {displayStages.map(({ stage, label, top }) => (
                    <div
                      key={stage}
                      className="tree-stage-label"
                      style={{ top: top - 38, width }}
                      aria-hidden="true"
                    >
                      <span>{label}</span>
                    </div>
                  ))}
                  {routeGroup.layout === "branches" && (
                    <div
                      className="tree-other-label"
                      style={{ top: routeLayout.lowerTop - 16 }}
                      aria-hidden="true"
                    >
                      方針の切替準備
                    </div>
                  )}
                </>
              )}
              <svg className="tree-edges" width={width} height={height} aria-hidden="true">
                {routeGroup &&
                  displayStages
                    .slice(1, routeGroup.layout === "branches" ? undefined : 4)
                    .map(({ stage, top }) => (
                      <path
                        key={`switch:${stage}`}
                        className="tree-switch-edge"
                        d={`M ${routeLayout!.laneLeft + 102} ${top - 26} H ${routeLayout!.laneLeft + (routeGroup.routes.length - 1) * routeLayout!.laneColumn + 102}`}
                      />
                    ))}
                {routeGroup &&
                  routeGroup.routes.flatMap((route) => {
                    const chain = nodes
                      .filter((node) => !node.option.switch_to && laneOf(node) === route.id)
                      .sort((a, b) => a.y - b.y);
                    if (routeGroup.layout === "branches")
                      return chain.length > 1
                        ? [
                            <path
                              key={`route:${route.id}`}
                              className="tree-route-edge"
                              d={`M ${chain[0].x + 102} ${chain[0].y + 94} V ${chain.at(-1)!.y}`}
                            />,
                          ]
                        : [];
                    return chain.slice(1).map((node, index) => {
                      const from = chain[index];
                      return (
                        <path
                          key={`route:${route.id}:${index}`}
                          className="tree-route-edge"
                          d={`M ${from.x + 102} ${from.y + 94} V ${node.y}`}
                        />
                      );
                    });
                  })}
                {nodes.flatMap((node) =>
                  (node.option.parents ?? []).map((parent) => {
                    const from = nodes.find((n) => n.option.option_id === parent.option_id);
                    if (from && routeGroup && routeOf(from) && routeOf(from) === routeOf(node))
                      return null;
                    return from ? (
                      <path
                        key={`${parent.option_id}:${node.option.option_id}`}
                        d={`M ${from.x + 102} ${from.y + 94} C ${from.x + 102} ${from.y + 124}, ${node.x + 102} ${node.y - 30}, ${node.x + 102} ${node.y}`}
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
                    className={`tree-node ${laneOf({ choice, option }) ? "is-route-node" : ""} ${acquired || current ? "is-acquired" : available ? "is-available" : "is-locked"}`}
                    key={option.option_id}
                    aria-label={`${choice.text}：${option.label}`}
                    data-decision={choice.event_id}
                    data-route={laneOf({ choice, option })}
                    data-stage={choice.tree?.route_stage}
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
          <SelectionMap>
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
                {choices.some((choice) => choice.menu === item.id && choice.selected_option) && (
                  <small>予定中</small>
                )}
              </button>
            ))}
          </SelectionMap>
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
                  ? selected.choice.crossroad_required
                    ? "岐路では、この方針を明示的に選ぶ必要があります。"
                    : `未選択時：${selected.choice.tree!.default_label}。同じ枝の方針は1つだけ継続します。`
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
                  {selected.choice.selection_kind === "policy"
                    ? "確定後、継続している間だけ有効"
                    : "確定後、育児終了まで有効・再取得で重複しません"}
                </small>
              )}
            </div>
          </div>
          <div className="tree-dialog-controls">
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
                  (selected.option.option_id === selected.choice.current_option &&
                    !selected.choice.crossroad_required)
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
                {selected.option.option_id === selected.choice.current_option &&
                !selected.choice.crossroad_required
                  ? "現在の方針"
                  : selected.option.available
                    ? "この選択を確定"
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
