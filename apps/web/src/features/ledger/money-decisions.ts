import { balance, goalMetrics, goalUsesSpendingAccount, projectGoal, MAX_WON, today, validDate, type Account, type Ledger } from "./model.ts";
import { cycleBudget } from "./cycle-budget.ts";

export const cashAccount = (account: Account) => ["SALARY", "FIXED", "LIVING", "SAVINGS"].includes(account.role);
function amount(value: number, positive = false) {
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0) || value > MAX_WON)
    throw new Error("금액은 원 단위로 1조 원 이내에 입력해 주세요.");
}
function date(value: string) {
  if (!validDate(value)) throw new Error("계산 기준일을 확인해 주세요.");
}

export function purchaseImpact(data: Ledger, accountId: string, price: number, asOf = today()) {
  date(asOf);
  amount(price, true);
  const account = data.accounts.find(a => a.id === accountId);
  if (!account || !cashAccount(account)) throw new Error("구매에 사용할 현금·저축 계좌를 선택해 주세요.");
  const current = balance(account, data.entries, asOf);
  if (current === null) throw new Error("선택한 계좌의 시작 잔액과 기준일을 먼저 등록해 주세요.");
  const budget = cycleBudget(data, asOf)?.rows.find(row => row.account.id === accountId);
  const goals = data.goals.filter(goal => goal.accountIds.includes(accountId)).map(goal => {
    const before = goalMetrics(goal, data, asOf);
    if (!before || (data.monthlyPlan && goalUsesSpendingAccount(goal, data.monthlyPlan)))
      return { goal, before: null, after: null, delay: null };
    const after = projectGoal(goal, before.saved - price, before.monthly, asOf);
    return { goal, before, after, delay: before.paymentCount === null || after.paymentCount === null ? null : after.paymentCount - before.paymentCount };
  });
  return { account, current, afterBalance: current - price, shortage: Math.max(0, price - current),
    budgetBefore: budget?.remaining ?? null,
    budgetAfter: budget?.remaining == null ? null : budget.remaining - price, goals };
}

export function incomeRunway(data: Ledger, selectedIds: string[], monthlyCost: number, protectedMoney: number, asOf = today()) {
  date(asOf);
  amount(monthlyCost, true);
  amount(protectedMoney);
  if (!selectedIds.length) throw new Error("생활에 사용할 계좌를 한 개 이상 선택해 주세요.");
  const selected = new Set(selectedIds);
  if (selected.size !== selectedIds.length || selectedIds.some(id => !data.accounts.some(a => a.id === id && cashAccount(a))))
    throw new Error("사용할 계좌를 다시 선택해 주세요. 청약·ISA·연금·대출은 사용할 자금에서 제외합니다.");
  const relevant = data.accounts.filter(a => cashAccount(a) || a.role === "CREDIT_CARD");
  const rows = relevant.map(account => ({ account, value: balance(account, data.entries, asOf) }));
  // Unknown debts must never be silently treated as zero, including unselected cash accounts.
  const unknown = rows.filter(row => row.value === null);
  if (unknown.length) throw new Error(`잔액 확인 필요: ${unknown.map(row => row.account.name).join(", ")}. 미등록 잔액을 0원으로 계산하지 않습니다.`);
  const cash = rows.filter(row => selected.has(row.account.id)).reduce((sum, row) => sum + Math.max(0, row.value!), 0);
  const debt = rows.reduce((sum, row) => sum + Math.max(0, -row.value!), 0);
  const available = Math.max(0, cash - debt - protectedMoney);
  const shortfall = Math.max(0, debt + protectedMoney - cash);
  const months = available / monthlyCost;
  return { cash, debt, available, shortfall, months, days: Math.floor(months * 30), protectedMoney, monthlyCost };
}
