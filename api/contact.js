// /api/contact — Vercel Serverless Function (Node.js runtime)
//
// SETUP (hazlo una vez en el proyecto de Vercel):
//   1. Crea una cuenta en https://resend.com (tiene plan gratuito, 100 emails/día).
//   2. Verifica el dominio cdayco.com en Resend (añade los registros DNS que te den, en IONOS).
//   3. Genera una API key en Resend y añádela en Vercel:
//      Project Settings → Environment Variables → RESEND_API_KEY = re_xxxxxxxx
//   4. Cambia el "from" de abajo a un remitente de tu dominio verificado,
//      por ejemplo "CDA & Co. <web@cdayco.com>".
//   5. Redeploy. El formulario de index.html ya apunta a POST /api/contact.
//
// Mientras RESEND_API_KEY no esté configurada, este endpoint devolverá error 500
// y el formulario del front-end mostrará automáticamente el aviso con el mailto
// de respaldo — no hay ningún estado roto de cara al visitante.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const { nombre, email, empresa, tipo, mensaje, privacidad, website } = req.body || {};

  // Honeypot: si un bot rellena este campo oculto, respondemos 200 sin enviar nada.
  if (website) {
    return res.status(200).json({ ok: true });
  }

  // Validación básica de servidor (el front-end ya valida, pero nunca hay que fiarse solo del cliente).
  if (!nombre || !email || !mensaje || !privacidad) {
    return res.status(400).json({ error: 'missing_fields' });
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'invalid_email' });
  }
  if (String(mensaje).length > 5000) {
    return res.status(400).json({ error: 'message_too_long' });
  }

  if (!process.env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY no configurada en las variables de entorno de Vercel.');
    return res.status(500).json({ error: 'not_configured' });
  }

  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'CDA & Co. <web@cdayco.com>',
        to: ['c.abril@cdayco.com'],
        reply_to: email,
        subject: `Nuevo contacto — ${nombre}${empresa ? ' · ' + empresa : ''}`,
        text: [
          `Nombre: ${nombre}`,
          `Email: ${email}`,
          `Empresa / marca: ${empresa || '—'}`,
          `Tipo de proyecto: ${tipo || '—'}`,
          '',
          mensaje
        ].join('\n')
      })
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error('Resend error:', errText);
      return res.status(502).json({ error: 'send_failed' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Contact form error:', err);
    return res.status(500).json({ error: 'server_error' });
  }
}
