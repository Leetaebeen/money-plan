import {
  MAX_WON,
  today,
  validDate,
  type Ledger,
  type MaturityPlan,
} from "./model.ts";

export function validateMaturities(data: Ledger) {
  const fail = (): never => {
    throw new Error(
      "만기 계획의 날짜·계좌·예상 금액·수령 확인을 점검해 주세요.",
    );
  };
  if (!Array.isArray(data.maturities) || data.maturities.length > 100) fail();
  const ids = new Set<string>();
  const active = new Set<string>();
  for (const m of data.maturities) {
    if (
      !m ||
      typeof m !== "object" ||
      typeof m.id !== "string" ||
      !m.id.trim() ||
      m.id.length > 160 ||
      ids.has(m.id) ||
      !data.accounts.some(
        (a) => a.id === m.accountId && a.role === "SAVINGS",
      ) ||
      !validDate(m.date) ||
      !(
        m.expectedAmount === null ||
        (Number.isSafeInteger(m.expectedAmount) &&
          m.expectedAmount > 0 &&
          m.expectedAmount <= MAX_WON)
      ) ||
      typeof m.note !== "string" ||
      m.note.length > 300 ||
      !Array.isArray(m.allocations) ||
      m.allocations.length > 100 ||
      !(
        m.receivedDate === null ||
        (validDate(m.receivedDate) &&
          m.receivedDate >= m.date &&
          m.receivedDate <= today())
      )
    )
      fail();
    ids.add(m.id);
    if (m.receivedDate === null) {
      if (active.has(m.accountId)) fail();
      active.add(m.accountId);
    }
    const destinations = new Set<string>();
    for (const a of m.allocations) {
      if (
        !a ||
        typeof a !== "object" ||
        a.accountId === m.accountId ||
        destinations.has(a.accountId) ||
        !data.accounts.some((account) => account.id === a.accountId) ||
        !Number.isSafeInteger(a.amount) ||
        a.amount <= 0 ||
        a.amount > MAX_WON
      )
        fail();
      destinations.add(a.accountId);
    }
  }
}

export function maturityMetrics(
  plan: MaturityPlan,
  data: Ledger,
  asOf = today(),
) {
  if (!validDate(asOf) || !validDate(plan.date))
    throw new Error("만기일과 조회 기준일을 확인해 주세요.");
  const daysLeft = Math.round(
    (Date.parse(plan.date) - Date.parse(asOf)) / 86400000,
  );
  const allocated = plan.allocations.reduce((n, a) => n + a.amount, 0);
  const remaining =
    plan.expectedAmount === null ? null : plan.expectedAmount - allocated;
  return {
    daysLeft,
    allocated,
    remaining,
    status:
      plan.receivedDate !== null && plan.receivedDate <= asOf
        ? "received"
        : daysLeft < 0
          ? "overdue"
          : daysLeft === 0
            ? "today"
            : daysLeft <= 30
              ? "soon"
              : "upcoming",
    continuingSchedules: data.schedules.filter(
      (s) =>
        s.targetAccountId === plan.accountId &&
        (s.endDate === null || s.endDate > plan.date),
    ),
    monthlyAllocation:
      data.monthlyPlan?.allocations.find((a) => a.accountId === plan.accountId)
        ?.amount ?? 0,
  };
}
