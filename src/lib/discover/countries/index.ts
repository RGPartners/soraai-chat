export interface DiscoverCountryOption {
  key: string;
  label: string;
}

const parseShowGlobalFlag = (value?: string | null) => {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return ['1', 'true', 'yes', 'enable', 'enabled', 'on'].includes(normalized);
};

const SHOW_GLOBAL_REGION = parseShowGlobalFlag(
  process.env.NEXT_PUBLIC_SHOW_GLOBAL_REGION,
);

const COUNTRY_OPTIONS: DiscoverCountryOption[] = [
  ...(SHOW_GLOBAL_REGION ? [{ key: 'global', label: 'Global' }] : []),
  { key: 'rwanda', label: 'Rwanda' },
];

export const DISCOVER_COUNTRIES: DiscoverCountryOption[] = COUNTRY_OPTIONS;

export const DEFAULT_DISCOVER_COUNTRY =
  DISCOVER_COUNTRIES[0]?.key ?? 'rwanda';

export const getCountryLabel = (key?: string | null) => {
  if (!key) {
    const fallback = DISCOVER_COUNTRIES[0];
    return fallback ? fallback.label : 'Rwanda';
  }

  const match = DISCOVER_COUNTRIES.find((country) => country.key === key);
  if (match) {
    return match.label;
  }

  if (key === 'global') {
    return 'Global';
  }

  return key.charAt(0).toUpperCase() + key.slice(1);
};
