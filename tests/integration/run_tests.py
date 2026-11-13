"""Integración: Edge Functions REALES (Deno) + Postgres con las migraciones REALES + PostgREST real. Solo Groq/GoTrue están simulados."""
import hashlib, json, subprocess, sys, threading, time, uuid, requests

CHAT, ADMIN, API, MOCK = 'http://127.0.0.1:8001', 'http://127.0.0.1:8002', 'http://127.0.0.1:8003', 'http://127.0.0.1:54321'
ANA, OWNER, BOB = ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333')
T = {'ana': 'token-ana', 'owner': 'token-owner', 'bob': 'token-bob'}
results = []
def check(name, cond, extra=''):
    results.append(bool(cond)); print(('PASS ' if cond else 'FAIL ') + name + (f'  [{extra}]' if (not cond and extra) else ''))

def sql(q):
    r = subprocess.run(['su', 'postgres', '-c', 'psql -At -F "|" -d crint'], input=q, text=True, capture_output=True)
    if r.returncode or 'ERROR' in r.stderr: raise RuntimeError(r.stderr)
    return [l for l in r.stdout.strip().split('\n') if l]
def one(q): rows = sql(q); return rows[0].split('|') if rows else None

sql('truncate cr_rate_limits')
MODEL = one("select id from cr_models where model_key='llama-3.3-70b-versatile'")[0]
VISION = one("select id from cr_models where model_key='gemini-2.5-flash'")[0]
def new_conv(uid=ANA):
    cid = str(uuid.uuid4()); sql(f"insert into cr_conversations (id,user_id,model_id) values ('{cid}','{uid}','{MODEL}')"); return cid
def hdr(who): return {'Authorization': f'Bearer {T[who]}', 'Content-Type': 'application/json'}
def events(resp):
    out = []
    for line in resp.iter_lines(decode_unicode=True):
        if line and line.startswith('data:'): out.append(json.loads(line[5:]))
    return out
def send(cid, content, who='ana', model=MODEL, **kw):
    return requests.post(CHAT, headers=hdr(who), json=dict(mode='send', conversationId=cid, modelId=model, content=content, **kw), stream=True)
def msgs(cid): return [r.split('|', 2) for r in sql(f"select role,status,content from cr_messages where conversation_id='{cid}' order by seq")]
def groq_last(): return json.dumps(requests.get(MOCK + '/__state').json()['groq_requests'][-1], ensure_ascii=False)
def admin(who, action, **p): return requests.post(ADMIN, headers=hdr(who), json=dict(action=action, **p))

# ---------------------------------------------------------------- chat
r = requests.post(CHAT, json={}); check('chat sin sesión => 401', r.status_code == 401)
r = requests.post(CHAT, headers=hdr('ana'), json=dict(mode='send', conversationId='nope')); check('conversationId inválido => 400', r.status_code == 400)
c1 = new_conv()
r = send(c1, 'x' * 20001); check('mensaje demasiado largo => 400', r.status_code == 400 and r.json()['error'] == 'content_too_long')

r = send(c1, 'Hola mundo'); ev = events(r)
check('stream: meta → deltas → done', [e['type'] for e in ev][0] == 'meta' and ev[-1]['type'] == 'done' and ev[-1]['status'] == 'done')
check('deltas recibidos completos', ''.join(e['text'] for e in ev if e['type'] == 'delta') == 'p0 p1 p2 p3 p4 ')
time.sleep(0.5)
m = msgs(c1)
check('mensaje de usuario y respuesta persistidos', [(a, b) for a, b, _ in m] == [('user', 'done'), ('assistant', 'done')] and m[1][2].strip() == 'p0 p1 p2 p3 p4')
check('título automático desde el primer mensaje', one(f"select title from cr_conversations where id='{c1}'")[0] == 'Hola mundo')
u = one("select status,prompt_tokens,completion_tokens from cr_usage_events where kind='chat' order by id desc limit 1")
check('uso registrado con tokens', u == ['ok', '11', '5'], str(u))
check('Groq recibió prompt de sistema + mensaje', '"role": "system"' in groq_last() and 'Hola mundo' in groq_last())

send(c1, 'segunda pregunta').content
time.sleep(0.4)
last = requests.get(MOCK + '/__state').json()['groq_requests'][-1]['messages']
check('mantiene el contexto (sistema+user+asistente+user)', [x['role'] for x in last] == ['system', 'user', 'assistant', 'user'])

