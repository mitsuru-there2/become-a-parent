import { useState } from "react";
import { GRANDPARENTS, grandparentNames } from "../../engine/grandparents";
import type { PublicState } from "../../engine/types";
import { PEOPLE } from "../../engine/shared";
import { labels } from "../../lib/labels";
import { StatusDetail } from "./status_detail";

type Stat = { label: string; value: number | string; max?: number };
type Member = { id: string; name: string; note: string; stats: Stat[]; compact: Stat[] };

function MemberStats({ member, compact = false }: { member: Member; compact?: boolean }) {
  return (
    <dl className={compact ? "party-compact-stats" : "party-full-stats"}>
      {(compact ? member.compact : member.stats).map((stat) => (
        <div key={stat.label}>
          <dt>{stat.label}</dt>
          {!compact && stat.max !== undefined && typeof stat.value === "number" && (
            <meter
              min={0}
              max={stat.max}
              value={stat.value}
              aria-label={`${member.name}の${stat.label}`}
            />
          )}
          <dd>{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function PartyStatus({ state }: { state: PublicState }) {
  const [selected, setSelected] = useState<string | null>(null);
  const max = [
    "rules-4",
    "rules-5",
    "rules-6",
    "rules-7",
    "rules-8",
    "rules-9",
    "rules-10",
    "rules-11",
  ].includes(state.versions.rules)
    ? 10
    : 100;
  const turn = state.decision_turn;
  const members: Member[] = PEOPLE.map((id) => {
    const compact: Stat[] = [
      { label: "健康", value: state.parents[id].health, max },
      ...(turn ? [{ label: "疲労", value: turn.fatigue[id], max }] : []),
      { label: "ストレス", value: state.parents[id].stress, max },
    ];
    return {
      id,
      name: labels[id],
      note: `${Math.floor(state.parents[id].age_months / 12)}歳`,
      compact,
      stats: [
        ...compact,
        ...(["fulfillment", "social", "regret"] as const).map((key) => ({
          label: labels[key],
          value: state.parents[id][key],
          max,
        })),
        ...(turn
          ? [
              { label: "対話", value: turn.skills[id].dialogue },
              { label: "段取り", value: turn.skills[id].planning },
              { label: "学び", value: turn.skills[id].learning },
            ]
          : []),
      ],
    };
  });
  for (const id of ["rules-9", "rules-10", "rules-11"].includes(state.versions.rules)
    ? (["home"] as const)
    : GRANDPARENTS) {
    const member =
      id === "home" ? state.grandparents : (state.grandparents.members?.[id] ?? state.grandparents);
    const compact: Stat[] = [
      { label: "体力", value: member.health, max },
      { label: "関係", value: member.relation, max },
      { label: "援助資金", value: `${member.funds}万円` },
    ];
    members.push({
      id,
      name: id === "home" ? "実家" : grandparentNames[id],
      note: id === "home" ? "家族を支える仲間" : !state.grandparents.members ? "祖父母共通" : "",
      compact,
      stats: [...compact, { label: "地域のつながり", value: member.network ? "あり" : "なし" }],
    });
  }
  const detail = members.find((member) => member.id === selected);
  return (
    <section className="rpg-party" aria-label="家族のステータス" data-members={members.length}>
      {members.map((member) => (
        <section className="party-member" key={member.id} aria-label={`${member.name}のステータス`}>
          <div className="party-desktop">
            <h2>
              <button
                aria-label={`${member.name}の詳細を開く`}
                aria-haspopup="dialog"
                onClick={() => setSelected(member.id)}
              >
                {member.name}
                <span>{member.note}</span>
              </button>
            </h2>
            <MemberStats member={member} />
          </div>
          <button
            className="party-compact"
            aria-label={`${member.name}の詳細を開く`}
            aria-haspopup="dialog"
            onClick={() => setSelected(member.id)}
          >
            <span className="party-compact-name">
              {member.name}
              <span aria-hidden="true">⌃</span>
            </span>
            <MemberStats member={member} compact />
          </button>
        </section>
      ))}
      {detail && (
        <StatusDetail title={`${detail.name}の状態`} onClose={() => setSelected(null)}>
          <p className="muted">{detail.note}</p>
          <MemberStats member={detail} />
        </StatusDetail>
      )}
    </section>
  );
}
