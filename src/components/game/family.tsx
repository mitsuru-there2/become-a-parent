import type { PublicState } from "../../engine/types";
import { PEOPLE } from "../../engine/shared";
import { labels } from "../../lib/labels";

export function Family({ publicState }: { publicState: PublicState }) {
  return (
    <aside className="family">
      <span className="eyebrow">OUR FAMILY</span>
      <h2>家族のようす</h2>
      {PEOPLE.map((parentId) => (
        <div className="parent" key={parentId}>
          <h3>
            親{parentId}
            <span>{Math.floor(publicState.parents[parentId].age_months / 12)}歳</span>
          </h3>
          {(["stress", "health", "fulfillment", "social", "regret"] as const).map((statKey) => (
            <div className="stat" key={statKey}>
              <span>{labels[statKey]}</span>
              <meter
                min="0"
                max="100"
                value={publicState.parents[parentId][statKey]}
                aria-label={`親${parentId}の${labels[statKey]}`}
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
