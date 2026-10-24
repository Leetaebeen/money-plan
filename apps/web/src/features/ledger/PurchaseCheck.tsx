import { useState } from "react";
import { cashAccount, purchaseImpact } from "./money-decisions";
import { money, planRemainder, won, type Ledger } from "./model";

export function PurchaseCheck({ data }: { data: Ledger }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [accountId, setAccountId] = useState("");
  const [submitted, setSubmitted] = useState(false);
  let result: ReturnType<typeof purchaseImpact> | null = null;
  let error = "";
  if (submitted) {
    try { result = purchaseImpact(data, accountId, money(price)); }
    catch (e) { error = e instanceof Error ? e.message : "입력을 확인해 주세요."; }
  }
  return <details className="ledger-panel ledger-goal-scenario">
    <summary>이거 사도 돼? · 구매 전 비교</summary>
    <p>오늘 한 번 구매한다면 계좌 잔액·소비 예산·연결된 목표가 어떻게 달라지는지 확인해요.</p>
    <form className="ledger-form" onSubmit={e => { e.preventDefault(); setSubmitted(true); }}>
      <div className="ledger-fields">
        <label>사고 싶은 것 (선택)<input maxLength={80} value={name} onChange={e => { setName(e.target.value); setSubmitted(false); }} placeholder="예: 노트북" /></label>
        <label>가격 (원)<input required inputMode="numeric" value={price} onChange={e => { setPrice(e.target.value); setSubmitted(false); }} /></label>
        <label>돈을 꺼낼 계좌<select required value={accountId} onChange={e => { setAccountId(e.target.value); setSubmitted(false); }}>
          <option value="">계좌 선택</option>
          {data.accounts.filter(cashAccount).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select></label>
      </div>
      <button className="ledger-btn" type="submit">구매 전후 비교</button>
    </form>
    {error && <p className="ledger-error" role="alert">{error}</p>}
    {result && <div aria-live="polite">
      <h3>{name.trim() || "이번 구매"} · {won(money(price))}</h3>
      <p>계좌 잔액: {won(result.current)} → <strong>{won(result.afterBalance)}</strong></p>
      {result.shortage > 0 && <p className="ledger-error">이 계좌에서 {won(result.shortage)} 부족해요. 아래 목표 비교는 부족한 돈을 별도로 마련한다는 가정입니다.</p>}
      <p>{result.budgetAfter === null ? "소비 예산 비교 불가: 월급 계획의 지출 계좌인지, 월급 주기 전체 기록과 카드 분류가 있는지 확인하세요." : `이번 월급 주기 예산: ${won(result.budgetBefore!)} → ${won(result.budgetAfter)}`}</p>
      {result.budgetAfter !== null && result.budgetAfter < 0 && <p className="ledger-error">구매 후 기록 기준 예산을 {won(-result.budgetAfter)} 초과해요.</p>}
      {result.goals.length === 0 && <p>이 계좌에 연결된 목표가 없습니다. 목표 지연은 계산하지 않아요. 향후 저축을 줄여야 한다면 목표에도 영향이 생길 수 있어요.</p>}
      {result.goals.map(row => <div key={row.goal.id} className="ledger-note">
        <h4>{row.goal.name}</h4>
        {row.before && row.after ? <>
          <p>예상 달성일: {row.before.projected ?? "계산 불가"} → {row.after.projected ?? "계산 불가"}</p>
          <p>{row.delay === null || !row.before.projected || !row.after.projected ? "월 납입액이 없거나 예측 범위를 넘어 지연 기간을 확정할 수 없어요." : row.delay === 0 ? "현재 월 납입을 유지하면 예상 달성일은 같아요." : `월 납입 ${row.delay}회만큼 더 필요해요.`}</p>
          <p>목표까지 부족한 돈: {won(row.before.remaining)} → {won(row.after.remaining)}</p>
          {row.after.projected && row.after.projected > row.goal.deadline && <p className="ledger-error">구매 후 예상 달성일이 목표 기한 {row.goal.deadline}을 넘어요.</p>}
        </> : <p>연결 잔액이 미등록이거나 쓸 돈과 목표 자금이 섞여 있어 달성일을 비교하지 않습니다.</p>}
      </div>)}
      {data.monthlyPlan && planRemainder(data.monthlyPlan) < 0 && <p className="ledger-error">현재 월급 계획부터 적자입니다. 목표 예상일은 월 납입 재원을 마련한다는 가정이에요.</p>}
    </div>}
    <p className="ledger-note">거래·목표는 변경하지 않습니다. 월 납입 유지·수익률 0% 가정이며, 앞으로 나갈 고정비와 다른 약속된 지출을 모두 차감한 구매 승인은 아닙니다. 적금·저축 계좌는 실제 인출 가능 여부와 중도해지 조건을 확인하세요. 청약·ISA·연금·신용카드는 선택에서 제외합니다.</p>
  </details>;
}
