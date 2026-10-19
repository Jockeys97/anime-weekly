import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { currentSeason, seasonPath } from '@/lib/season';
import { pageMetadata } from '@/lib/seo';
import { getRequestLocale, type LocaleParams } from '@/lib/request-locale';
import { getDictionary } from '@/lib/i18n';
import { localePath } from '@/lib/locale-routing';
export async function generateMetadata({ params }: { params?: LocaleParams }) {
  const locale = await getRequestLocale(params); const d = getDictionary(locale).catalog;
  return pageMetadata(d.seasonTitle, d.seasonDescription, '/season', undefined, locale);
}

export default async function SeasonIndex({ params }: { params?: LocaleParams }) {
  await connection();
  redirect(localePath(seasonPath(currentSeason()), await getRequestLocale(params)));
}
