import type { CSSProperties, ReactNode } from "react";
import actionMap from "../../../assets/scenes/action-map.svg";

// Both road endpoints and HTML buttons consume the same normalized anchors.
export const mapAnchors: Record<string, { x: number; y: number }> = {
  education: { x: 25, y: 23 },
  afterschool: { x: 75, y: 23 },
  home: { x: 50, y: 50 },
  grandparents: { x: 25, y: 77 },
  work: { x: 75, y: 77 },
};
export function markerPosition(id: string): CSSProperties {
  const { x, y } = mapAnchors[id] ?? mapAnchors.home;
  return { "--marker-x": `${x}%`, "--marker-y": `${y}%` } as CSSProperties;
}
export function ActionMap({ children }: { children: ReactNode }) {
  return (
    <div className="map-viewport" tabIndex={0} role="region" aria-label="地図の表示領域">
      <div className="action-map" role="group" aria-label="アクションの地図">
        <img src={actionMap} alt="" aria-hidden="true" />
        <svg
          className="map-roads"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {Object.entries(mapAnchors)
            .filter(([id]) => id !== "home")
            .map(([id, { x, y }]) => (
              <path
                key={id}
                data-road={id}
                d={`M ${mapAnchors.home.x} ${mapAnchors.home.y} L ${x} ${y}`}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          <circle
            cx={mapAnchors.home.x}
            cy={mapAnchors.home.y}
            r="8"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {children}
      </div>
    </div>
  );
}
