# Escaneo LOOPS en Vercel — página + Monday + mail

Este proyecto deja el escaneo **funcionando en la web**, y cada vez que alguien lo
completa:

- carga un ítem en tu tablero de **Monday** con el PDF adjunto, y
- te manda un **mail** con el resumen del lead y el PDF.

Todo en un mismo dominio de Vercel, así que **no hay que pegar ninguna URL**: la
página ya llama a `/api/escaneo-monday` sola.

## Qué hay en la carpeta

- `index.html` → el escaneo (la página que ve la gente). Ya viene conectada.
- `api/escaneo-monday.js` → la función que carga en Monday y manda el mail.
- `package.json`, `vercel.json` → configuración mínima.

---

## Paso 1 — Subir el proyecto a Vercel

**Opción rápida (sin GitHub) — desde tu compu:**
1. Descomprimí esta carpeta.
2. Abrí una terminal dentro de la carpeta y corré: `npx vercel`
3. Seguí las preguntas (login, nombre del proyecto). Al terminar te da una URL
   tipo `https://escaneo-loops.vercel.app`.
4. Para dejarlo en producción: `npx vercel --prod`.

**Opción con GitHub:**
1. Subí esta carpeta a un repositorio de GitHub.
2. En Vercel → **Add New… → Project → Import** ese repo → **Deploy**.

> Si preferís, este paso lo hacemos juntos por el navegador y te voy guiando.

---

## Paso 2 — Cargar las claves (Variables de Entorno)

En Vercel: **tu proyecto → Settings → Environment Variables**. Agregá estas:

| Nombre | Para qué | Ejemplo / valor |
|---|---|---|
| `MONDAY_TOKEN` | Cargar el lead en Monday | (tu token de Monday, ver Paso 3) |
| `RESEND_API_KEY` | Enviar el mail | (tu clave de Resend, ver Paso 4) |
| `MAIL_TO` | A qué mail te llega el aviso | `olpagroup25@gmail.com` |
| `MAIL_FROM` | Remitente del mail | dejalo vacío para arrancar (usa uno de prueba) |

Después de agregarlas, **volvé a desplegar** (`npx vercel --prod`, o en Vercel el
botón **Redeploy**) para que la función las tome.

> Podés poner solo `MONDAY_TOKEN` (carga a Monday nada más), solo las de mail
> (aviso por mail nada más), o las cuatro (las dos cosas). Lo que falte, se saltea
> sin romper nada.

---

## Paso 3 — Token de Monday

En **monday.com**: foto de perfil (abajo izq.) → **Desarrolladores** →
**Mis tokens de acceso** → copiá el token → pegalo en `MONDAY_TOKEN`.
(Si no aparece: **Administración → Conexiones → API**.)

---

## Paso 4 — Clave de Resend (para el mail)

1. Entrá a **resend.com** y creá una cuenta **con tu mail `olpagroup25@gmail.com`**
   (gratis, hasta 100 mails por día).
2. **API Keys → Create API Key** → copiá la clave → pegala en `RESEND_API_KEY`.
3. Para arrancar, dejá `MAIL_FROM` vacío: la función usa un remitente de prueba
   (`onboarding@resend.dev`) que puede enviarte mails **a tu propia dirección**
   (por eso `MAIL_TO` tiene que ser la misma con la que te registraste).
4. (Opcional, para más adelante) Si querés que el mail salga desde tu dominio
   (ej: `escaneo@loops.com.ar`), en Resend verificás el dominio y ponés esa
   dirección en `MAIL_FROM`.

---

## Probar

1. Entrá a la URL pública del escaneo y completá uno (poné empresa, email y teléfono).
2. En la pantalla de resultados esperá unos segundos.
3. Revisá: (a) el tablero de Monday — https://qida-force.monday.com/boards/18429427030 —
   tiene que aparecer la fila con el PDF; y (b) tu casilla `olpagroup25@gmail.com` —
   tiene que llegar el mail con el resumen y el PDF.

## Si algo no llega

- **No carga en Monday** → revisá que `MONDAY_TOKEN` esté bien y que redeployaste.
- **No llega el mail** → revisá `RESEND_API_KEY` y `MAIL_TO`; y que `MAIL_TO` sea la
  misma dirección con la que te registraste en Resend (mientras uses el remitente
  de prueba). Mirá también la carpeta de spam la primera vez.
- **La página abre pero no manda nada** → asegurate de haber desplegado la carpeta
  completa (que exista `/api/escaneo-monday`).