# editar y regenerar
first_user = one(f"select id from cr_messages where conversation_id='{c1}' and role='user' order by seq limit 1")[0]
r = requests.post(CHAT, headers=hdr('ana'), json=dict(mode='edit', conversationId=c1, modelId=MODEL, messageId=first_user, content='Pregunta editada'), stream=True); events(r); time.sleep(0.4)
m = msgs(c1)
check('editar: borra lo posterior y regenera', len(m) == 2 and m[0][2] == 'Pregunta editada' and m[1][1] == 'done', str(m))
asst = one(f"select id from cr_messages where conversation_id='{c1}' and role='assistant'")[0]
r = requests.post(CHAT, headers=hdr('ana'), json=dict(mode='regenerate', conversationId=c1, modelId=MODEL, messageId=asst), stream=True); events(r); time.sleep(0.4)
check('regenerar: reemplaza la respuesta', len(msgs(c1)) == 2 and one(f"select id from cr_messages where conversation_id='{c1}' and role='assistant'")[0] != asst)

# ---- conversaciones simultáneas e independientes
ca, cb = new_conv(), new_conv(); done = {}
def run_slow(): done['a'] = events(send(ca, 'SLOW pregunta A')); done['a_t'] = time.time()
th = threading.Thread(target=run_slow); th.start(); time.sleep(1.0)
st = one(f"select status from cr_messages where conversation_id='{ca}' and role='assistant'")[0]
t0 = time.time(); evb = events(send(cb, 'pregunta B')); tb = time.time() - t0
check('A sigue generando mientras B responde y termina', st == 'generating' and evb[-1]['status'] == 'done' and tb < 3)
r = send(ca, 'otra mientras genera'); check('misma conversación ocupada => 409 already_generating', r.status_code == 409 and r.json()['error'] == 'already_generating')
th.join(); check('A termina de forma independiente', done['a'][-1]['status'] == 'done')
mid = one(f"select content from cr_messages where conversation_id='{ca}' and role='assistant'")[0]
check('A guardó la respuesta completa (60 partes)', mid.count('p') >= 60)

# ---- cancelación individual
cc = new_conv(); box = {}
def run_cancel(): box['ev'] = events(send(cc, 'SLOW para cancelar'))
th = threading.Thread(target=run_cancel); th.start(); time.sleep(1.3)
ab0 = requests.get(MOCK + '/__state').json()['groq_aborted']
r = requests.post(CHAT, headers=hdr('ana'), json=dict(mode='cancel', conversationId=cc)); check('cancel => ok y 1 cancelada', r.json() == {'ok': True, 'cancelled': 1}, r.text)
th.join(timeout=8)
st, content = one(f"select status,content from cr_messages where conversation_id='{cc}' and role='assistant'")[0:2]
check('estado final cancelled con contenido parcial', st == 'cancelled' and 0 < len(content) < 100, f'{st} {len(content)}')
check('el stream terminó con done/cancelled', box['ev'][-1]['status'] == 'cancelled')
time.sleep(0.5); check('se abortó la llamada al proveedor (no sigue gastando)', requests.get(MOCK + '/__state').json()['groq_aborted'] > ab0)
cc2 = new_conv(); r = requests.post(CHAT, headers=hdr('bob'), json=dict(mode='cancel', conversationId=cc)); check('otro usuario no puede cancelar mi generación', r.json()['cancelled'] == 0)

# ---- desconexión del cliente: la respuesta continúa en el servidor
cd = new_conv(); r = send(cd, 'SLOW desconexion'); it = r.iter_lines(); next(it); time.sleep(0.6); r.close()
time.sleep(0.8); st = one(f"select status from cr_messages where conversation_id='{cd}' and role='assistant'")[0]
check('tras cerrar el navegador sigue "generating" en servidor', st == 'generating')
time.sleep(9.5); st, content = one(f"select status,content from cr_messages where conversation_id='{cd}' and role='assistant'")[0:2]
check('la respuesta se completó y quedó guardada (recuperable)', st == 'done' and content.count('p') >= 60, f'{st} {len(content)}')

# ---- error de proveedor: mensaje seguro
ce = new_conv(); ev = events(send(ce, 'RATELIMIT prueba')); time.sleep(0.3)
check('error del proveedor => estado error con mensaje seguro', ev[-1]['status'] == 'error' and 'límite' in ev[-1]['error'] and 'rl' not in ev[-1]['error'].split(' ')[0:1], str(ev[-1]))
check('error registrado en estadísticas', one("select error_code from cr_usage_events where status='error' order by id desc limit 1")[0] == 'provider_rate_limited')

