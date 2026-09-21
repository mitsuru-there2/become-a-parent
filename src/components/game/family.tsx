import { GRANDPARENTS, grandparentNames } from "../../engine/grandparents";
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
      {publicState.life?.selection_tree && (
        <section className="family-tree-effects" aria-label="現在の暮らしと取得効果">
          <h3>現在の暮らしと取得効果</h3>
          {publicState.life.notices.map((notice) => (
            <p className="warning" key={notice}>
              {notice}
            </p>
          ))}
          <div className="family-tree-policies">
            {publicState.life.policies.map((policy) => (
              <p key={policy.id}>
                <span>{policy.title}</span>
                <strong>{policy.label}</strong>
                {policy.cost > 0 && <small>{policy.cost}万円／半年</small>}
                {policy.planned_label !== policy.label && (
                  <small>今期の予定：{policy.planned_label}</small>
                )}
              </p>
            ))}
          </div>
          <div className="family-tree-modifiers">
            <h4>取得効果（{publicState.life.active_effects?.length ?? 0}）</h4>
            {publicState.life.active_effects?.length ? (
              publicState.life.active_effects.map((effect, index) => (
                <p key={`${effect.source}:${effect.label}:${index}`}>
                  {effect.source} · {effect.label}：{effect.kind === "good" ? "良い" : "悪い"}
                  イベント {effect.percent > 0 ? "+" : ""}
                  {effect.percent}%
                </p>
              ))
            ) : (
              <p>取得効果はまだありません。</p>
            )}
          </div>
        </section>
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
                  max={
                    [
                      "rules-4",
                      "rules-5",
                      "rules-6",
                      "rules-7",
                      "rules-8",
                      "rules-9",
                      "rules-10",
                      "rules-11",
                      "rules-12",
                      "rules-13",
                    ].includes(publicState.versions.rules)
                      ? 10
                      : 100
                  }
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
                max={
                  [
                    "rules-4",
                    "rules-5",
                    "rules-6",
                    "rules-7",
                    "rules-8",
                    "rules-9",
                    "rules-10",
                    "rules-11",
                    "rules-12",
                    "rules-13",
                  ].includes(publicState.versions.rules)
                    ? 10
                    : 100
                }
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
      </div>
      {(publicState.grandparents.members ? GRANDPARENTS : (["shared"] as const)).map((id) => {
        const member =
          id === "shared" ? publicState.grandparents : publicState.grandparents.members![id];
        const name =
          id === "shared"
            ? ["rules-9", "rules-10", "rules-11", "rules-12", "rules-13"].includes(
                publicState.versions.rules,
              )
              ? "実家"
              : "祖父母（共通）"
            : grandparentNames[id];
        return (
          <div className="parent" key={id}>
            <h3>{name}</h3>
            <div className="family-detail">
              <span>体力</span>
              <strong>{member.health}</strong>
              <span>家族との関係</span>
              <strong>{member.relation}</strong>
              <span>援助に使えるお金</span>
              <strong>{member.funds}万円</strong>
              <span>地域とのつながり</span>
              <strong>{member.network ? "あり" : "なし"}</strong>
            </div>
          </div>
        );
      })}
    </aside>
  );
}
