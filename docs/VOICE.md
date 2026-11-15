# Voz: dictado, lectura y modo conversación

## Qué hace cada parte
| Función | Motor | Qué necesita |
|---|---|---|
| **Dictado** | Groq Whisper `whisper-large-v3-turbo` mediante la función `transcribe` | `GROQ_API_KEY` en secretos y permiso de micrófono |
| **Leer respuestas** | `speechSynthesis` del navegador por defecto | Nada; las voces dependen del navegador y del sistema |
| **Lectura con voz externa** | Función `tts` → proveedor OpenAI-compatible `/audio/speech` | `TTS_BASE_URL`, `TTS_API_KEY`, `TTS_MODEL`, `TTS_VOICE` |
| **Modo conversación por voz** | Dictado + chat + motor de lectura | Lo anterior y HTTPS (o localhost) |

El dictado no envía automáticamente: el texto reconocido queda en el cuadro para que lo revises. El permiso de micrófono lo controla el navegador.

## Selección de voz
En Configuración → Voz se puede elegir el motor, la velocidad y una voz en español instalada en el navegador. La selección automática prioriza voces en español latino/argentino y nombres de voz masculinos cuando están disponibles; el catálogo depende del dispositivo.

El motor externo utiliza la voz configurada en el proveedor. De forma predeterminada, la función solicita el modelo `tts-1` y la voz `onyx`, pero el administrador puede cambiarlos mediante secretos. No hay efectos de audio artificiales aplicados después de generar la voz.

**Importante:** la calidad y naturalidad del motor externo no puede garantizarse sin probar el proveedor real. Si no está configurado o falla, Cut-real informa el problema y recurre a la voz del navegador cuando es posible.

## Modo conversación por voz
Escuchar → detectar silencio → transcribir → responder → hablar. La detección de silencio, cancelación de eco y funcionamiento manos libres dependen del navegador, micrófono y dispositivo. Para reducir falsos inicios, probá con auriculares.

## Cambiar de motor
Configuración → Voz → Motor de voz. Para habilitar voz externa, el responsable del servidor debe configurar los cuatro secretos TTS en Supabase y desplegar la función `tts`. Nunca coloques claves TTS en el frontend, repositorio ni navegador.
