/** Kept client-safe: Next replaces this public flag at build time. */
export function newsletterEnabled() {
  return process.env.NEXT_PUBLIC_NEWSLETTER_ENABLED === '1';
}

export function normalizeNewsletterEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(email)) return null;
  const local = email.slice(0, email.indexOf('@'));
  if (local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..') || email.split('@')[1].split('.').some(label => label.length > 63)) return null;
  return email;
}
