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

En **Administración → Memory Task** está el asistente de vinculación. Generá allí un par ES256, registrá la clave pública en la aplicación correspondiente de Memory Task y pegá en el asistente la URL de API, el App ID y la API key. Descargá el archivo de secretos y cargalo desde la raíz del repositorio:

```bash
npx supabase secrets set --env-file memory-task-secrets.env
```

Después actualizá el estado y ejecutá **Probar conexión**. El archivo contiene credenciales privadas: no lo subas a GitHub y eliminá la copia local una vez cargados los secretos. La clave privada nunca se registra en Memory Task; allí solo se almacena la clave pública.
