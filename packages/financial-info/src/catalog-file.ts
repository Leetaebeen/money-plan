import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { parseFinancialProductCatalog } from "./catalog.ts";

export async function writeFinancialProductCatalogFile(
  filePath: string,
  catalog: unknown,
): Promise<string> {
  const validatedCatalog = parseFinancialProductCatalog(catalog);
  const targetPath = resolve(filePath);
  const targetDirectory = dirname(targetPath);
  const temporaryPath = join(
    targetDirectory,
    `.${basename(targetPath)}.${randomUUID()}.tmp`,
  );

  await mkdir(targetDirectory, { recursive: true });
  try {
    await writeFile(
      temporaryPath,
      `${JSON.stringify(validatedCatalog, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    );
    await rename(temporaryPath, targetPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }

  return targetPath;
}