# ---- adjuntos
cf = new_conv()
sql(f"insert into cr_attachments (id,user_id,storage_path,file_name,mime_type,size_bytes,status,extracted_text) values "
    f"('aaaaaaaa-1111-1111-1111-000000000001','{ANA}','{ANA}/a.txt','notas.txt','text/plain',20,'processed','CONTENIDO_SECRETO_DEL_ARCHIVO'),"
    f"('aaaaaaaa-1111-1111-1111-000000000002','{ANA}','{ANA}/b.pdf','escaneo.pdf','application/pdf',20,'attached_only',null),"
    f"('aaaaaaaa-1111-1111-1111-000000000003','{ANA}','{ANA}/c.png','foto.png','image/png',20,'attached_only',null)")
events(send(cf, 'Resumí estos archivos', attachmentIds=['aaaaaaaa-1111-1111-1111-000000000001', 'aaaaaaaa-1111-1111-1111-000000000002', 'aaaaaaaa-1111-1111-1111-000000000003'])); time.sleep(0.4)
g = groq_last()
check('archivo procesado: su contenido llega al modelo', 'CONTENIDO_SECRETO_DEL_ARCHIVO' in g)
check('archivo sin procesar: se avisa que NO hay acceso al contenido', 'escaneo.pdf' in g and 'NO se pudo procesar' in g)
check('imagen con modelo sin visión: se avisa y no se finge verla', 'no puede ver imágenes' in g)
check('adjuntos quedaron vinculados al mensaje', one("select count(*) from cr_attachments where message_id is not null")[0] == '3')

# ---- seguridad entre usuarios, rate limit, suspensión
r = send(c1, 'hola', who='bob'); check('no se puede escribir en la conversación de otro usuario (404)', r.status_code == 404)
sql("update cr_models set user_rpm_limit=2 where id='%s'" % MODEL); cr = new_conv(BOB)
codes = []
for i in range(3):
    rr = send(new_conv(BOB), f'm{i}', who='bob'); codes.append(rr.status_code)
    if rr.status_code == 200: events(rr)
check('límite por usuario/modelo: 3.ª solicitud => 429', codes[:2] == [200, 200] and codes[2] == 429, str(codes))
sql("update cr_models set user_rpm_limit=20 where id='%s'" % MODEL)
sql(f"update cr_user_roles set suspended=true where user_id='{BOB}'"); r = send(new_conv(BOB), 'hola', who='bob')
check('usuario suspendido => 403', r.status_code == 403 and r.json()['error'] == 'suspended')
sql(f"update cr_user_roles set suspended=false where user_id='{BOB}'")

# ---------------------------------------------------------------- admin
r = admin('ana', 'stats'); check('admin: usuario común => 403', r.status_code == 403)
r = admin('owner', 'stats'); check('admin: propietario ve estadísticas', r.status_code == 200 and r.json()['messages'] > 5 and r.json()['users'] == 3)
check('estadísticas incluyen modelos y proveedores usados', any('Llama' in x['model'] for x in r.json()['by_model']) and any(x['provider'] == 'Groq' for x in r.json()['by_provider']))
r = admin('owner', 'providers.list'); txt = r.text
check('proveedores: estado de clave sin exponer el secreto', 'test-groq' not in txt and {p['slug']: p['key_configured'] for p in r.json()['providers']} == {'groq': True, 'gemini': False}, txt[:200])
r = admin('owner', 'users.setRole', userId=ANA, role='admin'); check('propietario promueve a admin', r.status_code == 200 and one(f"select role from cr_user_roles where user_id='{ANA}'")[0] == 'admin')
r = admin('ana', 'users.setRole', userId=BOB, role='admin'); check('un admin NO puede promover a otros (solo propietario)', r.status_code == 403)
r = admin('ana', 'users.suspend', userId=OWNER, reason='intento'); check('un admin no puede suspender al propietario', r.status_code == 403)
r = admin('owner', 'users.suspend', userId=BOB, reason='spam'); check('suspender con motivo', r.status_code == 200 and one(f"select suspended from cr_user_roles where user_id='{BOB}'")[0] == 't')
admin('owner', 'users.restore', userId=BOB)
r = admin('owner', 'conversations.messages', conversationId=c1); check('leer conversación SIN motivo => 400', r.status_code == 400)
r = admin('owner', 'conversations.messages', conversationId=c1, reason='soporte ticket #42'); check('leer conversación con motivo => 200', r.status_code == 200 and len(r.json()['messages']) == 2)
check('el acceso quedó auditado (quién, qué, por qué)', one("select actor_id,action,reason from cr_audit_logs where action='admin.view_conversation'") == [OWNER, 'admin.view_conversation', 'soporte ticket #42'])
r = admin('owner', 'users.setRole', userId=ANA, role='user'); check('revocar admin', r.status_code == 200)
r = admin('owner', 'providers.save', slug='x', name='X', base_url='http://inseguro', api_key_env='X_KEY', enabled=True); check('proveedor con http:// rechazado', r.status_code == 400)
r = admin('owner', 'providers.save', slug='x', name='X', base_url='https://x.example', api_key_env='sk-real-secret-value', enabled=True); check('rechaza pegar una clave en api_key_env', r.status_code == 400)

