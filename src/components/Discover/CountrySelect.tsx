import { ChevronDown } from 'lucide-react';
import { DISCOVER_COUNTRIES } from '@/lib/discover/countries';
import { cn } from '@/lib/utils';

interface CountrySelectProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

const CountrySelect = ({ value, onChange, className }: CountrySelectProps) => {
  return (
    <label className={cn('flex items-center gap-3 text-sm font-medium', className)}>
      <span className="text-black/60 dark:text-white/60">Region</span>
      <span className="relative">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="appearance-none rounded-full border border-black/20 bg-white px-4 py-1.5 pr-10 text-sm font-medium text-black shadow-sm transition hover:border-black/40 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 dark:border-white/20 dark:bg-dark-secondary dark:text-white dark:hover:border-white/40 dark:focus:border-cyan-300"
          aria-label="Select briefing region"
        >
          {DISCOVER_COUNTRIES.map((country) => (
            <option key={country.key} value={country.key}>
              {country.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/50 dark:text-white/50" />
      </span>
    </label>
  );
};

export default CountrySelect;
