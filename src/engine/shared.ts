import { sha256 } from "@noble/hashes/sha2.js";
export const PEOPLE = ["A", "B"] as const;
export const DOMAINS = ["study", "craft"] as const;
export const c = (n: number) => Math.max(0, Math.min(100, Math.trunc(n)));
export const div = (a: number, b: number) => Math.trunc(a / b);
export const clone = <T>(v: T): T => structuredClone(v);
export function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  return (
    "{" +
    Object.entries(v)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, x]) => JSON.stringify(k) + ":" + canonical(x))
      .join(",") +
    "}"
  );
}
export const hash = (s: string) =>
  Array.from(sha256(new TextEncoder().encode(s)), (b) => b.toString(16).padStart(2, "0")).join("");