# ---------------------------------------------------------------- API propia
r = admin('owner', 'keys.create', name='test-full', scopes=['models:read', 'chat:write'], rate_limit_per_minute=100); key = r.json()['secret']
check('clave creada: se muestra completa una vez (crk_…)', r.status_code == 200 and key.startswith('crk_') and len(key) == 47)
check('en la base solo está el hash SHA-256', one(f"select key_hash from cr_api_keys where name='test-full'")[0] == hashlib.sha256(key.encode()).hexdigest() and key not in json.dumps(sql('select * from cr_api_keys')))
check('keys.list no devuelve hash ni secreto', 'key_hash' not in admin('owner', 'keys.list').text and key not in admin('owner', 'keys.list').text)
H = {'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'}
check('API sin clave => 401', requests.get(API + '/api/v1/models').status_code == 401)
check('API con clave de formato inválido => 401', requests.get(API + '/api/v1/models', headers={'Authorization': 'Bearer sk-abc'}).status_code == 401)
r = requests.get(API + '/api/v1/models', headers=H); check('GET /v1/models', r.status_code == 200 and any(m['name'] == 'groq/llama-3.3-70b-versatile' for m in r.json()['data']) and not any('gemini' in m['name'] for m in r.json()['data']))
r = requests.post(API + '/api/v1/chat/completions', headers=H, json=dict(model='groq/llama-3.3-70b-versatile', messages=[dict(role='user', content='hola api')]))
check('POST /v1/chat/completions (sin stream) compatible OpenAI', r.status_code == 200 and r.json()['choices'][0]['message']['content'] == 'p0 p1 p2 p3 p4 ' and r.json()['usage']['completion_tokens'] == 5, r.text[:200])
r = requests.post(API + '/api/v1/chat/completions', headers=H, json=dict(model=MODEL, stream=True, messages=[dict(role='user', content='hola stream')]), stream=True)
lines = [l for l in r.iter_lines(decode_unicode=True) if l]
check('POST /v1/chat/completions (stream) con [DONE]', lines[-1] == 'data: [DONE]' and sum('chat.completion.chunk' in l for l in lines) >= 6)
r = requests.post(API + '/api/v1/chat/completions', headers=H, json=dict(model='nope/x', messages=[dict(role='user', content='x')])); check('modelo inexistente => 404', r.status_code == 404)
r = requests.post(API + '/api/v1/chat/completions', headers=H, json=dict(model=MODEL, messages=[dict(role='root', content='x')])); check('validación de roles => 400', r.status_code == 400)
time.sleep(0.5); check('uso de la API registrado por clave', int(one("select count(*) from cr_usage_events where kind='api' and api_key_id is not null")[0]) >= 2 and one("select last_used_at is not null from cr_api_keys where name='test-full'")[0] == 't')
k2 = admin('owner', 'keys.create', name='solo-lectura', scopes=['models:read'], rate_limit_per_minute=2).json(); H2 = {'Authorization': f"Bearer {k2['secret']}", 'Content-Type': 'application/json'}
r = requests.post(API + '/api/v1/chat/completions', headers=H2, json=dict(model=MODEL, messages=[dict(role='user', content='x')])); check('scope insuficiente => 403', r.status_code == 403 and r.json()['error'] == 'insufficient_scope')
codes = [requests.get(API + '/api/v1/models', headers=H2).status_code for _ in range(3)]; check('rate limit por clave => 429', codes == [200, 200, 429] or codes[-1] == 429, str(codes))
admin('owner', 'keys.revoke', id=k2['id']); check('clave revocada => 401', requests.get(API + '/api/v1/models', headers=H2).status_code == 401)
check('keys.usage devuelve actividad', admin('owner', 'keys.usage', id=one("select id from cr_api_keys where name='test-full'")[0]).json()['requests_24h'] >= 2)

# ---------------------------------------------------------------- secretos
allout = ''.join([r.text for r in [admin('owner', a) for a in ('stats', 'providers.list', 'users.list', 'keys.list', 'audit.list', 'integrations.list')]])
check('ninguna respuesta del panel contiene secretos de proveedor', 'test-groq' not in allout and 'service_role' not in allout)

print(f'\n{sum(results)}/{len(results)} comprobaciones OK'); sys.exit(0 if all(results) else 1)
