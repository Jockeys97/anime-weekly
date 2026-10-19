import Link from 'next/link';
import './globals.css';
// Unmatched routes (including malformed anime IDs) must send an actual 404
// before a locale layout can stream a loading shell.
export default function GlobalNotFound() {
  return <html lang="it"><body><main className="empty-state"><h1>Pagina non trovata</h1><p>La pagina richiesta non esiste.</p><Link href="/">Torna alla home</Link></main></body></html>;
}
