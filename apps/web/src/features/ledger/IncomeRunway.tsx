import { useState } from "react";
import { cashAccount, incomeRunway } from "./money-decisions";
import { balance, money, won, type Ledger } from "./model";

export function IncomeRunway({ data }: { data: Ledger }) {
  const [ids, setIds] = useState(() => data.accounts.filter(a => ["SALARY", "FIXED", "LIVING"].includes(a.role)).map(a => a.id));
  const [cost, setCost] = useState(() => data.monthlyPlan ? String(data.monthlyPlan.fixedAmount + data.monthlyPlan.livingAmount) : "");
  const [reserve, setReserve] = useState("0");
  const [submitted, setSubmitted] = useState(false);
  let result: ReturnType<typeof incomeRunway> | null = null;
  let error = "";
  if (submitted) {
    try { result = incomeRunway(data, ids, money(cost), money(reserve)); }
    catch (e) { error = e instanceof Error ? e.message : "입력을 확인해 주세요."; }
  }
  return <details className="ledger-panel ledger-goal-scenario">
    <summary>수입 없이 얼마나 버틸 수 있을까?</summary>
    <p>급여와 새 수입이 끊겼을 때, 선택한 자금으로 생활할 수 있는 기간을 계산해요.</p>
    <form className="ledger-form" onSubmit={e => { e.preventDefault(); setSubmitted(true); }}>
      <fieldset className="ledger-checks"><legend>생활에 사용할 자금</legend>
        {data.accounts.filter(cashAccount).map(a => {
          const value = balance(a, data.entries);
          return <label className="ledger-checkbox" key={a.id}><input type="checkbox" checked={ids.includes(a.id)} onChange={e => {
            setIds(e.target.checked ? [...ids, a.id] : ids.filter(id => id !== a.id)); setSubmitted(false);
          }} />{a.name} · {value === null ? "잔액 미등록" : won(value)}{a.role === "SAVINGS" ? " (인출 가능한 경우만 선택)" : ""}</label>;
        })}
      </fieldset>
      <div className="ledger-fields">
        <label>수입 중단 후 매월 쓸 돈 (원)<input required inputMode="numeric" value={cost} onChange={e => { setCost(e.target.value); setSubmitted(false); }} /></label>
        <label>쓰지 않고 남길 돈·별도 목돈 지출 (원)<input required inputMode="numeric" value={reserve} onChange={e => { setReserve(e.target.value); setSubmitted(false); }} /></label>
      </div>
      <p className="ledger-note">월 지출의 초기값은 월급 계획의 고정비+생활비예요. 수입이 끊겨도 나갈 대출 원금·이자·보험료·비정기 지출을 포함하도록 직접 조정하세요. 현재 카드 미결제액은 아래에서 한 번 차감하므로 월 지출에는 앞으로의 소비를 입력하세요.</p>
      <button className="ledger-btn" type="submit">버틸 수 있는 기간 계산</button>
    </form>
    {error && <p className="ledger-error" role="alert">{error}</p>}
    {result && <div aria-live="polite">
      <h3>현재 가정으로 약 {Math.floor(result.months * 10) / 10}개월</h3>
      <p>30일을 한 달로 환산하면 약 {result.days.toLocaleString()}일 · 월 {won(result.monthlyCost)}</p>
      <p>선택한 양수 잔액 {won(result.cash)} − 카드 미결제·현금/저축 음수 잔액 {won(result.debt)} − 남겨둘 돈 {won(result.protectedMoney)}</p>
      <p>생활에 사용할 계산상 자금: <strong>{won(result.available)}</strong></p>
      {result.shortfall > 0 && <p className="ledger-error">부채와 남겨둘 돈을 확보하려면 {won(result.shortfall)} 부족해요.</p>}
    </div>}
    <p className="ledger-note">청약·ISA·연금은 제외하고 적금·저축은 직접 선택한 경우만 포함합니다. 선택하지 않은 현금·저축 계좌의 음수 잔액과 모든 카드 미결제액도 차감합니다. 대출 원금 전체는 즉시 차감하지 않으므로 매월 갚을 돈을 월 지출에 포함하세요. 신규 수입·수익률·물가 변동은 0으로 가정합니다. 목표용 자금을 선택하면 그 목표를 위해 남겨둘 돈도 따로 입력하세요. 실제 금융 독립 달성을 뜻하지 않으며 입력은 저장하지 않습니다.</p>
  </details>;
}
