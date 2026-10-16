// Named arcs cannot safely be inferred from a franchise prefix. These exact
// AniList IDs are parts of one provider/IMDb series; the resolver must still
// follow their real PREQUEL edges and validate chronology and the root year.
// Checked 2026-10-16:
// https://www.imdb.com/title/tt14986406/ (2022 series, not Bleach 2004)
// https://www.imdb.com/title/tt2359704/ (2012 TV adaptation)
// https://www.netflix.com/title/80179831
// https://www.viz.com/anime/tv-show/jojo-s-bizarre-adventure-video/video-unit/134
// Steel Ball Run (190327/210482) is deliberately outside the 2012 group.
const groups = [
  { rootId: 116674, rootYear: 2022, search: 'BLEACH: Sennen Kessen-hen', members: [116674, 159322, 169755, 185874] },
  { rootId: 14719, rootYear: 2012, search: 'JoJo no Kimyou na Bouken', members: [14719, 20474, 20799, 21450, 102883, 131942, 146722] },
] as const;

export function verifiedSeasonGroup(id: number) {
  return groups.find(group => (group.members as readonly number[]).includes(id));
}
