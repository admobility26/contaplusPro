import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { Category, ImportCandidate, Transaction } from '../types'
import { classify, isLikelyDuplicate } from './finance'
import { parseBankAmount, parseBankDate } from './bank-parser'
import { groupPdfTextRows, type PositionedPdfText } from './pdf-layout'
import { ensureReadableStreamAsyncIterator } from './stream-polyfill'
export { detectBank, parseBankText, parseBankTextDetailed } from './bank-parser'

ensureReadableStreamAsyncIterator()
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker

const uuid=()=>crypto.randomUUID()

// Safari cannot async-iterate pdf.js text streams, so read the stream manually.
async function readTextItems(page: Awaited<ReturnType<pdfjsLib.PDFDocumentProxy['getPage']>>) {
  const stream = (page as unknown as { streamTextContent: (o?: unknown) => ReadableStream<{ items: unknown[] }> }).streamTextContent({})
  const reader = stream.getReader()
  const items: PositionedPdfText[] = []
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      for (const item of value?.items ?? []) {
        if (item && typeof item === 'object' && 'str' in item) items.push(item as PositionedPdfText)
      }
    }
  } finally {
    reader.releaseLock()
  }
  return items
}

export async function extractPdfText(file:File){
  const bytes=new Uint8Array(await file.arrayBuffer())
  const pdf=await pdfjsLib.getDocument({data:bytes}).promise
  let full=''
  const pages:string[]=[]
  for(let p=1;p<=pdf.numPages;p++){
    const page=await pdf.getPage(p)
    const items=await readTextItems(page)
    const text=groupPdfTextRows(items)
    pages.push(text); full+=text+'\n'
  }
  return {text:full,pages,numPages:pdf.numPages}
}

function detectDelimiter(header:string){
  const counts=[',',';','\t'].map(d=>({d,n:header.split(d).length}))
  return counts.sort((a,b)=>b.n-a.n)[0]!.d
}
function splitCsvLine(line:string,delim:string){
  const cells:string[]=[]; let cur=''; let quote=false
  for(let i=0;i<line.length;i++){
    const ch=line[i]
    if(ch==='"'){ if(quote&&line[i+1]==='"'){cur+='"';i++}else quote=!quote }
    else if(ch===delim&&!quote){cells.push(cur.trim());cur=''} else cur+=ch
  }
  cells.push(cur.trim()); return cells
}
export async function parseCsv(file:File,accountId:string,categories:Category[],existing:Transaction[]){
  const utf8=await file.text(); const text=utf8.includes('\uFFFD')?new TextDecoder('windows-1252').decode(await file.arrayBuffer()):utf8
  const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean); if(lines.length<2)return []
  const delim=detectDelimiter(lines[0]??''); const headers=splitCsvLine(lines[0]??'',delim).map(h=>h.toLowerCase())
  const find=(names:string[])=>headers.findIndex(h=>names.some(n=>h.includes(n)))
  const dateI=find(['fecha','date']); const descI=find(['concepto','descripcion','descripción','description','detalle']); const amtI=find(['importe','amount','cantidad']); const debitI=find(['cargo','debit']); const creditI=find(['abono','credit'])
  const out:ImportCandidate[]=[]
  for(const line of lines.slice(1)){
    const cells=splitCsvLine(line,delim); if(cells.length<2)continue
    const dateRaw=cells[dateI>=0?dateI:0]||''; const date=parseBankDate(dateRaw)||(/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)?dateRaw:''); if(!date)continue
    const description=cells[descI>=0?descI:1]||'Movimiento importado'
    let amount=NaN
    if(amtI>=0)amount=parseBankAmount(cells[amtI]||'')
    else { const cr=parseBankAmount(cells[creditI]||''); const db=parseBankAmount(cells[debitI]||''); amount=Number.isFinite(cr)&&cr!==0?Math.abs(cr):Number.isFinite(db)?-Math.abs(db):NaN }
    if(!Number.isFinite(amount))continue
    const category=classify(description,amount,categories)!; const type=category.type==='transfer'?'transfer':amount>=0?'income':'expense'
    const candidate={id:uuid(),date,description,amount,type,categoryId:category.id,accountId,confidence:0.92,duplicate:false,selected:true} as ImportCandidate
    candidate.duplicate=isLikelyDuplicate(candidate,existing)||isLikelyDuplicate(candidate,out as Transaction[]); if(candidate.duplicate)candidate.selected=false; out.push(candidate)
  }
  return out
}
