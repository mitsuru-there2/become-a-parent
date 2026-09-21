import { useEffect, useRef, useState } from "react";
import { useStore } from "@nanostores/react";
import type { Choice, PublicState } from "../../engine/types";
import { $busy, update } from "../../stores/game";
import { ContentImage } from "./content_image";
import { SelectionMap, markerPosition } from "./selection_map";

type Selected = { choiceId: string; optionId: string };
const durations = {
  instant: "取得時のみ",
  stage: "このステージ中・毎期",
  permanent: "恒久・育児終了まで",
};
export function StageSelectionTree({ state, choices }: { state: PublicState; choices: Choice[] }) {
  const life = state.life!;
  const currentStage = life.stage!;
  const [menu, setMenu] = useState<string | null>(null);
  const [viewStage, setViewStage] = useState(currentStage.index);
  const [selected, setSelected] = useState<Selected | null>(null);
  const busy = useStore($busy);
  const heading = useRef<HTMLHeadingElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const mapButtons = useRef<Record<string, HTMLButtonElement | null>>({});
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
  const missing = life.crossroad?.missing ?? [];
  const changeable = life.crossroad?.changeable ?? [];
  const canChangeRoute = changeable.some((item) => item.menu === menu);
  useEffect(() => {
    if (menu) heading.current?.focus();
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
    setMenu(id);
    setViewStage(currentStage.index);
    if (id === menu) heading.current?.focus();
  }
  return (
    <section
      className={`life-content selection-tree-content stage-tree ${menu ? "is-category" : "is-map"}`}
      aria-label={menu ? "選択ツリー" : "選択マップ"}
    >
      {missing.length > 0 && (
        <aside className="crossroad-alert" role="alert" aria-label="岐路の必須選択">
          <div>
            <strong>{life.crossroad!.label}</strong>
            <span>全カテゴリのルートを確定すると、半年を進められます。</span>
          </div>
          <nav aria-label="未実施の必須選択">
            {missing.map((item) => (
              <button key={item.decision_id} onClick={() => openMenu(item.menu)}>
                {item.title}へ →
              </button>
            ))}
          </nav>
        </aside>
      )}
      {changeable.length > 0 && (
        <aside className="crossroad-alert" role="alert" aria-label="岐路のルート変更">
          <div>
            <strong>{life.crossroad!.label} · ルートを変更できます</strong>
            <span>
              現在のルートを引き継いでいます。変更せず、そのまま半年を進められます。変更するとペナルティが発生します。
            </span>
          </div>
          <nav aria-label="変更できるルート">
            {changeable.map((item) => (
              <button key={item.decision_id} onClick={() => openMenu(item.menu)}>
                {item.title}へ →
              </button>
            ))}
          </nav>
        </aside>
      )}
      {selectedMenu && group && routeChoice ? (
        <>
          <div className="tree-category-heading">
            <button
              className="tree-back"
              onClick={() => {
                setMenu(null);
                requestAnimationFrame(() => mapButtons.current[selectedMenu.id]?.focus());
              }}
            >
              ← マップに戻る
            </button>
            <div>
              <h2 ref={heading} tabIndex={-1}>
                {selectedMenu.label}
              </h2>
              <p>{selectedMenu.description}</p>
            </div>
          </div>
          <nav className="stage-tabs" aria-label="ステージ">
            {life.stages!.map((item) => (
              <button
                key={item.index}
                aria-pressed={viewStage === item.index}
                onClick={() => setViewStage(item.index)}
              >
                {item.label}
                {item.index === currentStage.index ? " · 現在" : ""}
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
                  ? "条件を満たせば、ステージ中いつでも取得できます。"
                  : "岐路で、このステージのルートを確定してください。"
                : "別のステージを閲覧しています。取得は対象ステージで行います。"}
            </span>
          </div>
          <div className="stage-lanes" ref={lanes} tabIndex={0} aria-label="ルート別の選択">
            <div className="stage-lanes-inner">
              {group.routes.map((route) => {
                const routeOption = routeChoice.options.find((o) => o.route === route.id)!;
                const chosen = group.chosen_stages?.[String(viewStage)] === route.id;
                const candidates = visibleChoices
                  .flatMap((choice) =>
                    choice.options
                      .filter((option) => option.routes?.includes(route.id))
                      .map((option) => ({ choice, option })),
                  )
                  .sort((a, b) => a.option.routes!.length - b.option.routes!.length);
                return (
                  <section
                    className={`stage-route ${chosen ? "is-current" : ""}`}
                    key={route.id}
                    aria-label={`${route.label}ルート`}
                  >
                    <header className="stage-route-heading">
                      <span>
                        {chosen
                          ? canChangeRoute && currentView
                            ? "✓ 引き継いだルート"
                            : "✓ 確定したルート"
                          : currentView && group.previous === route.id
                            ? "前のステージのルート"
                            : "ルート"}
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
                            : currentView
                              ? "次の岐路で変更できます"
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
                              ? "✓ 取得済み"
                              : !currentView
                                ? "◇ 対象ステージで取得"
                                : option.available
                                  ? "○ 取得できます"
                                  : "◇ 条件待ち"}
                          </span>
                          <strong>{option.label}</strong>
                          <small>
                            {choice.text}
                            {option.routes!.length === group.routes.length ? " · 全ルート共通" : ""}
                          </small>
                          <div className="stage-effect-tags">
                            {option.effect_details?.map((effect) => (
                              <em key={effect.duration}>
                                {effect.duration === "instant"
                                  ? "取得時"
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
              return (
                <button
                  ref={(element) => {
                    mapButtons.current[item.id] = element;
                  }}
                  key={item.id}
                  className="map-marker"
                  data-menu={item.id}
                  style={markerPosition(item.id)}
                  onClick={() => openMenu(item.id)}
                >
                  <span className="map-marker-icon" aria-hidden="true">
                    {
                      (
                        {
                          education: "学",
                          home: "家",
                          grandparents: "縁",
                          afterschool: "遊",
                          work: "働",
                        } as Record<string, string>
                      )[item.id]
                    }
                  </span>
                  <strong>{item.label}</strong>
                  <small>
                    {route.routes.find((r) => r.id === route.current)?.label ?? "ルート未選択"}
                  </small>
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
                </p>
              )}
              {selectedOption.effect_details?.map((effect) => (
                <section className="stage-effect-detail" key={effect.duration}>
                  <strong>{durations[effect.duration]}</strong>
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
                  : "この選択を取得"}
            </button>
          </div>
        </dialog>
      )}
    </section>
  );
}
