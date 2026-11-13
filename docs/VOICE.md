# Voz: dictado, lectura y modo conversación

## Qué hace cada parte
| Función | Motor | Qué necesita |
|---|---|---|
| **Dictado** (micrófono del compositor) | `transcribe` → Whisper (`whisper-large-v3-turbo`) en Groq | `GROQ_API_KEY` en secretos; permiso de micrófono del navegador |
| **Leer respuestas** (pausar, reanudar, detener, velocidad) | Navegador (`speechSynthesis`) por defecto | Nada. Hay voces en español según tu sistema |
| **Leer con proveedor externo** | `tts` → API OpenAI-compatible `/audio/speech` | `TTS_BASE_URL`, `TTS_API_KEY`, `TTS_MODEL`, `TTS_VOICE` |
| **Modo conversación por voz** | Los tres anteriores en bucle | Lo mismo que dictado + un motor de lectura |

El dictado **no envía solo**: el texto transcripto queda en el cuadro para que lo revises. El micrófono requiere HTTPS (o `localhost`).

## Modo conversación por voz
Escuchar → silencio de 1,3 s = fin de turno → transcribir → responder → hablar. Si hablás mientras la IA habla, se interrumpe y vuelve a escucharte (usa cancelación de eco del navegador; con parlantes fuertes puede dispararse solo, mejor con auriculares). Hay botones "Enviar ahora" e "Interrumpir". Los errores (permiso, red, límites) se muestran y el bucle reintenta; los de configuración (sin `GROQ_API_KEY`) lo detienen con un mensaje claro.

## Identidad de voz (inspirada en un robot de combate, original)
Es una **identidad propia**, no un clon de ninguna voz protegida:
- **Navegador:** `pitch` grave (0,55), ritmo algo más lento, preferencia por voces masculinas en español rioplatense/latino. El resultado depende de las voces instaladas en tu sistema.
- **Proveedor externo:** además se procesa el audio en el navegador con una cadena sutil (realce de graves, saturación suave, modulación metálica a 55 Hz con mezcla baja y una resonancia corta de 12 ms). Los parámetros están en `src/voice/engine.ts` (`RemoteEngine`) y se ajustan a gusto.

**Importante:** el sonido final no pudo evaluarse en este entorno (no hay audio). Probalo y ajustá `VOICE_PROFILE` y la cadena de efectos; para una voz más "mecánica" y consistente conviene un proveedor TTS con voz grave.

## Cambiar de motor
Configuración → Voz → *Motor de voz*. Si el motor externo falla o no está configurado, la app avisa y lee con el del navegador. Para sumar otro motor implementá `SpeechEngine` (`speak/pause/resume/stop`) en `src/voice/engine.ts` y registralo en `makeEngine()`. Para otro servicio de transcripción, reemplazá la llamada en `supabase/functions/transcribe/index.ts`.
