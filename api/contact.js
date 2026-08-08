const CONTACT_EMAIL = 'hamed.rahnama@gmail.com';
const MAX_FIELD_LENGTH = 5000;

function clean(value, maxLength = MAX_FIELD_LENGTH) {
  return String(value || '').trim().slice(0, maxLength);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  if (!process.env.RESEND_API_KEY) return res.status(503).json({ error: 'Contact email is not configured yet.' });

  const name = clean(req.body?.name, 120);
  const email = clean(req.body?.email, 320).toLowerCase();
  const subject = clean(req.body?.subject, 160);
  const message = clean(req.body?.message);
  const website = clean(req.body?.website, 200);
  if (website) return res.status(200).json({ ok: true });
  if (!name || !subject || message.length < 10 || !/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ error: 'Please complete every field with a valid email address.' });
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL || 'Girih Studio <onboarding@resend.dev>',
      to: [CONTACT_EMAIL],
      reply_to: email,
      subject: `[Girih Studio] ${subject}`,
      text: `Name: ${name}\nEmail: ${email}\n\n${message}`,
    }),
  });

  if (!response.ok) {
    const details = await response.json().catch(() => null);
    console.error('Contact email failed', response.status, details);
    return res.status(502).json({ error: 'Your message could not be sent. Please try again.' });
  }
  return res.status(200).json({ ok: true });
}
