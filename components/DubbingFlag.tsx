import type { Locale } from '@/lib/locales';

// Decorative language markers. The adjacent language label is authoritative;
// these flags never imply a particular streaming country or regional dub.
export function DubbingFlag({ language }: { language: Locale }) {
  return <span className="dubbing-flag" data-language={language} aria-hidden="true">
    <svg viewBox="0 0 30 20" fill="none">
      {language === 'it' && <><path fill="#009246" d="M0 0h10v20H0z" /><path fill="#fff" d="M10 0h10v20H10z" /><path fill="#ce2b37" d="M20 0h10v20H20z" /></>}
      {language === 'fr' && <><path fill="#002395" d="M0 0h10v20H0z" /><path fill="#fff" d="M10 0h10v20H10z" /><path fill="#ed2939" d="M20 0h10v20H20z" /></>}
      {language === 'de' && <><path fill="#191919" d="M0 0h30v7H0z" /><path fill="#d00" d="M0 7h30v6H0z" /><path fill="#ffce00" d="M0 13h30v7H0z" /></>}
      {language === 'es' && <><path fill="#aa151b" d="M0 0h30v20H0z" /><path fill="#f1bf00" d="M0 5h30v10H0z" /><path fill="#aa151b" d="M8 8h4v4l-2 2-2-2z" /><path fill="#f8f3df" d="M9 9h2v3H9z" /></>}
      {language === 'pt' && <><path fill="#046a38" d="M0 0h12v20H0z" /><path fill="#da291c" d="M12 0h18v20H12z" /><circle cx="12" cy="10" r="4" fill="#ffcd00" /><path fill="#fff" stroke="#da291c" d="M10 7.5h4v4l-2 1.5-2-1.5z" /><path stroke="#002d72" d="M11 9h2m-2 1.5h2" /></>}
      {language === 'en' && <><path fill="#012169" d="M0 0h30v20H0z" /><path stroke="#fff" strokeWidth="4" d="m0 0 30 20M30 0 0 20" /><path stroke="#c8102e" strokeWidth="1.5" d="m0 0 30 20M30 0 0 20" /><path stroke="#fff" strokeWidth="7" d="M15 0v20M0 10h30" /><path stroke="#c8102e" strokeWidth="4" d="M15 0v20M0 10h30" /></>}
    </svg>
  </span>;
}
