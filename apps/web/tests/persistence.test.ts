import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test from "node:test";
import Dexie from "dexie";
import { calculateAllocationPlans } from "@money-plan/finance-engine";
import { buildMonthlyInput, type MonthlyFormDraft } from "../src/domain/plan-form.ts";

const persistence = await import("../src/persistence/db.ts");

const {
  DraftConflictError,
  ProfileConflictError,
  db,
  deleteAllLocalData,
  deletePlannerDraft,
  exportLocalData,
  loadLatestPlan,
  loadMonthlyDraft,
  loadProfile,
  loadWindfallDraft,
  preparePlannerDraftSession,
  saveMonthlyDraft,
  saveMonthlyDraftAndProfile,
  savePlanRun,
  saveProfile,
  saveWindfallDraft,
} = persistence;

function newReference(id: "monthly" | "windfall", sessionId: string) {
  return { id, sessionId, generation: 0, revision: 0, versionToken: null } as const;
}

function referenceFor(draft: {
  id: "monthly" | "windfall";
  sessionId: string;
  generation: number;
  revision: number;
  versionToken: string;
}) {
  return {
    id: draft.id,
    sessionId: draft.sessionId,
    generation: draft.generation,
    revision: draft.revision,
    versionToken: draft.versionToken,
  };
}

function validMonthlyDraft(): MonthlyFormDraft {
  return {
    profile: {
      monthlyNetIncomeWon: "3000000",
      fixedEssentialWon: "1000000",
      variableEssentialWon: "600000",
      irregularEssentialReserveWon: "100000",
      contractualDebtPaymentsWon: "100000",
      plannedFlexibleSpendWon: "300000",
      currentEmergencyFundWon: "0",
      emergencyTargetMonths: 4,
      longTermGoalEnabled: true,
      goals: [],
    },
    currentCycleRequiredShortfallWon: "0",
  };
}

