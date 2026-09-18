import { GRANDPARENTS, grandparentNames } from "../../engine/grandparents";
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
  const max = ["rules-4", "rules-5", "rules-6", "rules-7", "rules-8", "rules-9"].includes(
    state.versions.rules,
  )
    ? 10
    : 100;
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
      {(state.versions.rules === "rules-9" ? (["home"] as const) : GRANDPARENTS).map((id) => {
        const person = id === "home" ? "実家" : grandparentNames[id];
        const member =
          id === "home"
            ? state.grandparents
            : (state.grandparents.members?.[id] ?? state.grandparents);
        return (
          <section className="party-member" key={person} aria-label={`${person}のステータス`}>
            <h2>
              {person}
              {id === "home" ? (
                <span>家族を支える仲間</span>
              ) : (
                !state.grandparents.members && <span>祖父母共通</span>
              )}
            </h2>
            <div className="party-grand-stats">
              <StatusMeter max={max} person={person} label="体力" value={member.health} />
              <StatusMeter max={max} person={person} label="関係" value={member.relation} />
            </div>
            <dl className="party-support">
              <div>
                <dt>援助資金</dt>
                <dd>
                  {member.funds}
                  <small> 万円</small>
                </dd>
              </div>
              <div>
                <dt>地域のつながり</dt>
                <dd>{member.network ? "あり" : "なし"}</dd>
              </div>
            </dl>
          </section>
        );
      })}
    </section>
  );
}
