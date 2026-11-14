import { useCallback, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChatView } from '../components/ChatView'
import { PrivacyGate, Settings } from '../components/Settings'
import { Sidebar } from '../components/Sidebar'
import { VoiceMode } from '../components/VoiceMode'
import { useAuth } from '../store/auth'
import { useChat } from '../store/chat'
import { useUi } from '../store/ui'

export function ChatPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const { settingsOpen, voiceOpen, setVoice } = useUi()
  const privacyAck = useAuth((s) => s.privacyAck)
  const userId = useAuth((s) => s.me?.userId)
  const ephemeralCallId = useRef<string | null>(null)

  useEffect(() => { if (userId) void useChat.getState().init(); return () => useChat.getState().reset() }, [userId])

  const ensureConv = useCallback(async () => {
    if (ephemeralCallId.current) return ephemeralCallId.current
    const c = await useChat.getState().createConversation(true)
    ephemeralCallId.current = c
    return c
  }, [])

  const closeVoice = useCallback(() => {
    const callId = ephemeralCallId.current
    ephemeralCallId.current = null
    if (callId) void useChat.getState().remove(callId)
    setVoice(false)
  }, [setVoice])

  return (
    <div className="app">
      <Sidebar activeId={id} />
      <ChatView key={id ?? 'new'} convId={id} />
      {settingsOpen && <Settings />}
      {voiceOpen && <VoiceMode ensureConv={ensureConv} onClose={closeVoice} />}
      {!privacyAck && <PrivacyGate />}
    </div>
  )
}
