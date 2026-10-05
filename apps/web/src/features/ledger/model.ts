import { validateSchedules } from "./schedules.ts";
import { validateMaturities } from "./maturities.ts";

export type AccountRole =
  | "SALARY"
  | "FIXED"
  | "LIVING"
  | "SAVINGS"
  | "HOUSING"
  | "ISA"
  | "PENSION";
export type EntryKind =
  | "INCOME"
  | "EXPENSE"
  | "TRANSFER"
  | "REFUND"
  | "ADJUSTMENT";
export interface Account {
  id: string;
  name: string;
  role: AccountRole;
  openingBalance: number | null;
  openingDate: string;
}
export interface Entry {
  id: string;
  accountId: string;
  date: string;
  amount: number;
  description: string;
  category: string;
  kind: EntryKind;
  batchId: string | null;
  pairId: string | null;
}
export interface Goal {
  id: string;
  name: string;
  target: number;
  deadline: string;
  monthly: number;
  paymentDay: number;
  accountIds: string[];
}
export interface ImportBatch {
  id: string;
  accountId: string;
  hash: string;
  importedAt: string;
  rowCount: number;
}
export interface MonthlyPlan {
  salaryAccountId: string;
  payday: number;
  netIncome: number;
  fixedAccountId: string | null;
  fixedAmount: number;
  livingAccountId: string | null;
  livingAmount: number;
  reserveAmount: number;
  allocations: { accountId: string; amount: number }[];
}
export const savingRoles: AccountRole[] = [
  "SAVINGS",
  "HOUSING",
  "ISA",
  "PENSION",
];
export interface PaymentSchedule {
  id: string;
  name: string;
  accountId: string;
  targetAccountId: string | null;
  amount: number;
  day: number;
  startDate: string;
  endDate: string | null;
  payments: { dueDate: string; entryId: string }[];
}
export interface MaturityPlan {
  id: string;
  accountId: string;
  date: string;
  expectedAmount: number | null;
  allocations: { accountId: string; amount: number }[];
  note: string;
  receivedDate: string | null;
}
export interface Ledger {
  schemaVersion: 4;
  maturities: MaturityPlan[];
  schedules: PaymentSchedule[];
  accounts: Account[];
  entries: Entry[];
  goals: Goal[];
  batches: ImportBatch[];
  monthlyPlan: MonthlyPlan | null;
}
export interface LedgerSnapshot {
  revision: number;
  data: Ledger;
}
export const roles: Record<AccountRole, string> = {
  SALARY: "월급",
  FIXED: "고정비",
  LIVING: "생활비",
  SAVINGS: "적금·저축",
  HOUSING: "주택청약",
  ISA: "ISA",
  PENSION: "연금저축",
};
export const kinds: Record<EntryKind, string> = {
  INCOME: "수입",
  EXPENSE: "지출",
  TRANSFER: "계좌 이동",
  REFUND: "환불",
  ADJUSTMENT: "잔액 조정",
};
export const MAX_WON = 1_000_000_000_000;
export function today(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(
    new Date(),
  );
}
export function won(value: number): string {
  return `${(value === 0 ? 0 : value).toLocaleString("ko-KR")}원`;
}
export function validDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^20\d{2}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function money(value: string, signed = false): number {
  const clean = value.trim().replaceAll(",", "");
  if (!(signed ? /^-?\d+$/ : /^\d+$/).test(clean))
    throw new Error("금액은 원 단위 정수로 입력해 주세요.");
  const result = Number(clean);
  if (!Number.isSafeInteger(result) || Math.abs(result) > MAX_WON)
    throw new Error("금액은 1조 원 이내로 입력해 주세요.");
  return result;
}
export function reformatEntryAmount(
  value: string,
  previous: EntryKind,
  next: EntryKind,
  imported: boolean,
): string {
  let parsed: number;
  try {
    parsed = money(value, true);
  } catch {
    return value;
  }
  const signed =
    previous === "EXPENSE" || (previous === "TRANSFER" && !imported)
      ? -Math.abs(parsed)
      : parsed;
  return String(
    next === "ADJUSTMENT" || (next === "TRANSFER" && imported)
      ? signed
      : Math.abs(signed),
  );
}
export function initialLedger(): Ledger {
  const defaults: [string, AccountRole][] = [
    ["카카오 월급", "SALARY"],
    ["토스 고정비", "FIXED"],
    ["국민 생활비", "LIVING"],
    ["국민 주택청약", "HOUSING"],
    ["국민 미래적금", "SAVINGS"],
    ["미래에셋 ISA", "ISA"],
    ["미래에셋 연금저축", "PENSION"],
  ];
  return {
    schemaVersion: 4,
    maturities: [],
    schedules: [],
    accounts: defaults.map(([name, role]) => ({
      id: crypto.randomUUID(),
      name,
      role,
      openingBalance: null,
      openingDate: today(),
    })),
    entries: [],
    goals: [],
    batches: [],
    monthlyPlan: null,
  };
}
export function balance(
  account: Account,
  entries: Entry[],
  asOf = today(),
): number | null {
  if (account.openingBalance === null || account.openingDate > asOf)
    return null;
  return entries
    .filter(
      (e) =>
        e.accountId === account.id &&
        e.date >= account.openingDate &&
        e.date <= asOf,
    )
    .reduce((sum, e) => sum + e.amount, account.openingBalance);
}
export function goalMonthly(goal: Goal, data: Ledger): number {
  return data.monthlyPlan
    ? data.monthlyPlan.allocations
        .filter((a) => goal.accountIds.includes(a.accountId))
        .reduce((sum, a) => sum + a.amount, 0)
    : goal.monthly;
}
export function planUsesAccount(plan: MonthlyPlan | null, id: string): boolean {
  return (
    !!plan &&
    (plan.salaryAccountId === id ||
      plan.fixedAccountId === id ||
      plan.livingAccountId === id ||
      plan.allocations.some((a) => a.accountId === id))
  );
}
export function planRemainder(plan: MonthlyPlan): number {
  return (
    plan.netIncome -
    plan.fixedAmount -
    plan.livingAmount -
    plan.reserveAmount -
    plan.allocations.reduce((sum, a) => sum + a.amount, 0)
  );
}
export function goalUsesSpendingAccount(
  goal: Goal,
  plan: MonthlyPlan,
): boolean {
  return goal.accountIds.some(
    (id) =>
      id === plan.salaryAccountId ||
      (plan.fixedAmount > 0 && id === plan.fixedAccountId) ||
      (plan.livingAmount > 0 && id === plan.livingAccountId),
  );
}
export function goalMetrics(goal: Goal, data: Ledger, asOf = today()) {
  const monthly = goalMonthly(goal, data);
  const balances = goal.accountIds
    .map((id) => data.accounts.find((a) => a.id === id))
    .map((a) => (a ? balance(a, data.entries, asOf) : null));
  if (!balances.length || balances.some((b) => b === null)) return null;
  const saved = balances.reduce<number>((sum, b) => sum + (b ?? 0), 0);
  const remaining = Math.max(0, goal.target - saved);
  const date = new Date(`${asOf}T00:00:00Z`);
  const dates: string[] = [];
  for (let i = 0; i <= 1200; i++) {
    const next = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + i, goal.paymentDay),
    )
      .toISOString()
      .slice(0, 10);
    if (next > asOf) dates.push(next);
  }
  const cycles = dates.filter((d) => d <= goal.deadline).length;
  const needed =
    remaining === 0 ? 0 : cycles ? Math.ceil(remaining / cycles) : null;
  const paymentCount =
    remaining === 0 ? 0 : monthly > 0 ? Math.ceil(remaining / monthly) : null;
  const projected =
    paymentCount === 0
      ? asOf
      : paymentCount !== null && paymentCount <= dates.length
        ? dates[paymentCount - 1]!
        : null;
  return {
    saved,
    remaining,
    cycles,
    needed,
    projected,
    paymentCount,
    monthly,
    gap: needed === null ? null : Math.max(0, needed - monthly),
  };
}
export function fingerprint(
  entry: Pick<Entry, "accountId" | "date" | "amount" | "description">,
): string {
  return JSON.stringify([
    entry.accountId,
    entry.date,
    entry.amount,
    entry.description.trim(),
  ]);
}

