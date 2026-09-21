// =============================================================================
//  LOOPS · Escaneo de Eficiencia Operativa  →  Monday + Email
//  Función serverless de Vercel.
//
//  Cada vez que alguien completa el escaneo, esta función:
//    1) crea un ítem en el tablero de Monday con el PDF adjunto  (si hay MONDAY_TOKEN)
//    2) te manda un mail con el resumen del lead + el PDF        (si hay RESEND_API_KEY)
//
//  Las claves NUNCA van en la página: viven acá, en las Variables de Entorno de
//  Vercel. La página solo llama a /api/escaneo-monday (mismo dominio, sin CORS).
//
//  Variables de entorno (Vercel → Settings → Environment Variables):
//    MONDAY_TOKEN    -> token de la API de Monday        (para cargar en el tablero)
//    RESEND_API_KEY  -> clave de Resend (resend.com)     (para el aviso por mail)
//    MAIL_TO         -> a qué mail te llega el aviso      (ej: olpagroup25@gmail.com)
//    MAIL_FROM       -> remitente (por defecto onboarding@resend.dev, sirve para probar)
// =============================================================================

const BOARD_ID = "18429427030";
const GROUP_ID = "topics";

const COL = {
  segmento:  "dropdown_mm6wsg53",
  referente: "text_mm6tgdre",
  email:     "email_mm6tzpjg",
  telefono:  "phone_mm6t55xk",
  nivel:     "color_mm6tv0w0",
  indice:    "numeric_mm6ta7hh",
  margen:    "numeric_mm6t2ta2",
  obras:     "numeric_mm6tr4fq",
  m2:        "numeric_mm6tbf6e",
  zonas:     "text_mm6tj7aq",
  fecha:     "date_mm6t22v1",
  pdf:       "file_mm6tw38v",
  estado:    "color_mm6tpreb",
};
const NIVEL_LABEL = { 1: "N1 · Crítico", 2: "N2 · En desarrollo", 3: "N3 · Sólido" };

const MONDAY_API  = "https://api.monday.com/v2";
const MONDAY_FILE = "https://api.monday.com/v2/file";
const RESEND_API  = "https://api.resend.com/emails";

const toNumber = (v) => {
  if (v == null) return "";
  const d = String(v).replace(/[^\d]/g, "");
  return d === "" ? "" : String(parseInt(d, 10));
};
const todayISO = (iso) => {
  const d = iso ? new Date(iso) : new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const esc = (s) => String(s == null ? "" : s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));

