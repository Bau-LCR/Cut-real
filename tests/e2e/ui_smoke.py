"""Prueba de interfaz con Chromium real. El backend se SIMULA solo acá (page.route) para ejercitar el frontend
sin credenciales. Requiere: pip install playwright; la app corriendo con VITE_SUPABASE_URL=http://localhost:54321.
Uso: python3 tests/e2e/ui_smoke.py http://localhost:5199 [carpeta_capturas]"""
import asyncio, json, sys, time, uuid
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:5199'
SHOTS = sys.argv[2] if len(sys.argv) > 2 else '/tmp/shots'
API = 'http://localhost:54321'
UID = '11111111-1111-1111-1111-111111111111'
M1, M2 = 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002'
C1, C2 = 'cccccccc-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000002'
now = time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime())
def conv(i, t): return dict(id=i, title=t, model_id=M1, pinned=False, created_at=now, updated_at=now, last_message_at=now)
def msg(i, c, seq, role, content): return dict(id=i, seq=seq, conversation_id=c, role=role, content=content, status='done', model_id=M1, error=None, sources=[], web_search_used=False, created_at=now, updated_at=now)
MD = "## Resumen\n\nUna **fórmula**: $E = mc^2$ y una lista:\n\n- Uno\n- Dos\n\n| País | Capital |\n|---|---|\n| Argentina | Buenos Aires |\n| Chile | Santiago |\n\n```python\ndef hola():\n    print('hola')\n```\n\n> Una cita\n"
STORE = {
  C1: [msg('m1', C1, 1, 'user', 'Resumime la historia'), msg('m2', C1, 2, 'assistant', MD)],
  C2: [msg('m3', C2, 3, 'user', 'Ejercicios de álgebra'), msg('m4', C2, 4, 'assistant', 'Dale, empecemos.')],
}
CONVS = [conv(C1, 'Resumen de historia'), conv(C2, 'Ejercicios de álgebra')]
MODELS = [dict(id=M1, model_key='llama-3.3-70b-versatile', display_name='Llama 3.3 70B', supports_vision=False, context_window=131072, sort_order=10, provider_slug='groq', provider_name='Groq'),
          dict(id=M2, model_key='llama-3.1-8b-instant', display_name='Llama 3.1 8B (rápido)', supports_vision=False, context_window=131072, sort_order=20, provider_slug='groq', provider_name='Groq')]
CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'}
chat_calls = []

def sse(events): return ''.join(f'data: {json.dumps(e)}\n\n' for e in events)

async def handle(route):
    req = route.request; url = req.url; m = req.method
    if m == 'OPTIONS': return await route.fulfill(status=204, headers=CORS)
    one = 'pgrst.object' in req.headers.get('accept', '')
    def ok(data, status=200): return route.fulfill(status=status, headers={**CORS, 'content-type': 'application/json'}, body=json.dumps(data))
    if '/rpc/cr_ensure_profile' in url: return await ok(dict(role='owner', suspended=False))
    if '/rest/v1/cr_profiles' in url: return await ok(dict(email='ana@example.com', display_name='Ana', avatar_url=None))
    if '/rest/v1/cr_user_settings' in url: return await ok(dict(default_model_id=None, web_search_default=False, voice={}, privacy_notice_ack_at=now))
    if '/rest/v1/cr_available_models' in url: return await ok(MODELS)
    if '/rest/v1/cr_attachments' in url: return await ok([])
    if '/rest/v1/cr_integration' in url: return await ok([])
    if '/rest/v1/cr_conversations' in url:
        if m == 'POST':
            body = json.loads(req.post_data); c = conv(str(uuid.uuid4()), 'Nueva conversación'); c['model_id'] = body.get('model_id'); CONVS.insert(0, c); STORE[c['id']] = []
            return await ok(c, 201)
        if m == 'GET':
            if 'id=eq.' in url:
                cid = url.split('id=eq.')[1].split('&')[0]; c = next((x for x in CONVS if x['id'] == cid), None)
                return await ok(c if one else ([c] if c else []))
            return await ok(CONVS)
        return await ok([])
    if '/rest/v1/cr_messages' in url:
        cid = url.split('conversation_id=eq.')[1].split('&')[0] if 'conversation_id=eq.' in url else None
        return await ok(sorted(STORE.get(cid, []), key=lambda x: -x['seq']))
    if '/functions/v1/chat' in url:
        b = json.loads(req.post_data); chat_calls.append(b)
        if b['mode'] == 'cancel': return await ok(dict(ok=True, cancelled=1))
        cid = b['conversationId']; delay = 3.0 if 'LENTA' in (b.get('content') or '') else 0.8
        await asyncio.sleep(delay)
        n = max([x['seq'] for v in STORE.values() for x in v] + [0])
        um = msg(str(uuid.uuid4()), cid, n + 1, 'user', b['content']); text = f"Respuesta a: {b['content']}"
        am = msg(str(uuid.uuid4()), cid, n + 2, 'assistant', text); STORE[cid] += [um, am]
        return await route.fulfill(status=200, headers={**CORS, 'content-type': 'text/event-stream'}, body=sse([
            dict(type='meta', userMessage=um, assistantMessageId=am['id'], assistantSeq=am['seq'], assistantCreatedAt=now), dict(type='status', status='generating'),
            dict(type='delta', text=text[:10]), dict(type='delta', text=text[10:]), dict(type='done', status='done', error=None, errorCode=None)]))
    return await route.fulfill(status=404, headers=CORS, body='{}')

