import { today, validateMonthlyPlan, type Ledger } from "./model.ts";
import { salaryCycle } from "./monthly-plan.ts";

export function cycleBudget(data: Ledger, asOf = today()) {
  const plan = data.monthlyPlan;
  if (!plan) return null;
  validateMonthlyPlan(plan, data.accounts);
  const cycle = salaryCycle(plan.payday, asOf);
  const daysLeft = Math.round(
    (Date.parse(cycle.next) - Date.parse(asOf)) / 86400000,
  );
  const end = new Date(Date.parse(cycle.next) - 86400000)
    .toISOString()
    .slice(0, 10);
  const budgets = new Map<string, { planned: number; purposes: string[] }>();
  for (const [id, amount, purpose] of [
    [plan.fixedAccountId, plan.fixedAmount, "고정비"],
    [plan.livingAccountId, plan.livingAmount, "생활비"],
  ] as const) {
    if (!id) continue;
    const current = budgets.get(id) ?? { planned: 0, purposes: [] };
    current.planned += amount;
    current.purposes.push(purpose);
    budgets.set(id, current);
  }
  const cards = data.accounts.filter(
    (a) => a.role === "CREDIT_CARD" && a.openingDate <= asOf,
  );
  const cardIds = new Set(cards.map((a) => a.id));
  const cardEntries = data.entries.filter(
    (e) =>
      cardIds.has(e.accountId) &&
      e.date >= cycle.start &&
      e.date <= asOf &&
      (e.kind === "EXPENSE" || e.kind === "REFUND"),
  );
  const targetFor = (e: (typeof cardEntries)[number]) =>
    e.cardBudget === "FIXED"
      ? plan.fixedAccountId
      : e.cardBudget === "LIVING"
        ? plan.livingAccountId
        : null;
  const unassignedCards = cardEntries.filter((e) => !targetFor(e)).length;
  const partialCards = cards.some((a) => a.openingDate > cycle.start);
  const hasCard = cards.length > 0;
  const rows = [...budgets].map(([id, budget]) => {
    const account = data.accounts.find((a) => a.id === id)!;
    const entries = data.entries.filter(
      (e) =>
        (e.accountId === id ||
          (cardIds.has(e.accountId) && targetFor(e) === id)) &&
        e.date >= cycle.start &&
        e.date >=
          data.accounts.find((a) => a.id === e.accountId)!.openingDate &&
        e.date <= asOf,
    );
    const spent = entries
      .filter((e) => e.kind === "EXPENSE")
      .reduce((n, e) => n - e.amount, 0);
    const refunded = entries
      .filter((e) => e.kind === "REFUND")
      .reduce((n, e) => n + e.amount, 0);
    const partial = account.openingDate > cycle.start || partialCards;
    const remaining =
      partial || unassignedCards > 0 ? null : budget.planned - spent + refunded;
    // A shared fixed-cost account may still contain unpaid bills.
    const daily =
      remaining !== null &&
      id === plan.livingAccountId &&
      !(plan.fixedAmount > 0 && id === plan.fixedAccountId)
        ? Math.floor(Math.max(0, remaining) / daysLeft)
        : null;
    return { account, ...budget, spent, refunded, partial, remaining, daily };
  });
  return {
    ...cycle,
    end,
    asOf,
    daysLeft,
    hasCard,
    unassignedCards,
    partialCards,
    rows,
  };
}
