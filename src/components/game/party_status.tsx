import { useEffect, useRef, useState } from "react";
import { GRANDPARENTS, grandparentNames } from "../../engine/grandparents";
import type { PublicState } from "../../engine/types";
import { PEOPLE } from "../../engine/shared";
import { labels } from "../../lib/labels";
import { StatusDetail } from "./status_detail";
import { ChildStatus } from "./child_status";
import { FamilyPortrait, StatMeter, type PortraitKind } from "./status_visual";

type Stat = {
  label: string;
  value: number | string;
  rawValue?: number;
  max?: number;
  burden?: boolean;
  kind?: "percent" | "score";
};
type Member = {
  id: string;
  name: string;
  note: string;
  portrait: PortraitKind;
  stats: Stat[];
  compact: Stat[];
};

type StatusChanges = { values: Record<string, number | true>; sequence: number };

function statusSnapshot(state: PublicState, members: Member[]) {
  const snapshot: Record<string, number | string> = {};
  for (const member of members) {
    for (const stat of member.compact)
      snapshot[`${member.id}:${stat.label}`] = stat.rawValue ?? stat.value;
  }
  for (const code of ["energy", "relationship.A", "relationship.B"]) {
    snapshot[`child:${code}`] =
      state.observations.find((item) => item.code === code)?.band ?? "unknown";
  }
  return snapshot;
}

