export type AccountType =
  "checking" | "savings" | "credit" | "mortgage" | "loan" | "cash" | "paypal";
export type TxType = "income" | "expense" | "transfer";

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  institution?: string;
  openingBalance: number;
  creditLimit?: number;
  interestRate?: number;
  monthlyPayment?: number;
  outstandingBalance?: number;
  reconciledBalance?: number;
  reconciledDate?: string;
  linkedAccountId?: string;
  billingDay?: number;
  active: boolean;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  type: TxType;
  parent?: string;
  /** Nivel superior de la clasificación (p. ej. Necesidades básicas). */
  family?: string;
  /** Grupo dentro de la familia (p. ej. Alimentación). */
  category?: string;
  keywords: string[];
  essential: boolean;
  excludedFromAdvice?: boolean;
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: TxType;
  categoryId: string;
  accountId: string;
  notes?: string;
  source: "manual" | "pdf" | "csv" | "backup";
  sourceFile?: string;
  merchant?: string;
  cardAccountId?: string;
  statementMonth?: string;
  installmentEnabled?: boolean;
  installmentNumber?: number;
  installmentCount?: number;
  installmentPrincipal?: number;
  installmentInterest?: number;
  fundingAccountId?: string;
  transferAccountId?: string;
  transferPairId?: string;
  reviewed: boolean;
  excluded: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ImportCandidate {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: TxType;
  categoryId: string;
  accountId: string;
  confidence: number;
  duplicate: boolean;
  selected: boolean;
}

export interface AppSettings {
  monthlySavingsTarget: number;
  emergencyMonthsTarget: number;
  warningDebtRatio: number;
}

export interface BackupData {
  version: 1;
  exportedAt: string;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  settings: AppSettings;
}
