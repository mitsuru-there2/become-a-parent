import type { PublicState } from "../engine/types";
// 情景・画像は共通サービスが保存内の設定から選ぶ。UIは隠し状態を参照しない。
export function sceneFor(state: PublicState) {
  return {
    title: state.scene?.title ?? "家族のある暮らし",
    text: state.scene?.text ?? "今日も、家族それぞれの一日が続いていく。",
    visual: state.scene?.visual ?? null,
    season:
      state.time.season === "春〜夏"
        ? "窓の外では、日が少しずつ長くなる。"
        : "窓の外では、日が少しずつ短くなる。",
  };
}
