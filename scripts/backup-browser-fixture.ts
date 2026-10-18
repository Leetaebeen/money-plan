// Synthetic data only. Run with Node 24; never restore into a personal ledger.
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import {
  encryptBackup,
  decryptBackup,
} from "../apps/web/src/features/ledger/backup.ts";
import { captureMonthlyPlan } from "../apps/web/src/features/ledger/plan-history.ts";
import { recordScheduledPayment } from "../apps/web/src/features/ledger/schedules.ts";
import type { Ledger } from "../apps/web/src/features/ledger/model.ts";

const passphrase = "synthetic-browser-backup";
const data: Ledger = {
  schemaVersion: 7,
  accounts: [
    {
      id: "qa-cash",
      name: "QA 생활비",
      role: "LIVING",
      openingDate: "2026-01-01",
      openingBalance: 1000000,
    },
    {
      id: "qa-save",
      name: "QA 적금",
      role: "SAVINGS",
      openingDate: "2026-01-01",
      openingBalance: 10000000,
    },
  ],
  entries: [
    {
      id: "qa-income",
      accountId: "qa-cash",
      date: "2026-01-25",
      amount: 3000000,
      description: "QA 급여",
      category: "급여",
      kind: "INCOME",
      batchId: null,
      pairId: null,
    },
  ],
  goals: [
    {
      id: "qa-goal",
      name: "QA 자산 목표",
      target: 50000000,
      deadline: "2028-01-25",
      monthly: 1000000,
      paymentDay: 25,
      accountIds: ["qa-save"],
    },
  ],
  monthlyPlan: {
    salaryAccountId: "qa-cash",
    payday: 25,
    netIncome: 3000000,
    fixedAccountId: "qa-cash",
    fixedAmount: 800000,
    livingAccountId: "qa-cash",
    livingAmount: 500000,
    reserveAmount: 200000,
    allocations: [{ accountId: "qa-save", amount: 1000000 }],
  },
  schedules: [
    {
      id: "qa-bill",
      name: "QA 통신비",
      accountId: "qa-cash",
      targetAccountId: null,
      amount: 50000,
      day: 31,
      startDate: "2026-01-01",
      endDate: null,
      payments: [],
    },
  ],
  maturities: [
    {
      id: "qa-maturity",
      accountId: "qa-save",
      date: "2027-01-31",
      expectedAmount: 10500000,
      allocations: [{ accountId: "qa-cash", amount: 10000000 }],
      note: "QA 만기 계획",
      receivedDate: null,
    },
  ],
  batches: [],
  planHistory: [],
};
captureMonthlyPlan(data, "2026-01-25");
recordScheduledPayment(
  data,
  "qa-bill",
  "2026-01-31",
  { date: "2026-01-31" },
  "2026-02-14",
);

const [mode, path, originalPath] = process.argv.slice(2);
if (
  !path ||
  !["create", "verify"].includes(mode ?? "") ||
  (mode === "verify" && !originalPath)
) {
  throw new Error(
    "Usage: node scripts/backup-browser-fixture.ts create <output> | verify <browser export> <original backup>",
  );
}
if (mode === "create") {
  await writeFile(path, await encryptBackup(data, passphrase), { flag: "wx" });
  console.log(
    "Synthetic backup created. Test passphrase: synthetic-browser-backup",
  );
} else {
  const restored = await decryptBackup(await readFile(path, "utf8"), passphrase);
  const original = await decryptBackup(
    await readFile(originalPath!, "utf8"),
    passphrase,
  );
  // IndexedDB returns records in key order; record ordering is not ledger data.
  for (const ledger of [original, restored]) {
    for (const key of [
      "accounts",
      "entries",
      "goals",
      "batches",
      "schedules",
      "maturities",
    ] as const) {
      ledger[key].sort((a, b) => a.id.localeCompare(b.id));
    }
    ledger.planHistory.sort((a, b) => a.month.localeCompare(b.month));
  }
  assert.deepEqual(restored, original);
  console.log(
    "PASS: all ledger fields and payment links survived browser restore and export.",
  );
}
