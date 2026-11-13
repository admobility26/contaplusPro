import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = path.join(root, 'public', 'tesseract')
await fs.mkdir(path.join(out,'core'), { recursive:true })
await fs.mkdir(path.join(out,'lang'), { recursive:true })

async function walk(dir){
  const entries=await fs.readdir(dir,{withFileTypes:true})
  const files=[]
  for(const e of entries){
    const p=path.join(dir,e.name)
    if(e.isDirectory()) files.push(...await walk(p)); else files.push(p)
  }
  return files
}

async function firstMatching(dir, predicate){
  const files=await walk(dir)
  return files.find(f=>predicate(path.basename(f),f))
}

const workerRoot=path.join(root,'node_modules','tesseract.js')
const worker=await firstMatching(workerRoot,(name)=>name==='worker.min.js')
if(!worker) throw new Error('No se encontró worker.min.js de tesseract.js')
await fs.copyFile(worker,path.join(out,'worker.min.js'))

const coreRoot=path.join(root,'node_modules','tesseract.js-core')
const coreFiles=(await walk(coreRoot)).filter(f=>/^tesseract-core-(?:simd|relaxedsimd)-lstm.*\.(?:js|wasm)$/.test(path.basename(f)))
if(!coreFiles.length) throw new Error('No se encontraron assets de tesseract.js-core')
for(const src of coreFiles) await fs.copyFile(src,path.join(out,'core',path.basename(src)))

const langRoot=path.join(root,'node_modules','@tesseract.js-data','spa')
const lang=await firstMatching(langRoot,(name)=>name==='spa.traineddata.gz')
if(!lang) throw new Error('No se encontró spa.traineddata.gz')
await fs.copyFile(lang,path.join(out,'lang','spa.traineddata.gz'))
console.log('OCR local preparado en public/tesseract')
