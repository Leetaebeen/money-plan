import test from "node:test";
import assert from "node:assert/strict";
import { incomeRunway, purchaseImpact } from "../src/features/ledger/money-decisions.ts";
import { initialLedger, type Ledger } from "../src/features/ledger/model.ts";
const asOf = "2026-10-24";
function fixture(): Ledger {
  const data = initialLedger();
  data.accounts = [
    { id: "cash", name: "생활비", role: "LIVING", openingBalance: 3000000, openingDate: "2026-01-01" },
    { id: "save", name: "저축", role: "SAVINGS", openingBalance: 5000000, openingDate: "2026-01-01" },
    { id: "card", name: "카드", role: "CREDIT_CARD", openingBalance: -500000, openingDate: "2026-01-01" },
    { id: "pension", name: "연금", role: "PENSION", openingBalance: 90000000, openingDate: "2026-01-01" },
  ];
  data.goals = [{ id: "goal", name: "목돈", target: 10000000, monthly: 500000, paymentDay: 25, deadline: "2027-07-25", accountIds: ["save"] }];
  return data;
}
test("purchase compares real goal payment dates without changing records or recurring contributions", () => {
  const data = fixture();
  const before = structuredClone(data);
  const result = purchaseImpact(data, "save", 800000, asOf);
  assert.equal(result.afterBalance, 4200000);
  assert.equal(result.goals[0]!.before!.projected, "2027-07-25");
  assert.equal(result.goals[0]!.after!.projected, "2027-09-25");
  assert.equal(result.goals[0]!.delay, 2);
  assert.deepEqual(data, before);
  assert.equal(purchaseImpact(data, "cash", 100000, asOf).goals.length, 0);
});
test("purchase distinguishes shortage, already achieved and no monthly savings", () => {
  const data = fixture();
  assert.equal(purchaseImpact(data, "cash", 4000000, asOf).shortage, 1000000);
  data.goals[0]!.target = 5000000;
  assert.equal(purchaseImpact(data, "save", 500000, asOf).goals[0]!.before!.remaining, 0);
  assert.equal(purchaseImpact(data, "save", 500000, asOf).goals[0]!.delay, 1);
  data.goals[0]!.monthly = 0;
  assert.equal(purchaseImpact(data, "save", 500000, asOf).goals[0]!.after!.projected, null);
});
test("purchase uses current salary cycle and refuses to invent remaining budget for unclassified cards", () => {
  const data = fixture();
  data.monthlyPlan = { salaryAccountId: "cash", payday: 25, netIncome: 3000000, fixedAccountId: null, fixedAmount: 0, livingAccountId: "cash", livingAmount: 600000, reserveAmount: 0, allocations: [{ accountId: "save", amount: 500000 }] };
  data.entries.push({ id: "e", accountId: "cash", date: "2026-10-01", amount: -200000, kind: "EXPENSE", description: "소비", category: "생활", pairId: null, batchId: null });
  assert.equal(purchaseImpact(data, "cash", 100000, asOf).budgetAfter, 300000);
  data.entries.push({ ...data.entries[0]!, id: "c", accountId: "card" });
  assert.equal(purchaseImpact(data, "cash", 100000, asOf).budgetAfter, null);
});
test("purchase rejects invalid amounts, unknown balances, dates and restricted accounts", () => {
  const data = fixture();
  for (const price of [0, -1, 0.5, NaN, Infinity, 1000000000001]) assert.throws(() => purchaseImpact(data, "cash", price, asOf));
  assert.throws(() => purchaseImpact(data, "pension", 100, asOf));
  assert.throws(() => purchaseImpact(data, "cash", 100, "2026-02-30"));
  data.accounts[0]!.openingBalance = null;
  assert.throws(() => purchaseImpact(data, "cash", 100, asOf));
});
test("runway excludes restricted wealth, nets all card/cash debt and protects reserved money", () => {
  const data = fixture();
  data.accounts.push({ id: "overdraft", name: "마이너스", role: "SALARY", openingBalance: -500000, openingDate: "2026-01-01" });
  const before = structuredClone(data);
  const result = incomeRunway(data, ["cash"], 1000000, 500000, asOf);
  assert.equal(result.cash, 3000000);
  assert.equal(result.debt, 1000000);
  assert.equal(result.available, 1500000);
  assert.equal(result.months, 1.5);
  assert.equal(result.days, 45);
  assert.equal(incomeRunway(data, ["cash", "save"], 1000000, 500000, asOf).months, 6.5);
  assert.deepEqual(data, before);
});
test("runway blocks unknown liabilities and invalid inputs; zero funds are not infinite runway", () => {
  const data = fixture();
  assert.throws(() => incomeRunway(data, [], 1, 0, asOf));
  assert.throws(() => incomeRunway(data, ["cash", "cash"], 1, 0, asOf));
  assert.throws(() => incomeRunway(data, ["pension"], 1, 0, asOf));
  for (const cost of [0, -1, NaN, 0.1]) assert.throws(() => incomeRunway(data, ["cash"], cost, 0, asOf));
  assert.throws(() => incomeRunway(data, ["cash"], 1, -1, asOf));
  const zero = incomeRunway(data, ["cash"], 1000000, 3000000, asOf);
  assert.equal(zero.months, 0);
  assert.equal(zero.shortfall, 500000);
  data.accounts[2]!.openingBalance = null;
  assert.throws(() => incomeRunway(data, ["cash"], 1000000, 0, asOf));
});
test("future income is never spendable and future-start balances are unknown", () => {
  const data = fixture();
  data.entries.push({ id: "future", accountId: "cash", date: "2026-10-25", amount: 10000000, kind: "INCOME", description: "급여", category: "급여", pairId: null, batchId: null });
  assert.equal(purchaseImpact(data, "cash", 1000000, asOf).current, 3000000);
  assert.equal(incomeRunway(data, ["cash"], 1000000, 0, asOf).cash, 3000000);
  data.accounts[0]!.openingDate = "2026-10-25";
  assert.throws(() => incomeRunway(data, ["cash"], 1000000, 0, asOf));
});
