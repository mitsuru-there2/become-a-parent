import { ActionTree } from "./action_tree";
import { useState } from "react";
import { useStore } from "@nanostores/react";
import type { Choice, PublicState } from "../../engine/types";
import { $busy, update } from "../../stores/game";

export function LifeMenus({ state, choices }: { state: PublicState; choices: Choice[] }) {
  const [menu, setMenu] = useState<string | null>(null);
  const busy = useStore($busy);
  const life = state.life!;
  if (life.action_tree) return <ActionTree state={state} choices={choices} />;
  const selectedMenu = life.menus.find((m) => m.id === menu);
  const scheduled = choices.filter((c) => c.selected_option);
  const opportunities = choices.filter((c) => c.fresh);
  return (
    <section className="life-content" aria-label="生活メニュー">
      <nav className="life-tabs" aria-label="暮らしの分類">
        <button aria-pressed={menu === null} onClick={() => setMenu(null)}>
          暮らしの一覧
        </button>
        {life.menus.map((item) => (
          <button key={item.id} aria-pressed={menu === item.id} onClick={() => setMenu(item.id)}>
            {item.label}
          </button>
        ))}
      </nav>
      {selectedMenu ? (
        <>
          <h2>{selectedMenu.label}</h2>
          <p className="life-lead">
            {selectedMenu.description}。変更しなければ今の暮らしが続きます。
          </p>
          {choices
            .filter((c) => c.menu === menu)
            .map((choice) => (
              <article className="life-decision" key={choice.instance_id} aria-label={choice.text}>
                <header>
                  <h3>{choice.text}</h3>
                  <span>
                    {choice.decision_kind === "policy" ? "継続する設定" : "今期だけの行動"}
                    {choice.fresh ? " · 新しい機会" : ""}
                  </span>
                </header>
                <p>{choice.reason}</p>
                {choice.expires_age_months! < 234 &&
                  choice.expires_age_months! - state.time.child_months < 6 && (
                    <p className="warning">
                      今期までの機会です。選ばなければ見送ります。継続設定は対象期間が終わると標準に戻ります。
                    </p>
                  )}
                <div className="choices decision-options">
                  {choice.options
                    .filter((o) => !o.option_id.endsWith(":cancel"))
                    .map((option) => {
                      const selected =
                        option.option_id === (choice.selected_option ?? choice.current_option);
                      return (
                        <button
                          key={option.option_id}
                          aria-pressed={selected}
                          disabled={busy || !option.available}
                          onClick={() =>
                            void update("choose", {
                              event_instance: choice.instance_id,
                              option_id: option.option_id,
                            })
                          }
                        >
                          <span className="choice-number">{selected ? "✓" : "＋"}</span>
                          <span>
                            <strong>{option.label}</strong>
                            <small>
                              支出 {option.cost}万円
                              {option.income ? ` ／ 半年後に入金 ＋${option.income}万円` : ""}
                            </small>
                            <small>{option.description}</small>
                            {option.reasons.map((r) => (
                              <small key={r.code}>{r.message}</small>
                            ))}
                          </span>
                        </button>
                      );
                    })}
                </div>
                {choice.selected_option && (
                  <button
                    className="life-cancel"
                    disabled={busy}
                    onClick={() =>
                      void update("choose", {
                        event_instance: choice.instance_id,
                        option_id: `${choice.event_id}:cancel`,
                      })
                    }
                  >
                    この予定を取り消す
                  </button>
                )}
              </article>
            ))}
          {!choices.some((c) => c.menu === menu) && (
            <p>今期は変更できる項目がありません。現在の暮らしを続けられます。</p>
          )}
        </>
      ) : (
        <>
          <h2>この暮らしを、続けていく。</h2>
          <p className="life-lead">
            何も選ばずに半年を進められます。気になることがあるときだけ、暮らしを変えてみましょう。
          </p>
          <div className="life-summary">
            {life.menus.map((item) => (
              <button key={item.id} onClick={() => setMenu(item.id)}>
                <strong>{item.label} ↗</strong>
                <span>
                  {life.policies
                    .filter((p) => choices.some((c) => c.event_id === p.id && c.menu === item.id))
                    .map((p) => p.planned_label)
                    .join(" ／ ") || "今の暮らしを続ける"}
                </span>
              </button>
            ))}
          </div>
          {opportunities.length > 0 && (
            <section className="life-opportunities">
              <h3>今期の機会</h3>
              {opportunities.map((c) => (
                <button key={c.event_id} onClick={() => setMenu(c.menu!)}>
                  <strong>{c.text} ↗</strong>
                  <span>{c.reason}</span>
                </button>
              ))}
            </section>
          )}
          <section className="life-observations">
            <h3>気になる様子</h3>
            <p>{state.family_status?.description}</p>
            {state.observations.map((o) => (
              <p key={o.code}>{o.text}</p>
            ))}
          </section>
          {state.decision_turn?.previous_result && (
            <details className="life-reflection">
              <summary>前の半年を振り返る</summary>
              {state.decision_turn.previous_result.text.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </details>
          )}
        </>
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
      {life.notices.map((notice) => (
        <p className="warning" key={notice}>
          {notice}
        </p>
      ))}
    </section>
  );
}
