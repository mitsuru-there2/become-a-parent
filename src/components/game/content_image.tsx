import type { Visual } from "../../content/types";
const assets = import.meta.glob("../../../assets/**/*.{png,jpg,jpeg,webp,gif,svg}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;
export function ContentImage({ visual, priority = false }: { visual: Visual; priority?: boolean }) {
  return (
    <img
      src={assets["../../.." + visual.src] ?? visual.src}
      alt={visual.alt}
      fetchPriority={priority ? "high" : "auto"}
      loading={priority ? "eager" : "lazy"}
      onError={(event) => {
        event.currentTarget.hidden = true;
      }}
    />
  );
}
