import type { Account, AppSettings, BackupData, Category, Transaction } from "../types";
import { defaultAccounts, defaultCategories, defaultSettings } from "./defaults";
import { readVaultData, updateVaultData } from "./secure-vault";

/** This application never opens, modifies or deletes the old app's IndexedDB. */
export function getInitialData(): BackupData {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    accounts: structuredClone(defaultAccounts),
    categories: structuredClone(defaultCategories),
    transactions: [],
    settings: structuredClone(defaultSettings),
  };
}

export async function seedIfNeeded() {
  const data = readVaultData();
  if (data.accounts.length > 0 && data.categories.length > 0) return;
  await updateVaultData((current) => {
    if (current.accounts.length === 0) current.accounts = structuredClone(defaultAccounts);
    if (current.categories.length === 0) current.categories = structuredClone(defaultCategories);
  });
}

export async function getAllData() {
  const { accounts, categories, transactions, settings } = readVaultData();
  return { accounts, categories, transactions, settings };
}

export async function saveAccount(account: Account) {
  await updateVaultData((data) => {
    const index = data.accounts.findIndex((a) => a.id === account.id);
    if (index === -1) data.accounts.push(account);
    else data.accounts[index] = account;
  });
}

export async function deleteAccount(id: string) {
  await updateVaultData((data) => {
    if (data.transactions.some((t) => t.accountId === id || t.transferAccountId === id))
      throw new Error("Esta cuenta tiene movimientos asociados. No se puede borrar sin revisar el histórico.");
    data.accounts = data.accounts.filter((a) => a.id !== id);
  });
}

export async function saveCategory(category: Category) {
  await updateVaultData((data) => {
    const index = data.categories.findIndex((c) => c.id === category.id);
    if (index === -1) data.categories.push(category);
    else data.categories[index] = category;
  });
}

export async function deleteCategory(id: string) {
  await updateVaultData((data) => {
    if (data.transactions.some((t) => t.categoryId === id))
      throw new Error("La categoría está siendo utilizada por movimientos.");
    data.categories = data.categories.filter((c) => c.id !== id);
  });
}

export async function saveTransaction(txn: Transaction) {
  await updateVaultData((data) => {
    const index = data.transactions.findIndex((t) => t.id === txn.id);
    if (index < 0) data.transactions.push(txn);
    else data.transactions[index] = txn;
  });
}

const norm = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();

export async function saveTransactionEntry(txn: Transaction) {
  await updateVaultData((data) => {
    const existing = data.transactions.find((row) => row.id === txn.id);
    const effectiveAmount =
      txn.type === "transfer" && txn.transferAccountId ? -Math.abs(txn.amount) : txn.amount;
    const duplicate = data.transactions.some((row) =>
      row.id !== txn.id &&
      row.id !== existing?.transferPairId &&
      row.accountId === txn.accountId &&
      row.date === txn.date &&
      Math.abs(row.amount - effectiveAmount) < 0.005 &&
      norm(row.description) === norm(txn.description),
    );
    if (duplicate) throw new Error("Ya existe un movimiento igual en esta cuenta y fecha.");
    const updated = data.transactions.filter((row) =>
      row.id !== txn.id && row.id !== existing?.transferPairId,
    );
    if (txn.type === "transfer" && txn.transferAccountId) {
      if (txn.transferAccountId === txn.accountId)
        throw new Error("La cuenta de destino debe ser diferente de la de origen.");
      const pairId = existing?.transferPairId || txn.transferPairId || crypto.randomUUID();
      const time = new Date().toISOString();
      updated.push({
        ...txn,
        amount: -Math.abs(txn.amount),
        categoryId: "transfer",
        transferPairId: pairId,
        updatedAt: time,
      });
      updated.push({
        ...txn,
        id: pairId,
        accountId: txn.transferAccountId,
        transferAccountId: txn.accountId,
        transferPairId: txn.id,
        amount: Math.abs(txn.amount),
        categoryId: "transfer",
        source: "manual",
        createdAt: existing?.createdAt || time,
        updatedAt: time,
      });
    } else {
      const clean = { ...txn };
      delete clean.transferPairId;
      updated.push(clean);
    }
    data.transactions = updated;
  });
}

export async function saveTransactions(txns: Transaction[]) {
  await updateVaultData((data) => {
    const ids = new Set(data.transactions.map((row) => row.id));
    for (const transaction of txns) {
      if (ids.has(transaction.id)) throw new Error("Identificador de movimiento duplicado.");
      ids.add(transaction.id);
      data.transactions.push(transaction);
    }
  });
}

export async function deleteTransaction(id: string) {
  await updateVaultData((data) => {
    const row = data.transactions.find((t) => t.id === id);
    const ids = new Set([id, ...(row?.transferPairId ? [row.transferPairId] : [])]);
    data.transactions = data.transactions.filter((t) => !ids.has(t.id));
  });
}

export async function deleteTransactions(ids: string[]) {
  await updateVaultData((data) => {
    const expanded = new Set(ids);
    for (const row of data.transactions) {
      if (expanded.has(row.id) && row.transferPairId) expanded.add(row.transferPairId);
    }
    data.transactions = data.transactions.filter((row) => !expanded.has(row.id));
  });
}

export async function deleteAccountTransactions(accountId: string) {
  await updateVaultData((data) => {
    const expanded = new Set(data.transactions.filter((t) => t.accountId === accountId).map((t) => t.id));
    for (const row of data.transactions) {
      if (expanded.has(row.id) && row.transferPairId) expanded.add(row.transferPairId);
    }
    data.transactions = data.transactions.filter((row) => !expanded.has(row.id));
  });
}

export async function saveSettings(settings: AppSettings) {
  await updateVaultData((data) => { data.settings = settings; });
}


/** Import old, UNENCRYPTED JSON only into an already unlocked encrypted vault. */
export async function importLegacyBackup(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("Copia antigua no válida.");
  const backup = value as Partial<BackupData>;
  if (
    backup.version !== 1 ||
    !Array.isArray(backup.accounts) ||
    !Array.isArray(backup.categories) ||
    !Array.isArray(backup.transactions) ||
    !backup.settings ||
    typeof backup.settings !== "object"
  ) throw new Error("La copia antigua no es compatible.");
  await updateVaultData((data) => {
    data.accounts = structuredClone(backup.accounts!);
    data.categories = structuredClone(backup.categories!);
    data.transactions = structuredClone(backup.transactions!);
    data.settings = structuredClone(backup.settings!);
  });
}
