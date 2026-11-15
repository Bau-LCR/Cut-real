# Voz de Cut-real

## Motores disponibles
| Función | Motor | Configuración |
|---|---|---|
| Dictado | Groq Whisper `whisper-large-v3-turbo` | `GROQ_API_KEY` y permiso de micrófono |
| Lectura del navegador | `speechSynthesis` del navegador | No requiere clave; depende de las voces instaladas |
| Lectura natural de Cut-real | Gemini TTS `gemini-3.8-flash-tts` | `GEMINI_API_KEY` en secretos de Supabase |
| Proveedor alternativo | OpenAI-compatible `/audio/speech` | `TTS_PROVIDER=openai`, `TTS_BASE_URL`, `TTS_API_KEY`, `TTS_MODEL` |

## Voz natural recomendada
La opción recomendada es **Proveedor externo** en Configuración → Voz. Si `GEMINI_API_KEY` está configurada, el backend utiliza Gemini TTS y genera audio WAV con una instrucción de español rioplatense natural, pausas moderadas y entonación conversacional. Se puede elegir una voz predefinida (Kore, Puck, Charon, Aoede, Zephyr, Enceladus, Gacrux o Sulafat).

La función limita el texto a 4.000 caracteres y aplica un máximo de 30 solicitudes por minuto y usuario. La generación remota puede tardar más que la voz local y consume cuota del proveedor. Si el servicio no está disponible, Cut-real informa el error y puede recurrir a la voz del navegador.

## Modo conversación
El modo conversación usa el motor seleccionado en Configuración, incluida la voz remota si está activada. El navegador debe permitir audio y micrófono; usá auriculares para reducir eco.

## Privacidad y seguridad
El texto que se lee en voz alta se envía al proveedor de TTS configurado para generar el audio. No coloques claves en el frontend ni en el repositorio. Las claves se guardan únicamente como secretos de Supabase.
