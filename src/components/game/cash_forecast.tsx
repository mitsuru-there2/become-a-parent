import { useRef } from "react";
import type { Forecast } from "../../engine/types";

const signed = (value: number) => `${value < 0 ? "−" : "＋"}${Math.abs(value)}万円`;

export function CashForecast({ cash, forecast }: { cash: number; forecast: Forecast }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const incomes = forecast.cash_flow?.filter((line) => line.income) ?? [];
  const costs = forecast.cash_flow?.filter((line) => line.cost) ?? [];
  return (
    <>
      <button
        className="rpg-cash rpg-money-summary"
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
      >
        <strong>
          {cash}
          <small> 万円</small>
        </strong>
        <span className="rpg-money-income">
          <span aria-hidden="true">▲</span>
          <span className="sr-only">入金</span> {forecast.income}万円
        </span>
        <span className="rpg-money-cost">
          <span aria-hidden="true">▼</span>
          <span className="sr-only">支出</span> {forecast.cost}万円
        </span>
        <span className="rpg-money-more" aria-hidden="true">
          ⌄
        </span>
        <span className="sr-only">資金の予定を開く</span>
      </button>
      <dialog ref={dialog} className="rpg-finance-dialog" aria-labelledby="finance-dialog-title">
        <header>
          <div>
            <span className="tree-eyebrow">HOUSEHOLD BUDGET</span>
            <h2 id="finance-dialog-title">半年の資金予定</h2>
          </div>
          <button aria-label="閉じる" onClick={() => dialog.current?.close()}>
            ×
          </button>
        </header>
        <div className="rpg-finance-dialog-body">
          <div className="rpg-finance-current">
            <span>いまの資金</span>
            <strong>{cash}万円</strong>
          </div>
          <div className="rpg-finance-lines">
            <section>
              <h3>入金の予定</h3>
              <dl>
                {incomes.map((line, index) => (
                  <div key={`${line.label}:income:${index}`}>
                    <dt>{line.label}</dt>
                    <dd>{signed(line.income!)}</dd>
                  </div>
                ))}
              </dl>
              <p>
                入金合計 <strong>{signed(forecast.income)}</strong>
              </p>
            </section>
            <section>
              <h3>支出の予定</h3>
              <dl>
                {costs.map((line, index) => (
                  <div key={`${line.label}:cost:${index}`}>
                    <dt>{line.label}</dt>
                    <dd>{signed(-line.cost!)}</dd>
                  </div>
                ))}
              </dl>
              <p>
                支出合計 <strong>{signed(-forecast.cost)}</strong>
              </p>
            </section>
          </div>
          <div className="rpg-finance-projected">
            <span>半年後の資金予定</span>
            <strong>{forecast.projected_cash}万円</strong>
          </div>
          {cash + forecast.income - forecast.cost !== forecast.projected_cash && (
            <p className="rpg-finance-cap">資金の上限が反映されています。</p>
          )}
        </div>
      </dialog>
    </>
  );
}
