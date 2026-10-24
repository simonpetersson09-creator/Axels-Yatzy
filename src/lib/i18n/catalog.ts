import names from './catalog-names.json';

// Catalog labels are separate from UI copy; prices and ownership stay server-owned.
const catalog: Record<string, Record<string, string>> = names;
export function catalogName(id: string, lang: string): string | undefined {
  return catalog[lang]?.[id];
}