function record(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("올바른 가계부 데이터가 아닙니다.");
}
function text(value: unknown, max = 160): asserts value is string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new Error("이름·설명 형식을 확인해 주세요.");
}
function amount(value: unknown, signed = false): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    Math.abs(value) > MAX_WON ||
    (!signed && value < 0)
  )
    throw new Error("올바르지 않은 금액입니다.");
}
function unique(items: { id: string }[]) {
  if (new Set(items.map((i) => i.id)).size !== items.length)
    throw new Error("중복된 데이터 식별자가 있습니다.");
}
export function validateLedger(value: unknown): asserts value is Ledger {
  record(value);
  if (
    value.schemaVersion !== 4 ||
    !Array.isArray(value.accounts) ||
    !Array.isArray(value.entries) ||
    !Array.isArray(value.goals) ||
    !Array.isArray(value.batches)
  )
    throw new Error("지원하지 않는 가계부 백업 형식입니다.");
  if (
    value.accounts.length > 100 ||
    value.entries.length > 25000 ||
    value.goals.length > 50 ||
    value.batches.length > 1000
  )
    throw new Error("가계부 데이터 한도를 초과했습니다 (거래 최대 25,000건).");
  for (const a of value.accounts) {
    record(a);
    text(a.id);
    text(a.name, 60);
    if (
      typeof a.role !== "string" ||
      !Object.hasOwn(roles, a.role) ||
      !validDate(a.openingDate)
    )
      throw new Error("계좌 종류·기준일을 확인해 주세요.");
    if (a.openingBalance !== null) amount(a.openingBalance, true);
  }
  const accounts = value.accounts as Account[];
  unique(accounts);
  const accountIds = new Set(accounts.map((a) => a.id));
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  for (const b of value.batches) {
    record(b);
    text(b.id);
    if (
      typeof b.accountId !== "string" ||
      !accountIds.has(b.accountId) ||
      typeof b.hash !== "string" ||
      !/^[a-f0-9]{64}$/.test(b.hash) ||
      typeof b.importedAt !== "string" ||
      !Number.isFinite(Date.parse(b.importedAt)) ||
      !Number.isInteger(b.rowCount) ||
      Number(b.rowCount) < 1 ||
      Number(b.rowCount) > 5000
    )
      throw new Error("가져오기 이력 형식이 잘못되었습니다.");
  }
  unique(value.batches as ImportBatch[]);
  const batches = new Map(
    (value.batches as ImportBatch[]).map((b) => [b.id, b]),
  );
  if (
    new Set(
      (value.batches as ImportBatch[]).map((b) => `${b.accountId}:${b.hash}`),
    ).size !== value.batches.length
  )
    throw new Error("중복된 파일 이력이 있습니다.");
  for (const e of value.entries) {
    record(e);
    text(e.id);
    text(e.description);
    text(e.category, 60);
    amount(e.amount, true);
    if (
      e.amount === 0 ||
      !validDate(e.date) ||
      typeof e.accountId !== "string" ||
      !accountIds.has(e.accountId) ||
      typeof e.kind !== "string" ||
      !Object.hasOwn(kinds, e.kind)
    )
      throw new Error("거래의 날짜·계좌·종류를 확인해 주세요.");
    if (e.date < accountById.get(e.accountId)!.openingDate)
      throw new Error("계좌의 잔액 기준일보다 이전 거래가 있습니다.");
    if (
      (e.kind === "EXPENSE" && e.amount > 0) ||
      ((e.kind === "INCOME" || e.kind === "REFUND") && e.amount < 0)
    )
      throw new Error("거래 종류와 입출금 방향이 일치하지 않습니다.");
    if (
      e.batchId !== null &&
      (typeof e.batchId !== "string" ||
        batches.get(e.batchId)?.accountId !== e.accountId)
    )
      throw new Error("거래와 가져오기 이력이 일치하지 않습니다.");
    if (e.pairId !== null) {
      text(e.pairId);
      if (e.kind !== "TRANSFER" || e.batchId !== null)
        throw new Error("이체 연결이 올바르지 않습니다.");
    }
  }
  unique(value.entries as Entry[]);
  const absoluteTotal =
    accounts.reduce((sum, a) => sum + Math.abs(a.openingBalance ?? 0), 0) +
    (value.entries as Entry[]).reduce((sum, e) => sum + Math.abs(e.amount), 0);
  if (!Number.isSafeInteger(absoluteTotal))
    throw new Error("정확히 계산할 수 있는 합계 범위를 초과했습니다.");
  const pairs = new Map<string, Entry[]>();
  for (const e of value.entries as Entry[])
    if (e.pairId) pairs.set(e.pairId, [...(pairs.get(e.pairId) ?? []), e]);
  for (const group of pairs.values())
    if (
      group.length !== 2 ||
      group[0]!.accountId === group[1]!.accountId ||
      group[0]!.amount + group[1]!.amount !== 0 ||
      group[0]!.date !== group[1]!.date
    )
      throw new Error("이체 양쪽 거래가 일치하지 않습니다.");
  const assigned = new Set<string>();
  for (const g of value.goals) {
    record(g);
    text(g.id);
    text(g.name, 60);
    amount(g.target);
    amount(g.monthly);
    if (
      g.target === 0 ||
      !validDate(g.deadline) ||
      !Number.isInteger(g.paymentDay) ||
      Number(g.paymentDay) < 1 ||
      Number(g.paymentDay) > 28 ||
      !Array.isArray(g.accountIds) ||
      !g.accountIds.length
    )
      throw new Error("목표 금액·날짜·납입일·연결 계좌를 확인해 주세요.");
    for (const id of g.accountIds) {
      if (typeof id !== "string" || !accountIds.has(id) || assigned.has(id))
        throw new Error("계좌는 한 목표에만 연결할 수 있습니다.");
      assigned.add(id);
    }
  }
  unique(value.goals as Goal[]);
  if (value.monthlyPlan !== null)
    validateMonthlyPlan(value.monthlyPlan, accounts);
  validateSchedules(value as unknown as Ledger);
  validateMaturities(value as unknown as Ledger);
}

