import { validateLedger, type Ledger } from "./model.ts";
const encoder = new TextEncoder();
const ITERATIONS = 210000;
function encode(bytes: Uint8Array): string {
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw);
}
function decode(value: unknown): Uint8Array<ArrayBuffer> {
  if (
    typeof value !== "string" ||
    value.length > 30_000_000 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  )
    throw new Error("백업 형식을 확인해 주세요.");
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
async function derive(passphrase: string, salt: Uint8Array<ArrayBuffer>) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    key,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function encryptBackup(
  data: Ledger,
  passphrase: string,
): Promise<string> {
  validateLedger(data);
  if (passphrase.length < 8 || passphrase.length > 256)
    throw new Error("백업 암호는 8~256자로 입력해 주세요.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await derive(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(JSON.stringify(data)),
  );
  return JSON.stringify({
    format: "money-plan-ledger-encrypted-v1",
    iterations: ITERATIONS,
    salt: encode(salt),
    iv: encode(iv),
    ciphertext: encode(new Uint8Array(ciphertext)),
  });
}
export async function decryptBackup(
  raw: string,
  passphrase: string,
): Promise<Ledger> {
  if (raw.length > 30_000_000 || passphrase.length > 256)
    throw new Error("백업 파일 또는 암호가 너무 큽니다.");
  let envelope: Record<string, unknown>;
  try {
    envelope = JSON.parse(raw);
  } catch {
    throw new Error("백업 파일 형식이 잘못되었습니다.");
  }
  if (
    !envelope ||
    envelope.format !== "money-plan-ledger-encrypted-v1" ||
    envelope.iterations !== ITERATIONS
  )
    throw new Error("이 가계부에서 만든 암호화 백업을 선택해 주세요.");
  const salt = decode(envelope.salt);
  const iv = decode(envelope.iv);
  const ciphertext = decode(envelope.ciphertext);
  if (salt.length !== 16 || iv.length !== 12)
    throw new Error("백업 암호화 형식이 잘못되었습니다.");
  let decoded: ArrayBuffer;
  try {
    decoded = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      await derive(passphrase, salt),
      ciphertext,
    );
  } catch {
    throw new Error("암호가 다르거나 파일이 손상되었습니다.");
  }
  const data: unknown = JSON.parse(new TextDecoder().decode(decoded));
  validateLedger(data);
  return data;
}
