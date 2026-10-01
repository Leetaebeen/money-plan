import type { Table } from "dexie";
import { db } from "../../persistence/db.ts";
import { reconcileSchedulePayments } from "./schedules.ts";
import {
  initialLedger,
  today,
  validateLedger,
  type Entry,
  type Ledger,
  type LedgerSnapshot,
} from "./model.ts";
const tables = () => [
  db.accounts,
  db.ledgerEntries,
  db.ledgerGoals,
  db.importBatches,
  db.ledgerMeta,
];
function ordered(data: Ledger): Ledger {
  const roleOrder = [
    "SALARY",
    "FIXED",
    "LIVING",
    "HOUSING",
    "SAVINGS",
    "ISA",
    "PENSION",
  ];
  data.accounts.sort(
    (a, b) =>
      roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role) ||
      a.name.localeCompare(b.name, "ko"),
  );
  data.goals.sort(
    (a, b) =>
      a.deadline.localeCompare(b.deadline) ||
      a.name.localeCompare(b.name, "ko"),
  );
  return data;
}
async function read(): Promise<LedgerSnapshot> {
  const [accounts, entries, goals, batches, meta] = await Promise.all([
    db.accounts.toArray(),
    db.ledgerEntries.toArray(),
    db.ledgerGoals.toArray(),
    db.importBatches.toArray(),
    db.ledgerMeta.get("primary"),
  ]);
  return {
    revision: meta?.revision ?? 0,
    data: ordered({
      schemaVersion: 3,
      schedules: meta?.schedules ?? [],
      accounts,
      entries,
      goals,
      batches,
      monthlyPlan: meta?.monthlyPlan ?? null,
    }),
  };
}
export async function loadLedger(): Promise<LedgerSnapshot> {
  return db.transaction("rw", tables(), async () => {
    if (!(await db.ledgerMeta.get("primary"))) {
      await db.accounts.bulkAdd(initialLedger().accounts);
      await db.ledgerMeta.put({ id: "primary", revision: 0 });
    }
    return read();
  });
}
async function sync<T extends { id: string }>(
  table: Table<T, string>,
  before: T[],
  after: T[],
) {
  const old = new Map(before.map((row) => [row.id, JSON.stringify(row)]));
  const ids = new Set(after.map((row) => row.id));
  await table.bulkDelete(
    before.filter((row) => !ids.has(row.id)).map((row) => row.id),
  );
  await table.bulkPut(
    after.filter((row) => old.get(row.id) !== JSON.stringify(row)),
  );
}
export async function mutateLedger(
  revision: number,
  change: (data: Ledger) => void,
): Promise<LedgerSnapshot> {
  return db.transaction("rw", tables(), async () => {
    const current = await read();
    if (current.revision !== revision)
      throw new Error(
        "다른 화면에서 데이터가 변경됐어요. 새로고침 후 다시 시도해 주세요.",
      );
    const next = structuredClone(current.data);
    change(next);
    reconcileSchedulePayments(next);
    validateLedger(next);
    await sync(db.accounts, current.data.accounts, next.accounts);
    await sync(db.ledgerEntries, current.data.entries, next.entries);
    await sync(db.ledgerGoals, current.data.goals, next.goals);
    await sync(db.importBatches, current.data.batches, next.batches);
    await db.ledgerMeta.put({
      id: "primary",
      revision: revision + 1,
      monthlyPlan: next.monthlyPlan,
      schedules: next.schedules,
    });
    return { data: ordered(next), revision: revision + 1 };
  });
}
export async function commitImport(
  revision: number,
  accountId: string,
  hash: string,
  entries: Omit<Entry, "id" | "batchId" | "pairId">[],
) {
  return mutateLedger(revision, (data) => {
    const account = data.accounts.find((a) => a.id === accountId);
    if (!account || !entries.length || entries.length > 5000)
      throw new Error("반영할 거래와 계좌를 확인해 주세요.");
    if (data.batches.some((b) => b.accountId === accountId && b.hash === hash))
      throw new Error("이미 이 계좌에 가져온 파일입니다.");
    if (
      entries.some(
        (e) =>
          e.accountId !== accountId ||
          e.date < account.openingDate ||
          e.date > today(),
      )
    )
      throw new Error("계좌의 기준일과 거래 날짜를 다시 확인해 주세요.");
    const id = crypto.randomUUID();
    data.batches.push({
      id,
      accountId,
      hash,
      importedAt: new Date().toISOString(),
      rowCount: entries.length,
    });
    data.entries.push(
      ...entries.map((e) => ({
        ...e,
        id: crypto.randomUUID(),
        batchId: id,
        pairId: null,
      })),
    );
  });
}
export async function undoImport(revision: number, batchId: string) {
  return mutateLedger(revision, (data) => {
    data.entries = data.entries.filter((e) => e.batchId !== batchId);
    data.batches = data.batches.filter((b) => b.id !== batchId);
  });
}
export async function restoreLedger(revision: number, data: Ledger) {
  validateLedger(data);
  return mutateLedger(revision, (next) => {
    next.accounts = structuredClone(data.accounts);
    next.entries = structuredClone(data.entries);
    next.goals = structuredClone(data.goals);
    next.batches = structuredClone(data.batches);
    next.monthlyPlan = structuredClone(data.monthlyPlan);
    next.schedules = structuredClone(data.schedules);
  });
}
