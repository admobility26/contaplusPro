import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { createWorker, OEM, PSM } from 'tesseract.js'
import { ensureReadableStreamAsyncIterator } from './stream-polyfill'

ensureReadableStreamAsyncIterator()
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker

export async function ocrPdf(file: File, onProgress?: (progress: number, message: string) => void) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise
  const worker = await createWorker('spa', OEM.LSTM_ONLY, {
    workerPath:'/tesseract/worker.min.js',
    corePath:'/tesseract/core',
    langPath:'/tesseract/lang',
    logger: (message) => {
      if (typeof message.progress === 'number') {
        onProgress?.(message.progress, message.status || 'OCR local')
      }
    },
  })
  let text = ''
  try{
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_COLUMN,
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
    })
    for(let p=1;p<=pdf.numPages;p++){
      onProgress?.((p-1)/pdf.numPages,`OCR local · página ${p}/${pdf.numPages}`)
      const page=await pdf.getPage(p)
      // Bank statements contain small tabular text. Rendering close to 300 DPI
      // materially improves dates, decimal separators and minus signs.
      const viewport=page.getViewport({scale:3})
      const canvas=document.createElement('canvas')
      canvas.width=Math.ceil(viewport.width)
      canvas.height=Math.ceil(viewport.height)
      const ctx=canvas.getContext('2d')
      if(!ctx) throw new Error('No se pudo crear el canvas para OCR')
      await page.render({canvasContext:ctx,viewport,canvas}).promise
      const result=await worker.recognize(canvas)
      text += `${result.data.text}\n`
    }
    onProgress?.(1,'OCR local completado')
    return text
  } finally {
    await worker.terminate()
  }
}
