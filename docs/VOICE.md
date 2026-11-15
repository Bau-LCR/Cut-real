# Voz de Cut-real

## Motores disponibles
| Función | Motor | Configuración |
|---|---|---|
| Dictado | Groq Whisper | `GROQ_API_KEY` y permiso de micrófono |
| Lectura del navegador | `speechSynthesis` | Depende de las voces instaladas en el dispositivo |
| Lectura natural de Cut-real | Gemini 3.8 Flash TTS | `GEMINI_API_KEY` y `GEMINI_TTS_MODEL=gemini-3.8-flash-tts` |
| Alternativa compatible | API OpenAI-compatible `/audio/speech` | `TTS_PROVIDER=openai`, `TTS_BASE_URL`, `TTS_API_KEY`, `TTS_MODEL` |

## Configuración recomendada
En Configuración → Voz, elegí **Proveedor externo** para utilizar Gemini TTS. El backend genera audio con una instrucción de español rioplatense natural, pausas moderadas y entonación conversacional. Las voces predefinidas incluyen Kore, Puck, Charon, Aoede, Zephyr, Enceladus, Gacrux y Sulafat.

El modelo de referencia es `gemini-3.8-flash-tts`. Google también publica modelos TTS de otras versiones; confirmá disponibilidad y cuota en AI Studio antes de cambiarlo. La integración usa el endpoint Interactions de Gemini y devuelve audio WAV.

La función limita cada texto a 4.000 caracteres, 30 solicitudes por minuto y 60 por día por usuario. La generación remota puede tardar más que la voz local y consume cuota del proveedor. Si el proveedor no está configurado o falla, la aplicación puede recurrir a la voz del navegador.

## Modo conversación
El modo conversación utiliza el motor seleccionado en Configuración. El navegador debe permitir audio y micrófono; los auriculares ayudan a reducir eco.

## Privacidad
El texto leído se envía al proveedor de TTS configurado para generar el audio. No coloques claves en el frontend ni en el repositorio. Las claves deben guardarse únicamente como secretos de Supabase.
