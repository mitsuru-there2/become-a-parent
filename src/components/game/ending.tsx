import { motion } from "motion/react";
import type { Result } from "../../engine/types";
import { PEOPLE } from "../../engine/shared";
import { labels } from "../../lib/labels";

export function Ending({ result }: { result: Result }) {
  return (
    <motion.section
      className="ending"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <span className="eyebrow">LIFE GOES ON · {result.ending.id}</span>
      <h1>{result.ending.title}</h1>
      <p className="ending-story">{result.ending.text}</p>
      <div className="results">
        {PEOPLE.map((parentId) => {
          const parentResult = result.parents[parentId];
          return (
            <div key={parentId}>
              <span className="eyebrow">
                親{parentId}の人生 · {parentResult.death_age}歳
              </span>
              <h2>
                幸福 <strong>{parentResult.happiness}</strong>
                <small> / 100</small>
              </h2>
              <p>{parentResult.label}</p>
              <dl>
                {Object.entries(parentResult.axes).map(([axis, score]) => (
                  <div key={axis}>
                    <dt>{labels[axis]}</dt>
                    <dd>{score}</dd>
                  </div>
                ))}
                <div>
                  <dt>残った資金</dt>
                  <dd>{parentResult.cash}万円</dd>
                </div>
              </dl>
            </div>
          );
        })}
        <div>
          <span className="eyebrow">子どもの人生 · {result.child.age}歳</span>
          <h2>
            幸福 <strong>{result.child.happiness}</strong>
            <small> / 100</small>
          </h2>
          <p>{result.child.residence === "far" ? "遠くの街で暮らす" : "近くで暮らす"}</p>
          <dl>
            <div>
              <dt>主体性</dt>
              <dd>{result.child.autonomy}</dd>
            </div>
            <div>
              <dt>社会的な成果</dt>
              <dd>{result.child.social_success}</dd>
            </div>
          </dl>
        </div>
      </div>
      <div className="story-lines">
        {result.story.map((line, index) => (
          <p key={index}>{line}</p>
        ))}
      </div>
      <p className="fine">
        この評価は、家族それぞれがどんな幸せを感じたかを振り返るための、ゲーム内の指標です。
      </p>
    </motion.section>
  );
}
