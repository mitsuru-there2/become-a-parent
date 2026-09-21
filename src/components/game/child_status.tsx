import { useState } from "react";
import type { Observation, PublicState } from "../../engine/types";
import { StatusDetail } from "./status_detail";
import { FamilyPortrait, ObservationMark } from "./status_visual";

function ObservationRow({ observation, label }: { observation?: Observation; label: string }) {
  if (!observation) return null;
  return (
    <div className="child-observation-row">
      <ObservationMark observation={observation} label={label} />
      <p>{observation.short_text ?? observation.text}</p>
    </div>
  );
}

export function ChildStatus({ state }: { state: PublicState }) {
  const [open, setOpen] = useState(false);
  const observation = (code: string) => state.observations.find((item) => item.code === code);
  const energy = observation("energy");
  const infant = state.time.child_months < 36;
  const age = `${Math.floor(state.time.child_months / 12)}歳${state.time.child_months % 12 ? "6か月" : ""}`;
  const changes = state.observations.filter(
    (item) => ["settling", "recovery"].includes(item.code) || item.code.startsWith("trend:"),
  );
  return (
    <section className="party-member child-member" aria-label="子どものステータス">
      <button
        className="family-member-button"
        aria-label="子どもの詳細を開く"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <span className="family-member-heading">
          <FamilyPortrait kind="child" ageMonths={state.time.child_months} />
          <span>
            <strong>子ども</strong>
            <small>{age}</small>
          </span>
          <span className="family-open" aria-hidden="true">
            ↗
          </span>
        </span>
        <span className="child-compact-observations">
          <ObservationMark observation={energy} label="余裕" compact />
          <ObservationMark observation={observation("relationship.A")} label="父との関係" compact />
          <ObservationMark observation={observation("relationship.B")} label="母との関係" compact />
        </span>
      </button>
      {open && (
        <StatusDetail title="子どもの様子" onClose={() => setOpen(false)} variant="sheet">
          <div className="member-detail-heading">
            <FamilyPortrait kind="child" ageMonths={state.time.child_months} />
            <div>
              <strong>{age}</strong>
              <p>{state.time.school_label ?? "成人後"}</p>
            </div>
          </div>
          {state.life?.route_groups
            ?.filter((group) => group.menu === "education")
            .map((group) => (
              <p className="muted" key={group.id}>
                教育・進路：
                {group.routes.find((route) => route.id === group.current)?.label ?? "ルート未選択"}
              </p>
            ))}
          <section className="status-section">
            <h3>今の様子</h3>
            <ObservationRow observation={energy} label="余裕" />
            <ObservationRow observation={observation("agency")} label="自分で選ぶ様子" />
          </section>
          <section className="status-section">
            <h3>興味と成長</h3>
            <p className="muted">好きなことと、できること。それぞれの育ちを見守ります。</p>
            {(["study", "craft"] as const).map((domain) => (
              <div className="child-domain" key={domain}>
                <h4>
                  <span aria-hidden="true">{domain === "study" ? "▤" : "◇"}</span>{" "}
                  {infant
                    ? domain === "study"
                      ? "ことば・数の遊び"
                      : "形・音の遊び"
                    : domain === "study"
                      ? "学び"
                      : "創作"}
                </h4>
                <ObservationRow
                  observation={observation(`interest.${domain}`)}
                  label="好き・興味"
                />
                <ObservationRow
                  observation={observation(`progress.${domain}`)}
                  label="得意・成長"
                />
                {domain === "study" &&
                  state.time.child_months >= 72 &&
                  state.life?.study_score !== undefined && (
                    <div className="study-score">
                      <span>成績</span>
                      <meter min={0} max={100} value={state.life.study_score} aria-label="成績" />
                      <strong>
                        {state.life.study_score}
                        <small> / 100</small>
                      </strong>
                      <p className="muted">
                        進路ごとの必要な成績は、教育・進路の選択詳細で確認できます。
                      </p>
                    </div>
                  )}
              </div>
            ))}
          </section>
          <section className="status-section">
            <h3>父母との関係</h3>
            {(["A", "B"] as const).map((id) => (
              <div className="child-relationship" key={id}>
                <FamilyPortrait kind={id === "A" ? "father" : "mother"} />
                <ObservationRow
                  observation={observation(`relationship.${id}`)}
                  label={id === "A" ? "父との関係" : "母との関係"}
                />
              </div>
            ))}
          </section>
          <section className="status-section">
            <h3>最近の変化</h3>
            {changes.length ? (
              changes.map((item) => <p key={item.code}>{item.text}</p>)
            ) : (
              <p className="muted">いまは、はっきりした変化の手がかりはありません。</p>
            )}
          </section>
          <p className="status-footnote">図は、いま見えている様子を表しています。</p>
        </StatusDetail>
      )}
    </section>
  );
}
