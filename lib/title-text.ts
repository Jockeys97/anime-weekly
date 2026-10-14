// Shared by server data loaders and browser text fallbacks.
export function displayTitle(title: string): string {
  return title.replace(/\branma\s*(?:½|1\s*[/⁄]\s*2)/giu, 'Ranma ½').trim();
}
export function cleanSynopsis(text: string | null | undefined): string {
  return (text || '').replace(/\(\s*Source\s*:[^)]*\)/gi, '')
    .replace(/\[\s*Written by MAL Rewrite\s*\]/gi, '')
    .replace(/^\s*Note\s*:[^\n]*(?:\n|$)/gim, '')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