async def main():
    results = []
    def check(name, cond): results.append((name, bool(cond))); print(('PASS ' if cond else 'FAIL ') + name)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for label, vp, mobile in [('desktop', dict(width=1366, height=820), False), ('mobile', dict(width=390, height=780), True)]:
            ctx = await b.new_context(viewport=vp, is_mobile=mobile, has_touch=mobile, device_scale_factor=2 if mobile else 1)
            sess = dict(access_token='x.y.z', refresh_token='r', token_type='bearer', expires_in=3600, expires_at=int(time.time()) + 3600,
                        user=dict(id=UID, email='ana@example.com', aud='authenticated', role='authenticated', app_metadata={}, user_metadata={}, created_at=now))
            await ctx.add_init_script(f"localStorage.setItem('cutreal2-auth', {json.dumps(json.dumps(sess))})")
            await ctx.route(API + '/**', handle)
            page = await ctx.new_page()
            errors = []; page.on('pageerror', lambda e: errors.append(str(e)))
            await page.goto(BASE + '/'); await page.wait_for_selector('.empty', timeout=10000)
            check(f'[{label}] pantalla de inicio con logo', await page.locator('.empty img').count() == 1)
            await page.screenshot(path=f'{SHOTS}/{label}-1-inicio.png')
            if mobile: await page.click('.menu-btn'); await page.wait_for_selector('.sidebar.open'); await page.wait_for_timeout(450); await page.screenshot(path=f'{SHOTS}/{label}-2-menu.png')
            await page.click(f'.conv a[href="#/c/{C1}"]'); await page.wait_for_selector('.md table', timeout=8000)
            check(f'[{label}] Markdown: tabla renderizada', await page.locator('.md table').count() == 1)
            check(f'[{label}] Markdown: código con botón copiar', await page.locator('.codehead').count() == 1)
            check(f'[{label}] Markdown: fórmula KaTeX', await page.locator('.katex').count() >= 1)
            check(f'[{label}] sin símbolos de formato literales', '##' not in await page.locator('.md').first.inner_text() and '**' not in await page.locator('.md').first.inner_text())
            await page.screenshot(path=f'{SHOTS}/{label}-3-chat.png')
            if label == 'desktop':
                # Dos generaciones simultáneas: C1 (lenta) y C2 (rápida)
                await page.fill('textarea', 'pregunta LENTA uno'); await page.click('.send')
                await page.wait_for_selector('.typing', timeout=3000)
                await page.click(f'.conv a[href="#/c/{C2}"]'); await page.wait_for_selector('text=Dale, empecemos.')
                check('conv 1 sigue generando mientras estoy en conv 2 (indicador en barra lateral)', await page.locator('.conv .busy').count() == 1)
                await page.fill('textarea', 'pregunta rapida dos'); await page.click('.send')
                await page.wait_for_selector('text=Respuesta a: pregunta rapida dos', timeout=6000)
                check('conv 2 terminó sin esperar a conv 1', await page.locator('.conv .busy').count() == 1)
                await page.click(f'.conv a[href="#/c/{C1}"]')
                await page.wait_for_selector('text=Respuesta a: pregunta LENTA uno', timeout=8000)
                check('conv 1 completó su propia respuesta de forma independiente', True)
                check('las dos solicitudes viajaron separadas', [c['conversationId'] for c in chat_calls if c['mode'] == 'send'] == [C1, C2])
                # Cancelación individual
                await page.fill('textarea', 'otra LENTA tres'); await page.click('.send'); await page.wait_for_selector('.send.stop')
                await page.click('.send.stop'); await page.wait_for_timeout(300)
                check('cancelar llama a la función con mode=cancel', any(c['mode'] == 'cancel' and c['conversationId'] == C1 for c in chat_calls))
                check('botón vuelve a "enviar" tras cancelar', await page.locator('.send.stop').count() == 0)
                # Nueva conversación se crea en el primer envío
                await page.click('text=Nueva conversación'); await page.wait_for_selector('.empty')
                await page.fill('textarea', 'hola nueva'); await page.press('textarea', 'Enter')
                await page.wait_for_selector('text=Respuesta a: hola nueva', timeout=6000)
                check('primer mensaje crea conversación y navega', '#/c/' in page.url)
                # Búsqueda
                await page.screenshot(path=f'{SHOTS}/{label}-4-concurrente.png')
            check(f'[{label}] sin errores de JS', not errors)
            if mobile:
                check('[mobile] sin scroll horizontal', await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'))
            await ctx.close()
        await b.close()
    bad = [n for n, ok in results if not ok]
    print(f'\n{len(results) - len(bad)}/{len(results)} comprobaciones OK'); sys.exit(1 if bad else 0)
asyncio.run(main())
