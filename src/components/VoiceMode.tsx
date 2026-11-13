import { useEffect, useRef, useState } from 'react'
import { FnError } from '../lib/functions'
import { MicSession, transcribe } from '../voice/recorder'
import { speakAndWait, stopSpeaking } from '../store/speech'
import { useChat } from '../store/chat'
import { X } from './icons'

type Phase = 'starting' | 'listening' | 'transcribing' | 'thinking' | 'speaking' | 'error'
const LABEL: Record<Phase, string> = { starting: 'Preparando el micrófono…', listening: 'Te escucho', transcribing: 'Transcribiendo…', thinking: 'Pensando…', speaking: 'Hablando', error: 'Algo falló' }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Turnos: escuchar → detectar fin de turno (silencio) → transcribir → responder → hablar. Hablar encima interrumpe a la IA. */
export function VoiceMode({ ensureConv, onClose }: { ensureConv(): Promise<string>; onClose(): void }) {
  const [phase, setPhase] = useState<Phase>('starting')
  const [said, setSaid] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [lvl, setLvl] = useState(0)
  const ctl = useRef({ dead: false, abort: new AbortController(), stopRec: () => {}, fatal: false })

  useEffect(() => {
    const c = ctl.current
    const mic = new MicSession()
    ;(async () => {
      try { if (!MicSession.supported) throw new Error('Tu navegador no permite grabar audio.'); await mic.open() }
      catch (e) { c.fatal = true; setErr((e as Error).message); setPhase('error'); return }
      while (!c.dead) {
        setPhase('listening'); setErr(null)
        const rec = mic.record({ vad: true, silenceMs: 1300, onLevel: (l) => setLvl(Math.min(1, l * 6)), signal: c.abort.signal })
        c.stopRec = rec.stop
        const blob = await rec.done
        if (c.dead) break
        if (!blob || blob.size < 1500) continue                     // nadie habló
        setPhase('transcribing')
        let text = ''
        try { text = await transcribe(blob) }
        catch (e) {
          const fe = e as FnError; setErr(fe.message); setPhase('error')
          if (fe.code === 'stt_not_configured' || fe.code === 'unauthenticated') { c.fatal = true; break }
          await sleep(2500); continue
        }
        if (c.dead) break
        if (text.trim().length < 2) continue
        setSaid(text); setPhase('thinking')
        try {
          const id = await ensureConv()
          const res = await useChat.getState().send(id, text, {})
          if (!res.ok) { setErr(res.error ?? 'No se pudo obtener la respuesta.'); setPhase('error'); await sleep(2800); continue }
          if (c.dead || !res.content) continue
          setPhase('speaking')
          const barge = new AbortController()
          const speaking = speakAndWait(res.content).catch(() => {})
          const interrupted = mic.waitForVoice(barge.signal).then((v) => v)
          const first = await Promise.race([interrupted.then((v) => (v ? 'barge' : 'wait')), speaking.then(() => 'done')])
          barge.abort()
          if (first === 'barge') stopSpeaking()
          await speaking
        } catch (e) { setErr((e as Error).message); setPhase('error'); await sleep(2500) }
      }
    })()
    return () => { c.dead = true; c.abort.abort(); c.stopRec(); stopSpeaking(); mic.close() }
  }, [ensureConv])

  const c = ctl.current
  return (
    <div className="voice" role="dialog" aria-modal="true" aria-label="Conversación por voz">
      <header><span>Conversación por voz</span><button className="icon-btn" onClick={onClose} aria-label="Cerrar modo voz"><X /></button></header>
      <div className="stage">
        <div className={`orb ${phase === 'thinking' || phase === 'transcribing' ? 'thinking' : phase}`} style={{ ['--lvl' as string]: phase === 'listening' ? lvl : 0 }} aria-hidden="true" />
        <div className="state" role="status">{LABEL[phase]}</div>
        {err && <div className="notice error" role="alert" style={{ maxWidth: 440 }}><div className="grow">{err}</div></div>}
        {said && !err && <div className="said">“{said}”</div>}
      </div>
      <div className="controls">
        {phase === 'speaking' && <button className="btn" onClick={() => stopSpeaking()}>Interrumpir</button>}
        {phase === 'listening' && <button className="btn" onClick={() => c.stopRec()}>Enviar ahora</button>}
        <button className="btn primary" onClick={onClose}>Terminar</button>
      </div>
    </div>
  )
}
