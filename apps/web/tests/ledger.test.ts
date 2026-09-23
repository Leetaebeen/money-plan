import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test from "node:test";
import Dexie from "dexie";
import {
  balance,
  goalMetrics,
  initialLedger,
  money,
  reformatEntryAmount,
  validateLedger,
  validDate,
  type Entry,
  type Ledger,
} from "../src/features/ledger/model.ts";
import {
  parseCsv,
  prepareRows,
  suggestColumns,
} from "../src/features/ledger/csv.ts";
import { decryptBackup, encryptBackup } from "../src/features/ledger/backup.ts";
import { db, deleteAllLocalData } from "../src/persistence/db.ts";
import {
  commitImport,
  loadLedger,
  mutateLedger,
  restoreLedger,
  undoImport,
} from "../src/features/ledger/store.ts";
function fixture(): Ledger {
  return {
    schemaVersion: 1,
    accounts: [
      {
        id: "cash",
        name: "생활비",
        role: "LIVING",
        openingDate: "2026-01-01",
        openingBalance: 1000000,
      },
      {
        id: "save",
        name: "적금",
        role: "SAVINGS",
        openingDate: "2026-01-01",
        openingBalance: 10000000,
      },
    ],
    entries: [],
    goals: [
      {
        id: "goal",
        name: "목표",
        target: 50000000,
        deadline: "2028-01-25",
        monthly: 1200000,
        paymentDay: 25,
        accountIds: ["save"],
      },
    ],
    batches: [],
  };
}
test("reclassifying imported expenses as transfers preserves the outgoing balance", () => {
  assert.equal(reformatEntryAmount("12,000", "EXPENSE", "TRANSFER", true), "-12000");
  assert.equal(reformatEntryAmount("12000", "INCOME", "TRANSFER", true), "12000");
  assert.equal(reformatEntryAmount("-12000", "TRANSFER", "EXPENSE", true), "12000");
  assert.equal(reformatEntryAmount("12000", "EXPENSE", "TRANSFER", false), "12000");
});
function entry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: "entry",
    accountId: "cash",
    date: "2026-01-15",
    amount: -1000,
    description: "점심",
    category: "식비",
    kind: "EXPENSE",
    batchId: null,
    pairId: null,
    ...overrides,
  };
}
test.beforeEach(async () => {
  db.close();
  await db.delete();
  await db.open();
});
test.after(async () => {
  db.close();
  await db.delete();
});

