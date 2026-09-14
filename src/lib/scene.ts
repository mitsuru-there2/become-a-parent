// Presentation only: public age/stage/season, never hidden traits or outcomes.
// A future image renderer can mount in [data-scene-media] beside this text.
const chapters: Record<string, [string, string]> = {
  baby: [
    "小さな寝息のある暮らし",
    "洗いかけの哺乳瓶。畳みかけの洗濯物。\n小さな寝息を聞きながら、今日の予定を組み直す。",
  ],
  preschool: [
    "「なんで？」が増える頃",
    "玄関の小さな靴。ポケットの中には、いつの間にか石。\n出かけるだけでも、ひとつの冒険になる。",
  ],
  primary: [
    "ただいま、のその先に",
    "机に置かれた連絡帳。明日の持ち物が、またひとつ。\n家の外の世界が、少しずつ広がっていく。",
  ],
  junior: [
    "近すぎず、遠すぎず",
    "少し大きくなった靴が、玄関に並ぶ。\n声をかけるタイミングを考えながら、夕飯の支度をする。",
  ],
  senior: [
    "未来の話をする食卓",
    "机の上には、進路の資料と飲みかけのコップ。\nこれからの話を、どんな距離で聞こう。",
  ],
  launch: [
    "手を離す練習",
    "予定表に、家族それぞれの用事が増えていく。\nいつもの食卓で、この先の暮らしを思い描く。",
  ],
};

export function sceneFor(time: { stage: string | null; season: string | null }) {
  const [title, text] = chapters[time.stage ?? ""] || [
    "家族のある暮らし",
    "今日も、家族それぞれの一日が続いていく。",
  ];
  return {
    title,
    text,
    season:
      time.season === "春〜夏"
        ? "窓の外では、日が少しずつ長くなる。"
        : "窓の外では、日が少しずつ短くなる。",
  };
}