function MemberStats({ member }: { member: Member }) {
  return (
    <dl className="member-full-stats">
      {member.stats.map((stat) => (
        <div key={stat.label} data-burden={stat.burden || undefined}>
          <dt>
            {stat.label}
            {stat.burden && <small>高いほど負担</small>}
          </dt>
          <dd>
            {stat.kind === "percent" && typeof stat.value === "number" ? (
              <StatMeter
                label={stat.label}
                value={stat.value}
                max={100}
                burden={stat.burden}
                percent
              />
            ) : stat.max !== undefined && typeof stat.value === "number" ? (
              <meter
                min={0}
                max={stat.max}
                value={stat.value}
                aria-label={`${member.name}の${stat.label}`}
              />
            ) : null}
            {stat.kind !== "percent" && (
              <strong>
                {stat.value}
                {stat.kind === "score" ? (
                  "点"
                ) : stat.max !== undefined ? (
                  <small> / {stat.max}</small>
                ) : null}
              </strong>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function PartyStatus({ state }: { state: PublicState }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [changes, setChanges] = useState<StatusChanges>({ values: {}, sequence: 0 });
  const previous = useRef<Record<string, number | string> | null>(null);
  const percent = state.versions.rules === "rules-14";
  const max = [
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
  ].includes(state.versions.rules)
    ? 10
    : 100;
  const turn = state.decision_turn;
  const members: Member[] = PEOPLE.map((id) => {
    const compact: Stat[] = [
      {
        label: "健康",
        value: state.parents[id].health,
        max,
        kind: percent ? ("percent" as const) : undefined,
      },
      ...(turn
        ? [
            {
              label: "疲労",
              value: turn.fatigue[id],
              max,
              burden: true,
              kind: percent ? ("percent" as const) : undefined,
            },
          ]
        : []),
      {
        label: "ストレス",
        value: state.parents[id].stress,
        max,
        burden: true,
        kind: percent ? ("percent" as const) : undefined,
      },
    ];
    return {
      id,
      name: labels[id],
      portrait: id === "A" ? "father" : "mother",
      note: `${Math.floor(state.parents[id].age_months / 12)}歳`,
      compact,
      stats: [
        ...compact,
        ...(["fulfillment", "social", "regret"] as const).map((key) => ({
          label: labels[key],
          value: state.parents[id][key],
          max,
          burden: key === "regret",
          kind: percent ? ("percent" as const) : undefined,
        })),
        ...(turn
          ? [
              {
                label: "対話",
                value: turn.skills[id].dialogue,
                max,
                kind: percent ? ("score" as const) : undefined,
              },
              {
                label: "段取り",
                value: turn.skills[id].planning,
                max,
                kind: percent ? ("score" as const) : undefined,
              },
              {
                label: "学びの支援",
                value: turn.skills[id].learning,
                max,
                kind: percent ? ("score" as const) : undefined,
              },
            ]
          : []),
      ],
    };
  });
  for (const id of ["rules-9", "rules-10", "rules-11", "rules-12", "rules-13", "rules-14"].includes(
    state.versions.rules,
  )
    ? (["home"] as const)
    : GRANDPARENTS) {
    const member =
      id === "home" ? state.grandparents : (state.grandparents.members?.[id] ?? state.grandparents);
    const compact: Stat[] = [
      { label: "体力", value: member.health, max, kind: percent ? "percent" : undefined },
      { label: "関係", value: member.relation, max, kind: percent ? "percent" : undefined },
      { label: "援助資金", value: `${member.funds}万円`, rawValue: member.funds },
    ];
    members.push({
      id,
      name: id === "home" ? "実家" : grandparentNames[id],
      portrait: "home",
      note: id === "home" ? "家族を支える仲間" : !state.grandparents.members ? "祖父母共通" : "",
      compact,
      stats: [...compact, { label: "地域のつながり", value: member.network ? "あり" : "なし" }],
    });
  }
  const snapshot = statusSnapshot(state, members);
  useEffect(() => {
    const before = previous.current;
    previous.current = snapshot;
    if (!before) return;
    const values: Record<string, number | true> = {};
    for (const [key, value] of Object.entries(snapshot)) {
      const oldValue = before[key];
      if (oldValue === undefined || oldValue === value) continue;
      values[key] =
        typeof value === "number" && typeof oldValue === "number" ? value - oldValue : true;
    }
    if (Object.keys(values).length === 0) {
      setChanges((current) => ({ ...current, values: {} }));
      return;
    }
    setChanges((current) => ({ values, sequence: current.sequence + 1 }));
    const timeout = window.setTimeout(
      () => setChanges((current) => ({ ...current, values: {} })),
      1700,
    );
    return () => window.clearTimeout(timeout);
  }, [state]);
  const detail = members.find((member) => member.id === selected);
  return (
    <section
      className="rpg-party"
      aria-label="家族のステータス"
      data-members={members.length + 1}
      data-scale={percent ? "percent" : undefined}
    >
      <ChildStatus state={state} changes={changes} />
      {members.map((member) => (
        <section
          className="party-member"
          key={member.id}
          aria-label={`${member.name}のステータス`}
          data-changed={
            member.compact.some(
              (stat) => changes.values[`${member.id}:${stat.label}`] !== undefined,
            ) || undefined
          }
        >
          <button
            className="family-member-button"
            aria-label={`${member.name}の詳細を開く`}
            aria-haspopup="dialog"
            onClick={() => setSelected(member.id)}
          >
            <span className="family-member-heading">
              <FamilyPortrait kind={member.portrait} />
              <span>
                <strong>{member.name}</strong>
                <small>{member.id === "home" ? "家族の支え" : member.note}</small>
              </span>
              <span className="family-open" aria-hidden="true">
                ↗
              </span>
            </span>
            <span className={`family-compact-stats${percent ? " is-percent" : ""}`}>
              {member.compact.map((stat) =>
                stat.max !== undefined && typeof stat.value === "number" ? (
                  <StatMeter
                    key={stat.label}
                    label={stat.label}
                    value={stat.value}
                    max={stat.max}
                    burden={stat.burden}
                    percent={stat.kind === "percent"}
                    changeSequence={changes.sequence}
                    delta={
                      typeof changes.values[`${member.id}:${stat.label}`] === "number"
                        ? (changes.values[`${member.id}:${stat.label}`] as number)
                        : undefined
                    }
                  />
                ) : (
                  <span className="status-money" key={stat.label}>
                    <span>{stat.label}</span>
                    <strong>{stat.value}</strong>
                    {typeof changes.values[`${member.id}:${stat.label}`] === "number" && (
                      <span
                        className="status-change"
                        data-direction={
                          (changes.values[`${member.id}:${stat.label}`] as number) > 0
                            ? "up"
                            : "down"
                        }
                        key={changes.sequence}
                      >
                        {(changes.values[`${member.id}:${stat.label}`] as number) > 0 ? "+" : ""}
                        {changes.values[`${member.id}:${stat.label}`]}万円
                      </span>
                    )}
                  </span>
                ),
              )}
            </span>
          </button>
        </section>
      ))}
      {detail && (
        <StatusDetail
          title={`${detail.name}の状態`}
          onClose={() => setSelected(null)}
          variant="sheet"
        >
          <div className="member-detail-heading">
            <FamilyPortrait kind={detail.portrait} />
            <div>
              <strong>{detail.name}</strong>
              <p>{detail.note}</p>
            </div>
          </div>
          <MemberStats member={detail} />
        </StatusDetail>
      )}
    </section>
  );
}
