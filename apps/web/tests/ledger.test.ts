import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test from "node:test";
import Dexie from "dexie";
import {
  balance,
  goalMetrics,
  initialLedger,
  money,
  readLedgerBackup,
  reformatEntryAmount,
  validateLedger,
  validDate,
  type Entry,
  type Ledger,
  type MonthlyPlan,
} from "../src/features/ledger/model.ts";
import {
  monthlyMetrics,
  salaryCycle,
} from "../src/features/ledger/monthly-plan.ts";
import {
  parseCsv,
  parseCsvDocument,
  selectHeader,
  suggestHeader,
  statementDate,
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
    schemaVersion: 2,
    monthlyPlan: null,
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
  assert.equal(
    reformatEntryAmount("12,000", "EXPENSE", "TRANSFER", true),
    "-12000",
  );
  assert.equal(
    reformatEntryAmount("12000", "INCOME", "TRANSFER", true),
    "12000",
  );
  assert.equal(
    reformatEntryAmount("-12000", "TRANSFER", "EXPENSE", true),
    "12000",
  );
  assert.equal(
    reformatEntryAmount("12000", "EXPENSE", "TRANSFER", false),
    "12000",
  );
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
function monthlyPlan(): MonthlyPlan {
  return {
    salaryAccountId: "cash",
    payday: 25,
    netIncome: 3000000,
    fixedAccountId: "cash",
    fixedAmount: 800000,
    livingAccountId: "cash",
    livingAmount: 500000,
    reserveAmount: 200000,
    allocations: [{ accountId: "save", amount: 1000000 }],
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
test("goal assets include negative account balances instead of overstating progress", () => {
  const data = fixture();
  data.accounts[0]!.openingBalance = -2000000;
  const goal = {
    ...data.goals[0]!,
    target: 9000000,
    accountIds: ["cash", "save"],
  };
  const metrics = goalMetrics(goal, data, "2026-01-25")!;
  assert.equal(metrics.saved, 8000000);
  assert.equal(metrics.remaining, 1000000);
  assert.equal(metrics.paymentCount, 1);
  assert.equal(metrics.projected, "2026-02-25");
  const deficit = goalMetrics(
    { ...goal, accountIds: ["cash"] },
    data,
    "2026-01-25",
  )!;
  assert.equal(deficit.saved, -2000000);
  assert.equal(deficit.remaining, 11000000);
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

test("statement headers can follow notes and blank lines without losing original line numbers", () => {
  const document = parseCsvDocument(
    '거래내역\n조회기간 안내\n\n거래일자\t적요\t거래금액\t입출금구분\n20260901\t"점심\n식사"\t12000\t출금\n\n2026년 9월 2일\t급여\t3000000\t입금',
  );
  assert.equal(suggestHeader(document), 3);
  const table = selectHeader(document, 3);
  const rows = prepareRows(
    table,
    suggestColumns(table.headers),
    "cash",
    [],
    "2026-09-01",
    "2026-09-30",
  );
  assert.deepEqual(
    rows.map((r) => [r.row, r.entry?.date, r.entry?.amount]),
    [
      [5, "2026-09-01", -12000],
      [8, "2026-09-02", 3000000],
    ],
  );
  assert.equal(rows[0]!.entry!.description, "점심\n식사");
  assert.throws(() => selectHeader(document, 0), /CSV 열/);
  assert.throws(() => selectHeader(document, -1), /제목/);
  assert.throws(() => selectHeader(document, 50), /제목/);
});

test("directed amounts reject unknown directions and negative magnitudes instead of reversing balances", () => {
  const table = parseCsv(
    "날짜,내용,금액,구분\n2026-01-15,식사,12000,출금\n2026-01-15,식사,12000,출금\n2026-01-16,급여,1000,CREDIT\n2026-01-16,모호함,1000,이체\n2026-01-16,음수,-1000,출금",
  );
  const columns = suggestColumns(table.headers);
  const rows = prepareRows(
    table,
    columns,
    "cash",
    [],
    "2026-01-01",
    "2026-01-31",
  );
  assert.equal(rows[0]!.entry!.amount, -12000);
  assert.equal(rows[1]!.duplicate, true);
  assert.equal(rows[1]!.selected, false);
  assert.equal(rows[2]!.entry!.amount, 1000);
  assert.ok(rows[3]!.error);
  assert.ok(rows[4]!.error);
  assert.throws(
    () =>
      prepareRows(
        table,
        { ...columns, direction: 2 },
        "cash",
        [],
        "2026-01-01",
        "2026-01-31",
      ),
    /각각/,
  );
  assert.throws(
    () =>
      prepareRows(
        table,
        { ...columns, date: NaN },
        "cash",
        [],
        "2026-01-01",
        "2026-01-31",
      ),
    /각각/,
  );
});

test("statement dates are normalized strictly and delimiters can be overridden", () => {
  for (const value of [
    "20260901",
    "2026. 9. 1",
    "2026/9/1 09:30:01",
    "2026년 9월 1일",
    "2026-09-01T09:30:01.123",
  ])
    assert.equal(statementDate(value), "2026-09-01");
  for (const value of [
    "20260230",
    "2026-09-01 garbage",
    "2026-09-01 25:00",
    "2026-09-01T09:30Z",
  ])
    assert.throws(() => statementDate(value));
  const document = parseCsvDocument(
    '안내\n날짜,내용,금액\n20260901,"커피\t메모",-1000',
    ",",
  );
  assert.equal(selectHeader(document, 1).rows[0]![1], "커피\t메모");
  assert.throws(
    () =>
      parseCsvDocument(
        "날짜,내용,금액\n" + Array.from({ length: 101 }, () => "x").join(","),
      ),
    /100개/,
  );
});
test("v3 migration preserves existing v2 plans and seeds accounts without inventing balances", async () => {
  db.close();
  await db.delete();
  const legacy = new Dexie("money-plan");
  legacy.version(2).stores({
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
  bad.entries = [entry({ date: "2025-12-31" })];
  await assert.rejects(restoreLedger(first.revision, bad), /기준일/);
  const numericAccount = fixture();
  numericAccount.accounts[0]!.id = "1";
  numericAccount.entries = [entry({ accountId: 1 as unknown as string })];
  await assert.rejects(restoreLedger(first.revision, numericAccount), /계좌/);
  assert.deepEqual((await loadLedger()).data.entries, []);
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

test("monthly plans conserve salary, combine destinations, and derive goal funding from allocations", () => {
  const data = fixture();
  data.monthlyPlan = monthlyPlan();
  const result = monthlyMetrics(data, "2026-01-25")!;
  assert.equal(result.capacity, 1500000);
  assert.equal(result.savings, 1000000);
  assert.equal(result.unassigned, 500000);
  assert.equal(result.deficit, 0);
  assert.deepEqual(
    result.routes.map((r) => [r.accountId, r.amount, r.transfer]),
    [
      ["cash", 2000000, false],
      ["save", 1000000, true],
    ],
  );
  assert.equal(
    result.routes.reduce((sum, r) => sum + r.amount, 0),
    data.monthlyPlan.netIncome,
  );
  assert.equal(result.goals[0]!.metrics!.monthly, 1000000);
  assert.equal(result.goalGap, 666667);
  assert.equal(result.additionalIncome, 166667);
  assert.equal(
    goalMetrics(data.goals[0]!, data, "2026-01-25")!.projected,
    "2029-05-25",
  );
  assert.equal(data.entries.length, 0);
  assert.equal(balance(data.accounts[1]!, data.entries), 10000000);
});

test("overspending is a deficit and missing or spent goal assets never imply feasibility", () => {
  const data = fixture();
  data.monthlyPlan = { ...monthlyPlan(), netIncome: 1000000 };
  let result = monthlyMetrics(data, "2026-01-25")!;
  assert.equal(result.capacity, -500000);
  assert.equal(result.deficit, 1500000);
  assert.equal(result.unassigned, 0);
  assert.equal(result.additionalIncome, 2166667);
  data.accounts[1]!.openingBalance = null;
  result = monthlyMetrics(data, "2026-01-25")!;
  assert.equal(result.goals[0]!.status, "unknown");
  assert.equal(result.goalGap, null);
  assert.equal(result.additionalIncome, null);
  data.accounts[1]!.openingBalance = 10000000;
  data.goals[0]!.deadline = "2026-01-25";
  assert.equal(monthlyMetrics(data, "2026-01-25")!.goals[0]!.status, "overdue");
  data.goals[0]!.accountIds = ["cash"];
  assert.equal(
    monthlyMetrics(data, "2026-01-25")!.goals[0]!.status,
    "spending",
  );
  data.goals[0]!.accountIds = ["save"];
  data.monthlyPlan.allocations = [];
  assert.equal(goalMetrics(data.goals[0]!, data, "2026-01-25")!.monthly, 0);
  assert.equal(
    goalMetrics(data.goals[0]!, data, "2026-01-25")!.projected,
    null,
  );
});

test("monthly plans reject double allocations, broken account references, and invalid amounts", () => {
  const data = fixture();
  for (const override of [
    { payday: 32 },
    { payday: 0 },
    { netIncome: -1 },
    { livingAmount: 1.5 },
    { salaryAccountId: "missing" },
    { fixedAccountId: null },
    {
      allocations: [
        { accountId: "save", amount: 1 },
        { accountId: "save", amount: 2 },
      ],
    },
    { allocations: [{ accountId: "cash", amount: 1 }] },
    { allocations: [{ accountId: "save", amount: 0 }] },
    { livingAccountId: "save" },
  ]) {
    data.monthlyPlan = { ...monthlyPlan(), ...override };
    assert.throws(() => validateLedger(data));
  }
  data.monthlyPlan = { ...monthlyPlan(), fixedAccountId: null, fixedAmount: 0 };
  validateLedger(data);
});

test("salary cycles handle month-end, leap years, and the payday boundary", () => {
  assert.deepEqual(salaryCycle(31, "2028-02-28"), {
    start: "2028-01-31",
    next: "2028-02-29",
  });
  assert.deepEqual(salaryCycle(31, "2028-02-29"), {
    start: "2028-02-29",
    next: "2028-03-31",
  });
  assert.deepEqual(salaryCycle(31, "2026-02-28"), {
    start: "2026-02-28",
    next: "2026-03-31",
  });
  assert.deepEqual(salaryCycle(25, "2026-01-24"), {
    start: "2025-12-25",
    next: "2026-01-25",
  });
  assert.throws(() => salaryCycle(0));
});

test("monthly plans persist atomically, roundtrip backups, and legacy restore clears the plan", async () => {
  let snapshot = await loadLedger();
  snapshot = await restoreLedger(snapshot.revision, fixture());
  snapshot = await mutateLedger(snapshot.revision, (data) => {
    data.monthlyPlan = monthlyPlan();
  });
  assert.deepEqual((await loadLedger()).data.monthlyPlan, monthlyPlan());
  assert.equal((await loadLedger()).data.entries.length, 0);
  await assert.rejects(
    mutateLedger(snapshot.revision - 1, (data) => {
      data.monthlyPlan = null;
    }),
    /다른 화면/,
  );
  await assert.rejects(
    mutateLedger(snapshot.revision, (data) => {
      data.accounts = data.accounts.filter((a) => a.id !== "cash");
    }),
  );
  assert.deepEqual((await loadLedger()).data.monthlyPlan, monthlyPlan());
  const encrypted = await encryptBackup(
    snapshot.data,
    "synthetic-monthly-plan",
  );
  assert.deepEqual(
    (await decryptBackup(encrypted, "synthetic-monthly-plan")).monthlyPlan,
    monthlyPlan(),
  );
  const legacy = { ...fixture(), schemaVersion: 1 } as Record<string, unknown>;
  delete legacy.monthlyPlan;
  const upgraded = readLedgerBackup(legacy);
  assert.equal(upgraded.schemaVersion, 2);
  assert.equal(upgraded.monthlyPlan, null);
  snapshot = await restoreLedger(snapshot.revision, upgraded);
  assert.equal(snapshot.data.monthlyPlan, null);
  assert.equal(snapshot.data.accounts.length, 2);
  await mutateLedger(snapshot.revision, (data) => {
    data.monthlyPlan = monthlyPlan();
  });
  await deleteAllLocalData();
  assert.equal((await loadLedger()).data.monthlyPlan, null);
  assert.throws(() => readLedgerBackup({ ...legacy, schemaVersion: 99 }));
});

test("v4 upgrades v3 ledger data and revision without inventing a monthly plan", async () => {
  db.close();
  await db.delete();
  const previous = new Dexie("money-plan");
  previous.version(3).stores({
    profiles: "id, updatedAt",
    planRuns: "id, mode, selectedScenarioId, createdAt",
    plannerDrafts: "id, updatedAt",
    accounts: "id",
    ledgerEntries: "id, accountId, date, batchId, pairId",
    ledgerGoals: "id",
    importBatches: "id, accountId, &[accountId+hash]",
    ledgerMeta: "id",
  });
  await previous.table("accounts").bulkPut(fixture().accounts);
  await previous.table("ledgerEntries").add(entry());
  await previous.table("ledgerGoals").bulkPut(fixture().goals);
  await previous.table("ledgerMeta").put({ id: "primary", revision: 7 });
  previous.close();
  await db.open();
  const snapshot = await loadLedger();
  assert.equal(snapshot.revision, 7);
  assert.equal(snapshot.data.monthlyPlan, null);
  assert.equal(snapshot.data.accounts.length, 2);
  assert.equal(snapshot.data.goals.length, 1);
  assert.equal(
    balance(
      snapshot.data.accounts.find((a) => a.id === "cash")!,
      snapshot.data.entries,
    ),
    999000,
  );
});
