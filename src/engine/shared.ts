import { sha256 } from "@noble/hashes/sha2.js";
export const PEOPLE = ["A", "B"] as const;
export const DOMAINS = ["study", "craft"] as const;
export const clampStat = (value: number) => Math.max(0, Math.min(100, Math.trunc(value)));
// rules-1は負の値もゼロ方向へ切り捨てる。Math.floorへの置換は再生結果を変える。
export const integerDivide = (dividend: number, divisor: number) => Math.trunc(dividend / divisor);
export const clone = <T>(value: T): T => structuredClone(value);
// 保存のdigestと再送の照合で共有。オブジェクトのキー順に依存させない。
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  return (
    "{" +
    Object.entries(value)
      .sort(([leftKey], [rightKey]) => (leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0))
      .map(([key, entry]) => JSON.stringify(key) + ":" + canonical(entry))
      .join(",") +
    "}"
  );
}
export const hash = (text: string) =>
  Array.from(sha256(new TextEncoder().encode(text)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
