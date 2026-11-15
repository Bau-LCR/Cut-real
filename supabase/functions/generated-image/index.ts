import { corsHeaders, errorResponse, HttpError, json } from '../_shared/cors.ts'
import { authenticate, rateLimit } from '../_shared/supabase.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed', 'Método no permitido.')
    const ctx = await authenticate(req)
    await rateLimit(ctx.db, 'generated-image-url:' + ctx.userId, 60)
    const body = await req.json().catch(() => null)
    const id = typeof body?.id === 'string' ? body.id : ''
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
      throw new HttpError(400, 'bad_request', 'Identificador de imagen inválido.')
    const { data: image } = await ctx.db.from('cr_generated_images')
      .select('storage_path, mime_type, alt_text').eq('id', id).eq('user_id', ctx.userId).maybeSingle()
    if (!image) throw new HttpError(404, 'not_found', 'No encontramos esa imagen en tu cuenta.')
    const { data, error } = await ctx.db.storage.from('cr-generated-images').createSignedUrl(image.storage_path, 3600)
    if (error || !data?.signedUrl) throw new HttpError(500, 'image_url_failed', 'No se pudo preparar la imagen.')
    return json(req, { url: data.signedUrl, mimeType: image.mime_type, alt: image.alt_text })
  } catch (e) { return errorResponse(req, e) }
})
