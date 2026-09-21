import type { History, Observation, PublicState } from "./types";

const observationCodes: Record<string, string> = {
  ストレス: "energy",
  主体性: "agency",
  "信頼・父": "relationship.A",
  "信頼・母": "relationship.B",
  "興味・学び": "interest.study",
  "興味・創作": "interest.craft",
  "能力・学び": "progress.study",
  "能力・創作": "progress.craft",
};

/** Internal stage logs retain exact values for replay. Public logs use their recorded observations. */
export function publicHistoryLines(
  lines: string[],
  observations: Observation[],
  studyPublic: boolean,
) {
  return [
    ...new Set(
      lines.map((line) => {
        const match = /^子ども・(.+?) -?\d+→-?\d+(?:（.*）)?$/.exec(line);
        if (!match || (studyPublic && match[1] === "能力・学び")) return line;
        const observation = observations.find((item) => item.code === observationCodes[match[1]]);
        return observation
          ? `子ども・${match[1]}：${observation.text}`
          : "子どもの様子を見守っています。";
      }),
    ),
  ];
}

export function publicHistory(entry: History, studyPublic: boolean): History {
  if (entry.kind === "adult") return entry;
  return {
    ...entry,
    text: publicHistoryLines(entry.text, entry.observations, studyPublic),
    ...(entry.event_results
      ? {
          event_results: entry.event_results.map((event) => ({
            ...event,
            changes: publicHistoryLines(event.changes, entry.observations, studyPublic),
          })),
        }
      : {}),
  };
}

export function publicStateHistory(state: PublicState): PublicState {
  if (!state.decision_turn) return state;
  const turn = state.decision_turn;
  const studyPublic = state.life?.study_score !== undefined;
  return {
    ...state,
    decision_turn: {
      ...turn,
      previous_result: turn.previous_result
        ? publicHistory(turn.previous_result, studyPublic)
        : null,
      event_result: publicHistoryLines(turn.event_result, state.observations, studyPublic),
      event_results: turn.event_results.map((event) => ({
        ...event,
        changes: publicHistoryLines(event.changes, state.observations, studyPublic),
      })),
    },
  };
}
