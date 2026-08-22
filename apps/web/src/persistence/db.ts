import Dexie, { type Table } from "dexie";
import type {
  AllocationInput,
  AllocationResult,
  PlanMode,
  ScenarioId,
} from "@money-plan/finance-engine";
import type { ProfileDraft } from "../domain/plan-form";

export interface StoredProfile {
  id: "primary";
  draft: ProfileDraft;
  updatedAt: string;
}

export interface StoredPlanRun {
  id: string;
  mode: PlanMode;
  input: AllocationInput;
  result: AllocationResult;
  selectedScenarioId: ScenarioId;
  createdAt: string;
}

class MoneyPlanDatabase extends Dexie {
  profiles!: Table<StoredProfile, string>;
  planRuns!: Table<StoredPlanRun, string>;

  constructor() {
    super("money-plan");
    this.version(1).stores({
      profiles: "id, updatedAt",
      planRuns: "id, mode, selectedScenarioId, createdAt",
    });
  }
}

export const db = new MoneyPlanDatabase();

export async function loadProfile(): Promise<StoredProfile | undefined> {
  return db.profiles.get("primary");
}

export async function saveProfile(draft: ProfileDraft): Promise<StoredProfile> {
  const profile: StoredProfile = {
    id: "primary",
    draft: structuredClone(draft),
    updatedAt: new Date().toISOString(),
  };
  await db.profiles.put(profile);
  return profile;
}

export async function loadLatestPlan(): Promise<StoredPlanRun | undefined> {
  return db.planRuns.orderBy("createdAt").last();
}

export async function savePlanRun(
  input: AllocationInput,
  result: AllocationResult,
  selectedScenarioId: ScenarioId,
): Promise<StoredPlanRun> {
  const run: StoredPlanRun = {
    id: crypto.randomUUID(),
    mode: input.mode,
    input: structuredClone(input),
    result: structuredClone(result),
    selectedScenarioId,
    createdAt: new Date().toISOString(),
  };
  await db.planRuns.add(run);
  return run;
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  return navigator.storage.persist();
}

export async function exportLocalData(): Promise<Blob> {
  const [profiles, planRuns] = await Promise.all([
    db.profiles.toArray(),
    db.planRuns.toArray(),
  ]);
  return new Blob(
    [JSON.stringify({ exportedAt: new Date().toISOString(), profiles, planRuns }, null, 2)],
    { type: "application/json;charset=utf-8" },
  );
}

export async function deleteAllLocalData(): Promise<void> {
  await db.transaction("rw", db.profiles, db.planRuns, async () => {
    await Promise.all([db.profiles.clear(), db.planRuns.clear()]);
  });
}
