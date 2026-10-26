import Link from '@/components/LocaleLink';
import { getDictionary, type Locale } from '@/lib/i18n';
import { malContentPreset } from '@/lib/mal-content';
import { searchPresetPath } from '@/lib/search-presets';

/** Adult (isAdult / MAL Hx) and R+ detail pages link to their Search landing. */
export function SearchPresetCta({ anime, locale }: { anime: { idMal?: number | null; isAdult?: boolean | null }; locale: Locale }) {
  const preset = malContentPreset(anime);
  if (!preset) return null;
  const d = getDictionary(locale).searchPromo;
  return <p className="search-preset-cta"><Link href={searchPresetPath(preset)} prefetch={false} className="catalog-details">{preset === 'hentai' ? d.seeHentai : d.seeMild} →</Link></p>;
}
