import Dexie, { type Table } from "dexie";
import type {
  AllocationInput,
  AllocationResult,
  PlanMode,
  ScenarioId,
} from "@money-plan/finance-engine";
import type {
  MonthlyFormDraft,
  ProfileDraft,
  WindfallFormDraft,
} from "../domain/plan-form";

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

export type PlannerDraftId = "monthly" | "windfall";

export interface StoredMonthlyDraft {
  id: "monthly";
  recordType: "DRAFT";
  schemaVersion: 1;
  sessionId: string;
  generation: number;
  revision: number;
  versionToken: string;
  draft: MonthlyFormDraft;
  step: number;
  updatedAt: string;
}

export interface StoredWindfallDraft {
  id: "windfall";
  recordType: "DRAFT";
  schemaVersion: 1;
  sessionId: string;
  generation: number;
  revision: number;
  versionToken: string;
  draft: WindfallFormDraft;
  baseProfileUpdatedAt: string;
  updatedAt: string;
}

export type StoredPlannerDraft = StoredMonthlyDraft | StoredWindfallDraft;

export interface StoredDraftTombstone {
  id: PlannerDraftId;
  recordType: "TOMBSTONE";
  schemaVersion: 1;
  sessionId: string;
  generation: number;
  revision: number;
  versionToken: string;
  reason: "COMPLETED" | "DISCARDED" | "PROFILE_CHANGED" | "ALL_DATA_DELETED";
  updatedAt: string;
}

export type StoredPlannerState = StoredPlannerDraft | StoredDraftTombstone;

export interface DraftWriteReference {
  id: PlannerDraftId;
  sessionId: string;
  generation: number;
  revision: number;
  versionToken: string | null;
}

export type CompletedDraftReference = DraftWriteReference;

export interface PreparedPlannerDraft {
  reference: DraftWriteReference;
  draft?: StoredPlannerDraft;
}

export interface PreparedWindfallContext {
  profile?: StoredProfile;
  prepared: PreparedPlannerDraft;
}

export interface SavePlanRunOutcome {
  run: StoredPlanRun;
  draftCompleted: boolean;
}

export interface SaveMonthlyDraftAndProfileOutcome {
  draft: StoredMonthlyDraft;
  profile: StoredProfile;
  profileChanged: boolean;
}

export class DraftConflictError extends Error {
  constructor(message = "다른 화면에서 초안이 변경되었습니다.") {
    super(message);
    this.name = "DraftConflictError";
  }
}

export class ProfileConflictError extends Error {
  constructor(message = "다른 화면에서 월급 정보가 변경되었습니다.") {
    super(message);
    this.name = "ProfileConflictError";
  }
}

class MoneyPlanDatabase extends Dexie {
  profiles!: Table<StoredProfile, string>;
  planRuns!: Table<StoredPlanRun, string>;
  plannerDrafts!: Table<StoredPlannerState, PlannerDraftId>;

  constructor() {
    super("money-plan");
    this.version(1).stores({
      profiles: "id, updatedAt",
      planRuns: "id, mode, selectedScenarioId, createdAt",
    });
    this.version(2).stores({
      profiles: "id, updatedAt",
      planRuns: "id, mode, selectedScenarioId, createdAt",
      plannerDrafts: "id, updatedAt",
    });
  }
}

export const db = new MoneyPlanDatabase();

const draftWriteQueues: Record<PlannerDraftId, Promise<void>> = {
  monthly: Promise.resolve(),
  windfall: Promise.resolve(),
};

