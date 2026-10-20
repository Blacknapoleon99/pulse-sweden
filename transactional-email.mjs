import { fail } from './http-api.mjs';
export function createMailer({ key = process.env.RESEND_API_KEY, from = process.env.EMAIL_FROM, appUrl = process.env.PUBLIC_APP_URL, fetcher = fetch } = {}) {
  let base;
  try { const parsed = new URL(appUrl); if (parsed.protocol === 'https:') base = parsed.origin; } catch { /* configuration stays disabled */ }
  const configured = Boolean(key && from && base);
  return { configured,
    async send(to, subject, text) {
      if (!configured) throw fail(503, 'E-posttjänsten är inte ansluten');
      const result = await fetcher('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: [to], subject, text }), signal: AbortSignal.timeout(12_000) });
      if (!result.ok) throw fail(503, 'E-post kunde inte skickas. Försök igen senare');
    },
    async accountLink(email, kind, token) {
      const url = new URL('/account', base);
      // Fragments keep recovery tokens out of HTTP access logs and Referer headers.
      url.hash = new URLSearchParams({ action: kind, token }).toString();
      await this.send(email, kind === 'verify' ? 'Bekräfta din e-post · TryggPuls' : 'Återställ lösenord · TryggPuls', `${kind === 'verify' ? 'Bekräfta din e-postadress' : 'Välj ett nytt lösenord'} genom att öppna ${url}. Länken gäller i 30 minuter. Om du inte begärde detta kan du ignorera meddelandet.`);
    }
  };
}
