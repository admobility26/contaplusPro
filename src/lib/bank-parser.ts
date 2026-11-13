import type { Category, ImportCandidate, Transaction } from '../types'
import { classify, isLikelyDuplicate } from './finance'

const DATE_RE=/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/
const AMOUNT_RE=/([+-]?\s?(?:\d{1,3}(?:\.\d{3})+|\d+)[,.]\d{2}(?:\s*-)?)/g

type BankProfile = {
  id: string
  name: string
  detect: RegExp
  cleanup?: Array<[RegExp,string]>
}

const BANK_PROFILES: BankProfile[] = [
  {id:'kutxabank',name:'Kutxabank',detect:/kutxabank|caja\s+vital/i},
  {id:'bbva',name:'BBVA',detect:/\bbbva\b|banco\s+bilbao\s+vizcaya/i},
  {id:'santander',name:'Santander',detect:/banco\s+santander|\bsantander\b/i},
  {id:'laboral-kutxa',name:'Laboral Kutxa',detect:/laboral\s+kutxa|caja\s+laboral/i},
  {id:'caixabank',name:'CaixaBank',detect:/caixabank|la\s+caixa|imaginbank|imagin\b/i},
  {id:'ing',name:'ING',detect:/\bing\s*(?:bank|direct)?\b|nationale[- ]nederlanden/i},
  {id:'cajamar',name:'Cajamar',detect:/grupo\s+cooperativo\s+cajamar|\bcajamar\b/i},
]

const NON_MOVEMENT_PATTERNS=[
  /^saldo\b/i,/^balance\b/i,/^totales?\b/i,/^resumen\b/i,
  /^apertura\b/i,/^cierre\b/i,/suma\s+y\s+sigue/i,/saldo\s+(?:inicial|anterior|final|disponible|actual)/i,
  /l[ií]mite\s+de\s+cr[eé]dito/i,
]

export function detectBank(text:string) {
  return BANK_PROFILES.find(profile=>profile.detect.test(text)) ?? null
}

