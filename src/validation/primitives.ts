import * as v from "valibot";
export const integer = (minimum = 0, maximum = 99999) =>
  v.pipe(v.number(), v.integer(), v.minValue(minimum), v.maxValue(maximum));
export const requestIdSchema = v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{1,64}$/));
export const contentIdSchema = v.pipe(
  v.string(),
  v.regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/),
  v.check(
    (id) => !["constructor", "prototype", "__proto__", "none"].includes(id),
    "予約されたIDは使えません",
  ),
);
// recordが危険なキーを除外する前に検査し、入力の一部を黙って捨てない。
export function dictionary<T extends v.GenericSchema>(item: T, contentIds = true) {
  return v.pipe(
    v.unknown(),
    v.check(
      (value) =>
        !!value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Object.keys(value).every((key) =>
          contentIds
            ? v.is(contentIdSchema, key)
            : !["__proto__", "constructor", "prototype"].includes(key),
        ),
      "辞書のキーが不正です",
    ),
    v.record(v.string(), item),
  );
}
export const unique = <T>() =>
  v.check((items: T[]) => new Set(items).size === items.length, "重複しています");
