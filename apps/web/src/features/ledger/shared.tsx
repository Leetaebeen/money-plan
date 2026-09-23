import type { Ledger } from "./model";
export interface PanelProps {
  data: Ledger;
  busy: boolean;
  change: (fn: (data: Ledger) => void, message?: string) => Promise<boolean>;
}
export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="ledger-empty">{children}</div>;
}
export function download(
  content: string,
  name: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
