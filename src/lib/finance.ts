import type { Account, Category, Transaction } from '../types'

export const euro = new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'})
export const pct = new Intl.NumberFormat('es-ES',{style:'percent',maximumFractionDigits:1})

export function classify(description:string, amount:number, categories:Category[]){
  const text=description.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'')
  const txType = amount >= 0 ? 'income' : 'expense'
  const internalTransfer = /traspaso|transferencia.*(?:propia|mismo titular|entre cuentas)|entre mis cuentas/.test(text)
  if (internalTransfer) return categories.find(c=>c.id==='transfer') ?? categories.find(c=>c.type==='transfer') ?? categories[0]!
  const cardSettlement = /(?:liquidacion|pago|recibo|adeudo)\s*(?:de\s*)?tarjeta|tarjeta\s*(?:liquidacion|pago)|cuota\s*visa/.test(text)
  if (cardSettlement) return categories.find(c=>c.id==='exp-card') ?? categories[0]!
  const ranked=categories
    .filter(c=>c.type===txType)
    .map(c=>({c,score:c.keywords.reduce((s,k)=> text.includes(k.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'')) ? s+Math.max(1,k.length/5):s,0)}))
    .sort((a,b)=>b.score-a.score)
  const best=ranked[0]
  if(best && best.score>0) return best.c
  return categories.find(c=>c.id===(txType==='income'?'inc-other':'exp-other')) ?? categories[0]!
}

export function isLikelyDuplicate(candidate:{date:string;description:string;amount:number;accountId:string}, transactions:Transaction[]){
  const norm=(s:string)=>s.toLowerCase().replace(/\s+/g,' ').trim()
  return transactions.some(t=>t.accountId===candidate.accountId && t.date===candidate.date && Math.abs(t.amount-candidate.amount)<0.005 && norm(t.description)===norm(candidate.description))
}

export function monthlyStats(transactions:Transaction[], categories:Category[], month?:string){
  const filtered=transactions.filter(t=>!t.excluded && (!month || t.date.startsWith(month)))
  const income=filtered.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0)
  const expenses=Math.abs(filtered.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0))
  const savings=income-expenses
  const categoryMap=new Map<string,number>()
  for(const t of filtered.filter(t=>t.type==='expense')) categoryMap.set(t.categoryId,(categoryMap.get(t.categoryId)||0)+Math.abs(t.amount))
  const byCategory=[...categoryMap.entries()].map(([id,value])=>({id,name:categories.find(c=>c.id===id)?.name??'Sin categoría',value})).sort((a,b)=>b.value-a.value)
  return {income,expenses,savings,savingsRate:income>0?savings/income:0,byCategory}
}

function monthKey(date:string){return date.slice(0,7)}
export function latestMonths(transactions:Transaction[], n=6){
  const months=[...new Set(transactions.map(t=>monthKey(t.date)))].sort().slice(-n)
  return months
}

export function recurringExpenses(transactions:Transaction[]){
  const expense=transactions.filter(t=>t.type==='expense'&&!t.excluded)
  const groups=new Map<string,Transaction[]>()
  for(const t of expense){
    const key=t.description.toLowerCase().replace(/\d+/g,'').replace(/[^a-záéíóúüñ ]/gi,' ').replace(/\s+/g,' ').trim().slice(0,45)
    if(key.length<4) continue
    groups.set(key,[...(groups.get(key)||[]),t])
  }
  return [...groups.entries()].map(([key,items])=>{
    const months=new Set(items.map(i=>monthKey(i.date)))
    const avg=items.reduce((s,i)=>s+Math.abs(i.amount),0)/items.length
    return {key,label:items[0]!.description,count:items.length,months:months.size,avg,annual:avg*12}
  }).filter(x=>x.months>=2).sort((a,b)=>b.annual-a.annual)
}

export function accountDebt(accounts:Account[]){
  const debts=accounts.filter(a=>a.active && ['credit','mortgage','loan'].includes(a.type))
  const outstanding=debts.reduce((s,a)=>s+(a.outstandingBalance||0),0)
  const monthly=debts.reduce((s,a)=>s+(a.monthlyPayment||0),0)
  return {debts,outstanding,monthly}
}

export function buildAdvice(transactions:Transaction[], categories:Category[], accounts:Account[], selectedMonth:string, targetCost=0, targetMonthly=0){
  const historicalMonths=[...new Set(transactions.map(t=>monthKey(t.date)).filter(m=>m<selectedMonth))].sort().slice(-6)
  const stats=historicalMonths.map(m=>monthlyStats(transactions,categories,m))
  const avgIncome=stats.length?stats.reduce((s,x)=>s+x.income,0)/stats.length:0
  const avgExpenses=stats.length?stats.reduce((s,x)=>s+x.expenses,0)/stats.length:0
  const selected=monthlyStats(transactions,categories,selectedMonth)
  const currentIncome=selected.income
  const currentExpenses=selected.expenses
  const currentFree=selected.savings
  const avgFree=avgIncome-avgExpenses
  const debt=accountDebt(accounts)
  const debtRatio=currentIncome>0?debt.monthly/currentIncome:0
  const eligibleTransactions=transactions.filter(t=>monthKey(t.date)<=selectedMonth)
  const recurr=recurringExpenses(eligibleTransactions).slice(0,8)
  const discretionaryIds=new Set(categories.filter(c=>c.type==='expense'&&!c.essential).map(c=>c.id))
  const discretionary=transactions.filter(t=>t.type==='expense'&&!t.excluded&&discretionaryIds.has(t.categoryId)&&monthKey(t.date)===selectedMonth)
  const avgDisc=Math.abs(discretionary.reduce((s,t)=>s+t.amount,0))
  const suggestedCut=avgDisc*0.20
  const postMonthly=currentFree-targetMonthly
  const stressIncome=currentIncome*0.9
  const stressExpenses=currentExpenses*1.1
  const stressFree=stressIncome-stressExpenses-targetMonthly
  const upfrontOk=targetCost<=0 || targetCost<=Math.max(0,currentFree*3)
  const monthlyOk=targetMonthly<=0 || (postMonthly>Math.max(100,currentIncome*0.1) && debtRatio+(targetMonthly/(currentIncome||1))<0.4)
  const viability=monthlyOk&&upfrontOk&&stressFree>=0?'viable':monthlyOk?'ajustada':'no recomendable'
  return {months:historicalMonths,selectedMonth,currentIncome,currentExpenses,currentFree,avgIncome,avgExpenses,avgFree,incomeTrend:avgIncome?currentIncome/avgIncome-1:0,expenseTrend:avgExpenses?currentExpenses/avgExpenses-1:0,debt,debtRatio,recurr,avgDisc,suggestedCut,targetCost,targetMonthly,postMonthly,stressFree,viability}
}