// Sube un PDF (base64) a la columna de archivo de un ítem existente. Devuelve true/false.
async function uploadPdfToItem(TOKEN, itemId, pdfBase64, pdfNombre, nombre) {
  try {
    const bytes = Buffer.from(pdfBase64, "base64");
    const fileName = (pdfNombre || `Escaneo ${nombre || itemId}.pdf`).toString();
    const fd = new FormData();
    fd.append("query", `mutation ($file: File!) { add_file_to_column (item_id: ${itemId}, column_id: "${COL.pdf}", file: $file) { id } }`);
    fd.append("map", JSON.stringify({ "0": ["variables.file"] }));
    fd.append("0", new Blob([bytes], { type: "application/pdf" }), fileName);
    const rf = await fetch(MONDAY_FILE, { method: "POST", headers: { Authorization: TOKEN, "API-Version": "2024-10" }, body: fd });
    const jf = await rf.json();
    return !jf.errors;
  } catch { return false; }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // body: Vercel ya lo parsea si viene como JSON; si no, lo intentamos parsear.
  let lead = req.body;
  if (typeof lead === "string") { try { lead = JSON.parse(lead); } catch { lead = {}; } }
  if (!lead || typeof lead !== "object") lead = {};

  // PASO 2 (opcional): solo adjuntar el PDF a un ítem YA creado (el escaneo lo llama aparte).
  if (lead.attachOnly && lead.itemId) {
    const T = process.env.MONDAY_TOKEN;
    let pdfAdjunto = false;
    if (T && lead.pdfBase64) pdfAdjunto = await uploadPdfToItem(T, lead.itemId, lead.pdfBase64, lead.pdfNombre, "");
    return res.status(200).json({ ok: true, monday: { itemId: lead.itemId, pdfAdjunto } });
  }

  const nombre = (lead.empresa || "").toString().trim() || "Escaneo sin empresa";
  const nivelLabel = NIVEL_LABEL[Number(lead.nivelNum)] || "";
  const result = { ok: true, monday: null, email: null };

  // ---------------------------------------------------------------- MONDAY ----
  const TOKEN = process.env.MONDAY_TOKEN;
  let itemId = null;
  if (TOKEN) {
    try {
      const cv = {
        [COL.indice]: toNumber(lead.indice),
        [COL.margen]: toNumber(lead.margenFuga),
        [COL.obras]:  toNumber(lead.obras),
        [COL.m2]:     toNumber(lead.m2),
        [COL.zonas]:  (lead.zonas || "").toString(),
        [COL.referente]: (lead.referente || "").toString(),
        [COL.fecha]:  { date: todayISO(lead.fechaISO) },
        [COL.estado]: { label: "Nuevo" },
      };
      if (lead.segmento) {
        const labels = String(lead.segmento).split("·").map((s) => s.trim()).filter(Boolean);
        if (labels.length) cv[COL.segmento] = { labels };
      }
      if (lead.email)    cv[COL.email]    = { email: lead.email, text: lead.email };
      if (lead.telefono) cv[COL.telefono] = { phone: String(lead.telefono).replace(/[^\d]/g, ""), countryShortName: "AR" };
      if (nivelLabel)    cv[COL.nivel]    = { label: nivelLabel };

      const q = `mutation ($b: ID!, $g: String, $n: String!, $c: JSON!) {
        create_item (board_id: $b, group_id: $g, item_name: $n, column_values: $c) { id } }`;
      const r = await fetch(MONDAY_API, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: TOKEN, "API-Version": "2024-10" },
        body: JSON.stringify({ query: q, variables: { b: BOARD_ID, g: GROUP_ID, n: nombre, c: JSON.stringify(cv) } }),
      });
      const j = await r.json();
      if (j.errors) throw new Error(JSON.stringify(j.errors));
      itemId = j.data.create_item.id;

      // Resumen en texto como NOTA del ítem (respaldo si el PDF no carga).
      if (lead.resumen) {
        try {
          const body = String(lead.resumen)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
          const uq = `mutation ($item: ID!, $body: String!) { create_update (item_id: $item, body: $body) { id } }`;
          await fetch(MONDAY_API, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: TOKEN, "API-Version": "2024-10" },
            body: JSON.stringify({ query: uq, variables: { item: itemId, body } }),
          });
        } catch { /* la nota es opcional */ }
      }

      // adjuntar PDF si vino en el mismo request (compatibilidad; el flujo nuevo lo manda aparte)
      let pdfOk = false;
      if (lead.pdfBase64) pdfOk = await uploadPdfToItem(TOKEN, itemId, lead.pdfBase64, lead.pdfNombre, nombre);
      result.monday = { itemId, pdfAdjunto: pdfOk };
    } catch (e) {
      result.monday = { error: String(e) };
    }
  }

  // ----------------------------------------------------------------- EMAIL ----
  const RKEY = process.env.RESEND_API_KEY;
  const MAIL_TO = process.env.MAIL_TO;
  const MAIL_FROM = process.env.MAIL_FROM || "LOOPS Escaneo <onboarding@resend.dev>";
  if (RKEY && MAIL_TO) {
    try {
      const idx = lead.indice != null ? `${lead.indice}/100` : "—";
      const fuga = lead.margenFuga ? `USD ${Number(lead.margenFuga).toLocaleString("es-AR")}/año` : "—";
      const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;color:#14202b;max-width:560px">
          <h2 style="margin:0 0 4px">Nuevo escaneo completado</h2>
          <p style="color:#5b6b78;margin:0 0 16px">${esc(nombre)}${lead.segmento ? " · " + esc(lead.segmento) : ""}</p>
          <table style="border-collapse:collapse;width:100%;font-size:14px">
            <tr><td style="padding:6px 0;color:#5b6b78">Referente</td><td style="padding:6px 0"><b>${esc(lead.referente) || "—"}</b></td></tr>
            <tr><td style="padding:6px 0;color:#5b6b78">Email</td><td style="padding:6px 0"><b>${esc(lead.email) || "—"}</b></td></tr>
            <tr><td style="padding:6px 0;color:#5b6b78">Teléfono / WhatsApp</td><td style="padding:6px 0"><b>${esc(lead.telefono) || "—"}</b></td></tr>
            <tr><td style="padding:6px 0;color:#5b6b78">Nivel de madurez</td><td style="padding:6px 0"><b>${esc(nivelLabel) || "—"}</b></td></tr>
            <tr><td style="padding:6px 0;color:#5b6b78">Índice</td><td style="padding:6px 0"><b>${esc(idx)}</b></td></tr>
            <tr><td style="padding:6px 0;color:#5b6b78">Margen en fuga (est.)</td><td style="padding:6px 0"><b>${esc(fuga)}</b></td></tr>
            <tr><td style="padding:6px 0;color:#5b6b78">Obras / m²</td><td style="padding:6px 0"><b>${esc(lead.obras) || "—"} · ${esc(lead.m2) || "—"}</b></td></tr>
            <tr><td style="padding:6px 0;color:#5b6b78">Zonas</td><td style="padding:6px 0"><b>${esc(lead.zonas) || "—"}</b></td></tr>
          </table>
          <p style="color:#5b6b78;font-size:12px;margin-top:16px">El informe completo va adjunto en PDF.</p>
        </div>`;
      const payload = {
        from: MAIL_FROM,
        to: [MAIL_TO],
        subject: `Nuevo escaneo — ${nombre}${nivelLabel ? " · " + nivelLabel : ""}`,
        html,
      };
      if (lead.pdfBase64) {
        payload.attachments = [{ filename: (lead.pdfNombre || `Escaneo ${nombre}.pdf`), content: lead.pdfBase64 }];
      }
      const re = await fetch(RESEND_API, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${RKEY}` },
        body: JSON.stringify(payload),
      });
      const jr = await re.json();
      result.email = re.ok ? { sent: true, id: jr.id } : { error: jr };
    } catch (e) {
      result.email = { error: String(e) };
    }
  }

  return res.status(200).json(result);
}
