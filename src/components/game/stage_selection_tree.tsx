import { useEffect, useRef, useState } from "react";
import { useStore } from "@nanostores/react";
import type { Choice, PublicState } from "../../engine/types";
import { $busy, update } from "../../stores/game";
import { MenuIcon } from "./menu_icon";
import { ContentImage } from "./content_image";
import { SelectionMap, markerPosition } from "./selection_map";

type Selected = { choiceId: string; optionId: string };
const durations = {
  instant: "取得時のみ",
  stage: "このステージ中・毎期",
  permanent: "恒久・育児終了まで",
};
export function StageSelectionTree({
  state,
  choices,
  category,
  onCategoryChange,
}: {
  state: PublicState;
  choices: Choice[];
  category?: string;
  onCategoryChange?: (category: string | null) => void;
}) {
  const life = state.life!;
  const currentStage = life.stage!;
  const [localMenu, setLocalMenu] = useState<string | null>(null);
  const menu = onCategoryChange ? (category ?? null) : localMenu;
  const [viewStage, setViewStage] = useState(currentStage.index);
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const [selected, setSelected] = useState<Selected | null>(null);
  const busy = useStore($busy);
  const heading = useRef<HTMLHeadingElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const mapButtons = useRef<Record<string, HTMLButtonElement | null>>({});
  const previousMenu = useRef<string | null>(null);
  const lanes = useRef<HTMLDivElement>(null);
  const selectedMenu = life.menus.find((m) => m.id === menu);
  const group = life.route_groups!.find((g) => g.menu === menu);
  const routeChoice = choices.find((c) => c.route_choice && c.menu === menu);
  const currentView = viewStage === currentStage.index;
  const visibleChoices = choices.filter(
    (c) => !c.route_choice && c.menu === menu && c.stages?.includes(viewStage),
  );
  const selectedChoice = choices.find((c) => c.event_id === selected?.choiceId);
  const selectedOption = selectedChoice?.options.find((o) => o.option_id === selected?.optionId);
  const pending = life.pending ?? [];
  const missing = life.crossroad?.missing ?? [];
  const changeable = life.crossroad?.changeable ?? [];
  const canChangeRoute = changeable.some((item) => item.menu === menu);
  const preferredRoute = group?.chosen_stages?.[String(viewStage)] ?? group?.current;
  const activeRoute =
    group?.routes.find((route) => route.id === selectedRoute)?.id ??
    group?.routes.find((route) => route.id === preferredRoute)?.id ??
    group?.routes[0]?.id;
  const availableCounts = new Map<string, number>();
  for (const choice of choices) {
    if (choice.route_choice || !choice.menu) continue;
    if (choice.options.some((option) => option.available))
      availableCounts.set(choice.menu, (availableCounts.get(choice.menu) ?? 0) + 1);
  }
  useEffect(() => {
    if (menu) heading.current?.focus();
    else if (previousMenu.current) mapButtons.current[previousMenu.current]?.focus();
    previousMenu.current = menu;
    setViewStage(currentStage.index);
    setSelectedRoute(null);
  }, [menu]);
  useEffect(() => {
    if (selected && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [selected]);
  useEffect(() => {
    const current = lanes.current?.querySelector<HTMLElement>(".stage-route.is-current");
    if (current && lanes.current)
      lanes.current.scrollLeft = Math.max(0, current.offsetLeft - lanes.current.offsetLeft - 12);
  }, [menu, viewStage]);
  function closeDetail() {
    dialog.current?.close();
    setSelected(null);
    opener.current?.focus();
  }
  function openDetail(
    choice: Choice,
    option: Choice["options"][number],
    button: HTMLButtonElement,
  ) {
    opener.current = button;
    setSelected({ choiceId: choice.event_id, optionId: option.option_id });
  }
  function openMenu(id: string) {
    if (onCategoryChange) onCategoryChange(id);
    else setLocalMenu(id);
    setViewStage(currentStage.index);
    setSelectedRoute(null);
    if (id === menu) heading.current?.focus();
  }
  function closeMenu() {
    if (onCategoryChange) onCategoryChange(null);
    else setLocalMenu(null);
  }
  function changeStage(index: number) {
    setViewStage(index);
    setSelectedRoute(null);
    if (lanes.current) lanes.current.scrollTop = 0;
  }
  return (
    <section
      className={`life-content selection-tree-content stage-tree ${menu ? "is-category" : "is-map"}`}
      aria-label={menu ? "選択ツリー" : "ホーム"}
    >
      {life.notices.map((notice) => (
        <p className="warning" role="alert" key={notice}>
          {notice}
        </p>
      ))}
      {selectedMenu && group && routeChoice ? (
        <>
          <div className="tree-category-heading">
            <button className="tree-back" onClick={closeMenu}>
              ← ホームに戻る
            </button>
            <div>
              <h2 ref={heading} tabIndex={-1}>
                {selectedMenu.label}
              </h2>
              <p>{selectedMenu.description}</p>
            </div>
            <span className="mobile-category-context">
              {Math.floor(state.time.child_months / 12)}歳
              {state.time.child_months % 12 ? "6か月" : ""} · 資金 {state.cash}万円
            </span>
          </div>
          <nav className="stage-tabs" aria-label="ステージ">
            {life.stages!.map((item) => (
              <button
                key={item.index}
                aria-pressed={viewStage === item.index}
                onClick={() => changeStage(item.index)}
              >
                {item.label}
                {item.index === currentStage.index ? " · 現在" : ""}
              </button>
            ))}
          </nav>
          <select
            className="stage-mobile-select"
            aria-label="ステージを選択"
            value={viewStage}
            onChange={(event) => changeStage(Number(event.target.value))}
          >
            {life.stages!.map((item) => (
              <option key={item.index} value={item.index}>
                {item.label}
                {item.index === currentStage.index ? " · 現在" : ""}
              </option>
            ))}
          </select>
          <nav className="stage-route-tabs" aria-label="ルートを切り替え">
            {group.routes.map((route) => (
              <button
                key={route.id}
                aria-pressed={route.id === activeRoute}
                onClick={() => {
                  setSelectedRoute(route.id);
                  if (lanes.current) lanes.current.scrollTop = 0;
                }}
              >
                {route.label}
                {group.chosen_stages?.[String(viewStage)] === route.id ? " ✓" : ""}
              </button>
            ))}
          </nav>
          <div className="stage-summary">
            <strong>
              {currentView
                ? `現在のルート：${group.routes.find((r) => r.id === group.current)?.label ?? "未選択"}`
                : `${life.stages![viewStage].label}の選択`}
            </strong>
            <span>
              {currentView
                ? group.current
                  ? "選択中のルートの判断だけ取得できます。ほかのルートは閲覧のみです。"
                  : "岐路で、このステージのルートを確定してください。"
                : "別のステージを閲覧しています。取得は対象ステージで行います。"}
            </span>
          </div>
          <div className="stage-lanes" ref={lanes} tabIndex={0} aria-label="ルート別の選択">
            <div className="stage-lanes-inner">
              {group.routes.map((route) => {
                const routeOption = routeChoice.options.find((o) => o.route === route.id)!;
                const chosen = group.chosen_stages?.[String(viewStage)] === route.id;
                const inactive = currentView && !!group.current && !chosen;
                const candidates = visibleChoices
                  .flatMap((choice) =>
                    choice.options
                      .filter((option) => option.routes?.includes(route.id))
                      .map((option) => ({ choice, option })),
                  )
                  .sort((a, b) => a.option.routes!.length - b.option.routes!.length);
                return (
                  <section
                    className={`stage-route ${chosen ? "is-current" : inactive ? "is-inactive" : ""}${route.id === activeRoute ? " is-mobile-active" : ""}`}
                    key={route.id}
                    aria-label={`${route.label}ルート`}
                  >
                    <header className="stage-route-heading">
                      <span>
                        {chosen
                          ? currentView
                            ? "✓ 選択中のルート"
                            : "✓ このステージで選んだルート"
                          : inactive
                            ? "— 選択不可・閲覧のみ"
                            : currentView
                              ? "ルート未選択"
                              : "このステージのルート"}
                      </span>
                      <h3>{route.label}</h3>
                      {currentView && (!group.current || (canChangeRoute && !chosen)) ? (
                        <button
                          className="stage-route-select"
                          onClick={(event) =>
                            openDetail(routeChoice, routeOption, event.currentTarget)
                          }
                        >
                          このルートを確認
                          {routeOption.cost ? ` · 変更 ${routeOption.cost}万円` : " · 無料"}
                        </button>
                      ) : (
                        <p>
                          {chosen
                            ? canChangeRoute && currentView
                              ? "変更しなければ、このルートを継続します"
                              : "次の岐路まで変更できません"
                            : inactive
                              ? "判断の取得には、このルートへの変更が必要です"
                              : "岐路で選べるルート"}
                        </p>
                      )}
                    </header>
                    <div className="stage-route-choices">
                      {candidates.map(({ choice, option }) => (
                        <button
                          key={option.option_id}
                          className={`stage-selection ${option.acquired ? "is-acquired" : option.available && currentView ? "is-available" : "is-locked"}`}
                          aria-label={`${choice.text}：${option.label}`}
                          onClick={(event) => openDetail(choice, option, event.currentTarget)}
                        >
                          <span>
                            {option.acquired
                              ? pending.includes(option.option_id)
                                ? "↶ 今期の取得予定・取消可"
                                : "✓ 取得済み"
                              : !currentView
                                ? "◇ 対象ステージで取得"
                                : inactive
                                  ? "— 別ルートのため選択不可"
                                  : !group.current
                                    ? "◇ 先にルートを選択"
                                    : option.available
                                      ? "＋ 今期の判断に追加できます"
                                      : "◇ 取得不可 · 条件待ち"}
                          </span>
                          <strong>{option.label}</strong>
                          {(choice.text !== option.label ||
                            option.routes!.length === group.routes.length) && (
                            <small>
                              {choice.text !== option.label ? choice.text : ""}
                              {option.routes!.length === group.routes.length
                                ? " · 全ルート共通"
                                : ""}
                            </small>
                          )}
                          <p className="stage-selection-impact">
                            {
                              option.effect_details?.find((effect) => effect.duration === "instant")
                                ?.description
                            }
                          </p>
                          <div className="stage-effect-tags">
                            {option.effect_details?.map((effect) => (
                              <em key={effect.duration}>
                                {effect.duration === "instant"
                                  ? life.pending
                                    ? "今期末"
                                    : "取得時"
                                  : effect.duration === "stage"
                                    ? "ステージ中"
                                    : "恒久"}
                              </em>
                            ))}
                          </div>
                        </button>
                      ))}
                      {!candidates.length && (
                        <p className="stage-empty">このステージに取得できる選択はありません。</p>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <>
          <p className="stage-map-caption">
            ステージ {currentStage.label} <span>判断カテゴリから、ルートと選択を確認</span>
          </p>
          <SelectionMap>
            {life.menus.map((item) => {
              const route = life.route_groups!.find((g) => g.menu === item.id)!;
              const routeRequired = missing.some((entry) => entry.menu === item.id);
              const routeChangeable = changeable.some((entry) => entry.menu === item.id);
              return (
                <button
                  ref={(element) => {
                    mapButtons.current[item.id] = element;
                  }}
                  key={item.id}
                  className={`map-marker${routeRequired ? " is-route-required" : routeChangeable ? " is-route-changeable" : ""}`}
                  data-menu={item.id}
                  style={markerPosition(item.id)}
                  onClick={() => openMenu(item.id)}
                >
                  {routeRequired && <span className="map-route-required">ルートを選択</span>}
                  {routeChangeable && !routeRequired && (
                    <span className="map-route-changeable">ルート変更可</span>
                  )}
                  <span className="map-marker-icon" aria-hidden="true">
                    <MenuIcon id={item.id} />
                  </span>
                  <strong>{item.id === "grandparents" ? "実家との関わり" : item.label}</strong>
                  <small>
                    {route.routes.find((r) => r.id === route.current)?.label ?? "ルート未選択"}
                  </small>
                  {!!availableCounts.get(item.id) && (
                    <span className="map-available-count">
                      取得可能 {availableCounts.get(item.id)}件
                    </span>
                  )}
                </button>
              );
            })}
          </SelectionMap>
        </>
      )}
      {selectedChoice && selectedOption && (
        <dialog
          ref={dialog}
          className="tree-detail stage-detail"
          aria-labelledby="stage-detail-title"
          onCancel={(event) => {
            event.preventDefault();
            closeDetail();
          }}
        >
          <div className="tree-detail-body">
            {selectedOption.visual && <ContentImage visual={selectedOption.visual} />}
            <div className="tree-detail-copy">
              <span className="tree-eyebrow">
                {selectedChoice.route_choice ? "岐路のルート確定" : selectedChoice.text}
              </span>
              <h3 id="stage-detail-title">{selectedOption.label}</h3>
              <p>{selectedOption.description}</p>
              {!selectedChoice.route_choice && (
                <p>
                  対象ステージ：
                  {selectedChoice.stages!.map((index) => life.stages![index].label).join("、")}
                  。この選択は一度だけ取得できます。
                  {life.pending && " 今期の取得は期末まで取り消せます。"}
                </p>
              )}
              {selectedOption.effect_details?.map((effect) => (
                <section className="stage-effect-detail" key={effect.duration}>
                  <strong>
                    {life.pending && effect.duration === "instant"
                      ? "今期末に反映"
                      : durations[effect.duration]}
                  </strong>
                  <p>{effect.description}</p>
                </section>
              ))}
              <ul className="tree-requirements">
                {selectedOption.requirements?.map((requirement, index) => (
                  <li key={index} className={requirement.startsWith("未達") ? "is-unmet" : ""}>
                    {requirement}
                  </li>
                ))}
              </ul>
              {!currentView && <p>現在のステージへ戻ると、取得できる選択を確認できます。</p>}
              {selectedChoice.route_choice && (
                <p>確定すると、このステージ中はルートを変更できません。</p>
              )}
            </div>
          </div>
          <div className="tree-dialog-controls">
            <button onClick={closeDetail}>閉じる</button>
            {selectedOption.acquired && pending.includes(selectedOption.option_id) && (
              <button
                className="tree-undo"
                disabled={busy}
                onClick={async () => {
                  if (await update("undo", { option_id: selectedOption.option_id })) closeDetail();
                }}
              >
                今期の取得を取り消す
              </button>
            )}
            <button
              className="tree-select"
              disabled={busy || !currentView || !selectedOption.available}
              onClick={async () => {
                if (
                  await update("choose", {
                    event_instance: selectedChoice.instance_id,
                    option_id: selectedOption.option_id,
                  })
                )
                  closeDetail();
              }}
            >
              {selectedOption.acquired
                ? selectedChoice.route_choice
                  ? "確定済み"
                  : "取得済み"
                : selectedChoice.route_choice
                  ? "このルートを確定"
                  : "今期の判断に追加"}
            </button>
          </div>
        </dialog>
      )}
    </section>
  );
}
