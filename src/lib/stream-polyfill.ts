// Safari does not implement async iteration over ReadableStream, which pdf.js
// relies on when reading text content. Polyfill it before any PDF is parsed.
export function ensureReadableStreamAsyncIterator() {
  if (typeof ReadableStream === 'undefined') return
  const proto = ReadableStream.prototype as unknown as Record<symbol, unknown>
  if (typeof proto[Symbol.asyncIterator] === 'function') return
  proto[Symbol.asyncIterator] = async function* (this: ReadableStream<unknown>) {
    const reader = this.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) return undefined
        yield value
      }
    } finally {
      reader.releaseLock()
    }
  }
}
