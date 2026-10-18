export type StorageProtection =
  | "protected"
  | "standard"
  | "unsupported"
  | "error";
type StorageAccess = {
  persisted?: () => Promise<boolean>;
  persist?: () => Promise<boolean>;
};

export async function readStorageProtection(
  storage?: StorageAccess,
): Promise<StorageProtection> {
  if (!storage?.persisted) return "unsupported";
  try {
    return (await storage.persisted()) ? "protected" : "standard";
  } catch {
    return "error";
  }
}

export async function requestStorageProtection(
  storage?: StorageAccess,
): Promise<StorageProtection> {
  if (!storage?.persist) return "unsupported";
  try {
    return (await storage.persist()) ? "protected" : "standard";
  } catch {
    return "error";
  }
}
