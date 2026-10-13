export function withAffiliate(url: string, parameter?: { name: string; value: string }): string {
  // No affiliate is enabled. Callers may explicitly pass a parameter in future.
  if (!parameter) return url;
  const target = new URL(url); target.searchParams.set(parameter.name, parameter.value); return target.toString();
}
