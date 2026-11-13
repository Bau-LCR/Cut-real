// Parser de streams estilo OpenAI (Groq, Gemini-compat, etc.). Sin dependencias de Deno => testeable en Node.
export interface StreamEvent { delta?: string; usage?: { prompt_tokens?: number; completion_tokens?: number }; finish?: string }

export async function* parseOpenAIStream(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let idx: number
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim()
        buf = buf.slice(idx + 1)
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (data === '[DONE]') return
        try {
          const j = JSON.parse(data)
          const choice = j.choices?.[0]
          const ev: StreamEvent = {}
          if (typeof choice?.delta?.content === 'string' && choice.delta.content) ev.delta = choice.delta.content
          if (choice?.finish_reason) ev.finish = choice.finish_reason
          const usage = j.usage ?? j.x_groq?.usage
          if (usage) ev.usage = usage
          if (ev.delta || ev.usage || ev.finish) yield ev
        } catch { /* línea parcial o keep-alive: se ignora */ }
      }
    }
  } finally { reader.releaseLock() }
}
