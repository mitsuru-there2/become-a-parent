import type { PublicState } from "../../engine/types";
import { PEOPLE } from "../../engine/shared";
import { labels } from "../../lib/labels";

function StatusMeter({
  person,
  label,
  value,
  max,
}: {
  person: string;
  label: string;
  value: number;
  max: number;
}) {
  return (
    <div className="party-stat">
      <span>{label}</span>
      <meter min={0} max={max} value={value} aria-label={`${person}の${label}`} />
      <b>{value}</b>
    </div>
  );
}

export function PartyStatus({ state }: { state: PublicState }) {
  const max = ["rules-4", "rules-5", "rules-6"].includes(state.versions.rules) ? 10 : 100;
  const turn = state.decision_turn;
  return (
    <section className="rpg-party" aria-label="家族のステータス">
      {PEOPLE.map((id) => (
        <section className="party-member" key={id} aria-label={`${labels[id]}のステータス`}>
          <h2>
            {labels[id]}
            <span>{Math.floor(state.parents[id].age_months / 12)}歳</span>
          </h2>
          <div className="party-stats">
            <StatusMeter
              max={max}
              person={labels[id]}
              label="健康"
              value={state.parents[id].health}
            />
            {turn && (
              <StatusMeter max={max} person={labels[id]} label="疲労" value={turn.fatigue[id]} />
            )}
            {(["stress", "fulfillment", "social", "regret"] as const).map((key) => (
              <StatusMeter
                max={max}
                key={key}
                person={labels[id]}
                label={labels[key]}
                value={state.parents[id][key]}
              />
            ))}
          </div>
          {turn && (
            <p className="party-skills">
              対話 <b>{turn.skills[id].dialogue}</b> · 段取り <b>{turn.skills[id].planning}</b> ·
              学び <b>{turn.skills[id].learning}</b>
            </p>
          )}
        </section>
      ))}
      {["祖父", "祖母"].map((person) => (
        <section className="party-member" key={person} aria-label={`${person}のステータス`}>
          <h2>
            {person}
            <span>祖父母共通</span>
          </h2>
          <div className="party-grand-stats">
            <StatusMeter max={max} person={person} label="体力" value={state.grandparents.health} />
            <StatusMeter
              max={max}
              person={person}
              label="関係"
              value={state.grandparents.relation}
            />
          </div>
          <dl className="party-support">
            <div>
              <dt>援助資金</dt>
              <dd>
                {state.grandparents.funds}
                <small> 万円</small>
              </dd>
            </div>
            <div>
              <dt>地域のつながり</dt>
              <dd>{state.grandparents.network ? "あり" : "なし"}</dd>
            </div>
          </dl>
        </section>
      ))}
    </section>
  );
}
