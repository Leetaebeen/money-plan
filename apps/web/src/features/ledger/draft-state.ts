export type DraftState = {
  key: string;
  initial: string;
  dirty: boolean;
} | null;

export function updateDraftState(
  previous: DraftState,
  key: string | null,
  value: string,
): DraftState {
  if (key === null) return null;
  if (previous?.key !== key) return { key, initial: value, dirty: false };
  return { ...previous, dirty: previous.initial !== value };
}
