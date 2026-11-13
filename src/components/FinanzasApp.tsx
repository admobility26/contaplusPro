import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  BookOpenCheck,
  CircleDollarSign,
  Download,
  FileSearch,
  Landmark,
  LockKeyhole,
  Menu,
  Pencil,
  Plus,
  ReceiptText,
  Settings,
  ShieldCheck,
  Trash2,
  Upload,
  WalletCards,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  Account,
  AccountType,
  AppSettings,
  Category,
  ImportCandidate,
  Transaction,
  TxType,
} from "../types";
import {
  deleteAccount,
  deleteAccountTransactions,
  deleteCategory,
  deleteTransaction,
  deleteTransactions,
  clearLegacyData,
  getAllData,
  readLegacyData,
  importLegacyBackup,
  saveAccount,
  saveCategory,
  saveSettings,
  saveTransactionEntry,
  saveTransactions,
  seedIfNeeded,
} from "../lib/db";
import {
  accountDebt,
  buildAdvice,
  euro,
  latestMonths,
  monthlyStats,
  pct,
  recurringExpenses,
} from "../lib/finance";
import { extractPdfText, parseBankTextDetailed, parseCsv } from "../lib/parser";
import { ocrPdf } from "../lib/ocr";
import { createVault, exportEncryptedBackup, lockVault, restoreEncryptedBackup, unlockVault, vaultExists } from "../lib/secure-vault";

const nav = [
  ["dashboard", "Resumen", BarChart3],
  ["transactions", "Movimientos", ReceiptText],
  ["import", "Importar", Upload],
  ["accounts", "Cuentas y deudas", Landmark],
  ["cards", "VISA y PayPal", WalletCards],
  ["categories", "Categorías", BookOpenCheck],
  ["audit", "Auditoría", ShieldCheck],
  ["advisor", "Asesor", CircleDollarSign],
  ["settings", "Ajustes", Settings],
] as const;

type View = (typeof nav)[number][0];
const now = new Date();
const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
const CHART_COLORS = [
  "#72a7ff",
  "#66d19e",
  "#f6c85f",
  "#ff7d8a",
  "#a78bfa",
  "#4fd1c5",
  "#f0883e",
  "#9aa8bf",
];
const uid = () => crypto.randomUUID();
const today = () => new Date().toISOString().slice(0, 10);

function realAccountBalance(account: Account, transactions: Transaction[]) {
  if (["credit", "mortgage", "loan"].includes(account.type) && account.outstandingBalance != null)
    return -Math.abs(account.outstandingBalance);
  if (account.reconciledBalance != null && account.reconciledDate) {
    return (
      account.reconciledBalance +
      transactions
        .filter(
          (transaction) =>
            transaction.accountId === account.id && transaction.date > account.reconciledDate!,
        )
        .reduce((sum, transaction) => sum + transaction.amount, 0)
    );
  }
  return (
    account.openingBalance +
    transactions
      .filter((transaction) => transaction.accountId === account.id)
      .reduce((sum, transaction) => sum + transaction.amount, 0)
  );
}

function runningAccountBalances(account: Account | undefined, transactions: Transaction[]) {
  const balances = new Map<string, number>();
  if (!account) return balances;
  let balance = account.openingBalance;
  [...transactions]
    .filter((transaction) => transaction.accountId === account.id)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
    .forEach((transaction) => {
      balance += transaction.amount;
      balances.set(transaction.id, balance);
    });
  return balances;
}

