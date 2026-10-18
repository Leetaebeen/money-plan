import { useEffect, useRef } from "react";
import { updateDraftState, type DraftState } from "./draft-state";

export function useDraftGuard(
  key: string | null,
  value: string,
  report?: (dirty: boolean) => void,
) {
  const state = useRef<DraftState>(null);
  useEffect(() => {
    state.current = updateDraftState(state.current, key, value);
    report?.(state.current?.dirty ?? false);
  }, [key, value, report]);
  useEffect(() => () => report?.(false), [report]);
}
