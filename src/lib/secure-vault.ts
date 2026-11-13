import { openDB } from "idb";
import type { BackupData } from "../types";

/** A password-derived, non-extractable AES-256-GCM key. No password/key is persisted. */
const DB_NAME = "finanzas-vault-v1";
const KDF_ITERATIONS = 600_000;
const enc = new TextEncoder();
const dec = new TextDecoder();

type Envelope = {
  format: "finanzas-local-encrypted";
  version: 1;
  algorithm: "AES-256-GCM";
  kdf: "PBKDF2-SHA256";
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
};

const database = openDB(DB_NAME, 1, {
  upgrade(db) {
    db.createObjectStore("encrypted");
  },
});

let session: { key: CryptoKey; data: BackupData; envelope: Envelope } | null = null;
let pending: Promise<unknown> = Promise.resolve();
let sessionGeneration = 0;

function requireCrypto() {
  if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues) {
    throw new Error("Necesitas abrir la aplicación en un contexto seguro (HTTPS o localhost).");
  }
}

function encode(bytes: Uint8Array): string {
  let result = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    result += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(result);
}

function decode(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function validateEnvelope(value: unknown): Envelope {
  if (!value || typeof value !== "object") throw new Error("Copia cifrada no válida.");
  const v = value as Partial<Envelope>;
  if (
    v.format !== "finanzas-local-encrypted" ||
    v.version !== 1 ||
    v.algorithm !== "AES-256-GCM" ||
    v.kdf !== "PBKDF2-SHA256" ||
    v.iterations !== KDF_ITERATIONS ||
    typeof v.salt !== "string" ||
    typeof v.iv !== "string" ||
    typeof v.ciphertext !== "string"
  ) {
    throw new Error("Formato de copia cifrada no compatible.");
  }
  if (decode(v.salt).length !== 16 || decode(v.iv).length !== 12) {
    throw new Error("Metadatos de cifrado no válidos.");
  }
  return v as Envelope;
}

function validateData(value: unknown): asserts value is BackupData {
  if (!value || typeof value !== "object") throw new Error("Los datos no son válidos.");
  const data = value as Partial<BackupData>;
  if (
    data.version !== 1 ||
    !Array.isArray(data.accounts) ||
    !Array.isArray(data.categories) ||
    !Array.isArray(data.transactions) ||
    !data.settings ||
    typeof data.settings !== "object"
  ) throw new Error("El contenido de la copia no es compatible.");
}

async function derive(password: string, salt: Uint8Array, iterations: number) {
  requireCrypto();
  const root = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    root,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function seal(data: BackupData, key: CryptoKey, salt: string): Promise<Envelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(JSON.stringify(data)),
  );
  return {
    format: "finanzas-local-encrypted",
    version: 1,
    algorithm: "AES-256-GCM",
    kdf: "PBKDF2-SHA256",
    iterations: KDF_ITERATIONS,
    salt,
    iv: encode(iv),
    ciphertext: encode(new Uint8Array(bytes)),
  };
}

async function unseal(envelope: Envelope, password: string) {
  const key = await derive(password, decode(envelope.salt), envelope.iterations);
  let data: unknown;
  try {
    const bytes = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: decode(envelope.iv) },
      key,
      decode(envelope.ciphertext),
    );
    data = JSON.parse(dec.decode(bytes));
  } catch {
    throw new Error("Contraseña incorrecta o datos cifrados dañados.");
  }
  validateData(data);
  return { key, data };
}

export async function vaultExists(): Promise<boolean> {
  return Boolean(await (await database).get("encrypted", "main"));
}

export async function createVault(password: string, initialData: BackupData) {
  requireCrypto();
  if (password.length < 12) throw new Error("Utiliza al menos 12 caracteres para la contraseña.");
  validateData(initialData);
  const db = await database;
  if (await db.get("encrypted", "main")) throw new Error("Ya existe una caja cifrada en este navegador.");
  const salt = encode(crypto.getRandomValues(new Uint8Array(16)));
  const key = await derive(password, decode(salt), KDF_ITERATIONS);
  const data = structuredClone(initialData);
  const envelope = await seal(data, key, salt);
  await db.put("encrypted", envelope, "main");
  // Verify that the committed backup can actually be decrypted before migrating legacy data.
  await unseal(validateEnvelope(await db.get("encrypted", "main")), password);
  sessionGeneration++;
  session = { key, data, envelope };
}

export async function unlockVault(password: string) {
  await pending;
  const raw = await (await database).get("encrypted", "main");
  if (!raw) throw new Error("No existe una caja cifrada todavía.");
  const envelope = validateEnvelope(raw);
  const result = await unseal(envelope, password);
  sessionGeneration++;
  session = { ...result, envelope };
}

export function lockVault() {
  sessionGeneration++;
  session = null;
}

export function readVaultData(): BackupData {
  if (!session) throw new Error("La caja cifrada está bloqueada.");
  return structuredClone(session.data);
}

/** Serialize changes so concurrent writes cannot overwrite each other. */
export function updateVaultData(change: (data: BackupData) => void): Promise<void> {
  const operation = pending.then(async () => {
    const generation = sessionGeneration;
    const current = session;
    if (!current) throw new Error("La caja cifrada está bloqueada.");
    const next = structuredClone(current.data);
    change(next);
    validateData(next);
    const envelope = await seal(next, current.key, current.envelope.salt);
    await (await database).put("encrypted", envelope, "main");
    if (generation === sessionGeneration) session = { ...current, data: next, envelope };
  });
  pending = operation.catch(() => undefined);
  return operation;
}

export async function exportEncryptedBackup(): Promise<string> {
  if (!session) throw new Error("La caja cifrada está bloqueada.");
  await pending;
  const envelope = validateEnvelope(await (await database).get("encrypted", "main"));
  return JSON.stringify(envelope, null, 2);
}

/** Never replace the current vault until the imported file has decrypted successfully. */
export async function restoreEncryptedBackup(raw: string, password: string): Promise<void> {
  await pending;
  const envelope = validateEnvelope(JSON.parse(raw));
  const restored = await unseal(envelope, password);
  await (await database).put("encrypted", envelope, "main");
  sessionGeneration++;
  session = { ...restored, envelope };
}
