import { parse, isValid } from 'date-fns';
import { EbmTemplateOptions } from './types';

const RW_DEFAULT_DATE_FORMATS = ['yyyy-MM-dd', 'dd/MM/yyyy', 'dd-MM-yyyy', 'dd.MM.yyyy'];

export const normalizeWhitespace = (input: string) => input.replace(/[\s\u00A0]+/g, ' ').trim();

export const normalizeTin = (input: string) => {
  const digits = (input || '').replace(/[^0-9]/g, '');
  return digits || undefined;
};

export const parseAmount = (input: string, options?: EbmTemplateOptions) => {
  if (!input) return undefined;
  const decimalSeparator = options?.decimalSeparator ?? '.';
  const thousandsSeparator = decimalSeparator === '.' ? ',' : '.';
  const cleaned = input
    .replace(new RegExp(`[^0-9${decimalSeparator}${thousandsSeparator}-]`, 'g'), '')
    .replace(new RegExp(`[${thousandsSeparator}]`, 'g'), '')
    .replace(decimalSeparator, '.');

  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const parseDateStrict = (input: string, options?: EbmTemplateOptions) => {
  if (!input) return undefined;

  const formats = options?.dateFormats?.length
    ? options.dateFormats
    : RW_DEFAULT_DATE_FORMATS;

  for (const format of formats) {
    const parsed = parse(input.trim(), format, new Date());
    if (isValid(parsed)) {
      return parsed;
    }
  }

  const fallback = new Date(input);
  return isValid(fallback) ? fallback : undefined;
};

export const applyReplacements = (
  value: string,
  replacements: [string, string][] | undefined,
) => {
  if (!replacements || replacements.length === 0) return value;
  return replacements.reduce((acc, [pattern, replacement]) => {
    const regex = new RegExp(pattern, 'g');
    return acc.replace(regex, replacement);
  }, value);
};