function enqueueDraftWrite<T>(id: PlannerDraftId, operation: () => Promise<T>): Promise<T> {
  const queued = draftWriteQueues[id].catch(() => undefined).then(operation);
  draftWriteQueues[id] = queued.then(
    () => undefined,
    () => undefined,
  );
  return queued;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasStringFields(value: Record<string, unknown>, fields: readonly string[]): boolean {
  return fields.every((field) => typeof value[field] === "string");
}

function isProfileDraft(value: unknown): value is ProfileDraft {
  if (!isObjectRecord(value)) return false;
  const moneyFields = [
    "monthlyNetIncomeWon",
    "fixedEssentialWon",
    "variableEssentialWon",
    "irregularEssentialReserveWon",
    "contractualDebtPaymentsWon",
    "plannedFlexibleSpendWon",
    "currentEmergencyFundWon",
  ] as const;
  const emergencyMonthsValid = value.emergencyTargetMonths === null ||
    Number.isInteger(value.emergencyTargetMonths);
  const longTermChoiceValid = value.longTermGoalEnabled === null ||
    typeof value.longTermGoalEnabled === "boolean";
  const goalsValid = Array.isArray(value.goals) && value.goals.every((goal) =>
    isObjectRecord(goal) &&
    hasStringFields(goal, ["id", "label", "targetWon", "savedWon", "monthsRemaining"]) &&
    ["SHORT_TERM", "DEBT_REPAYMENT", "OTHER"].includes(String(goal.kind)),
  );
  return hasStringFields(value, moneyFields) &&
    emergencyMonthsValid &&
    longTermChoiceValid &&
    goalsValid;
}

function isMonthlyFormDraft(value: unknown): value is MonthlyFormDraft {
  return isObjectRecord(value) &&
    typeof value.currentCycleRequiredShortfallWon === "string" &&
    isProfileDraft(value.profile);
}

function isWindfallFormDraft(value: unknown): value is WindfallFormDraft {
  if (!isObjectRecord(value) || !hasStringFields(value, [
    "amountWon",
    "taxReserveWon",
    "nearTermReserveWon",
  ])) return false;
  const deficitMonthsValid = value.deficitCoverageMonths === null ||
    Number.isInteger(value.deficitCoverageMonths);
  const catchUpsValid = isObjectRecord(value.goalCatchUps) &&
    Object.values(value.goalCatchUps).every((amount) => typeof amount === "string");
  return deficitMonthsValid && catchUpsValid;
}

function isStoredMonthlyDraft(value: unknown): value is StoredMonthlyDraft {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredMonthlyDraft>;
  return candidate.id === "monthly" &&
    candidate.recordType === "DRAFT" &&
    candidate.schemaVersion === 1 &&
    typeof candidate.sessionId === "string" &&
    candidate.sessionId.length > 0 &&
    Number.isInteger(candidate.generation) &&
    (candidate.generation ?? 0) >= 1 &&
    Number.isInteger(candidate.revision) &&
    (candidate.revision ?? 0) >= 1 &&
    typeof candidate.versionToken === "string" &&
    candidate.versionToken.length > 0 &&
    typeof candidate.updatedAt === "string" &&
    Number.isInteger(candidate.step) &&
    (candidate.step ?? -1) >= 0 &&
    (candidate.step ?? 4) <= 3 &&
    isMonthlyFormDraft(candidate.draft);
}

function isStoredWindfallDraft(value: unknown): value is StoredWindfallDraft {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredWindfallDraft>;
  return candidate.id === "windfall" &&
    candidate.recordType === "DRAFT" &&
    candidate.schemaVersion === 1 &&
    typeof candidate.sessionId === "string" &&
    candidate.sessionId.length > 0 &&
    Number.isInteger(candidate.generation) &&
    (candidate.generation ?? 0) >= 1 &&
    Number.isInteger(candidate.revision) &&
    (candidate.revision ?? 0) >= 1 &&
    typeof candidate.versionToken === "string" &&
    candidate.versionToken.length > 0 &&
    typeof candidate.updatedAt === "string" &&
    typeof candidate.baseProfileUpdatedAt === "string" &&
    isWindfallFormDraft(candidate.draft);
}

function isStoredDraftTombstone(value: unknown): value is StoredDraftTombstone {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredDraftTombstone>;
  return (candidate.id === "monthly" || candidate.id === "windfall") &&
    candidate.recordType === "TOMBSTONE" &&
    candidate.schemaVersion === 1 &&
    typeof candidate.sessionId === "string" &&
    candidate.sessionId.length > 0 &&
    Number.isInteger(candidate.generation) &&
    (candidate.generation ?? 0) >= 1 &&
    Number.isInteger(candidate.revision) &&
    (candidate.revision ?? -1) >= 0 &&
    typeof candidate.versionToken === "string" &&
    candidate.versionToken.length > 0 &&
    ["COMPLETED", "DISCARDED", "PROFILE_CHANGED", "ALL_DATA_DELETED"].includes(String(candidate.reason)) &&
    typeof candidate.updatedAt === "string";
}

function isStoredPlannerState(value: unknown): value is StoredPlannerState {
  return isStoredMonthlyDraft(value) ||
    isStoredWindfallDraft(value) ||
    isStoredDraftTombstone(value);
}

function tombstoneFor(
  draft: StoredPlannerDraft,
  reason: StoredDraftTombstone["reason"],
): StoredDraftTombstone {
  return {
    id: draft.id,
    recordType: "TOMBSTONE",
    schemaVersion: 1,
    sessionId: draft.sessionId,
    generation: draft.generation,
    revision: draft.revision,
    versionToken: draft.versionToken,
    reason,
    updatedAt: new Date().toISOString(),
  };
}

function deletionBarrierFor(
  id: PlannerDraftId,
  current: unknown,
): StoredDraftTombstone {
  const generation = isStoredPlannerState(current) ? current.generation + 1 : 1;
  return {
    id,
    recordType: "TOMBSTONE",
    schemaVersion: 1,
    sessionId: crypto.randomUUID(),
    generation,
    revision: 0,
    versionToken: crypto.randomUUID(),
    reason: "ALL_DATA_DELETED",
    updatedAt: new Date().toISOString(),
  };
}

function referenceForDraft(draft: StoredPlannerDraft): DraftWriteReference {
  return {
    id: draft.id,
    sessionId: draft.sessionId,
    generation: draft.generation,
    revision: draft.revision,
    versionToken: draft.versionToken,
  };
}

function nextDraftVersion(
  id: PlannerDraftId,
  reference: DraftWriteReference,
  current: unknown,
): Pick<DraftWriteReference, "generation" | "revision"> {
  if (
    reference.id !== id ||
    !reference.sessionId ||
    !Number.isInteger(reference.generation) ||
    reference.generation < 0 ||
    !Number.isInteger(reference.revision) ||
    reference.revision < 0 ||
    (reference.versionToken !== null && !reference.versionToken)
  ) {
    throw new TypeError("올바른 초안 수정 기준이 필요합니다.");
  }
  if (current === undefined) {
    if (reference.generation !== 0 || reference.revision !== 0 || reference.versionToken !== null) {
      throw new DraftConflictError("초안 상태가 다른 화면에서 변경되었어요.");
    }
    return { generation: 1, revision: 1 };
  }
  if (!isStoredPlannerState(current)) {
    throw new DraftConflictError("지원하지 않는 형식의 초안이 있어 저장하지 못했어요.");
  }
  if (current.recordType === "TOMBSTONE") {
    if (
      reference.generation !== current.generation ||
      reference.revision !== 0 ||
      reference.versionToken !== current.versionToken
    ) {
      throw new DraftConflictError("완료 또는 삭제 이후 초안 상태가 변경되었어요.");
    }
    return { generation: current.generation + 1, revision: 1 };
  }
  if (
    current.sessionId !== reference.sessionId ||
    current.generation !== reference.generation ||
    current.revision !== reference.revision ||
    current.versionToken !== reference.versionToken
  ) {
    throw new DraftConflictError("다른 화면의 최신 초안을 덮어쓰지 않았어요.");
  }
  return { generation: current.generation, revision: current.revision + 1 };
}

function preparedPlannerDraftFromState(
  id: PlannerDraftId,
  current: unknown,
): PreparedPlannerDraft {
  if (current === undefined) {
    return {
      reference: {
        id,
        sessionId: crypto.randomUUID(),
        generation: 0,
        revision: 0,
        versionToken: null,
      },
    };
  }
  if (!isStoredPlannerState(current)) {
    throw new DraftConflictError("지원하지 않는 형식의 초안이 있어 불러오지 못했어요.");
  }
  if (current.recordType === "TOMBSTONE") {
    return {
      reference: {
        id,
        sessionId: crypto.randomUUID(),
        generation: current.generation,
        revision: 0,
        versionToken: current.versionToken,
      },
    };
  }
  return {
    reference: referenceForDraft(current),
    draft: structuredClone(current),
  };
}

export async function preparePlannerDraftSession(
  id: PlannerDraftId,
): Promise<PreparedPlannerDraft> {
  await draftWriteQueues[id];
  const current: unknown = await db.plannerDrafts.get(id);
  return preparedPlannerDraftFromState(id, current);
}

export async function prepareWindfallDraftContext(): Promise<PreparedWindfallContext> {
  await draftWriteQueues.windfall;
  return db.transaction("r", db.profiles, db.plannerDrafts, async () => {
    const [profile, current] = await Promise.all([
      db.profiles.get("primary"),
      db.plannerDrafts.get("windfall"),
    ]);
    return {
      profile: profile ? structuredClone(profile) : undefined,
      prepared: preparedPlannerDraftFromState("windfall", current),
    };
  });
}

export async function loadProfile(): Promise<StoredProfile | undefined> {
  return db.profiles.get("primary");
}

export async function saveProfile(
  draft: ProfileDraft,
  expectedUpdatedAt: string | null,
  sourceDraft: DraftWriteReference,
): Promise<StoredProfile> {
  const nextDraft = structuredClone(draft);
  const stored = await enqueueDraftWrite("windfall", () =>
    db.transaction("rw", db.profiles, db.plannerDrafts, async () => {
      const current = await db.profiles.get("primary");
      const monthlyState: unknown = await db.plannerDrafts.get("monthly");
      if (
        !isStoredMonthlyDraft(monthlyState) ||
        sourceDraft.id !== "monthly" ||
        monthlyState.sessionId !== sourceDraft.sessionId ||
        monthlyState.generation !== sourceDraft.generation ||
        monthlyState.revision !== sourceDraft.revision ||
        monthlyState.versionToken !== sourceDraft.versionToken
      ) {
        throw new ProfileConflictError("월급 계획 초안이 다른 화면에서 변경되어 프로필을 저장하지 않았어요.");
      }
      if (current && JSON.stringify(current.draft) === JSON.stringify(nextDraft)) {
        return current;
      }
      if ((current?.updatedAt ?? null) !== expectedUpdatedAt) {
        throw new ProfileConflictError("다른 화면에서 저장한 최신 월급 정보를 먼저 반영해 주세요.");
      }
      const now = new Date().toISOString();
      const updatedAt = current && now <= current.updatedAt
        ? new Date(Date.parse(current.updatedAt) + 1).toISOString()
        : now;
      const nextProfile: StoredProfile = {
        id: "primary",
        draft: nextDraft,
        updatedAt,
      };
      await db.profiles.put(nextProfile);
      const windfallState: unknown = await db.plannerDrafts.get("windfall");
      if (isStoredWindfallDraft(windfallState)) {
        await db.plannerDrafts.put(tombstoneFor(windfallState, "PROFILE_CHANGED"));
      }
      return nextProfile;
    }),
  );
  return structuredClone(stored);
}

export async function saveMonthlyDraftAndProfile(
  draft: MonthlyFormDraft,
  step: number,
  reference: DraftWriteReference,
  expectedProfileUpdatedAt: string | null,
  updatedAt = new Date().toISOString(),
): Promise<SaveMonthlyDraftAndProfileOutcome> {
  if (!Number.isInteger(step) || step < 0 || step > 3) {
    throw new RangeError("월급 계획 단계는 0~3이어야 합니다.");
  }
  const nextDraft = structuredClone(draft);
  const stored = await enqueueDraftWrite("monthly", () =>
    db.transaction("rw", db.profiles, db.plannerDrafts, async () => {
      const [currentDraft, currentProfile] = await Promise.all([
        db.plannerDrafts.get("monthly"),
        db.profiles.get("primary"),
      ]);
      const version = nextDraftVersion("monthly", reference, currentDraft);
      const profileChanged = !currentProfile ||
        JSON.stringify(currentProfile.draft) !== JSON.stringify(nextDraft.profile);
      if (profileChanged && (currentProfile?.updatedAt ?? null) !== expectedProfileUpdatedAt) {
        throw new ProfileConflictError("다른 화면에서 저장한 최신 월급 정보를 먼저 반영해 주세요.");
      }
      const now = new Date().toISOString();
      const profileUpdatedAt = !profileChanged && currentProfile
        ? currentProfile.updatedAt
        : currentProfile && now <= currentProfile.updatedAt
          ? new Date(Date.parse(currentProfile.updatedAt) + 1).toISOString()
          : now;
      const nextProfile: StoredProfile = profileChanged || !currentProfile
        ? { id: "primary", draft: structuredClone(nextDraft.profile), updatedAt: profileUpdatedAt }
        : currentProfile;
      const nextMonthlyDraft: StoredMonthlyDraft = {
        id: "monthly",
        recordType: "DRAFT",
        schemaVersion: 1,
        sessionId: reference.sessionId,
        generation: version.generation,
        revision: version.revision,
        versionToken: crypto.randomUUID(),
        draft: nextDraft,
        step,
        updatedAt,
      };

      await db.plannerDrafts.put(nextMonthlyDraft);
      if (profileChanged) {
        await db.profiles.put(nextProfile);
        const windfallState: unknown = await db.plannerDrafts.get("windfall");
        if (isStoredWindfallDraft(windfallState)) {
          await db.plannerDrafts.put(tombstoneFor(windfallState, "PROFILE_CHANGED"));
        }
      }
      return { draft: nextMonthlyDraft, profile: nextProfile, profileChanged };
    }),
  );
  return structuredClone(stored);
}

export async function loadMonthlyDraft(): Promise<StoredMonthlyDraft | undefined> {
  await draftWriteQueues.monthly;
  const stored: unknown = await db.plannerDrafts.get("monthly");
  return isStoredMonthlyDraft(stored) ? structuredClone(stored) : undefined;
}

export async function loadWindfallDraft(): Promise<StoredWindfallDraft | undefined> {
  await draftWriteQueues.windfall;
  const stored: unknown = await db.plannerDrafts.get("windfall");
  return isStoredWindfallDraft(stored) ? structuredClone(stored) : undefined;
}

export async function saveMonthlyDraft(
  draft: MonthlyFormDraft,
  step: number,
  reference: DraftWriteReference,
  updatedAt = new Date().toISOString(),
): Promise<StoredMonthlyDraft> {
  if (!Number.isInteger(step) || step < 0 || step > 3) {
    throw new RangeError("월급 계획 단계는 0~3이어야 합니다.");
  }
  const stored = await enqueueDraftWrite("monthly", () =>
    db.transaction("rw", db.plannerDrafts, async () => {
      const current: unknown = await db.plannerDrafts.get("monthly");
      const version = nextDraftVersion("monthly", reference, current);
      const next: StoredMonthlyDraft = {
        id: "monthly",
        recordType: "DRAFT",
        schemaVersion: 1,
        sessionId: reference.sessionId,
        generation: version.generation,
        revision: version.revision,
        versionToken: crypto.randomUUID(),
        draft: structuredClone(draft),
        step,
        updatedAt,
      };
      await db.plannerDrafts.put(next);
      return next;
    }),
  );
  return structuredClone(stored);
}

export async function saveWindfallDraft(
  draft: WindfallFormDraft,
  baseProfileUpdatedAt: string,
  reference: DraftWriteReference,
  updatedAt = new Date().toISOString(),
): Promise<StoredWindfallDraft> {
  const stored = await enqueueDraftWrite("windfall", () =>
    db.transaction("rw", db.profiles, db.plannerDrafts, async () => {
      const profile = await db.profiles.get("primary");
      if (!profile || profile.updatedAt !== baseProfileUpdatedAt) {
        throw new DraftConflictError("월급 정보가 변경되어 여윳돈 초안을 저장하지 않았어요.");
      }
      const current: unknown = await db.plannerDrafts.get("windfall");
      const version = nextDraftVersion("windfall", reference, current);
      const next: StoredWindfallDraft = {
        id: "windfall",
        recordType: "DRAFT",
        schemaVersion: 1,
        sessionId: reference.sessionId,
        generation: version.generation,
        revision: version.revision,
        versionToken: crypto.randomUUID(),
        draft: structuredClone(draft),
        baseProfileUpdatedAt,
        updatedAt,
      };
      await db.plannerDrafts.put(next);
      return next;
    }),
  );
  return structuredClone(stored);
}

export async function deletePlannerDraft(
  id: PlannerDraftId,
  reference: DraftWriteReference,
): Promise<void> {
  await enqueueDraftWrite(id, () =>
    db.transaction("rw", db.plannerDrafts, async () => {
      const current: unknown = await db.plannerDrafts.get(id);
      if (current === undefined || isStoredDraftTombstone(current)) {
        throw new DraftConflictError("초안이 이미 완료되거나 삭제되었어요.");
      }
      if (!isStoredMonthlyDraft(current) && !isStoredWindfallDraft(current)) {
        throw new DraftConflictError("지원하지 않는 형식의 초안은 전체 데이터 삭제로 정리해 주세요.");
      }
      if (
        reference.id !== id ||
        current.sessionId !== reference.sessionId ||
        current.generation !== reference.generation ||
        current.revision !== reference.revision ||
        current.versionToken !== reference.versionToken
      ) {
        throw new DraftConflictError("다른 화면에서 변경한 최신 초안은 삭제하지 않았어요.");
      }
      await db.plannerDrafts.put(tombstoneFor(current, "DISCARDED"));
    }),
  );
}

export async function loadLatestPlan(): Promise<StoredPlanRun | undefined> {
  return db.planRuns.orderBy("createdAt").last();
}

export async function savePlanRun(
  input: AllocationInput,
  result: AllocationResult,
  selectedScenarioId: ScenarioId,
  completedDraft: CompletedDraftReference,
): Promise<SavePlanRunOutcome> {
  const run: StoredPlanRun = {
    id: crypto.randomUUID(),
    mode: input.mode,
    input: structuredClone(input),
    result: structuredClone(result),
    selectedScenarioId,
    createdAt: new Date().toISOString(),
  };
  await enqueueDraftWrite(completedDraft.id, () =>
    db.transaction("rw", db.planRuns, db.plannerDrafts, async () => {
      const current: unknown = await db.plannerDrafts.get(completedDraft.id);
      if (!isStoredPlannerState(current)) {
        throw new DraftConflictError("초안이 삭제되어 이 계산 결과는 저장하지 않았어요.");
      }
      if (current.recordType === "TOMBSTONE") {
        if (
          current.reason !== "COMPLETED" ||
          current.sessionId !== completedDraft.sessionId ||
          current.generation !== completedDraft.generation ||
          current.revision !== completedDraft.revision ||
          current.versionToken !== completedDraft.versionToken
        ) {
          throw new DraftConflictError("완료 이후 초안 상태가 바뀌어 이 계산 결과는 저장하지 않았어요.");
        }
        await db.planRuns.add(run);
        return;
      }
      if (
        current.sessionId !== completedDraft.sessionId ||
        current.generation !== completedDraft.generation ||
        current.revision !== completedDraft.revision ||
        current.versionToken !== completedDraft.versionToken
      ) {
        throw new DraftConflictError("다른 화면의 최신 입력을 반영한 뒤 다시 계산해 주세요.");
      }
      await db.planRuns.add(run);
      await db.plannerDrafts.put(tombstoneFor(current, "COMPLETED"));
    }),
  );
  return { run: structuredClone(run), draftCompleted: true };
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  return navigator.storage.persist();
}

export async function exportLocalData(): Promise<Blob> {
  await Promise.all(Object.values(draftWriteQueues));
  const [profiles, planRuns, plannerStates] = await db.transaction(
    "r",
    db.profiles,
    db.planRuns,
    db.plannerDrafts,
    () => Promise.all([
      db.profiles.toArray(),
      db.planRuns.toArray(),
      db.plannerDrafts.toArray(),
    ]),
  );
  const plannerDrafts = plannerStates.filter(
    (state): state is StoredPlannerDraft => isStoredMonthlyDraft(state) || isStoredWindfallDraft(state),
  );
  return new Blob(
    [JSON.stringify({ exportedAt: new Date().toISOString(), profiles, planRuns, plannerDrafts }, null, 2)],
    { type: "application/json;charset=utf-8" },
  );
}

export async function deleteAllLocalData(): Promise<void> {
  await Promise.all(Object.values(draftWriteQueues));
  await db.transaction("rw", db.profiles, db.planRuns, db.plannerDrafts, async () => {
    const [monthlyState, windfallState] = await Promise.all([
      db.plannerDrafts.get("monthly"),
      db.plannerDrafts.get("windfall"),
    ]);
    await Promise.all([
      db.profiles.clear(),
      db.planRuns.clear(),
      db.plannerDrafts.put(deletionBarrierFor("monthly", monthlyState)),
      db.plannerDrafts.put(deletionBarrierFor("windfall", windfallState)),
    ]);
  });
}
