'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { useLocale } from '@/components/LanguageSelector';
import { getDictionary } from '@/lib/i18n';
import { newsletterEnabled } from '@/lib/newsletter';

type Status = 'success' | 'comingSoon' | 'invalid' | 'rateLimited' | 'error';

export function NewsletterSignup() {
  const locale = useLocale();
  const d = getDictionary(locale).newsletter;
  const id = useId();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [status, setStatus] = useState<Status | null>(null);
  if (!newsletterEnabled()) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    pending.current = true;
    setBusy(true); setStatus(null);
    try {
      const response = await fetch('/api/newsletter/subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: values.get('email'), consent: values.get('consent') === 'on', website: values.get('website'), locale }),
        signal: AbortSignal.timeout(15000),
      });
      const body = await response.json();
      const code: Status = response.ok ? 'success' : response.status === 429 ? 'rateLimited' : response.status === 400 ? 'invalid' : body.code === 'comingSoon' ? 'comingSoon' : 'error';
      setStatus(code);
      if (response.ok) form.reset();
    } catch { setStatus('error'); }
    finally { pending.current = false; setBusy(false); }
  }

  return <section className="newsletter" aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`}>{d.title}</h2>
    <p>{d.description}</p>
    <form onSubmit={submit} aria-busy={busy}>
      <label htmlFor={`${id}-email`}>{d.email}</label>
      <div className="newsletter-fields">
        <input id={`${id}-email`} name="email" type="email" autoComplete="email" maxLength={254} required disabled={busy} />
        <button className="button" type="submit" disabled={busy}>{busy ? d.sending : d.submit}</button>
      </div>
      <label className="newsletter-consent" htmlFor={`${id}-consent`}><input id={`${id}-consent`} name="consent" type="checkbox" required disabled={busy} />{d.consent}</label>
      <div className="newsletter-trap" aria-hidden="true"><label htmlFor={`${id}-website`}>{d.website}</label><input id={`${id}-website`} type="text" name="website" tabIndex={-1} autoComplete="off" /></div>
      <p role="status" aria-live="polite">{status ? d[status] : ''}</p>
    </form>
  </section>;
}