export function parseBankDate(dateText:string){
  const m=dateText.match(DATE_RE); if(!m) return ''
  let y=Number(m[3]); if(y<100)y+=2000
  const month=Number(m[2]); const day=Number(m[1]);
  const valid=new Date(Date.UTC(y,month-1,day));
  if(y<1900||y>2100||valid.getUTCFullYear()!==y||valid.getUTCMonth()!==month-1||valid.getUTCDate()!==day)return ''
  return `${y.toString().padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
}

export function parseBankAmount(value:string){
  if (!/[0-9]/.test(value)) return NaN
  const trailingMinus = /-\s*$/.test(value)
  const compact=value.replace(/-\s*$/,'').replace(/\s/g,'')
  const decimalSeparator=compact.lastIndexOf(',')>compact.lastIndexOf('.')?',':'.'
  const thousandsSeparator=decimalSeparator===','?'.':','
  const cleaned=compact
    .replace(new RegExp(`\\${thousandsSeparator}(?=\\d{3}(?:\\D|$))`,'g'),'')
    .replace(decimalSeparator,'.')
    .replace(/[^0-9+\-.]/g,'')
  const parsed=Number(cleaned)
  return Number.isFinite(parsed)?(trailingMinus?-Math.abs(parsed):parsed):NaN
}

function findAmounts(line:string,dateEnd:number){
  const regex=new RegExp(AMOUNT_RE.source,'g')
  const amounts:Array<{raw:string;idx:number;value:number}>=[]
  let match:RegExpExecArray|null
  // Avoid String#matchAll: it caused the import crash in some local browsers.
  while((match=regex.exec(line))!==null){
    const raw=match[1]??''
    const value=parseBankAmount(raw)
    const before=line[match.index-1]??' '
    const after=line[match.index+match[0].length]??' '
    const touchesIdentifier=/[\p{L}\p{N}]/u.test(before)||/[\p{L}\p{N}]/u.test(after)
    if(touchesIdentifier){regex.lastIndex=match.index+1;continue}
    if(Number.isFinite(value)&&match.index>=dateEnd)amounts.push({raw,idx:match.index,value})
    if(match[0].length===0)regex.lastIndex++
  }
  return amounts
}

function specializedCategory(line:string,categories:Category[]){
  const normalized=line.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'')
  const cardPayment=/(?:liquidacion|pago|recibo|adeudo).*tarjeta|tarjeta.*(?:liquidacion|pago)|cuota.*visa/.test(normalized)
  const loanPayment=/cuota.*(?:prestamo|hipoteca|credito)|amortizacion.*(?:prestamo|hipoteca)|recibo.*prestamo/.test(normalized)
  const expenseDetail=/cuota\s+mensual|seguro|recibo|compra|comision/.test(normalized)
  const internalTransfer=/traspaso|transferencia.*(?:propia|mismo titular|entre cuentas)|entre mis cuentas/.test(normalized)
  const categoryId=cardPayment?'exp-card':loanPayment?'exp-loans':internalTransfer&&!expenseDetail?'transfer':null
  return categoryId?categories.find(category=>category.id===categoryId):undefined
}

export function parseBankTextDetailed(text:string, accountId:string, categories:Category[], existing:Transaction[]){
  const bank=detectBank(text)
  let normalized=text
    .replace(/[–—−]/g,'-')
    .replace(/(\d)\s*[/|]\s*(\d)/g,'$1/$2')
    .replace(/(\d)\s*,\s*(\d{2})(?!\d)/g,'$1,$2')
  for(const [pattern,replacement] of bank?.cleanup??[])normalized=normalized.replace(pattern,replacement)
  const rawLines=normalized
    .split(/\n/)
    .map(line=>line.trim().replace(/\s+/g,' '))
    .filter(Boolean)
  const candidates:ImportCandidate[]=[]
  for(const line of rawLines){
    const dateMatch=line.match(DATE_RE); if(!dateMatch) continue
    const dateEnd=(dateMatch.index??0)+(dateMatch[0]?.length??0)
    const amounts=findAmounts(line,dateEnd)
    if(!amounts.length) continue
    const signed=amounts.filter(value=>/^[+-]/.test(value.raw.trim())||/-\s*$/.test(value.raw))
    const ambiguous=amounts.length>1&&signed.length!==1
    const chosen=signed[0]??amounts[0]!
    let amount=chosen.value
    const incomeHint=/nomina|nómina|ingreso|abono|transferencia recibida|pension|pensión|devolucion|devolución/i.test(line)
    const expenseHint=/compra|cargo|recibo|pago|retirada|comision|comisión|cuota/i.test(line)
    if(/-\s*$/.test(chosen.raw)) amount=-Math.abs(amount)
    else if(!/[+-]/.test(chosen.raw)) amount=expenseHint&&!incomeHint?-Math.abs(amount):Math.abs(amount)
    const date=parseBankDate(dateMatch[0]??'')
    if(!date)continue
    let description=line.slice(dateEnd, chosen.idx).trim().replace(DATE_RE,'').trim().replace(/\s+/g,' ')
    if(!description) description=line.replace(dateMatch[0]??'','').replace(chosen.raw,'').trim()
    description=description.replace(/^\d{1,2}[-/]\d{1,2}\s+/,'').trim()
    if(!description||NON_MOVEMENT_PATTERNS.some(pattern=>pattern.test(description)))continue
    const cardPurchase=/compra.*(?:visa|tarjeta)|(?:visa|tarjeta).*compra/i.test(line)
    const transferWithExpense=/traspaso.*(?:cuota\s+mensual|seguro|recibo|compra|comision)/i.test(line)
    const classificationText=(cardPurchase?description.replace(/\b(?:visa|tarjeta)\b/gi,''):description)
      .replace(transferWithExpense?/\btraspaso\b/gi:/$^/g,'')
    const category=specializedCategory(line,categories)??classify(classificationText,amount,categories)!
    const type=category.type==='transfer'?'transfer':amount>=0?'income':'expense'
    const candidate:ImportCandidate={id:crypto.randomUUID(),date,description,amount,type,categoryId:category.id,accountId,confidence:ambiguous?0.35:/[+-]/.test(chosen.raw)?0.88:0.68,duplicate:false,selected:!ambiguous}
    candidate.duplicate=isLikelyDuplicate(candidate,existing)||isLikelyDuplicate(candidate,candidates as Transaction[])
    if(candidate.duplicate) candidate.selected=false
    candidates.push(candidate)
  }
  return {bank:bank?.name??'Formato genérico',candidates}
}

export function parseBankText(text:string, accountId:string, categories:Category[], existing:Transaction[]):ImportCandidate[]{
  return parseBankTextDetailed(text,accountId,categories,existing).candidates
}
