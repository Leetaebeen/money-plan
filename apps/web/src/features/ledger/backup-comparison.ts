import type { Ledger } from "./model.ts";

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]]),
        )
      : item,
  );
}

export function compareBackup(current: Ledger, incoming: Ledger) {
  const groups = [
    ["accounts", "계좌"],
    ["entries", "거래"],
    ["goals", "목표"],
    ["schedules", "납부 일정"],
    ["maturities", "만기 계획"],
    ["planHistory", "월별 계획"],
    ["batches", "가져오기 이력"],
  ] as const;
  const rows = groups.map(([key, label]) => {
    const identify = (item: { id?: string; month?: string }) =>
      item.id ?? item.month!;
    const before = new Map(
      current[key].map((item) => [identify(item), canonical(item)]),
    );
    const after = new Map(
      incoming[key].map((item) => [identify(item), canonical(item)]),
    );
    return {
      key,
      label,
      current: before.size,
      incoming: after.size,
      added: [...after.keys()].filter((id) => !before.has(id)).length,
      removed: [...before.keys()].filter((id) => !after.has(id)).length,
      changed: [...after.keys()].filter(
        (id) => before.has(id) && before.get(id) !== after.get(id),
      ).length,
    };
  });
  const planChanged =
    canonical(current.monthlyPlan) !== canonical(incoming.monthlyPlan);
  return {
    rows,
    planChanged,
    identical:
      !planChanged && rows.every((r) => !r.added && !r.removed && !r.changed),
  };
}
