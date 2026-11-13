/** Lee un Response con text/event-stream y entrega cada evento JSON (`data: {...}`). */
export async function readSSE(res: Response, onEvent: (ev: any) => void): Promise<void> {
  if (!res.body) throw new Error('no_body')
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let i: number
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i)
      buf = buf.slice(i + 2)
      for (const line of block.split('\n')) {
        if (!line.startsWith('data:')) continue
        try { onEvent(JSON.parse(line.slice(5).trim())) } catch { /* evento parcial */ }
      }
    }
  }
}
