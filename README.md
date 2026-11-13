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
