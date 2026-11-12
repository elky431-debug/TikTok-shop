/** N'accepte que des chemins internes pour éviter les redirections ouvertes. */
export function safeNextPath(value: string | null | undefined, fallback = '/app'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  return value;
}