function readyMonthlyPlan(draft = validMonthlyDraft()) {
  const built = buildMonthlyInput(draft, "2026-08-22");
  assert.ok(built.value);
  const result = calculateAllocationPlans(built.value);
  assert.equal(result.status, "READY");
  const selectedScenarioId = result.scenarios[0]!.scenarioId;
  return { input: built.value, result, selectedScenarioId };
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

test("the v2 database keeps profile and plan data written by the v1 schema", async () => {
  db.close();
  await db.delete();
  const legacy = new Dexie("money-plan");
  legacy.version(1).stores({
    profiles: "id, updatedAt",
    planRuns: "id, mode, selectedScenarioId, createdAt",
  });
  const draft = validMonthlyDraft();
  const plan = readyMonthlyPlan(draft);
  await legacy.table("profiles").put({
    id: "primary",
    draft: draft.profile,
    updatedAt: "2026-08-22T00:00:00.000Z",
  });
  await legacy.table("planRuns").put({
    id: "legacy-plan",
    mode: plan.input.mode,
    input: plan.input,
    result: plan.result,
    selectedScenarioId: plan.selectedScenarioId,
    createdAt: "2026-08-22T00:30:00.000Z",
  });
  legacy.close();
  await db.open();

  const profile = await loadProfile();

  assert.equal(profile?.draft.monthlyNetIncomeWon, "3000000");
  assert.equal((await loadLatestPlan())?.id, "legacy-plan");
  assert.equal(await db.plannerDrafts.count(), 0);
});

test("monthly and windfall drafts round-trip independently", async () => {
  const monthly = validMonthlyDraft();
  const savedMonthly = await saveMonthlyDraft(
    monthly,
    2,
    newReference("monthly", "monthly-session"),
    "2026-08-22T01:00:00.000Z",
  );
  const profile = await saveProfile(monthly.profile, null, referenceFor(savedMonthly));
  const windfall = {
    amountWon: "700000",
    taxReserveWon: "50000",
    nearTermReserveWon: "100000",
    deficitCoverageMonths: null,
    goalCatchUps: {},
  };

  await saveWindfallDraft(
    windfall,
    profile.updatedAt,
    newReference("windfall", "windfall-session"),
    "2026-08-22T02:00:00.000Z",
  );

  const [storedMonthly, storedWindfall] = await Promise.all([
    loadMonthlyDraft(),
    loadWindfallDraft(),
  ]);
  assert.equal(storedMonthly?.step, 2);
  assert.equal(storedMonthly?.recordType, "DRAFT");
  assert.equal(storedMonthly?.sessionId, "monthly-session");
  assert.equal(storedMonthly?.revision, 1);
  assert.equal(storedMonthly?.draft.profile.fixedEssentialWon, "1000000");
  assert.equal(storedWindfall?.draft.amountWon, "700000");
  assert.equal(storedWindfall?.baseProfileUpdatedAt, profile.updatedAt);
  assert.equal(storedWindfall?.sessionId, "windfall-session");
});

test("a completed or discarded session cannot recreate its draft", async () => {
  const first = validMonthlyDraft();
  const second = validMonthlyDraft();
  second.profile.monthlyNetIncomeWon = "3500000";
  const initialReference = newReference("monthly", "monthly-session");
  const firstWrite = await saveMonthlyDraft(first, 0, initialReference);
  const secondWrite = await saveMonthlyDraft(second, 1, referenceFor(firstWrite));
  await deletePlannerDraft("monthly", referenceFor(secondWrite));

  assert.equal(await loadMonthlyDraft(), undefined);
  await assert.rejects(
    saveMonthlyDraft(second, 2, referenceFor(secondWrite)),
    (error: unknown) => error instanceof DraftConflictError,
  );
  assert.equal(await loadMonthlyDraft(), undefined);
});

test("an unsupported draft schema is ignored without blocking other data", async () => {
  await db.table("plannerDrafts").put({
    id: "monthly",
    recordType: "DRAFT",
    schemaVersion: 99,
    sessionId: "unsupported-session",
    generation: 1,
    revision: 1,
    versionToken: "unsupported-token",
    step: 1,
    updatedAt: "2026-08-22T03:00:00.000Z",
    draft: validMonthlyDraft(),
  });

  assert.equal(await loadMonthlyDraft(), undefined);
});

test("a newer draft revision survives a plan save based on an older revision", async () => {
  const draft = validMonthlyDraft();
  const plan = readyMonthlyPlan(draft);
  const first = await saveMonthlyDraft(
    draft,
    2,
    newReference("monthly", "shared-session"),
  );
  const changed = structuredClone(draft);
  changed.profile.monthlyNetIncomeWon = "3300000";
  const second = await saveMonthlyDraft(changed, 3, referenceFor(first));

  await assert.rejects(savePlanRun(
    plan.input,
    plan.result,
    plan.selectedScenarioId,
    referenceFor(first),
  ), DraftConflictError);

  assert.equal(await loadLatestPlan(), undefined);
  assert.equal((await loadMonthlyDraft())?.revision, second.revision);
  assert.equal((await loadMonthlyDraft())?.draft.profile.monthlyNetIncomeWon, "3300000");

  const latestOutcome = await savePlanRun(
    plan.input,
    plan.result,
    plan.selectedScenarioId,
    referenceFor(second),
  );
  assert.equal(latestOutcome.draftCompleted, true);
  assert.equal(await loadMonthlyDraft(), undefined);
  await assert.rejects(saveMonthlyDraft(changed, 3, referenceFor(second)), DraftConflictError);
});

test("saving a selected plan and completing its matching draft is atomic", async () => {
  const draft = validMonthlyDraft();
  const plan = readyMonthlyPlan(draft);
  const stored = await saveMonthlyDraft(
    draft,
    3,
    newReference("monthly", "atomic-session"),
  );

  const outcome = await savePlanRun(
    plan.input,
    plan.result,
    plan.selectedScenarioId,
    referenceFor(stored),
  );

  assert.equal(outcome.draftCompleted, true);
  assert.equal((await loadLatestPlan())?.id, outcome.run.id);
  assert.equal(await loadMonthlyDraft(), undefined);
});

test("a failed plan write rolls back draft completion", async () => {
  const draft = validMonthlyDraft();
  const plan = readyMonthlyPlan(draft);
  const stored = await saveMonthlyDraft(
    draft,
    3,
    newReference("monthly", "rollback-session"),
  );
  const failCreation = () => { throw new Error("forced plan write failure"); };
  db.planRuns.hook("creating", failCreation);

  try {
    await assert.rejects(savePlanRun(
      plan.input,
      plan.result,
      plan.selectedScenarioId,
      referenceFor(stored),
    ));
  } finally {
    db.planRuns.hook("creating").unsubscribe(failCreation);
  }

  assert.equal((await loadMonthlyDraft())?.revision, stored.revision);
  assert.equal(await loadLatestPlan(), undefined);
});

test("profile updates invalidate windfall drafts and exports include only active drafts", async () => {
  const draft = validMonthlyDraft();
  const monthly = await saveMonthlyDraft(
    draft,
    1,
    newReference("monthly", "monthly-export-session"),
  );
  const profile = await saveProfile(draft.profile, null, referenceFor(monthly));
  await saveWindfallDraft({
    amountWon: "700000",
    taxReserveWon: "0",
    nearTermReserveWon: "0",
    deficitCoverageMonths: null,
    goalCatchUps: {},
  }, profile.updatedAt, newReference("windfall", "windfall-invalidated-session"));

  const changedProfile = structuredClone(draft.profile);
  changedProfile.monthlyNetIncomeWon = "3100000";
  await saveProfile(changedProfile, profile.updatedAt, referenceFor(monthly));
  assert.equal(await loadWindfallDraft(), undefined);

  const exported = JSON.parse(await (await exportLocalData()).text()) as {
    plannerDrafts: Array<{ id: string; recordType: string }>;
  };
  assert.deepEqual(exported.plannerDrafts.map((stored) => stored.id), ["monthly"]);
  assert.deepEqual(exported.plannerDrafts.map((stored) => stored.recordType), ["DRAFT"]);

  await deleteAllLocalData();
  assert.equal(await loadProfile(), undefined);
  assert.equal(await loadMonthlyDraft(), undefined);
  assert.equal(await loadLatestPlan(), undefined);
});

test("an unchanged profile keeps its timestamp and active windfall draft", async () => {
  const draft = validMonthlyDraft();
  const monthly = await saveMonthlyDraft(
    draft,
    1,
    newReference("monthly", "unchanged-profile-monthly"),
  );
  const profile = await saveProfile(draft.profile, null, referenceFor(monthly));
  await saveWindfallDraft({
    amountWon: "700000",
    taxReserveWon: "0",
    nearTermReserveWon: "0",
    deficitCoverageMonths: null,
    goalCatchUps: {},
  }, profile.updatedAt, newReference("windfall", "unchanged-profile-session"));

  const unchanged = await saveProfile(
    structuredClone(draft.profile),
    profile.updatedAt,
    referenceFor(monthly),
  );

  assert.equal(unchanged.updatedAt, profile.updatedAt);
  assert.equal((await loadWindfallDraft())?.draft.amountWon, "700000");
});

test("a stale editor cannot overwrite a newer revision from the same session", async () => {
  const original = validMonthlyDraft();
  const first = await saveMonthlyDraft(
    original,
    1,
    newReference("monthly", "shared-editor-session"),
  );
  const staleReference = referenceFor(first);
  const changed = structuredClone(original);
  changed.profile.monthlyNetIncomeWon = "3300000";
  const newer = await saveMonthlyDraft(changed, 2, referenceFor(first));

  await assert.rejects(
    saveMonthlyDraft(original, 2, staleReference),
    DraftConflictError,
  );
  await assert.rejects(
    saveMonthlyDraft(original, 2, { ...staleReference, revision: newer.revision }),
    DraftConflictError,
  );

  assert.equal((await loadMonthlyDraft())?.revision, newer.revision);
  assert.equal((await loadMonthlyDraft())?.draft.profile.monthlyNetIncomeWon, "3300000");
});

test("a session prepared before another session completes cannot revive the draft", async () => {
  const draft = validMonthlyDraft();
  const plan = readyMonthlyPlan(draft);
  const firstPrepared = await preparePlannerDraftSession("monthly");
  const delayedPrepared = await preparePlannerDraftSession("monthly");
  const stored = await saveMonthlyDraft(draft, 3, firstPrepared.reference);

  await savePlanRun(plan.input, plan.result, plan.selectedScenarioId, referenceFor(stored));

  await assert.rejects(
    saveMonthlyDraft(draft, 3, delayedPrepared.reference),
    DraftConflictError,
  );
  assert.equal(await loadMonthlyDraft(), undefined);

  const nextPrepared = await preparePlannerDraftSession("monthly");
  const next = await saveMonthlyDraft(draft, 0, nextPrepared.reference);
  await deletePlannerDraft("monthly", referenceFor(next));
  await assert.rejects(saveMonthlyDraft(draft, 0, referenceFor(stored)), DraftConflictError);
});

test("separate database connections honor the same generation compare-and-swap", async () => {
  const secondTab = await import(
    new URL("../src/persistence/db.ts?second-tab", import.meta.url).href
  ) as typeof persistence;
  try {
    const firstPrepared = await preparePlannerDraftSession("monthly");
    const secondPrepared = await secondTab.preparePlannerDraftSession("monthly");
    await saveMonthlyDraft(validMonthlyDraft(), 0, firstPrepared.reference);

    await assert.rejects(
      secondTab.saveMonthlyDraft(validMonthlyDraft(), 0, secondPrepared.reference),
      (error: unknown) => error instanceof secondTab.DraftConflictError,
    );
  } finally {
    secondTab.db.close();
  }
});

test("the all-data deletion barrier rejects writes from already open editors", async () => {
  const draft = validMonthlyDraft();
  const stored = await saveMonthlyDraft(
    draft,
    1,
    newReference("monthly", "open-before-delete"),
  );
  const profile = await saveProfile(draft.profile, null, referenceFor(stored));
  assert.ok(profile.updatedAt);

  await deleteAllLocalData();

  assert.equal(await loadProfile(), undefined);
  assert.equal(await loadLatestPlan(), undefined);
  assert.equal(await loadMonthlyDraft(), undefined);
  await assert.rejects(saveMonthlyDraft(draft, 1, referenceFor(stored)), DraftConflictError);
  await assert.rejects(
    saveProfile(draft.profile, null, referenceFor(stored)),
    ProfileConflictError,
  );
  await assert.rejects(
    saveMonthlyDraftAndProfile(draft, 1, referenceFor(stored), null),
    DraftConflictError,
  );

  const fresh = await preparePlannerDraftSession("monthly");
  const restarted = await saveMonthlyDraft(draft, 0, fresh.reference);
  assert.ok(restarted.generation > stored.generation);
});

test("profile and windfall writes reject stale profile versions", async () => {
  const draft = validMonthlyDraft();
  const monthly = await saveMonthlyDraft(
    draft,
    1,
    newReference("monthly", "profile-cas-session"),
  );
  const firstProfile = await saveProfile(draft.profile, null, referenceFor(monthly));
  const changedProfile = structuredClone(draft.profile);
  changedProfile.monthlyNetIncomeWon = "3200000";
  const latestProfile = await saveProfile(
    changedProfile,
    firstProfile.updatedAt,
    referenceFor(monthly),
  );
  assert.notEqual(latestProfile.updatedAt, firstProfile.updatedAt);

  await assert.rejects(
    saveProfile(draft.profile, firstProfile.updatedAt, referenceFor(monthly)),
    ProfileConflictError,
  );
  assert.equal((await loadProfile())?.updatedAt, latestProfile.updatedAt);
  await assert.rejects(saveWindfallDraft({
    amountWon: "700000",
    taxReserveWon: "0",
    nearTermReserveWon: "0",
    deficitCoverageMonths: null,
    goalCatchUps: {},
  }, firstProfile.updatedAt, newReference("windfall", "stale-profile-windfall")), DraftConflictError);
  assert.equal(await loadWindfallDraft(), undefined);
});

test("monthly draft and profile changes roll back together on a profile conflict", async () => {
  const draft = validMonthlyDraft();
  const monthly = await saveMonthlyDraft(
    draft,
    1,
    newReference("monthly", "atomic-profile-session"),
  );
  const firstProfile = await saveProfile(draft.profile, null, referenceFor(monthly));
  const remoteProfile = structuredClone(draft.profile);
  remoteProfile.monthlyNetIncomeWon = "3400000";
  const latestProfile = await saveProfile(
    remoteProfile,
    firstProfile.updatedAt,
    referenceFor(monthly),
  );
  const localDraft = structuredClone(draft);
  localDraft.profile.monthlyNetIncomeWon = "3200000";

  await assert.rejects(
    saveMonthlyDraftAndProfile(
      localDraft,
      2,
      referenceFor(monthly),
      firstProfile.updatedAt,
    ),
    ProfileConflictError,
  );

  assert.equal((await loadMonthlyDraft())?.revision, monthly.revision);
  assert.equal((await loadMonthlyDraft())?.draft.profile.monthlyNetIncomeWon, "3000000");
  assert.equal((await loadProfile())?.updatedAt, latestProfile.updatedAt);
});

test("discarded newer drafts do not accept plan results from older revisions", async () => {
  const draft = validMonthlyDraft();
  const plan = readyMonthlyPlan(draft);
  const first = await saveMonthlyDraft(
    draft,
    1,
    newReference("monthly", "discarded-plan-session"),
  );
  const second = await saveMonthlyDraft(draft, 2, referenceFor(first));
  await deletePlannerDraft("monthly", referenceFor(second));

  await assert.rejects(
    savePlanRun(plan.input, plan.result, plan.selectedScenarioId, referenceFor(first)),
    DraftConflictError,
  );
  assert.equal(await loadLatestPlan(), undefined);
});

test("a late tombstone failure rolls back the plan written earlier in the transaction", async () => {
  const draft = validMonthlyDraft();
  const plan = readyMonthlyPlan(draft);
  const stored = await saveMonthlyDraft(
    draft,
    3,
    newReference("monthly", "late-rollback-session"),
  );
  const failUpdate = () => { throw new Error("forced tombstone failure"); };
  db.plannerDrafts.hook("updating", failUpdate);

  try {
    await assert.rejects(
      savePlanRun(plan.input, plan.result, plan.selectedScenarioId, referenceFor(stored)),
    );
  } finally {
    db.plannerDrafts.hook("updating").unsubscribe(failUpdate);
  }

  assert.equal(await loadLatestPlan(), undefined);
  assert.equal((await loadMonthlyDraft())?.revision, stored.revision);
});