function App({ onLock }: { onLock: () => void }) {
  const [view, setView] = useState<View>("dashboard");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [settings, setSettingsState] = useState<AppSettings>({
    monthlySavingsTarget: 300,
    emergencyMonthsTarget: 6,
    warningDebtRatio: 0.35,
  });
  const [month, setMonth] = useState(currentMonth);
  const [ready, setReady] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const refresh = async () => {
    const d = await getAllData();
    setAccounts(d.accounts);
    setCategories(d.categories);
    setTransactions(
      d.transactions.sort((a: Transaction, b: Transaction) => b.date.localeCompare(a.date)),
    );
    setSettingsState(d.settings);
  };
  useEffect(() => {
    (async () => {
      await seedIfNeeded();
      await refresh();
      setReady(true);
    })();
  }, []);
  if (!ready) return <div className="loading">Abriendo tu contabilidad local…</div>;
  const active = nav.find((n) => n[0] === view)!;
  const Icon = active[2];
  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebar ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">CP</div>
          <div>
            <strong>ContaPlus Pro</strong>
            <span>Privado · en tu dispositivo</span>
          </div>
          <button className="icon-btn mobile-only" onClick={() => setSidebar(false)}>
            <X size={20} />
          </button>
        </div>
        <nav>
          {nav.map(([id, label, I]) => (
            <button
              key={id}
              className={view === id ? "active" : ""}
              onClick={() => {
                setView(id);
                setSidebar(false);
              }}
            >
              <I size={19} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="privacy-card">
          <ShieldCheck size={18} />
          <div>
            <b>Local-first</b>
            <small>Los extractos no se envían a ningún servidor.</small>
          </div>
        </div>
      </aside>
      <main className="main">
        <header>
          <button className="icon-btn mobile-only" onClick={() => setSidebar(true)}>
            <Menu />
          </button>
          <div className="page-title">
            <Icon size={22} />
            <div>
              <h1>{active[1]}</h1>
              <p>Control financiero doméstico y auditable</p>
            </div>
          </div>
          <MonthSelect value={month} onChange={setMonth} />
          <button type="button" className="icon-btn" title="Bloquear caja cifrada" aria-label="Bloquear caja cifrada" onClick={() => { lockVault(); onLock(); }}><LockKeyhole size={20} /></button>
        </header>
        <div className="content">
          {view === "dashboard" && (
            <Dashboard
              transactions={transactions}
              categories={categories}
              accounts={accounts}
              month={month}
              settings={settings}
            />
          )}
          {view === "transactions" && (
            <TransactionsPage
              transactions={transactions}
              categories={categories}
              accounts={accounts}
              refresh={refresh}
            />
          )}
          {view === "import" && (
            <ImportPage
              accounts={accounts}
              categories={categories}
              transactions={transactions}
              refresh={refresh}
            />
          )}
          {view === "accounts" && <AccountsPage accounts={accounts} refresh={refresh} />}
          {view === "cards" && <CardsPage accounts={accounts} transactions={transactions} />}
          {view === "categories" && (
            <CategoriesPage categories={categories} transactions={transactions} refresh={refresh} />
          )}
          {view === "audit" && (
            <AuditPage transactions={transactions} categories={categories} accounts={accounts} />
          )}
          {view === "advisor" && (
            <AdvisorPage
              transactions={transactions}
              categories={categories}
              accounts={accounts}
              month={month}
            />
          )}
          {view === "settings" && (
            <SettingsPage
              settings={settings}
              onSettings={async (s) => {
                await saveSettings(s);
                await refresh();
              }}
              refresh={refresh}
            />
          )}
        </div>
      </main>
    </div>
  );
}

function MonthSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      className="month-select"
      type="month"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function Dashboard({
  transactions,
  categories,
  accounts,
  month,
  settings,
}: {
  transactions: Transaction[];
  categories: Category[];
  accounts: Account[];
  month: string;
  settings: AppSettings;
}) {
  const s = monthlyStats(transactions, categories, month);
  const debt = accountDebt(accounts);
  const months = latestMonths(transactions, 6);
  const trend = months.map((m: string) => ({
    month: m.slice(5),
    Ingresos: monthlyStats(transactions, categories, m).income,
    Gastos: monthlyStats(transactions, categories, m).expenses,
  }));
  const debtRatio = s.income ? debt.monthly / s.income : 0;
  const expenseReport = s.byCategory.map((item) => {
    const detail = categories.find((category) => category.id === item.id);
    return {
      ...item,
      family: detail?.family || "Otros",
      category: detail?.category || detail?.parent || "General",
      essential: Boolean(detail?.essential),
      share: s.expenses ? item.value / s.expenses : 0,
    };
  });
  return (
    <>
      <div className="kpi-grid">
        <Kpi title="Ingresos" value={euro.format(s.income)} hint={month} />
        <Kpi
          title="Gastos"
          value={euro.format(s.expenses)}
          hint={`${s.byCategory.length} categorías`}
        />
        <Kpi
          title="Ahorro"
          value={euro.format(s.savings)}
          hint={`${pct.format(s.savingsRate)} de ingresos`}
          tone={s.savings >= 0 ? "good" : "bad"}
        />
        <Kpi
          title="Cuotas de deuda"
          value={euro.format(debt.monthly)}
          hint={`${pct.format(debtRatio)} de ingresos`}
          tone={debtRatio > settings.warningDebtRatio ? "bad" : "neutral"}
        />
      </div>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Informe completo de gastos por categoría</h2>
            <p>Desglose de {month}: familia, categoría, subcategoría, peso y necesidad.</p>
          </div>
        </div>
        {expenseReport.length ? (
          <>
            <div className="chart" style={{ height: Math.max(280, expenseReport.length * 38) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={expenseReport} layout="vertical" margin={{ left: 24, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tickFormatter={(value) => `${Math.round(Number(value))} €`} />
                  <YAxis type="category" dataKey="name" width={145} />
                  <Tooltip formatter={(value) => euro.format(Number(value))} />
                  <Bar dataKey="value" name="Gasto" fill="#72a7ff" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Familia</th><th>Categoría</th><th>Subcategoría</th><th>Tipo</th><th className="right">Importe</th><th className="right">% del gasto</th></tr></thead>
                <tbody>
                  {expenseReport.map((item) => (
                    <tr key={item.id}>
                      <td>{item.family}</td><td>{item.category}</td><td><b>{item.name}</b></td>
                      <td>{item.essential ? "Esencial" : "No esencial"}</td>
                      <td className="right money">{euro.format(item.value)}</td>
                      <td className="right">{pct.format(item.share)}</td>
                    </tr>
                  ))}
                  <tr><td colSpan={4}><b>Total del mes</b></td><td className="right money"><b>{euro.format(s.expenses)}</b></td><td className="right"><b>100 %</b></td></tr>
                </tbody>
              </table>
            </div>
          </>
        ) : <Empty text="Todavía no hay gastos en este mes." />}
      </section>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Saldos reales</h2>
            <p>Cuentas, VISA, PayPal, préstamos e hipotecas.</p>
          </div>
        </div>
        <div className="cards-list">
          {accounts
            .filter((account) => account.active)
            .map((account) => {
              const balance = realAccountBalance(account, transactions);
              return (
                <div className="account-card" key={account.id}>
                  <div className="account-icon">
                    <WalletCards />
                  </div>
                  <div className="grow">
                    <b>{account.name}</b>
                    <span>
                      {accountTypeName(account.type)}
                      {account.institution ? ` · ${account.institution}` : ""}
                    </span>
                  </div>
                  <div className="account-numbers">
                    <b className={balance < 0 ? "danger-text" : "positive"}>
                      {euro.format(balance)}
                    </b>
                    <span>
                      {["credit", "mortgage", "loan"].includes(account.type)
                        ? "pendiente"
                        : "saldo real"}
                    </span>
                  </div>
                </div>
              );
            })}
        </div>
      </section>
      <div className="grid-2">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Ingresos vs. gastos</h2>
              <p>Últimos meses con movimientos</p>
            </div>
          </div>
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" />
                <YAxis width={64} />
                <Tooltip formatter={(v: any) => euro.format(Number(v))} />
                <Bar dataKey="Ingresos" fill="#66d19e" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Gastos" fill="#ff7d8a" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Gastos por categoría</h2>
              <p>{month}</p>
            </div>
          </div>
          {s.byCategory.length ? (
            <div className="category-layout">
              <div className="donut">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={s.byCategory.slice(0, 8)}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={52}
                      outerRadius={80}
                    >
                      {s.byCategory.slice(0, 8).map((_: unknown, i: number) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]!} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => euro.format(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="category-list">
                {s.byCategory.slice(0, 7).map((x: { id: string; name: string; value: number }) => (
                  <div key={x.id}>
                    <span>{x.name}</span>
                    <b>{euro.format(x.value)}</b>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <Empty text="Todavía no hay gastos en este mes." />
          )}
        </section>
      </div>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Lectura rápida</h2>
            <p>Indicadores calculados con tus datos, no por una IA.</p>
          </div>
        </div>
        <div className="insights">
          <Insight
            ok={s.savingsRate >= 0.1}
            text={
              s.income
                ? `Tasa de ahorro ${pct.format(s.savingsRate)}. Objetivo habitual configurable: prioriza mantener margen mensual positivo.`
                : "Importa movimientos para calcular tu capacidad de ahorro."
            }
          />
          <Insight
            ok={debtRatio <= settings.warningDebtRatio}
            text={`Carga mensual de deuda: ${pct.format(debtRatio)}. Umbral de aviso configurado: ${pct.format(settings.warningDebtRatio)}.`}
          />
          <Insight
            ok={s.savings >= settings.monthlySavingsTarget}
            text={`Ahorro del mes: ${euro.format(s.savings)} frente a objetivo ${euro.format(settings.monthlySavingsTarget)}.`}
          />
        </div>
      </section>
    </>
  );
}

function Kpi({
  title,
  value,
  hint,
  tone = "neutral",
}: {
  title: string;
  value: string;
  hint: string;
  tone?: string;
}) {
  return (
    <div className={`kpi ${tone}`}>
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}
function Insight({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div className="insight">
      <span className={ok ? "dot ok" : "dot warn"}></span>
      {text}
    </div>
  );
}

function TransactionsPage({
  transactions,
  categories,
  accounts,
  refresh,
}: {
  transactions: Transaction[];
  categories: Category[];
  accounts: Account[];
  refresh: () => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [type, setType] = useState<"all" | TxType>("all");
  const [edit, setEdit] = useState<Transaction | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [accountId, setAccountId] = useState(
    accounts.find((a) => a.active)?.id || accounts[0]?.id || "",
  );
  const accountMonths = useMemo(
    () =>
      [
        ...new Set(
          transactions.filter((t) => t.accountId === accountId).map((t) => t.date.slice(0, 7)),
        ),
      ]
        .sort()
        .reverse(),
    [accountId, transactions],
  );
  const [selectedMonth, setSelectedMonth] = useState(
    transactions
      .filter((t) => t.accountId === (accounts.find((a) => a.active)?.id || accounts[0]?.id))
      .map((t) => t.date.slice(0, 7))
      .sort()
      .at(-1) || currentMonth,
  );
  useEffect(() => {
    if (!accountMonths.includes(selectedMonth)) setSelectedMonth(accountMonths[0] || currentMonth);
  }, [accountId, accountMonths, selectedMonth]);
  useEffect(() => setSelectedIds(new Set()), [accountId, selectedMonth]);
  const monthTransactions = transactions.filter(
    (t) => t.accountId === accountId && t.date.startsWith(selectedMonth),
  );
  const filtered = monthTransactions.filter(
    (t) =>
      (type === "all" || t.type === type) &&
      `${t.description} ${t.notes || ""}`.toLowerCase().includes(search.toLowerCase()),
  );
  const monthIncome = monthTransactions
    .filter((t) => t.type === "income" && !t.excluded)
    .reduce((sum, t) => sum + t.amount, 0);
  const monthExpenses = Math.abs(
    monthTransactions
      .filter((t) => t.type === "expense" && !t.excluded)
      .reduce((sum, t) => sum + t.amount, 0),
  );
  const selectedAccount = accounts.find((a) => a.id === accountId);
  const currentBalance = selectedAccount ? realAccountBalance(selectedAccount, transactions) : 0;
  const balancesAfterMovement = useMemo(
    () => runningAccountBalances(selectedAccount, transactions),
    [selectedAccount, transactions],
  );
  const remove = async (t: Transaction) => {
    if (confirm(`¿Eliminar "${t.description}"?`)) {
      await deleteTransaction(t.id);
      await refresh();
    }
  };
  const removeSelected = async () => {
    const ids = [...selectedIds];
    if (!ids.length || !confirm(`¿Eliminar los ${ids.length} movimientos seleccionados?`)) return;
    await deleteTransactions(ids);
    setSelectedIds(new Set());
    await refresh();
  };
  const removeAll = async () => {
    const count = transactions.filter((t) => t.accountId === accountId).length;
    if (
      !count ||
      !confirm(
        `¿Eliminar TODOS los ${count} movimientos de "${selectedAccount?.name || "esta cuenta"}"? Esta acción no se puede deshacer.`,
      )
    )
      return;
    await deleteAccountTransactions(accountId);
    setSelectedIds(new Set());
    await refresh();
  };
  const allVisibleSelected = filtered.length > 0 && filtered.every((t) => selectedIds.has(t.id));
  return (
    <>
      <div className="kpi-grid">
        <Kpi
          title="Saldo actual"
          value={euro.format(currentBalance)}
          hint={selectedAccount?.name || "Sin cuenta"}
          tone={currentBalance >= 0 ? "good" : "bad"}
        />
        <Kpi
          title="Ingresos del mes"
          value={euro.format(monthIncome)}
          hint={selectedMonth}
          tone="good"
        />
        <Kpi title="Gastos del mes" value={euro.format(monthExpenses)} hint={selectedMonth} />
        <Kpi
          title="Resultado"
          value={euro.format(monthIncome - monthExpenses)}
          hint={`${monthTransactions.length} movimientos`}
          tone={monthIncome - monthExpenses >= 0 ? "good" : "bad"}
        />
      </div>
      <section className="panel">
        <div className="toolbar">
          <select
            aria-label="Cuenta"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {accounts
              .filter((a) => a.active)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
          <select
            aria-label="Mes"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
          >
            {accountMonths.length ? (
              accountMonths.map((month) => (
                <option key={month} value={month}>
                  {month}
                </option>
              ))
            ) : (
              <option value={selectedMonth}>{selectedMonth}</option>
            )}
          </select>
          <input
            placeholder="Buscar concepto o nota…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={type} onChange={(e) => setType(e.target.value as any)}>
            <option value="all">Todos</option>
            <option value="income">Ingresos</option>
            <option value="expense">Gastos</option>
            <option value="transfer">Transferencias</option>
          </select>
          <button
            className="primary"
            onClick={() =>
              setEdit(blankTransaction(accounts, categories, accountId, selectedMonth))
            }
          >
            <Plus size={17} />
            Nuevo movimiento
          </button>
          <button disabled={!selectedIds.size} onClick={removeSelected}>
            <Trash2 size={17} />
            Eliminar seleccionados ({selectedIds.size})
          </button>
          <button
            className="danger"
            disabled={!transactions.some((t) => t.accountId === accountId)}
            onClick={removeAll}
          >
            <Trash2 size={17} />
            Borrar todos de esta cuenta
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="Seleccionar movimientos visibles"
                    checked={allVisibleSelected}
                    onChange={(e) =>
                      setSelectedIds((current) => {
                        const next = new Set(current);
                        for (const transaction of filtered) {
                          if (e.target.checked) next.add(transaction.id);
                          else next.delete(transaction.id);
                        }
                        return next;
                      })
                    }
                  />
                </th>
                <th>Fecha</th>
                <th>Concepto</th>
                <th>Categoría</th>
                <th>Tipo</th>
                <th className="right">Importe</th>
                <th className="right">Saldo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className={t.excluded ? "muted-row" : ""}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Seleccionar ${t.description}`}
                      checked={selectedIds.has(t.id)}
                      onChange={(e) =>
                        setSelectedIds((current) => {
                          const next = new Set(current);
                          if (e.target.checked) next.add(t.id);
                          else next.delete(t.id);
                          return next;
                        })
                      }
                    />
                  </td>
                  <td>{formatDate(t.date)}</td>
                  <td>
                    <b>{t.description}</b>
                    {t.notes && <small className="block">{t.notes}</small>}
                  </td>
                  <td>{categories.find((c) => c.id === t.categoryId)?.name || "Sin categoría"}</td>
                  <td>
                    <Tag type={t.type} />
                  </td>
                  <td className={`right money ${t.amount >= 0 ? "positive" : ""}`}>
                    {euro.format(t.amount)}
                  </td>
                  <td
                    className={`right money ${(balancesAfterMovement.get(t.id) || 0) >= 0 ? "positive" : "danger-text"}`}
                  >
                    {euro.format(balancesAfterMovement.get(t.id) || 0)}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="icon-btn" title="Editar" onClick={() => setEdit(t)}>
                        <Pencil size={16} />
                      </button>
                      <button
                        className="icon-btn danger"
                        title="Eliminar"
                        onClick={() => remove(t)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length && <Empty text="No hay movimientos con estos filtros." />}
      </section>
      {edit && (
        <TransactionModal
          value={edit}
          accounts={accounts}
          categories={categories}
          onClose={() => setEdit(null)}
          onSave={async (t) => {
            try {
              await saveTransactionEntry(t);
              setEdit(null);
              await refresh();
            } catch (error: unknown) {
              alert(error instanceof Error ? error.message : "No se pudo guardar el movimiento.");
            }
          }}
        />
      )}
    </>
  );
}
function blankTransaction(
  accounts: Account[],
  categories: Category[],
  accountId?: string,
  month?: string,
): Transaction {
  return {
    id: uid(),
    date: month && month !== currentMonth ? `${month}-01` : today(),
    description: "",
    amount: 0,
    type: "expense",
    categoryId: categories.find((c) => c.type === "expense")?.id || "",
    accountId: accountId || accounts[0]?.id || "",
    source: "manual",
    reviewed: true,
    excluded: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
function Tag({ type }: { type: TxType }) {
  return (
    <span className={`tag ${type}`}>
      {type === "income" ? "Ingreso" : type === "expense" ? "Gasto" : "Transferencia"}
    </span>
  );
}

function CategoryOptions({ categories }: { categories: Category[] }) {
  const groups = new Map<string, Category[]>();
  for (const item of [...categories].sort((a, b) =>
    `${a.family || "Otros"}|${a.category || a.parent || "General"}|${a.name}`.localeCompare(
      `${b.family || "Otros"}|${b.category || b.parent || "General"}|${b.name}`,
      "es",
    ),
  )) {
    const key = `${item.family || "Otros"} · ${item.category || item.parent || "General"}`;
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  return (
    <>
      {[...groups].map(([label, items]) => (
        <optgroup label={label} key={label}>
          {items.map((item) => (
            <option value={item.id} key={item.id}>
              {item.name}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

function TransactionModal({
  value,
  accounts,
  categories,
  onClose,
  onSave,
}: {
  value: Transaction;
  accounts: Account[];
  categories: Category[];
  onClose: () => void;
  onSave: (v: Transaction) => void;
}) {
  const [v, setV] = useState(value);
  const cats = categories.filter(
    (c) => c.type === v.type || (v.type === "transfer" && c.type === "transfer"),
  );
  const selectedAccount = accounts.find((a) => a.id === v.accountId);
  const isCard = selectedAccount?.type === "credit";
  const isPayPal = selectedAccount?.type === "paypal";
  const isCardSettlement = v.categoryId === "exp-card" || Boolean(v.cardAccountId);
  const set = (k: keyof Transaction, val: any) =>
    setV((x) => ({ ...x, [k]: val, updatedAt: new Date().toISOString() }));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!v.description.trim()) return;
    const principal = Math.abs(v.installmentPrincipal || 0);
    const interest = Math.abs(v.installmentInterest || 0);
    onSave(
      v.installmentEnabled
        ? { ...v, amount: v.type === "income" ? principal + interest : -(principal + interest) }
        : v,
    );
  };
  return (
    <div className="modal-back">
      <form className="modal" onSubmit={submit}>
        <div className="modal-head">
          <h2>Editar movimiento</h2>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="form-grid">
          <label>
            Fecha
            <input
              type="date"
              value={v.date}
              onChange={(e) => set("date", e.target.value)}
              required
            />
          </label>
          <label>
            Tipo
            <select
              value={v.type}
              onChange={(e) => {
                const t = e.target.value as TxType;
                setV((x) => {
                  const next = {
                    ...x,
                    type: t,
                    categoryId: categories.find((c) => c.type === t)?.id || x.categoryId,
                    amount:
                      t === "expense"
                        ? -Math.abs(x.amount)
                        : t === "income"
                          ? Math.abs(x.amount)
                          : x.amount,
                  };
                  if (t !== "transfer") delete next.transferAccountId;
                  return next;
                });
              }}
            >
              <option value="expense">Gasto</option>
              <option value="income">Ingreso</option>
              <option value="transfer">Transferencia</option>
            </select>
          </label>
          <label className="span-2">
            Concepto
            <input
              value={v.description}
              onChange={(e) => set("description", e.target.value)}
              required
            />
          </label>
          <label>
            Importe (€)
            <input
              type="number"
              step="0.01"
              value={v.amount}
              disabled={v.installmentEnabled}
              onChange={(e) => set("amount", Number(e.target.value))}
            />
          </label>
          <label>
            Cuenta
            <select
              value={v.accountId}
              onChange={(e) =>
                setV((x) => {
                  const next = { ...x, accountId: e.target.value };
                  delete next.fundingAccountId;
                  delete next.cardAccountId;
                  if (next.transferAccountId === e.target.value) delete next.transferAccountId;
                  return next;
                })
              }
            >
              {accounts.map((a) => (
                <option value={a.id} key={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          {v.type === "transfer" && (
            <label>
              Cuenta destino
              <select
                value={v.transferAccountId || ""}
                onChange={(e) => set("transferAccountId", e.target.value)}
                required
              >
                <option value="">Selecciona destino</option>
                {accounts
                  .filter((a) => a.active && a.id !== v.accountId)
                  .map((a) => (
                    <option value={a.id} key={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label>
            Categoría
            <select value={v.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
              <CategoryOptions categories={cats} />
            </select>
          </label>
          <label>
            Revisado
            <select
              value={v.reviewed ? "1" : "0"}
              onChange={(e) => set("reviewed", e.target.value === "1")}
            >
              <option value="1">Sí</option>
              <option value="0">Pendiente</option>
            </select>
          </label>
          {isCard && (
            <>
              <label>
                Mes de liquidación
                <input
                  type="month"
                  value={v.statementMonth || v.date.slice(0, 7)}
                  onChange={(e) => set("statementMonth", e.target.value)}
                />
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={Boolean(v.installmentEnabled)}
                  onChange={(e) => set("installmentEnabled", e.target.checked)}
                />
                Compra aplazada
              </label>
              {v.installmentEnabled && (
                <>
                  <label>
                    Cuota actual
                    <input
                      type="number"
                      min="1"
                      value={v.installmentNumber || 1}
                      onChange={(e) => set("installmentNumber", Number(e.target.value))}
                    />
                  </label>
                  <label>
                    Total cuotas
                    <input
                      type="number"
                      min="1"
                      value={v.installmentCount || 1}
                      onChange={(e) => set("installmentCount", Number(e.target.value))}
                    />
                  </label>
                  <label>
                    Principal de esta cuota
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={v.installmentPrincipal || 0}
                      onChange={(e) => set("installmentPrincipal", Number(e.target.value))}
                    />
                  </label>
                  <label>
                    Interés de esta cuota
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={v.installmentInterest || 0}
                      onChange={(e) => set("installmentInterest", Number(e.target.value))}
                    />
                  </label>
                </>
              )}
            </>
          )}
          {isCardSettlement && (
            <>
              <label>
                VISA liquidada
                <select
                  value={v.cardAccountId || ""}
                  onChange={(e) => set("cardAccountId", e.target.value || undefined)}
                >
                  <option value="">Sin asociar</option>
                  {accounts
                    .filter((a) => a.type === "credit")
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </select>
              </label>
              {!isCard && (
                <label>
                  Mes del recibo VISA
                  <input
                    type="month"
                    value={v.statementMonth || previousStatementMonth(v.date, 1)}
                    onChange={(e) => set("statementMonth", e.target.value)}
                  />
                </label>
              )}
            </>
          )}
          {isPayPal && (
            <label>
              Pagado desde
              <select
                value={v.fundingAccountId || selectedAccount?.linkedAccountId || ""}
                onChange={(e) => set("fundingAccountId", e.target.value || undefined)}
              >
                <option value="">Sin asociar</option>
                {accounts
                  .filter((a) => a.id !== v.accountId && a.type !== "paypal")
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label className="span-2">
            Notas
            <textarea
              rows={3}
              value={v.notes || ""}
              onChange={(e) => set("notes", e.target.value)}
            />
          </label>
          <label className="check span-2">
            <input
              type="checkbox"
              checked={v.excluded}
              onChange={(e) => set("excluded", e.target.checked)}
            />
            Excluir de análisis y asesor
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary" type="submit">
            Guardar cambios
          </button>
        </div>
      </form>
    </div>
  );
}

function ImportPage({
  accounts,
  categories,
  transactions,
  refresh,
}: {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  refresh: () => Promise<void>;
}) {
  const [accountId, setAccountId] = useState(accounts[0]?.id || "");
  const [candidates, setCandidates] = useState<ImportCandidate[]>([]);
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastPdf, setLastPdf] = useState<File | null>(null);
  const handle = async (file: File) => {
    setBusy(true);
    setStatus("Leyendo archivo localmente…");
    setFileName(file.name);
    setLastPdf(file.name.toLowerCase().endsWith(".pdf") ? file : null);
    try {
      let rows: ImportCandidate[] = [];
      if (file.name.toLowerCase().endsWith(".pdf")) {
        const extracted = await extractPdfText(file);
        const parsed = parseBankTextDetailed(extracted.text, accountId, categories, transactions);
        rows = parsed.candidates;
        setStatus(
          rows.length
            ? `${parsed.bank}: ${rows.length} movimientos detectados en ${extracted.numPages} páginas.`
            : `${parsed.bank}: no se detectaron movimientos. Prueba el OCR local.`,
        );
      } else if (/\.csv$/i.test(file.name)) {
        rows = await parseCsv(file, accountId, categories, transactions);
        setStatus(`CSV analizado: ${rows.length} candidatos.`);
      } else throw new Error("Formato no compatible. Usa PDF o CSV.");
      setCandidates(rows);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "";
      setStatus(
        /password/i.test(message)
          ? "El PDF está protegido con contraseña. Guarda una copia sin contraseña e inténtalo de nuevo."
          : "No se pudo leer la estructura del PDF. Prueba el OCR local o utiliza el CSV del banco.",
      );
    } finally {
      setBusy(false);
    }
  };
  const runOcr = async () => {
    if (!lastPdf) return;
    setBusy(true);
    try {
      setStatus("Iniciando OCR 100% local…");
      const text = await ocrPdf(lastPdf, (p: number, msg: string) =>
        setStatus(`${msg} · ${Math.round(p * 100)}%`),
      );
      const parsed = parseBankTextDetailed(text, accountId, categories, transactions);
      setCandidates(parsed.candidates);
      setStatus(
        parsed.candidates.length
          ? `${parsed.bank}: OCR completado con ${parsed.candidates.length} movimientos. Revísalos antes de guardar.`
          : "OCR completado, pero no se pudieron estructurar movimientos. Prueba el CSV del banco.",
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "error desconocido";
      setStatus(`OCR no disponible: ${message}`);
    } finally {
      setBusy(false);
    }
  };
  const update = (id: string, patch: Partial<ImportCandidate>) =>
    setCandidates((c) => c.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const save = async () => {
    const selected = candidates.filter((c) => c.selected && !c.duplicate);
    const time = new Date().toISOString();
    try {
      await saveTransactions(
      selected.map((c) => ({
        id: uid(),
        date: c.date,
        description: c.description,
        amount: c.amount,
        type: c.type,
        categoryId: c.categoryId,
        accountId: c.accountId,
        source: fileName.endsWith(".pdf") ? "pdf" : "csv",
        sourceFile: fileName,
        reviewed: c.confidence >= 0.8,
        excluded: false,
        createdAt: time,
        updatedAt: time,
      })),
    );
      setCandidates([]);
      setStatus(`${selected.length} movimientos guardados.`);
      await refresh();
    } catch (error) { setStatus(error instanceof Error ? error.message : "No se pudieron guardar los movimientos."); }
  };
  return (
    <>
      <section className="panel">
        <div className="import-hero">
          <FileSearch size={36} />
          <div>
            <h2>Importa extractos sin subirlos</h2>
            <p>
              PDF con texto o CSV. Primero se muestra una revisión editable; nada se guarda hasta
              que tú confirmas.
            </p>
          </div>
        </div>
        <div className="import-controls">
          <label>
            Cuenta destino
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className={`file-drop ${busy ? "disabled" : ""}`}>
            <Upload size={20} />
            <span>{busy ? "Procesando…" : "Seleccionar PDF o CSV"}</span>
            <input
              type="file"
              accept=".pdf,.csv,application/pdf,text/csv"
              disabled={busy}
              onChange={(e) => e.target.files?.[0] && handle(e.target.files[0])}
            />
          </label>
          {lastPdf && (
            <button className="ocr-button" disabled={busy} onClick={runOcr}>
              <FileSearch size={18} />
              {busy
                ? "Procesando OCR…"
                : candidates.length
                  ? "Repetir con OCR mejorado"
                  : "Probar OCR local"}
            </button>
          )}
        </div>
        {status && <div className="notice">{status}</div>}
      </section>
      {candidates.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Revisión antes de guardar</h2>
              <p>Edita cualquier dato. Los duplicados se desmarcan automáticamente.</p>
            </div>
            <button className="primary" onClick={save}>
              Guardar seleccionados ({candidates.filter((c) => c.selected && !c.duplicate).length})
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>✓</th>
                  <th>Fecha</th>
                  <th>Concepto</th>
                  <th>Categoría</th>
                  <th className="right">Importe</th>
                  <th>Conf.</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => (
                  <tr key={c.id} className={c.duplicate ? "duplicate" : ""}>
                    <td>
                      <input
                        type="checkbox"
                        checked={c.selected}
                        disabled={c.duplicate}
                        onChange={(e) => update(c.id, { selected: e.target.checked })}
                      />
                    </td>
                    <td>
                      <input
                        className="cell-input"
                        type="date"
                        value={c.date}
                        onChange={(e) => update(c.id, { date: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="cell-input wide"
                        value={c.description}
                        onChange={(e) => update(c.id, { description: e.target.value })}
                      />
                      {c.duplicate && (
                        <small className="block danger-text">Posible duplicado</small>
                      )}
                    </td>
                    <td>
                      <select
                        className="cell-input"
                        value={c.categoryId}
                        onChange={(e) => {
                          const cat = categories.find((x) => x.id === e.target.value);
                          update(c.id, { categoryId: e.target.value, type: cat?.type || c.type });
                        }}
                      >
                        <CategoryOptions
                          categories={categories.filter(
                            (x) => x.type === c.type || x.type === "transfer",
                          )}
                        />
                      </select>
                    </td>
                    <td>
                      <input
                        className="cell-input amount"
                        type="number"
                        step="0.01"
                        value={c.amount}
                        onChange={(e) => update(c.id, { amount: Number(e.target.value) })}
                      />
                    </td>
                    <td>{Math.round(c.confidence * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

function CardsPage({
  accounts,
  transactions,
}: {
  accounts: Account[];
  transactions: Transaction[];
}) {
  const cards = accounts.filter((a) => a.type === "credit");
  const paypal = accounts.filter((a) => a.type === "paypal");
  const checks = buildCardChecks(accounts, transactions);
  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>VISA y formas de pago</h2>
            <p>Asocia cada tarjeta o PayPal con la cuenta donde se realiza el cargo.</p>
          </div>
        </div>
        <div className="cards-list">
          {[...cards, ...paypal].map((a) => (
            <div className="account-card" key={a.id}>
              <div className="account-icon">
                <WalletCards />
              </div>
              <div className="grow">
                <b>{a.name}</b>
                <span>
                  {accountTypeName(a.type)} ·{" "}
                  {a.linkedAccountId
                    ? `cargo en ${accounts.find((x) => x.id === a.linkedAccountId)?.name || "cuenta asociada"}`
                    : "sin cuenta asociada"}
                  {a.type === "credit" ? ` · día ${a.billingDay || 1}` : ""}
                </span>
              </div>
            </div>
          ))}
        </div>
        {cards.length + paypal.length === 0 && (
          <Empty text="Crea una cuenta de tipo VISA o PayPal para empezar." />
        )}
      </section>
      {checks.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Conciliación mensual de VISA</h2>
              <p>
                El esperado suma compras, cuotas fraccionadas e intereses; debe coincidir con el
                recibo.
              </p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>VISA</th>
                  <th>Mes</th>
                  <th>Mov.</th>
                  <th className="right">Principal</th>
                  <th className="right">Intereses</th>
                  <th className="right">Esperado</th>
                  <th className="right">Recibo</th>
                  <th className="right">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {checks.map((r) => (
                  <tr key={`${r.card.id}-${r.month}`}>
                    <td>
                      <b>{r.card.name}</b>
                    </td>
                    <td>{r.month}</td>
                    <td>{r.purchases}</td>
                    <td className="right">{euro.format(r.principal)}</td>
                    <td className="right">{euro.format(r.interest)}</td>
                    <td className="right">{euro.format(r.expected)}</td>
                    <td className="right">{euro.format(r.charged)}</td>
                    <td
                      className={`right money ${Math.abs(r.diff) > 0.01 ? "danger-text" : "positive"}`}
                    >
                      {euro.format(r.diff)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

function buildCardChecks(accounts: Account[], transactions: Transaction[]) {
  return accounts
    .filter((a) => a.type === "credit")
    .flatMap((card) => {
      const purchases = transactions.filter(
        (t) => t.accountId === card.id && t.type !== "transfer" && !t.excluded,
      );
      const months = [...new Set(purchases.map((t) => t.statementMonth || t.date.slice(0, 7)))]
        .sort()
        .reverse();
      return months.map((month) => {
        const rows = purchases.filter((t) => (t.statementMonth || t.date.slice(0, 7)) === month);
        const principal = rows.reduce(
          (sum, t) => sum + Math.abs(t.installmentEnabled ? t.installmentPrincipal || 0 : t.amount),
          0,
        );
        const interest = rows.reduce((sum, t) => sum + Math.abs(t.installmentInterest || 0), 0);
        const expected = principal + interest;
        const settlements = transactions.filter(
          (t) =>
            t.cardAccountId === card.id &&
            (t.statementMonth || previousStatementMonth(t.date, card.billingDay || 1)) === month,
        );
        const charged = Math.abs(settlements.reduce((sum, t) => sum + t.amount, 0));
        return {
          card,
          month,
          purchases: rows.length,
          principal,
          interest,
          expected,
          charged,
          diff: charged - expected,
        };
      });
    });
}
function previousStatementMonth(date: string, billingDay: number) {
  const d = new Date(`${date}T12:00:00`);
  if (d.getDate() > Math.min(28, billingDay + 5)) return date.slice(0, 7);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function AccountsPage({
  accounts,
  refresh,
}: {
  accounts: Account[];
  refresh: () => Promise<void>;
}) {
  const [edit, setEdit] = useState<Account | null>(null);
  const debt = accountDebt(accounts);
  const remove = async (a: Account) => {
    if (confirm(`¿Eliminar la cuenta "${a.name}"? Los movimientos no se borrarán.`)) {
      try { await deleteAccount(a.id); await refresh(); } catch (error) { alert(error instanceof Error ? error.message : "No se pudo eliminar la cuenta."); }
    }
  };
  return (
    <>
      <div className="kpi-grid">
        <Kpi
          title="Deuda pendiente"
          value={euro.format(debt.outstanding)}
          hint="Hipotecas, créditos y tarjetas"
        />
        <Kpi
          title="Cuotas mensuales"
          value={euro.format(debt.monthly)}
          hint={`${debt.debts.length} deudas activas`}
        />
      </div>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Cuentas, tarjetas y financiación</h2>
            <p>La cuota y saldo pendiente alimentan el análisis de capacidad de pago.</p>
          </div>
          <button className="primary" onClick={() => setEdit(blankAccount())}>
            <Plus size={17} />
            Añadir
          </button>
        </div>
        <div className="cards-list">
          {accounts.map((a) => (
            <div className="account-card" key={a.id}>
              <div className="account-icon">
                <WalletCards />
              </div>
              <div className="grow">
                <b>{a.name}</b>
                <span>
                  {accountTypeName(a.type)}
                  {a.institution ? ` · ${a.institution}` : ""}
                  {a.linkedAccountId
                    ? ` · vinculada a ${accounts.find((x) => x.id === a.linkedAccountId)?.name || "cuenta"}`
                    : ""}
                </span>
              </div>
              {["credit", "mortgage", "loan"].includes(a.type) && (
                <div className="account-numbers">
                  <b>{euro.format(a.outstandingBalance || 0)}</b>
                  <span>{euro.format(a.monthlyPayment || 0)}/mes</span>
                </div>
              )}
              <button className="icon-btn" onClick={() => setEdit(a)}>
                <Pencil size={17} />
              </button>
              <button className="icon-btn danger" onClick={() => remove(a)}>
                <Trash2 size={17} />
              </button>
            </div>
          ))}
        </div>
      </section>
      {edit && (
        <AccountModal
          value={edit}
          accounts={accounts}
          onClose={() => setEdit(null)}
          onSave={async (a) => {
            await saveAccount(a);
            setEdit(null);
            await refresh();
          }}
        />
      )}
    </>
  );
}
function blankAccount(): Account {
  return {
    id: uid(),
    name: "",
    type: "checking",
    openingBalance: 0,
    active: true,
    createdAt: new Date().toISOString(),
  };
}
function accountTypeName(t: AccountType) {
  return (
    {
      checking: "Cuenta corriente",
      savings: "Ahorro",
      credit: "Tarjeta de crédito",
      mortgage: "Hipoteca",
      loan: "Préstamo personal",
      cash: "Efectivo",
      paypal: "PayPal",
    } as Record<AccountType, string>
  )[t];
}
function AccountModal({
  value,
  accounts,
  onClose,
  onSave,
}: {
  value: Account;
  accounts: Account[];
  onClose: () => void;
  onSave: (a: Account) => void;
}) {
  const [v, setV] = useState(value);
  const set = (k: keyof Account, val: any) => setV((x) => ({ ...x, [k]: val }));
  const debt = ["credit", "mortgage", "loan"].includes(v.type);
  const linkable = v.type === "credit" || v.type === "paypal";
  return (
    <div className="modal-back">
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault();
          if (v.name.trim()) onSave(v);
        }}
      >
        <div className="modal-head">
          <h2>Cuenta / financiación</h2>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="form-grid">
          <label>
            Nombre
            <input value={v.name} onChange={(e) => set("name", e.target.value)} required />
          </label>
          <label>
            Tipo
            <select value={v.type} onChange={(e) => set("type", e.target.value as AccountType)}>
              {(
                [
                  "checking",
                  "savings",
                  "credit",
                  "mortgage",
                  "loan",
                  "cash",
                  "paypal",
                ] as AccountType[]
              ).map((t) => (
                <option key={t} value={t}>
                  {accountTypeName(t)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Entidad
            <input
              value={v.institution || ""}
              onChange={(e) => set("institution", e.target.value)}
            />
          </label>
          <label>
            Saldo inicial
            <input
              type="number"
              step="0.01"
              value={v.openingBalance}
              onChange={(e) => set("openingBalance", Number(e.target.value))}
            />
          </label>
          {linkable && (
            <label>
              Cuenta o VISA asociada
              <select
                value={v.linkedAccountId || ""}
                onChange={(e) => set("linkedAccountId", e.target.value || undefined)}
              >
                <option value="">Sin asociar</option>
                {accounts
                  .filter((a) => a.id !== v.id && a.type !== "paypal")
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {v.type === "credit" && (
            <label>
              Día de cargo mensual
              <input
                type="number"
                min="1"
                max="28"
                value={v.billingDay || 1}
                onChange={(e) => set("billingDay", Number(e.target.value))}
              />
            </label>
          )}
          <label>
            Saldo real / extracto
            <input
              type="number"
              step="0.01"
              value={v.reconciledBalance ?? ""}
              onChange={(e) =>
                set("reconciledBalance", e.target.value === "" ? undefined : Number(e.target.value))
              }
            />
          </label>
          <label>
            Fecha del saldo real
            <input
              type="date"
              value={v.reconciledDate || ""}
              onChange={(e) => set("reconciledDate", e.target.value || undefined)}
            />
          </label>
          {debt && (
            <>
              <label>
                Saldo pendiente
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={v.outstandingBalance || 0}
                  onChange={(e) => set("outstandingBalance", Number(e.target.value))}
                />
              </label>
              <label>
                Cuota mensual
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={v.monthlyPayment || 0}
                  onChange={(e) => set("monthlyPayment", Number(e.target.value))}
                />
              </label>
              <label>
                Interés TIN/TAE (%)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={v.interestRate || 0}
                  onChange={(e) => set("interestRate", Number(e.target.value))}
                />
              </label>
              {v.type === "credit" && (
                <label>
                  Límite tarjeta
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={v.creditLimit || 0}
                    onChange={(e) => set("creditLimit", Number(e.target.value))}
                  />
                </label>
              )}
            </>
          )}
          <label className="check span-2">
            <input
              type="checkbox"
              checked={v.active}
              onChange={(e) => set("active", e.target.checked)}
            />
            Cuenta activa
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary">Guardar</button>
        </div>
      </form>
    </div>
  );
}

function CategoriesPage({
  categories,
  transactions,
  refresh,
}: {
  categories: Category[];
  transactions: Transaction[];
  refresh: () => Promise<void>;
}) {
  const [edit, setEdit] = useState<Category | null>(null);
  const remove = async (c: Category) => {
    if (transactions.some((t) => t.categoryId === c.id))
      return alert("Esta categoría tiene movimientos. Reasígnalos antes de eliminarla.");
    if (confirm(`¿Eliminar ${c.name}?`)) {
      await deleteCategory(c.id);
      await refresh();
    }
  };
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Categorías y reglas automáticas</h2>
          <p>
            Las palabras clave se usan para clasificar nuevos extractos. Todo se puede corregir
            después.
          </p>
        </div>
        <button
          className="primary"
          onClick={() =>
            setEdit({ id: uid(), name: "", type: "expense", keywords: [], essential: false })
          }
        >
          <Plus size={17} />
          Categoría
        </button>
      </div>
      <div className="category-admin">
        {[...categories]
          .sort((a, b) =>
            `${a.type}|${a.family || "Otros"}|${a.category || a.parent || "General"}|${a.name}`.localeCompare(
              `${b.type}|${b.family || "Otros"}|${b.category || b.parent || "General"}|${b.name}`,
              "es",
            ),
          )
          .map((c) => (
            <div key={c.id}>
              <div>
                <Tag type={c.type} />
                <b>{c.name}</b>
                {c.type === "expense" &&
                  (c.essential ? (
                    <span className="essential">Esencial</span>
                  ) : (
                    <span className="tag transfer">No esencial</span>
                  ))}
                <small className="block">
                  {c.family || "Otros"} → {c.category || c.parent || "General"} → {c.name}
                </small>
                <small>
                  {c.keywords.length ? c.keywords.join(" · ") : "Sin reglas automáticas"}
                </small>
              </div>
              <div className="row-actions">
                <button className="icon-btn" onClick={() => setEdit(c)}>
                  <Pencil size={16} />
                </button>
                <button className="icon-btn danger" onClick={() => remove(c)}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
      </div>
      {edit && (
        <CategoryModal
          value={edit}
          onClose={() => setEdit(null)}
          onSave={async (c) => {
            await saveCategory(c);
            setEdit(null);
            await refresh();
          }}
        />
      )}
    </section>
  );
}
function CategoryModal({
  value,
  onClose,
  onSave,
}: {
  value: Category;
  onClose: () => void;
  onSave: (c: Category) => void;
}) {
  const [v, setV] = useState(value);
  return (
    <div className="modal-back">
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(v);
        }}
      >
        <div className="modal-head">
          <h2>Clasificación del movimiento</h2>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="form-grid">
          <label>
            Nombre
            <input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required />
          </label>
          <label>
            Tipo
            <select value={v.type} onChange={(e) => setV({ ...v, type: e.target.value as TxType })}>
              <option value="expense">Gasto</option>
              <option value="income">Ingreso</option>
              <option value="transfer">Transferencia</option>
            </select>
          </label>
          <label>
            Familia
            <input
              value={v.family || ""}
              placeholder="Ej. Estilo de vida"
              onChange={(e) => setV({ ...v, family: e.target.value })}
              required
            />
          </label>
          <label>
            Categoría
            <input
              value={v.category || v.parent || ""}
              placeholder="Ej. Cultura y espectáculos"
              onChange={(e) => setV({ ...v, category: e.target.value })}
              required
            />
          </label>
          <small className="span-2">
            El nombre de arriba es la subcategoría final que se asigna al movimiento.
          </small>
          <label className="span-2">
            Palabras clave, separadas por comas
            <textarea
              rows={3}
              value={v.keywords.join(", ")}
              onChange={(e) =>
                setV({
                  ...v,
                  keywords: e.target.value
                    .split(",")
                    .map((x) => x.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
          <label className="check span-2">
            <input
              type="checkbox"
              checked={v.essential}
              onChange={(e) => setV({ ...v, essential: e.target.checked })}
            />
            Gasto esencial (no proponer recorte)
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary">Guardar</button>
        </div>
      </form>
    </div>
  );
}

function AuditPage({
  transactions,
  categories,
  accounts,
}: {
  transactions: Transaction[];
  categories: Category[];
  accounts: Account[];
}) {
  const pending = transactions.filter((t) => !t.reviewed);
  const uncategorized = transactions.filter((t) =>
    ["exp-other", "inc-other"].includes(t.categoryId),
  );
  const reconciliations = accounts.map((a) => {
    const until = a.reconciledDate || "9999-12-31";
    const calculated =
      a.openingBalance +
      transactions
        .filter((t) => t.accountId === a.id && t.date <= until)
        .reduce((sum, t) => sum + t.amount, 0);
    const diff = a.reconciledBalance == null ? null : a.reconciledBalance - calculated;
    return { a, calculated, diff };
  });
  const duplicates = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of transactions) {
      const k = `${t.accountId}|${t.date}|${t.amount.toFixed(2)}|${t.description.toLowerCase().replace(/\s+/g, " ")}`;
      map.set(k, [...(map.get(k) || []), t]);
    }
    return [...map.values()].filter((x) => x.length > 1);
  }, [transactions]);
  const transferIssues = transactions.filter((t) => {
    if (t.type !== "transfer") return false;
    const pair = transactions.find((candidate) => candidate.id === t.transferPairId);
    return (
      !pair ||
      pair.type !== "transfer" ||
      pair.transferPairId !== t.id ||
      pair.accountId === t.accountId ||
      Math.abs(pair.amount + t.amount) >= 0.005
    );
  });
  const recurr = recurringExpenses(transactions).slice(0, 10);
  return (
    <>
      <div className="kpi-grid">
        <Kpi
          title="Pendientes de revisar"
          value={String(pending.length)}
          hint="Importes de baja confianza"
          tone={pending.length ? "bad" : "good"}
        />
        <Kpi
          title="Posibles duplicados"
          value={String(duplicates.reduce((s, g) => s + g.length - 1, 0))}
          hint={`${duplicates.length} grupos`}
          tone={duplicates.length ? "bad" : "good"}
        />
        <Kpi
          title="Otros / sin afinar"
          value={String(uncategorized.length)}
          hint="Conviene recategorizar"
        />
        <Kpi
          title="Transferencias sin cuadrar"
          value={String(transferIssues.length)}
          hint="Deben tener dos asientos opuestos"
          tone={transferIssues.length ? "bad" : "good"}
        />
      </div>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Conciliación de saldos</h2>
            <p>
              Compara el saldo calculado por movimientos con el saldo real que introduzcas en cada
              cuenta.
            </p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Cuenta</th>
                <th>Fecha control</th>
                <th className="right">Calculado</th>
                <th className="right">Saldo real</th>
                <th className="right">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {reconciliations.map((r) => (
                <tr key={r.a.id}>
                  <td>
                    <b>{r.a.name}</b>
                  </td>
                  <td>{r.a.reconciledDate ? formatDate(r.a.reconciledDate) : "Sin conciliar"}</td>
                  <td className="right money">{euro.format(r.calculated)}</td>
                  <td className="right">
                    {r.a.reconciledBalance == null ? "—" : euro.format(r.a.reconciledBalance)}
                  </td>
                  <td
                    className={`right money ${r.diff != null && Math.abs(r.diff) > 0.01 ? "danger-text" : "positive"}`}
                  >
                    {r.diff == null ? "—" : euro.format(r.diff)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Asientos de transferencias</h2>
            <p>
              Cada transferencia debe tener una salida y una entrada del mismo importe entre dos
              cuentas. No se incluyen en ingresos ni gastos.
            </p>
          </div>
        </div>
        {transferIssues.length ? (
          transferIssues.map((t) => (
            <div className="audit-item" key={t.id}>
              <b>{t.description}</b>
              <span>
                {formatDate(t.date)} · {euro.format(t.amount)} · asiento contrario no encontrado o
                descuadrado
              </span>
            </div>
          ))
        ) : (
          <Empty text="Todos los asientos de transferencias están cuadrados." />
        )}
      </section>
      <div className="grid-2">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Duplicados exactos</h2>
              <p>Misma cuenta, fecha, importe y concepto normalizado.</p>
            </div>
          </div>
          {duplicates.length ? (
            duplicates.map((g, i) => (
              <div className="audit-item" key={i}>
                <b>{g[0]!.description}</b>
                <span>
                  {formatDate(g[0]!.date)} · {euro.format(g[0]!.amount)} · {g.length} registros
                </span>
              </div>
            ))
          ) : (
            <Empty text="No se detectan duplicados exactos." />
          )}
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Pagos recurrentes detectados</h2>
              <p>Patrones presentes en dos o más meses.</p>
            </div>
          </div>
          {recurr.length ? (
            recurr.map((r) => (
              <div className="audit-item" key={r.key}>
                <b>{r.label}</b>
                <span>
                  ≈ {euro.format(r.avg)}/mes · {r.months} meses · {euro.format(r.annual)}/año
                </span>
              </div>
            ))
          ) : (
            <Empty text="Aún no hay histórico suficiente." />
          )}
        </section>
      </div>
    </>
  );
}

function AdvisorPage({
  transactions,
  categories,
  accounts,
  month,
}: {
  transactions: Transaction[];
  categories: Category[];
  accounts: Account[];
  month: string;
}) {
  const [upfront, setUpfront] = useState(0);
  const [monthly, setMonthly] = useState(0);
  const a = buildAdvice(transactions, categories, accounts, month, upfront, monthly);
  const topCuts = useMemo(() => {
    const ids = new Set(
      categories.filter((c) => c.type === "expense" && !c.essential).map((c) => c.id),
    );
    const sums = new Map<string, number>();
    for (const t of transactions.filter(
      (t) =>
        t.type === "expense" &&
        !t.excluded &&
        ids.has(t.categoryId) &&
        t.date.startsWith(month),
    ))
      sums.set(t.categoryId, (sums.get(t.categoryId) || 0) + Math.abs(t.amount));
    return [...sums.entries()]
      .map(([id, v]) => ({
        name: categories.find((c) => c.id === id)?.name || "Otros",
        monthly: v,
        cut: v * 0.2,
      }))
      .sort((x, y) => y.cut - x.cut)
      .slice(0, 6);
  }, [transactions, categories, month]);
  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>¿Puedo afrontar un nuevo gasto?</h2>
            <p>Consejo para {month}, comparado con la media de hasta 6 meses anteriores.</p>
          </div>
        </div>
        <div className="simulator">
          <label>
            Pago inicial (€)
            <input
              type="number"
              min="0"
              step="10"
              value={upfront}
              onChange={(e) => setUpfront(Number(e.target.value))}
            />
          </label>
          <label>
            Nueva cuota mensual (€)
            <input
              type="number"
              min="0"
              step="1"
              value={monthly}
              onChange={(e) => setMonthly(Number(e.target.value))}
            />
          </label>
          <div className={`verdict ${a.viability.replace(" ", "-")}`}>
            <small>Resultado orientativo</small>
            <strong>{a.viability.toUpperCase()}</strong>
          </div>
        </div>
        <div className="advisor-grid">
          <div>
            <span>Ingresos del mes</span>
            <b>{euro.format(a.currentIncome)}</b>
          </div>
          <div>
            <span>Gastos del mes</span>
            <b>{euro.format(a.currentExpenses)}</b>
          </div>
          <div>
            <span>Margen del mes</span>
            <b>{euro.format(a.currentFree)}</b>
          </div>
          <div>
            <span>Media ingresos anteriores</span>
            <b>{a.months.length ? euro.format(a.avgIncome) : "Sin histórico"}</b>
          </div>
          <div>
            <span>Media gastos anteriores</span>
            <b>{a.months.length ? euro.format(a.avgExpenses) : "Sin histórico"}</b>
          </div>
          <div>
            <span>Margen con nueva cuota</span>
            <b>{euro.format(a.postMonthly)}</b>
          </div>
          <div>
            <span>Escenario estrés (-10% ingreso / +10% gasto)</span>
            <b>{euro.format(a.stressFree)}</b>
          </div>
          <div>
            <span>Ratio cuotas deuda</span>
            <b>{pct.format(a.debtRatio)}</b>
          </div>
        </div>
      </section>
      <div className="grid-2">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Recortes que priorizaría</h2>
              <p>Solo categorías marcadas como no esenciales; propuesta inicial del 20%.</p>
            </div>
          </div>
          {topCuts.length ? (
            topCuts.map((x) => (
              <div className="cut-item" key={x.name}>
                <div>
                  <b>{x.name}</b>
                  <span>Gasto en {month}: {euro.format(x.monthly)}</span>
                </div>
                <strong>−{euro.format(x.cut)}/mes</strong>
              </div>
            ))
          ) : (
            <Empty text="No hay suficientes gastos discrecionales para proponer recortes." />
          )}
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Conclusiones</h2>
              <p>Generadas a partir de reglas financieras transparentes.</p>
            </div>
          </div>
          <div className="insights">
            <Insight
              ok={a.currentFree > 0}
              text={
                a.currentFree > 0
                  ? `En ${month}, tu margen antes de un nuevo gasto es ${euro.format(a.currentFree)}.`
                  : `En ${month}, los gastos igualan o superan los ingresos; priorizaría corregir el flujo antes de asumir nuevas cuotas.`
              }
            />
            <Insight
              ok={a.expenseTrend <= 0}
              text={a.months.length ? `Los gastos de ${month} están ${pct.format(Math.abs(a.expenseTrend))} ${a.expenseTrend <= 0 ? "por debajo" : "por encima"} de la media de los ${a.months.length} meses anteriores.` : "No hay meses anteriores suficientes para calcular la dinámica mensual."}
            />
            <Insight
              ok={a.debtRatio < 0.35}
              text={`Tus cuotas actuales representan aproximadamente ${pct.format(a.debtRatio)} de los ingresos de ${month}.`}
            />
            <Insight
              ok={a.stressFree >= 0}
              text={
                a.stressFree >= 0
                  ? `Incluso con el escenario de estrés simulado quedaría un margen de ${euro.format(a.stressFree)}.`
                  : `En el escenario de estrés faltaría aproximadamente ${euro.format(Math.abs(a.stressFree))} al mes.`
              }
            />
            <Insight
              ok={a.suggestedCut > 0}
              text={`Un recorte inicial del 20% sobre gasto discrecional reciente liberaría aproximadamente ${euro.format(a.suggestedCut)} al mes.`}
            />
          </div>
          <div className="disclaimer">
            Esto es una herramienta de planificación doméstica, no asesoramiento financiero
            regulado. Antes de contratar deuda real, contrasta TAE, comisiones, seguros vinculados y
            condiciones con un profesional independiente.
          </div>
        </section>
      </div>
    </>
  );
}

function SettingsPage({
  settings,
  onSettings,
  refresh,
}: {
  settings: AppSettings;
  onSettings: (s: AppSettings) => Promise<void>;
  refresh: () => Promise<void>;
}) {
  const [v, setV] = useState(settings);
  const [msg, setMsg] = useState("");
  const downloadBackup = async () => {
    const encrypted = await exportEncryptedBackup();
    downloadBlob(encrypted, `finanzas-seguras-${today()}.json`, "application/json");
  };
  const loadLegacy = async (file: File) => {
    if (!confirm("Esta copia antigua no está cifrada y sustituirá todos los datos actuales. ¿Continuar?")) return;
    try {
      await importLegacyBackup(JSON.parse(await file.text()));
      await refresh();
      setMsg("Copia antigua importada a la caja cifrada. Descarga ahora una copia cifrada de seguridad.");
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "No se pudo importar el archivo antiguo.");
    }
  };
  const load = async (file: File) => {
    try {
      const password = prompt("Introduce la contraseña de esta copia cifrada:");
      if (!password) return;
      const encrypted = await file.text();
      if (!confirm("La copia reemplazará los datos locales actuales. ¿Continuar?")) return;
      await restoreEncryptedBackup(encrypted, password);
      await refresh();
      setMsg("Copia cifrada restaurada correctamente.");
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "No se pudo restaurar la copia cifrada.");
    }
  };
  return (
    <div className="grid-2">
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Objetivos y umbrales</h2>
            <p>Ajustan el panel y las alertas.</p>
          </div>
        </div>
        <div className="settings-form">
          <label>
            Objetivo de ahorro mensual
            <input
              type="number"
              step="10"
              value={v.monthlySavingsTarget}
              onChange={(e) => setV({ ...v, monthlySavingsTarget: Number(e.target.value) })}
            />
          </label>
          <label>
            Meses objetivo de fondo de emergencia
            <input
              type="number"
              min="1"
              max="24"
              value={v.emergencyMonthsTarget}
              onChange={(e) => setV({ ...v, emergencyMonthsTarget: Number(e.target.value) })}
            />
          </label>
          <label>
            Alerta de ratio de cuotas (%)
            <input
              type="number"
              min="1"
              max="90"
              value={Math.round(v.warningDebtRatio * 100)}
              onChange={(e) => setV({ ...v, warningDebtRatio: Number(e.target.value) / 100 })}
            />
          </label>
          <button
            className="primary"
            onClick={async () => {
              await onSettings(v);
              setMsg("Ajustes guardados.");
            }}
          >
            Guardar ajustes
          </button>
        </div>
      </section>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Copia de seguridad cifrada</h2>
            <p>Exporta un archivo JSON cifrado. Para restaurarlo necesitarás su contraseña.</p>
          </div>
        </div>
        <div className="backup-actions">
          <button onClick={downloadBackup}>
            <Download size={18} />
            Descargar copia cifrada
          </button>
          <label className="button-like">
            <Upload size={18} />
            Restaurar copia cifrada
            <input
              type="file"
              accept="application/json,.json"
              onChange={(e) => e.target.files?.[0] && load(e.target.files[0])}
            />
          </label>
        </div>
        <div className="backup-actions" style={{ marginTop: 12 }}>
          <label className="button-like">
            <Upload size={18} />
            Importar copia antigua sin cifrar
            <input type="file" accept="application/json,.json" onChange={(e) => e.target.files?.[0] && loadLegacy(e.target.files[0])} />
          </label>
        </div>
        <p className="disclaimer">Utiliza la importación antigua solo para migrar. Conserva el archivo original hasta comprobar la nueva copia cifrada.</p>
        {msg && <div className="notice">{msg}</div>}
        <div className="privacy-large">
          <ShieldCheck />
          <div>
            <b>Privacidad por diseño</b>
            <p>
              Los datos se guardan en una caja cifrada local. Los PDF/CSV se procesan en este
              dispositivo; la copia de seguridad también permanece cifrada.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function formatDate(s: string) {
  const [y, m, d] = s.split("-");
  return y && m && d ? `${d}/${m}/${y}` : s;
}
function downloadBlob(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}


type VaultScreen = "checking" | "setup" | "unlock" | "ready";

export default function FinanceSecureApp() {
  const [screen, setScreen] = useState<VaultScreen>("checking");
  const [previousData, setPreviousData] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let current = true;
    (async () => {
      try {
        const exists = await vaultExists();
        if (exists) {
          if (current) setScreen("unlock");
        } else {
          const legacy = await readLegacyData();
          if (current) {
            setPreviousData(legacy.hasPreviousRecords);
            setScreen("setup");
          }
        }
      } catch (reason) {
        if (current) setError(reason instanceof Error ? reason.message : "No se pudo abrir la caja local.");
      }
    })();
    return () => { current = false; };
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      if (screen === "setup") {
        if (password !== confirmation) throw new Error("Las contraseñas no coinciden.");
        const legacy = await readLegacyData();
        await createVault(password, legacy.data);
        try {
          await clearLegacyData();
        } catch {
          alert("Los datos están cifrados, pero no se pudo limpiar la antigua base sin cifrar. Revisa el almacenamiento antes de añadir extractos nuevos.");
        }
      } else if (screen === "unlock") {
        await unlockVault(password);
      }
      setPassword("");
      setConfirmation("");
      setScreen("ready");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo abrir la caja local.");
    } finally {
      setBusy(false);
    }
  };

  if (screen === "ready") {
    return <App onLock={() => { setPassword(""); setConfirmation(""); setScreen("unlock"); }} />;
  }

  return (
    <main className="vault-screen">
      <form className="vault-panel" onSubmit={submit}>
        <LockKeyhole size={36} aria-hidden="true" />
        <h1>{screen === "setup" ? "Crear caja financiera cifrada" : "Abrir finanzas privadas"}</h1>
        <p>Los movimientos y saldos se almacenan cifrados en este dispositivo. Necesitarás tu contraseña cada vez que abras la aplicación.</p>
        {screen === "setup" && (
          <p className="notice">
            {previousData
              ? "Se han encontrado datos de la versión anterior. Se copiarán al almacenamiento cifrado antes de borrar los registros antiguos."
              : "Primera configuración. No podremos recuperar tu contraseña si la olvidas: guarda una copia cifrada en un lugar seguro."}
          </p>
        )}
        {screen !== "checking" ? (
          <>
            <label>
              Contraseña de la caja cifrada
              <input type="password" required minLength={screen === "setup" ? 12 : 1} autoComplete={screen === "setup" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            {screen === "setup" && (
              <label>
                Repite la contraseña
                <input type="password" required minLength={12} autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
              </label>
            )}
            {error && <p role="alert" className="danger-text">{error}</p>}
            <button type="submit" className="primary" disabled={busy}>
              {busy ? "Protegiendo datos…" : screen === "setup" ? "Cifrar y empezar" : "Desbloquear"}
            </button>
          </>
        ) : <p>{error || "Comprobando almacenamiento local…"}</p>}
        <small>La aplicación no dispone de recuperación remota de contraseña. No uses navegación privada para guardar información definitiva.</small>
      </form>
    </main>
  );
}
