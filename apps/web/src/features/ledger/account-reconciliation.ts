import { balance, MAX_WON, today, validDate, type Ledger } from "./model.ts";

export function reconciliationPreview(
  data: Ledger,
  accountId: string,
  date: string,
  actual: number,
  asOf = today(),
) {
  const account = data.accounts.find((a) => a.id === accountId);
  if (
    !account ||
    !validDate(date) ||
    !validDate(asOf) ||
    date > asOf ||
    date < account.openingDate
  )
    throw new Error(
      "계좌 기준일 이후, 오늘까지의 잔액 확인일을 선택해 주세요.",
    );
  if (!Number.isSafeInteger(actual) || Math.abs(actual) > MAX_WON)
    throw new Error("확인한 잔액을 원 단위 정수로 입력해 주세요.");
  const recorded = balance(account, data.entries, date);
  if (recorded === null)
    throw new Error("먼저 계좌 설정에서 기준 잔액을 등록해 주세요.");
  const adjustment = actual - recorded;
  if (!Number.isSafeInteger(adjustment) || Math.abs(adjustment) > MAX_WON)
    throw new Error("조정 차액이 입력 가능한 금액 범위를 넘습니다.");
  return { recorded, actual, adjustment, date };
}

export function reconcileAccountBalance(
  data: Ledger,
  accountId: string,
  date: string,
  actual: number,
  note: string,
  asOf = today(),
) {
  const preview = reconciliationPreview(data, accountId, date, actual, asOf);
  if (!note.trim() || note.trim().length > 160)
    throw new Error("잔액 조정 사유를 1~160자로 입력해 주세요.");
  if (!preview.adjustment)
    throw new Error("기록된 잔액과 같아 조정할 차액이 없습니다.");
  data.entries.push({
    id: crypto.randomUUID(),
    accountId,
    date,
    amount: preview.adjustment,
    description: note.trim(),
    category: "잔액 조정",
    kind: "ADJUSTMENT",
    batchId: null,
    pairId: null,
  });
}