test("money and calendar inputs reject truncation, invalid dates, and fractional won", () => {
  assert.equal(money("1,200"), 1200);
  assert.equal(money("-1,200", true), -1200);
  for (const input of ["", "1e6", "1.5", "100원", "1+2", "9007199254740992"])
    assert.throws(() => money(input));
  assert.equal(validDate("2026-02-30"), false);
  assert.equal(validDate("2028-02-29"), true);
  assert.equal(validDate("2026-2-1"), false);
});
test("unknown balances remain unknown and opening balance is only changed by in-range actual entries", () => {
  const account = fixture().accounts[0]!;
  const entries = [
    entry(),
    entry({ id: "old", date: "2025-12-31" }),
    entry({ id: "future", date: "2027-01-01" }),
    entry({ id: "transfer", kind: "TRANSFER", amount: -200000 }),
    entry({ id: "refund", kind: "REFUND", amount: 500 }),
  ];
  assert.equal(balance(account, entries, "2026-01-31"), 799500);
  assert.equal(balance({ ...account, openingBalance: null }, entries), null);
  assert.equal(
    balance({ ...account, openingDate: "2027-01-01" }, entries, "2026-01-31"),
    null,
  );
});
test("goal projections use future payment dates, actual assets, and zero return", () => {
  const data = fixture();
  const goal = data.goals[0]!;
  const metrics = goalMetrics(goal, data, "2026-01-25")!;
  assert.equal(metrics.cycles, 24);
  assert.equal(metrics.needed, 1666667);
  assert.equal(metrics.gap, 466667);
  assert.equal(metrics.paymentCount, 34);
  assert.equal(metrics.projected, "2028-11-25");
  assert.equal(
    goalMetrics({ ...goal, monthly: 0 }, data, "2026-01-25")!.projected,
    null,
  );
  assert.equal(
    goalMetrics({ ...goal, deadline: "2026-01-25" }, data, "2026-01-25")!
      .needed,
    null,
  );
  assert.equal(
    goalMetrics(
      { ...goal, target: 10000999, monthly: 999 },
      data,
      "2026-01-25",
    )!.projected,
    "2026-02-25",
  );
  assert.equal(
    goalMetrics({ ...goal, target: 1000 }, data, "2026-01-25")!.remaining,
    0,
  );
  data.accounts[1]!.openingBalance = null;
  assert.equal(goalMetrics(goal, data), null);
});
test("schema validation prevents duplicate goal assets, missing links, and broken transfer pairs", () => {
  const data = fixture();
  validateLedger(data);
  data.goals.push({ ...data.goals[0]!, id: "goal2" });
  assert.throws(() => validateLedger(data), /한 목표/);
  data.goals.pop();
  data.entries = [entry({ pairId: "pair", kind: "TRANSFER" })];
  assert.throws(() => validateLedger(data), /양쪽/);
  data.entries.push(
    entry({
      id: "opposite",
      accountId: "save",
      amount: 1000,
      pairId: "pair",
      kind: "TRANSFER",
    }),
  );
  validateLedger(data);
  data.entries[1]!.amount = 2000;
  assert.throws(() => validateLedger(data), /양쪽/);
  data.entries = [entry({ amount: 1000 })];
  assert.throws(() => validateLedger(data), /입출금/);
  data.entries = [entry({ batchId: "absent" })];
  assert.throws(() => validateLedger(data), /이력/);
});
test("CSV parser preserves quoted descriptions and reports ambiguous rows without dropping them", () => {
  const table = parseCsv(
    '\uFEFF날짜,내용,금액\r\n2026.1.15,"식사, 커피","-1,000"\r\n2026-01-16,"메모 ""인용""\n두 줄",2000\r\n2026-02-30,오류,100\r\n',
  );
  assert.equal(table.rows.length, 3);
  assert.equal(table.rows[0]![1], "식사, 커피");
  const rows = prepareRows(
    table,
    suggestColumns(table.headers),
    "cash",
    [],
    "2026-01-01",
    "2026-02-28",
  );
  assert.equal(rows[0]!.entry!.amount, -1000);
  assert.equal(rows[1]!.entry!.description, '메모 "인용"\n두 줄');
  assert.ok(rows[2]!.error);
  assert.throws(() => parseCsv('a,b,c\n1,"unclosed,3'), /따옴표/);
});
test("CSV duplicate candidates are reviewable, including repeats within a file", () => {
  const table = parseCsv(
    "날짜,내용,입금,출금\n2026-01-15,점심,0,1000\n2026-01-15,점심,0,1000\n2026-01-16,급여,3000000,0\n2026-01-16,모호함,100,100",
  );
  const rows = prepareRows(
    table,
    suggestColumns(table.headers),
    "cash",
    [entry()],
    "2026-01-01",
    "2026-01-31",
  );
  assert.equal(rows[0]!.duplicate, true);
  assert.equal(rows[0]!.selected, false);
  assert.equal(rows[1]!.duplicate, true);
  assert.equal(rows[2]!.entry!.amount, 3000000);
  assert.ok(rows[3]!.error);
  assert.ok(
    prepareRows(
      table,
      suggestColumns(table.headers),
      "cash",
      [],
      "2026-01-16",
      "2026-01-31",
    )[0]!.error,
  );
  assert.throws(
    () =>
      prepareRows(
        table,
        { date: 0, description: 0, amount: 2, deposit: -1, withdrawal: -1 },
        "cash",
        [],
        "2026-01-01",
        "2026-01-31",
      ),
    /각각/,
  );
});
test("v3 migration preserves existing v2 plans and seeds accounts without inventing balances", async () => {
  db.close();
  await db.delete();
  const legacy = new Dexie("money-plan");
  legacy
    .version(2)
    .stores({
      profiles: "id, updatedAt",
      planRuns: "id, mode, selectedScenarioId, createdAt",
      plannerDrafts: "id, updatedAt",
    });
  await legacy
    .table("planRuns")
    .put({ id: "prior", mode: "MONTHLY_SALARY", createdAt: "2026-01-01" });
  legacy.close();
  await db.open();
  const snapshot = await loadLedger();
  assert.equal(snapshot.data.accounts.length, 7);
  assert.ok(snapshot.data.accounts.every((a) => a.openingBalance === null));
  assert.ok(await db.planRuns.get("prior"));
  assert.equal(
    (await loadLedger()).data.accounts[0]!.id,
    snapshot.data.accounts[0]!.id,
  );
});
test("atomic imports prevent repeated files and can undo a batch after editing imported rows", async () => {
  let snapshot = await loadLedger();
  snapshot = await restoreLedger(snapshot.revision, fixture());
  const row = {
    accountId: "cash",
    date: "2026-01-15",
    amount: -1000,
    description: "점심",
    category: "미분류",
    kind: "EXPENSE" as const,
  };
  snapshot = await commitImport(snapshot.revision, "cash", "a".repeat(64), [
    row,
  ]);
  const batch = snapshot.data.batches[0]!;
  await assert.rejects(
    commitImport(snapshot.revision, "cash", "a".repeat(64), [row]),
    /이미/,
  );
  await assert.rejects(
    commitImport(snapshot.revision, "cash", "b".repeat(64), [
      { ...row, amount: 1000 },
    ]),
    /입출금/,
  );
  assert.equal((await loadLedger()).data.entries.length, 1);
  assert.equal((await loadLedger()).data.batches.length, 1);
  snapshot = await mutateLedger(snapshot.revision, (data) => {
    data.entries[0]!.category = "식비";
  });
  snapshot = await undoImport(snapshot.revision, batch.id);
  assert.equal(snapshot.data.entries.length, 0);
  assert.equal(snapshot.data.batches.length, 0);
});
test("concurrent writes and restore use revisions, and invalid restores preserve existing data", async () => {
  const initial = await loadLedger();
  const first = await restoreLedger(initial.revision, fixture());
  await assert.rejects(
    mutateLedger(initial.revision, (data) => {
      data.accounts = [];
    }),
    /다른 화면/,
  );
  const bad = fixture();
  bad.entries = [entry({ accountId: "missing" })];
  await assert.rejects(restoreLedger(first.revision, bad));
  assert.equal((await loadLedger()).revision, first.revision);
  await deleteAllLocalData();
  await assert.rejects(restoreLedger(first.revision, fixture()), /다른 화면/);
  const empty = await loadLedger();
  assert.equal(empty.data.accounts.length, 0);
  assert.equal(empty.data.goals.length, 0);
});
test("encrypted backup roundtrips every ledger field and rejects wrong passwords or tampering", async () => {
  const data = fixture();
  const passphrase = "example-only-test-phrase";
  const raw = await encryptBackup(data, passphrase);
  assert.equal(raw.includes("생활비"), false);
  assert.deepEqual(await decryptBackup(raw, passphrase), data);
  await assert.rejects(decryptBackup(raw, "different-example-phrase"), /암호/);
  const envelope = JSON.parse(raw);
  envelope.ciphertext = `${envelope.ciphertext.startsWith("A") ? "B" : "A"}${envelope.ciphertext.slice(1)}`;
  await assert.rejects(
    decryptBackup(JSON.stringify(envelope), passphrase),
    /암호/,
  );
  await assert.rejects(
    decryptBackup(JSON.stringify(data), passphrase),
    /암호화 백업/,
  );
  await assert.rejects(encryptBackup(data, "short"), /8~256/);
  validateLedger(initialLedger());
});