export function validateMonthlyPlan(
  value: unknown,
  accounts: Account[],
): asserts value is MonthlyPlan {
  record(value);
  const byId = new Map(accounts.map((a) => [a.id, a]));
  if (
    typeof value.salaryAccountId !== "string" ||
    !byId.has(value.salaryAccountId)
  )
    throw new Error("월급을 받는 계좌를 선택해 주세요.");
  if (
    !Number.isInteger(value.payday) ||
    Number(value.payday) < 1 ||
    Number(value.payday) > 31
  )
    throw new Error("월급날은 1~31일로 선택해 주세요.");
  for (const field of [
    "netIncome",
    "fixedAmount",
    "livingAmount",
    "reserveAmount",
  ])
    amount(value[field]);
  for (const [id, budget] of [
    [value.fixedAccountId, value.fixedAmount],
    [value.livingAccountId, value.livingAmount],
  ]) {
    if (id === null && budget === 0) continue;
    if (typeof id !== "string" || !byId.has(id))
      throw new Error("고정비·생활비를 보관할 계좌를 선택해 주세요.");
  }
  if (!Array.isArray(value.allocations) || value.allocations.length > 100)
    throw new Error("저축·투자 배분 항목을 확인해 주세요.");
  const used = new Set<string>();
  for (const allocation of value.allocations) {
    record(allocation);
    const id = allocation.accountId;
    if (typeof id !== "string" || !byId.has(id) || used.has(id))
      throw new Error("저축·투자 계좌가 없거나 중복되었습니다.");
    if (
      !savingRoles.includes(byId.get(id)!.role) ||
      id === value.salaryAccountId ||
      (value.fixedAmount !== 0 && id === value.fixedAccountId) ||
      (value.livingAmount !== 0 && id === value.livingAccountId)
    )
      throw new Error(
        "저축·투자는 월급·고정비·생활비와 분리된 적금·청약·ISA·연금 계좌에 배분해 주세요.",
      );
    amount(allocation.amount);
    if (allocation.amount === 0)
      throw new Error("0원 배분 항목은 제외해 주세요.");
    used.add(id);
  }
}

export function readLedgerBackup(value: unknown): Ledger {
  record(value);
  const upgraded =
    value.schemaVersion === 1 ||
    value.schemaVersion === 2 ||
    value.schemaVersion === 3
      ? {
          ...value,
          schemaVersion: 4,
          maturities: [],
          ...(value.schemaVersion !== 3 ? { schedules: [] } : {}),
          ...(value.schemaVersion === 1 ? { monthlyPlan: null } : {}),
        }
      : value;
  validateLedger(upgraded);
  return upgraded;
}
