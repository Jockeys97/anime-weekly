export function supportUrl(value = process.env.NEXT_PUBLIC_KOFI_URL): string | null {
  try {
    const url = new URL(value?.trim() ?? '');
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
