# Cut-real 2

Aplicación web de inteligencia artificial conversacional.

## Publicación

El frontend se compila con Vite y se publica en GitHub Pages mediante el workflow
`.github/workflows/deploy.yml`. Cada cambio enviado a `main` inicia una nueva
compilación y publicación.

Para publicar manualmente, abrí **Actions → Deploy frontend → Run workflow**.

La aplicación utiliza rutas base de Vite para funcionar tanto en GitHub Pages
como en un dominio propio. El backend y los servicios externos se configuran
por separado; consultá la documentación de `docs/`.


## Conexión con Memory Task

La vinculación se realiza desde las interfaces de ambas aplicaciones, sin cargar secretos manualmente en Supabase:

1. En **Administración → Memory Task**, pulsá **Generar código de vinculación**.
2. Copiá el código temporal y pegalo en **Memory Task → Servicios → Conectar Cut-real**.
3. Pulsá **Vincular ahora**. Memory Task crea o reutiliza la aplicación y la API key, registra la clave pública y entrega las credenciales directamente al backend de Cut-real.
4. Volvé a Cut-real, actualizá el estado y ejecutá **Probar conexión**.

El código vence a los 10 minutos y solo puede usarse una vez. La clave privada ES256 y la API key nunca se muestran al navegador; Cut-real las cifra y conserva en una tabla privada accesible únicamente desde Edge Functions. El cifrado utiliza una clave derivada en el servidor de la service-role key, por lo que no requiere configurar secretos adicionales. Si se rota la service-role key del proyecto, las credenciales cifradas existentes deberán volver a vincularse.

El workflow `deploy-memory-task.yml` aplica la migración y despliega `admin` y `memory-task-pairing` al integrar los cambios en `main`. Para habilitarlo, agregá en GitHub → Settings → Secrets and variables → Actions los secretos `SUPABASE_ACCESS_TOKEN` y `SUPABASE_DB_PASSWORD` de este proyecto. No los pegues en el código ni los compartas. El frontend de GitHub Pages no despliega funciones ni migraciones de Supabase.
