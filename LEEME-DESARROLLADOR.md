# Pere'z Burger · Panel de control v3 — instrucciones de instalación

Sitio **estático** (HTML + CSS + JS, sin build ni dependencias de npm). Se sube tal cual a cualquier hosting.
Backend: **Supabase** (Auth + Storage), configurado en `config.js`.

> Es una instalación **nueva y paralela** a la versión actual (`juani11299.github.io/perez-burger-control`).
> No debe compartir el proyecto de Supabase ni tocar esa web.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | Página única (login + panel) |
| `styles.css` | Estilos |
| `app.js` | Lógica de la app |
| `sync.js` | Login (Supabase Auth) y sincronización con Supabase Storage |
| `config.js` | **URL y clave anon de Supabase (lo único que hay que completar)** |
| `logo.png`, `logo-rojo.png` | Logos |

Todas las rutas son relativas: funciona en la raíz de un dominio o en una subcarpeta (ej. `/perez-burger/`).

## 1. Supabase (proyecto nuevo)

1. Crear un proyecto nuevo.
2. **Storage → New bucket**: nombre `perez-burger`, **privado** (no public).
3. **SQL Editor** → ejecutar:

```sql
create policy "pb_select" on storage.objects for select to authenticated
  using (bucket_id = 'perez-burger');
create policy "pb_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'perez-burger');
create policy "pb_update" on storage.objects for update to authenticated
  using (bucket_id = 'perez-burger') with check (bucket_id = 'perez-burger');
create policy "pb_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'perez-burger');
```

4. **Authentication → Sign In / Providers** → desactivar **"Allow new users to sign up"** (si no, cualquiera con la clave anon podría registrarse y ver los datos).
5. **Authentication → Users → Add user**: crear un usuario por persona, con **Auto Confirm User**.
   - En la app se ingresa con el usuario sin dominio: `juan` → se completa como `juan@perezburger.app`.
   - Para usar otro dominio, cambiar `USER_EMAIL_DOMAIN` en `config.js`. También se puede escribir el email completo.

## 2. `config.js`

```js
window.PB_CONFIG = {
  SUPABASE_URL:      'https://<proyecto>.supabase.co',
  SUPABASE_ANON_KEY: '<anon / publishable key>',   // NUNCA la service_role / secret
  BUCKET:            'perez-burger',
  USER_EMAIL_DOMAIN: 'perezburger.app',
};
```

Con `SUPABASE_ANON_KEY` vacío, la app arranca en **modo local** (sin login, guarda solo en el navegador). Sirve para probar.

## 3. Hosting

- Subir los archivos a cualquier hosting estático (subdominio propio recomendado, ej. `panel.dominio.com`).
- **HTTPS obligatorio** (Supabase Auth).
- **Recomendado: un origen propio** (subdominio). La app guarda datos en `localStorage` con las claves `hamburgueseria_data`, `perez_historial_meses`, `hamburgueseria_autobackups`, `pb_sync_*` y `pb_auth`. No debe compartir origen con la versión vieja de la app.
- Si el sitio usa **Content-Security-Policy**, permitir:
  - `script-src`: `https://cdnjs.cloudflare.com https://cdn.jsdelivr.net`
  - `style-src`: `https://fonts.googleapis.com` · `font-src`: `https://fonts.gstatic.com`
  - `connect-src`: `https://<proyecto>.supabase.co`
- Librerías por CDN: Chart.js 4.4.1 (cdnjs) y supabase-js 2.45.4 (jsdelivr).

## 4. Cómo guarda los datos

- Supabase Storage, bucket `perez-burger`:
  - `current.json` → mes en curso.
  - `historial/<Mes>_<Año>.json` → un archivo por mes cerrado.
- Cada cambio se guarda primero en el navegador y se sube solo. Si dos personas editan a la vez, la app **fusiona los cambios registro por registro** (merge de 3 vías con verificación posterior), en vez de pisarlos.
- Revisa la nube cada 20 s y al volver a la pestaña. Sin conexión reintenta solo.
- Link de solo lectura: `?readonly=1` (también requiere login).

## 5. Migrar datos desde la versión actual (opcional)

- Mes en curso: en la web vieja, botón **Backup** → descarga un `.json`. En la nueva: menú **⋯ → Restaurar backup**.
- Meses anteriores (historial): en la versión vieja están en Supabase Storage del proyecto viejo, en `historial/*.json`. Se pueden copiar tal cual a `historial/` del bucket nuevo. La app nueva los lee y los convierte sola al abrirlos.

## Seguridad — importante

La versión actual tiene la clave **service_role** de Supabase publicada en el repositorio público de GitHub (`app.js` y `perez-burger-control.html`). Cualquiera con esa clave puede leer o borrar los datos del proyecto viejo.
Cuando la versión nueva esté funcionando, **rotar las claves del proyecto viejo** (Project Settings → API / JWT Keys). Esto deja sin sincronización a la web vieja.

## Actualizaciones futuras

Los datos viven en Supabase, no en los archivos: reemplazar los archivos **no borra ni modifica datos**.

Para subir una versión nueva:
1. Reemplazar `index.html`, `styles.css`, `app.js`, `sync.js` y los logos.
2. **No pisar `config.js`**: tiene la URL y la clave del Supabase de producción. Si viene uno nuevo en el paquete, ignorarlo.
3. Los archivos llevan versión en `index.html` (`app.js?v=3.1`, etc.) para que los navegadores no usen copias viejas. Cada entrega nueva trae el número actualizado.
4. Si una versión cambia el formato de los datos, la app los convierte sola al abrirlos (función `migrateData` en `app.js`). No hace falta tocar Supabase.

Antes de cada actualización, recomendable: menú **⋯ → Descargar backup (JSON)** desde la web, o descargar el bucket `perez-burger` desde Supabase.
