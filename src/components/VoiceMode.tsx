import { useEffect, useRef, useState } from 'react'
import { FnError } from '../lib/functions'
import { MicSession, transcribe } from '../voice/recorder'
import { speakCallAndWait, stopSpeaking } from '../store/speech'
import { useChat } from '../store/chat'
import { supabase } from '../lib/supabase'
import { useAuth } from '../store/auth'
import { X } from './icons'

type Phase = 'starting' | 'listening' | 'transcribing' | 'thinking' | 'speaking' | 'error'
const LABEL: Record<Phase, string> = { starting: 'Preparando el micrófono…', listening: 'Te escucho', transcribing: 'Transcribiendo…', thinking: 'Pensando…', speaking: 'Hablando', error: 'Algo falló' }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Turnos: escuchar → detectar fin de turno (silencio) → transcribir → responder → hablar. Hablar encima interrumpe a la IA. */
export function VoiceMode({ ensureConv, onClose }: { ensureConv(): Promise<string>; onClose(): void }) {
  const [phase, setPhase] = useState<Phase>('starting')
  const [err, setErr] = useState<string | null>(null)
  const [voiceLevel, setVoiceLevelState] = useState(0)
  const ctl = useRef({ dead: false, abort: new AbortController(), stopRec: () => {}, fatal: false })

  useEffect(() => {
    const c = ctl.current
    c.dead = false; c.abort = new AbortController(); c.stopRec = () => {}; c.fatal = false
    const mic = new MicSession()
    let callSessionId: string | null = null
    let turnSeq = 0
    const startedAt = Date.now()
    ;(async () => {
      try {
        if (!MicSession.supported) throw new Error('Tu navegador no permite grabar audio.')
        await mic.open()
        const me = useAuth.getState().me
        if (!me) throw new Error('Tu sesión no está disponible.')
        const { data, error } = await supabase.from('cr_call_sessions').insert({ user_id: me.userId }).select('id').single()
        if (error || !data) throw new Error('No se pudo crear el registro de esta llamada.')
        callSessionId = data.id
        if (c.dead) {
          await supabase.from('cr_call_sessions').update({ ended_at: new Date().toISOString(), duration_seconds: Math.max(0, Math.round((Date.now() - startedAt) / 1000)) }).eq('id', callSessionId)
          return
        }
      }
      catch (e) { c.fatal = true; setErr((e as Error).message); setPhase('error'); return }
      while (!c.dead) {
        setPhase('listening'); setErr(null)
        const rec = mic.record({ vad: true, silenceMs: 1300, signal: c.abort.signal })
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
        const me = useAuth.getState().me
        if (callSessionId && me) {
          const { error: userLogError } = await supabase.from('cr_call_turns').insert({
            session_id: callSessionId, user_id: me.userId, seq: turnSeq++, role: 'user', content: text.trim(),
          })
          if (userLogError) setErr('No se pudo guardar tu intervención en el historial de llamadas.')
        }
        setPhase('thinking')
        try {
          const id = await ensureConv()
          const res = await useChat.getState().send(id, text, { silent: true, ephemeral: true })
          if (!res.ok) { setErr(res.error ?? 'No se pudo obtener la respuesta.'); setPhase('error'); await sleep(2800); continue }
          if (c.dead || !res.content) continue
          if (callSessionId && me) {
            const { error: assistantLogError } = await supabase.from('cr_call_turns').insert({
              session_id: callSessionId, user_id: me.userId, seq: turnSeq++, role: 'assistant', content: res.content.trim(),
            })
            if (assistantLogError) setErr('No se pudo guardar la respuesta en el historial de llamadas.')
          }
          setPhase('speaking')
          const barge = new AbortController()
          const speaking = speakCallAndWait(res.content, (level) => { if (!c.dead) setVoiceLevelState(level) }).catch(() => {})
          const interrupted = mic.waitForVoice(barge.signal).then((v) => v)
          const first = await Promise.race([interrupted.then((v) => (v ? 'barge' : 'wait')), speaking.then(() => 'done')])
          barge.abort()
          if (first === 'barge') stopSpeaking()
          await speaking
        } catch (e) { setErr((e as Error).message); setPhase('error'); await sleep(2500) }
      }
    })()
    return () => {
      c.dead = true; c.abort.abort(); c.stopRec(); stopSpeaking(); mic.close()
      if (callSessionId) void supabase.from('cr_call_sessions').update({ ended_at: new Date().toISOString(), duration_seconds: Math.max(0, Math.round((Date.now() - startedAt) / 1000)) }).eq('id', callSessionId)
    }
  }, [ensureConv])

  const c = ctl.current
  return (
    <div className="voice" role="dialog" aria-modal="true" aria-label="Conversación por voz">
      <header><span>Conversación por voz</span><button className="icon-btn" onClick={onClose} aria-label="Cerrar modo voz"><X /></button></header>
      <div className="stage">
        <div className={`orb ${phase === 'thinking' || phase === 'transcribing' ? 'thinking' : phase}`} style={{ ['--voice-level' as string]: phase === 'speaking' ? voiceLevel : 0 }} aria-hidden="true"><span className="orb-ring" /><span className="orb-halo" /><span className="orb-core" /><span className="orb-highlight" /></div>
        <div className="state" role="status">{LABEL[phase]}</div>
        {err && <div className="notice error" role="alert" style={{ maxWidth: 440 }}><div className="grow">{err}</div></div>}
      </div>
      <div className="controls">
        <button className="btn danger call-hangup" onClick={onClose}><X className="sm" /> Cortar llamada</button>
      </div>
    </div>
  )
}
