import type { PublicState } from "../../engine/types";
import { PEOPLE } from "../../engine/shared";
import { labels } from "../../lib/labels";

export function Family({ publicState }: { publicState: PublicState }) {
  return (
    <aside className="family">
      <span className="eyebrow">OUR FAMILY</span>
      <h2>家族の様子</h2>
      {publicState.family_status && (
        <div className="family-summary">
          <strong>{publicState.family_status.label}</strong>
          <span>{publicState.family_status.level} / 5</span>
          <p>{publicState.family_status.description}</p>
        </div>
      )}
      {PEOPLE.map((parentId) => (
        <div className="parent" key={parentId}>
          <h3>
            {labels[parentId]}
            <span>{Math.floor(publicState.parents[parentId].age_months / 12)}歳</span>
          </h3>
          {publicState.decision_turn && (
            <>
              <div className="stat">
                <span>疲労</span>
                <meter
                  min="0"
                  max={["rules-4", "rules-5"].includes(publicState.versions.rules) ? 10 : 100}
                  value={publicState.decision_turn.fatigue[parentId]}
                  aria-label={`${labels[parentId]}の疲労`}
                />
                <b>{publicState.decision_turn.fatigue[parentId]}</b>
              </div>
              <p className="parent-skills">
                対話 {publicState.decision_turn.skills[parentId].dialogue} · 段取り{" "}
                {publicState.decision_turn.skills[parentId].planning}
                <br />
                学びの支援 {publicState.decision_turn.skills[parentId].learning}
              </p>
            </>
          )}
          {(["stress", "health", "fulfillment", "social", "regret"] as const).map((statKey) => (
            <div className="stat" key={statKey}>
              <span>{labels[statKey]}</span>
              <meter
                min="0"
                max={["rules-4", "rules-5"].includes(publicState.versions.rules) ? 10 : 100}
                value={publicState.parents[parentId][statKey]}
                aria-label={`${labels[parentId]}の${labels[statKey]}`}
              />
              <b>{publicState.parents[parentId][statKey]}</b>
            </div>
          ))}
        </div>
      ))}
      <div className="family-detail">
        <span>夫婦の関係</span>
        <strong>{publicState.couple}</strong>
        <span>祖父母の体力</span>
        <strong>{publicState.grandparents.health}</strong>
        <span>祖父母との関係</span>
        <strong>{publicState.grandparents.relation}</strong>
        <span>援助に使えるお金</span>
        <strong>{publicState.grandparents.funds}万円</strong>
        <span>地域とのつながり</span>
        <strong>{publicState.grandparents.network ? "あり" : "なし"}</strong>
      </div>
    </aside>
  );
}
