# TurnoYa

App web (PWA) de reservas online de turnos para canchas/espacios deportivos. Es un **template genérico configurable**, no está atado a un cliente específico: todo lo que cambia por negocio (nombre, dirección, horarios, servicios, canchas, duración de turno) se edita en un bloque `CONFIG` al principio de `app.js`. Tal como viene configurado por defecto trae dos servicios de ejemplo (Pádel y Fútbol, 3 canchas cada uno, turnos de 60 min).

Incluye:
- **Front público** (`index.html` + `app.js`): grilla de horarios por semana, login de cliente por OTP (código enviado por email vía Supabase Auth), reserva con repetición semanal, "Mis turnos" (ver/cancelar), compartir por WhatsApp, agregar a Google Calendar o descargar `.ics`.
- **Panel admin** (`admin.html` + `admin.js`): login con email/password (Supabase Auth), listado y calendario semanal de reservas, filtros, edición/borrado de turnos, bloqueo manual de horarios, exportar reservas a CSV, borrar reservas pasadas.
- **PWA**: `manifest.json` + `sw.js` (service worker con cache de assets estáticos, instalable en el celular).

## Stack

- HTML/CSS/JS vanilla, sin framework ni build step.
- [Supabase](https://supabase.com) como backend: Auth (OTP para clientes, email/password para admin) + Postgres vía REST (`/rest/v1/...`) para reservas y bloqueos.
- Supabase Edge Function (`supabase/functions/notify-booking/index.ts`): existe pero está **deshabilitada intencionalmente** (devuelve `200 OK` sin hacer nada) — el admin ve las reservas directo desde el panel, no hay notificación automática.
- Fuentes de Google Fonts (Bebas Neue, Outfit) y SDK de Supabase JS cargados por CDN (`jsdelivr`).

No hay `package.json`: no hay dependencias de Node ni proceso de build.

## Cómo correrlo en local

Al ser HTML/JS estático, alcanza con levantarlo con cualquier servidor estático (no se puede abrir con `file://` directo porque los `fetch` a Supabase y el service worker lo requieren servido por HTTP):

```bash
# con Node (npx, sin instalar nada global)
npx serve .

# o con Python
python -m http.server 5500
```

Después abrir `http://localhost:<puerto>/index.html` (front público) o `http://localhost:<puerto>/admin.html` (panel admin).

## Variables de entorno

No hay `.env.example` — no usa variables de entorno. La URL y la key de Supabase están hardcodeadas directamente en el código cliente:

- `app.js` (línea 11-12) y `admin.js` (línea 6-7):
  - `SB_URL = 'https://krxkbpwbkymjasezwvjj.supabase.co'`
  - `SB_KEY = 'sb_publishable_...'` (es la publishable/anon key, pensada para exponerse en el frontend — la seguridad real depende de las políticas RLS configuradas en Supabase, no del secreto de esta key).

Para adaptar el template a otro negocio/cliente hay que editar el bloque `CONFIG` en `app.js` (nombre, dirección, link de Maps, horarios, servicios/canchas) y apuntar `SB_URL`/`SB_KEY` a tu propio proyecto de Supabase.

## Deploy

No se encontró configuración de deploy en el repo (sin `vercel.json`, `netlify.toml` ni CI). El repo está en GitHub: `SMsimarco/turnos-app`. Al ser estático, sirve para deployar tal cual en Vercel, Netlify, GitHub Pages o cualquier hosting de archivos estáticos.
