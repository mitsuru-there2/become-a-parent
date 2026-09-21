import type { Observation } from "../../engine/types";

export type PortraitKind = "child" | "father" | "mother" | "home";
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
}: {
  observation?: Observation;
  label: string;
  compact?: boolean;
}) {
  const band = observation?.band;
  const energy = observation?.code === "energy";
  return (
    <span
      className={`observation-mark${compact ? " is-compact" : ""}`}
      data-band={band}
      data-energy={energy || undefined}
      role="img"
      aria-label={`${label}：${observation?.short_text ?? observation?.text ?? "まだ様子がわかりません"}`}
    >
      <span className="observation-label" aria-hidden="true">
        {compact ? label.replace("との関係", "") : label}
      </span>
      <svg viewBox="0 0 54 20" fill="none" aria-hidden="true">
        {energy ? (
          <>
            <circle cx="27" cy="10" r="8" />
            <path d="M24 7v1m6-1v1" />
            <path
              d={
                band === "high"
                  ? "M23 14q4-5 8 0"
                  : band === "middle"
                    ? "M24 13h6"
                    : "M23 12q4 5 8 0"
              }
            />
          </>
        ) : (
          <>
            <path
              className="relation-line"
              d="M10 10h34"
              strokeDasharray={band === "high" ? undefined : "2 4"}
            />
            {["low", "middle", "high"].map((step, index) => (
              <circle
                key={step}
                cx={10 + index * 17}
                cy="10"
                r={band === step ? 5 : 3}
                className={band === step ? "is-current" : ""}
              />
            ))}
          </>
        )}
        {!band && <path className="unknown-mark" d="M24 6q0-4 5-2c4 3-2 4-2 7m0 4v.1" />}
      </svg>
    </span>
  );
}

export function StatMeter({
  label,
  value,
  max,
  burden = false,
}: {
  label: string;
  value: number;
  max: number;
  burden?: boolean;
}) {
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
