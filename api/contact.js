// /api/contact — CDA & Co.
// Endpoint de contacto endurecido para Vercel Serverless Functions.

const MAX_BODY_BYTES = 16 * 1024;

const LIMITS = Object.freeze({
  nombre: 120,
  email: 254,
  empresa: 160,
  tipo: 160,
  mensaje: 5000,
  website: 200
});

const ALLOWED_FIELDS = new Set([
  'nombre',
  'email',
  'empresa',
  'tipo',
  'mensaje',
  'privacidad',
  'website'
]);

function requiredSingleLine(value, maxLength) {
  if (typeof value !== 'string') return null;

  const v = value.trim();

  if (!v || v.length > maxLength) return null;

  // No permitimos CR/LF ni otros caracteres de control en campos
  // que pueden terminar en cabeceras/asunto del correo.
  if (/[\u0000-\u001F\u007F]/.test(v)) return null;

  return v;
}

function optionalSingleLine(value, maxLength) {
  if (value === undefined || value === null || value === '') return '';

  return requiredSingleLine(value, maxLength);
}

function requiredMessage(value, maxLength) {
  if (typeof value !== 'string') return null;

  const v = value.trim();

  if (!v || v.length > maxLength) return null;

  // Permitimos saltos de línea y tabuladores en el mensaje,
  // pero rechazamos otros controles invisibles.
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(v)) {
    return null;
  }

  return v;
}

function privacyAccepted(value) {
  return (
    value === true ||
    value === 'true' ||
    value === 'on' ||
    value === '1'
  );
}

export default async function handler(req, res) {
  // El endpoint no debe cachearse ni indexarse.
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  // Solo aceptamos JSON. Además de simplificar la superficie del endpoint,
  // esto impide POST cross-origin simples desde formularios HTML externos.
  const contentType = String(req.headers['content-type'] || '').toLowerCase();

  if (!contentType.startsWith('application/json')) {
    return res.status(415).json({ error: 'unsupported_media_type' });
  }

  // Defensa adicional frente a cuerpos excesivos.
  const contentLength = Number(req.headers['content-length'] || 0);

  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_BODY_BYTES
  ) {
    return res.status(413).json({ error: 'payload_too_large' });
  }

  let body = req.body;

  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: 'invalid_json' });
    }
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'invalid_body' });
  }

  // Content-Length puede faltar. Comprobamos también el tamaño real
  // del JSON ya parseado antes de procesar sus campos.
  let actualBodyBytes;

  try {
    actualBodyBytes = Buffer.byteLength(JSON.stringify(body), 'utf8');
  } catch {
    return res.status(400).json({ error: 'invalid_body' });
  }

  if (actualBodyBytes > MAX_BODY_BYTES) {
    return res.status(413).json({ error: 'payload_too_large' });
  }

  // Rechazamos campos inesperados.
  for (const key of Object.keys(body)) {
    if (!ALLOWED_FIELDS.has(key)) {
      return res.status(400).json({ error: 'unexpected_field' });
    }
  }

  const {
    nombre,
    email,
    empresa,
    tipo,
    mensaje,
    privacidad,
    website
  } = body;

  // Honeypot.
  // Respondemos como si todo hubiera ido bien para no dar pistas al bot.
  if (typeof website === 'string' && website.trim()) {
    return res.status(200).json({ ok: true });
  }

  if (
    website !== undefined &&
    website !== null &&
    typeof website !== 'string'
  ) {
    return res.status(400).json({ error: 'invalid_field' });
  }

  const cleanNombre = requiredSingleLine(nombre, LIMITS.nombre);
  const cleanEmpresa = optionalSingleLine(empresa, LIMITS.empresa);
  const cleanTipo = optionalSingleLine(tipo, LIMITS.tipo);
  const cleanMensaje = requiredMessage(mensaje, LIMITS.mensaje);

  if (
    !cleanNombre ||
    cleanEmpresa === null ||
    cleanTipo === null ||
    !cleanMensaje
  ) {
    return res.status(400).json({ error: 'invalid_field' });
  }

  if (typeof email !== 'string') {
    return res.status(400).json({ error: 'invalid_email' });
  }

  const cleanEmail = email.trim();

  if (
    !cleanEmail ||
    cleanEmail.length > LIMITS.email ||
    /[\u0000-\u001F\u007F]/.test(cleanEmail)
  ) {
    return res.status(400).json({ error: 'invalid_email' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  if (!emailRegex.test(cleanEmail)) {
    return res.status(400).json({ error: 'invalid_email' });
  }

  if (!privacyAccepted(privacidad)) {
    return res.status(400).json({ error: 'privacy_not_accepted' });
  }

  if (!process.env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY no configurada.');
    return res.status(500).json({ error: 'not_configured' });
  }

  try {
    const subject =
      `Nuevo contacto — ${cleanNombre}` +
      (cleanEmpresa ? ` · ${cleanEmpresa}` : '');

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'CDA & Co. <contacto@contacto.cdayco.com>',
        to: ['hola@cdayco.com'],
        reply_to: cleanEmail,
        subject,
        text: [
          `Nombre: ${cleanNombre}`,
          `Email: ${cleanEmail}`,
          `Empresa / marca: ${cleanEmpresa || '—'}`,
          `Tipo de proyecto: ${cleanTipo || '—'}`,
          '',
          cleanMensaje
        ].join('\n')
      })
    });

    if (!resendRes.ok) {
      // No volcamos la respuesta completa del proveedor a los logs.
      console.error('Resend send failed:', resendRes.status);
      return res.status(502).json({ error: 'send_failed' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(
      'Contact form error:',
      err instanceof Error ? err.name : 'unknown_error'
    );

    return res.status(500).json({ error: 'server_error' });
  }
}
