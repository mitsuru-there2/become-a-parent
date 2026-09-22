import type { Observation } from "../../engine/types";

export type PortraitKind = "child" | "father" | "mother" | "home";
const relationshipHeart = "M24 37C19 33 9 26 9 18a8 8 0 0 1 15-3 8 8 0 0 1 15 3c0 8-10 15-15 19Z";
const halfRelationshipHeart = "M24 37C19 33 9 26 9 18a8 8 0 0 1 15-3v22Z";
export function FamilyPortrait({
  kind,
  ageMonths = 0,
}: {
  kind: PortraitKind;
  ageMonths?: number;
}) {
  const emoji = {
    child: ageMonths < 36 ? "👶" : ageMonths < 216 ? "🧒" : "🧑",
    father: "👨",
    mother: "👩",
    home: "🏡",
  }[kind];
  return (
    <span className="family-portrait" data-person={kind} aria-hidden="true">
      {emoji}
    </span>
  );
}

export function ObservationMark({
  observation,
  label,
  compact = false,
  changed = false,
}: {
  observation?: Observation;
  label: string;
  compact?: boolean;
  changed?: boolean;
}) {
  const band = observation?.band;
  const energy = observation?.code === "energy";
  const relationship = observation?.code.startsWith("relationship.");
  const relationshipState =
    relationship && band ? { low: "嫌い", middle: "普通", high: "好き" }[band] : null;
  return (
    <span
      className={`observation-mark${compact ? " is-compact" : ""}${changed ? " status-changed" : ""}`}
      data-band={band}
      data-energy={energy || undefined}
      data-relationship={relationship || undefined}
      role="img"
      aria-label={`${label}：${relationshipState ? `${relationshipState}。` : ""}${observation?.short_text ?? observation?.text ?? "まだ様子がわかりません"}`}
    >
      <span className="observation-label" aria-hidden="true">
        {compact ? label.replace("との関係", "") : label}
      </span>
      <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
        {energy && band ? (
          <>
            <circle cx="24" cy="24" r="16" />
            <path d="M18 20v2m12-2v2" />
            <path
              d={
                band === "high"
                  ? "M17 32q7-8 14 0"
                  : band === "middle"
                    ? "M18 30h12"
                    : "M17 29q7 9 14 0"
              }
            />
          </>
        ) : relationship && band ? (
          <>
            {band === "middle" && (
              <path className="relationship-heart-half" d={halfRelationshipHeart} />
            )}
            <path
              className={`relationship-heart${band === "high" ? " is-filled" : ""}`}
              d={relationshipHeart}
            />
          </>
        ) : band ? (
          <>
            <path d="M8 24h32" strokeDasharray={band === "high" ? undefined : "2 4"} />
            {(["low", "middle", "high"] as const).map((step, index) => (
              <circle
                key={step}
                cx={10 + index * 14}
                cy="24"
                r={band === step ? 5 : 3}
                className={band === step ? "is-current" : ""}
              />
            ))}
          </>
        ) : (
          <path className="unknown-mark" d="M19 17a6 6 0 1 1 8 6c-3 2-3 3-3 5m0 5v1" />
        )}
      </svg>
    </span>
  );
}

export function StatMeter({
  label,
  value,
  max,
  burden = false,
  percent = false,
  delta,
  changeSequence,
}: {
  label: string;
  value: number;
  max: number;
  burden?: boolean;
  percent?: boolean;
  delta?: number;
  changeSequence?: number;
}) {
  if (percent)
    return (
      <span className="status-meter status-percent" data-burden={burden || undefined}>
        <span>{label}</span>
        <span
          className="status-percent-ring"
          role="img"
          aria-label={`${label} ${value}%${burden ? "、高いほど負担" : ""}`}
          style={
            {
              "--ring-progress": `${value}%`,
              background:
                "conic-gradient(var(--ring-color, #acc2a3) var(--ring-progress), #343e32 0)",
            } as React.CSSProperties
          }
        >
          <span>{value}%</span>
        </span>
        {delta !== undefined && (
          <span
            className="status-change"
            data-direction={delta > 0 ? "up" : "down"}
            key={changeSequence}
          >
            {delta > 0 ? "+" : ""}
            {delta}
          </span>
        )}
      </span>
    );
  return (
    <span className="status-meter" data-burden={burden || undefined}>
      <span>{label}</span>
      <meter
        min={0}
        max={max}
        value={value}
        aria-label={`${label}${burden ? "（高いほど負担）" : ""}`}
      >
        {value} / {max}
      </meter>
    </span>
  );
}
