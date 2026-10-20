import Image from 'next/image';
import type { ReactNode } from 'react';
import Link from '@/components/LocaleLink';
import { getDictionary, type Locale } from '@/lib/i18n';
import type { LandingCountry } from '@/lib/landing-providers';

function Chip({ name, logo }: { name: string; logo: string | null }) {
  return <span className="landing-chip">{logo && <Image src={`https://image.tmdb.org/t/p/w92${logo}`} alt="" width={18} height={18} loading="lazy" />}<span>{name}</span></span>;
}
/** Server-rendered landing card sharing the homepage `.anime-card` poster/body layout. */
export function LandingCard({ locale, href, name, poster, typeLabel, ratings, primary, others, badge, aside, headingLevel = 3 }: { locale: Locale; href: string; name: string; poster: string | null; typeLabel?: string; ratings: string; primary: LandingCountry | null; others: LandingCountry[]; badge?: ReactNode; aside?: ReactNode; headingLevel?: 2 | 3 }) {
  const d = getDictionary(locale); const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return <article className="anime-card landing-anime-card">
    <Link href={href} prefetch={false} className="poster" aria-label={name}>{poster ? <Image src={poster} alt={name} fill loading="lazy" sizes="(max-width: 600px) 95px, 135px" /> : <span>{d.state.noPoster}</span>}</Link>
    <div className="card-body">
      {(badge || typeLabel) && <span className="type-label">{badge}{typeLabel}</span>}
      <Heading><Link href={href} prefetch={false}>{name}</Link></Heading>
      {ratings && <p className="landing-ratings">{ratings}{aside}</p>}
      {primary && <div className="landing-providers"><span className="landing-region">{d.regions[primary.country]}</span>{primary.providers.map(p => <Chip key={p.id} name={p.name} logo={p.logo} />)}</div>}
      {others.length > 0 && <details className="landing-other-countries"><summary>{d.landings.otherCountries} ({others.length})</summary><ul>{others.map(item => <li key={item.country}><strong>{d.regions[item.country]}</strong>: {item.providers.map(p => p.name).join(', ')}</li>)}</ul></details>}
    </div>
  </article>;
}
