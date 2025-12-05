import logger from '@/lib/logger';
import { serverFileStorage } from '@/lib/storage';
import {
  buildPagesKey,
  readJsonFromStorage,
} from '@/lib/storage/uploaded-files';
import { normalizeWhitespace } from './normalizers';
import { EbmTemplate, loadEbmTemplates } from './template';
import type {
  EbmExtractedField,
  EbmExtractedFieldMatch,
  EbmTemplateFieldConfig,
  EbmTextExtraction,
  EbmTextPage,
  EbmTextSnapshot,
} from './types';

const textLogger = logger.withDefaults({ tag: 'ebm:text' });

interface StoredPagesPayload {
  title?: string;
  pages?: Array<{
    pageNumber?: number;
    text?: string;
  }>;
}

interface PreparedPage {
  pageNumber: number;
  rawText: string;
  preparedText: string;
}

const INLINE_FLAG_PATTERN = /^\(\?[a-z]+\)/i;

const stripInlineFlags = (pattern: string) => {
  let body = pattern;
  const flags = new Set<string>(['g', 'u']);

  while (INLINE_FLAG_PATTERN.test(body)) {
    const match = body.match(INLINE_FLAG_PATTERN);
    if (!match) {
      break;
    }

    const flagChunk = match[0];
    const flagLetters = flagChunk.slice(2, -1);

    for (const letter of flagLetters) {
      switch (letter) {
        case 'i':
        case 'm':
        case 's':
        case 'u':
          flags.add(letter);
          break;
        default:
          break;
      }
    }

    body = body.slice(flagChunk.length);
  }

  return {
    body,
    flags: Array.from(flags).join(''),
  };
};

const buildRegExp = (pattern: string): RegExp | null => {
  if (!pattern) {
    return null;
  }

  try {
    const { body, flags } = stripInlineFlags(pattern);
    return new RegExp(body, flags);
  } catch (error) {
    textLogger.warn('Failed to build RegExp for pattern.', {
      pattern,
      error,
    });
    return null;
  }
};

const normalizeMatch = (value: string) => normalizeWhitespace(value);

const createMatchRecord = (
  value: string,
  config: EbmTemplateFieldConfig,
  pageNumber?: number,
): EbmExtractedFieldMatch => {
  const normalized = normalizeMatch(value);
  const record: EbmExtractedFieldMatch = {
    raw: value,
    normalized,
    value: value != null ? value : undefined,
    pageNumber,
  };
  return record;
};

const coerceMatchValues = (
  matches: EbmExtractedFieldMatch[],
  template: EbmTemplate,
  config: EbmTemplateFieldConfig,
) => {
  if (!config.type) {
    return matches;
  }

  return matches.map((match) => {
    const coerced =
      typeof match.raw === 'string'
        ? template.coerceValue(match.raw, config.type)
        : match.raw;

    const coercedMatch: EbmExtractedFieldMatch = {
      ...match,
      value: coerced,
    };
    return coercedMatch;
  });
};

const applyGrouping = (
  matches: EbmExtractedFieldMatch[],
  config: EbmTemplateFieldConfig,
): EbmExtractedFieldMatch[] => {
  if (!config.group || matches.length === 0) {
    return matches;
  }

  switch (config.group) {
    case 'first':
      return matches.slice(0, 1);
    case 'last':
      return matches.slice(-1);
    case 'sum': {
      const total = matches.reduce((acc, match) => {
        if (typeof match.value === 'number' && Number.isFinite(match.value)) {
          return acc + match.value;
        }
        return acc;
      }, 0);

      return [
        {
          raw: String(total),
          normalized: normalizeMatch(String(total)),
          value: total,
          pageNumber: matches[0]?.pageNumber,
        },
      ];
    }
    case 'concat': {
      const raw = matches.map((match) => match.raw).join(' ');
      return [
        {
          raw,
          normalized: normalizeMatch(raw),
          value: raw,
          pageNumber: matches[0]?.pageNumber,
        },
      ];
    }
    default:
      return matches;
  }
};

const collectMatchesFromText = (
  regex: RegExp,
  content: string,
  fieldName: string,
  config: EbmTemplateFieldConfig,
  pageNumber?: number,
): EbmExtractedFieldMatch[] => {
  const matches: EbmExtractedFieldMatch[] = [];

  for (const match of content.matchAll(regex)) {
    if (!match) continue;

    let candidate: string | undefined;

    if (match.groups) {
      if (match.groups[fieldName] != null) {
        candidate = String(match.groups[fieldName]);
      } else {
        const fallbackGroup = Object.values(match.groups).find(
          (value) => value != null,
        );
        if (fallbackGroup != null) {
          candidate = String(fallbackGroup);
        }
      }
    }

    if (candidate == null && match.length > 1) {
      candidate = String(match[1]);
    }

    if (candidate == null) {
      candidate = match[0];
    }

    if (!candidate) {
      continue;
    }

    matches.push(createMatchRecord(candidate, config, pageNumber));
  }

  return matches;
};

const collectMatchesForPattern = (
  pattern: string,
  fieldName: string,
  config: EbmTemplateFieldConfig,
  template: EbmTemplate,
  preparedContent: string,
  preparedPages: PreparedPage[],
): EbmExtractedFieldMatch[] => {
  const regex = buildRegExp(pattern);
  if (!regex) {
    return [];
  }

  const pageMatches: EbmExtractedFieldMatch[] = [];
  const seen = new Set<string>();

  for (const page of preparedPages) {
    const currentRegex = new RegExp(regex); // create a fresh instance
    const matches = collectMatchesFromText(
      currentRegex,
      page.preparedText,
      fieldName,
      config,
      page.pageNumber,
    );

    for (const match of matches) {
      if (seen.has(match.normalized)) {
        continue;
      }
      seen.add(match.normalized);
      pageMatches.push(match);
    }
  }

  if (pageMatches.length > 0) {
    return pageMatches;
  }

  const fallbackRegex = new RegExp(regex);
  const docMatches = collectMatchesFromText(
    fallbackRegex,
    preparedContent,
    fieldName,
    config,
  );

  const filtered = docMatches.filter((match) => {
    if (seen.has(match.normalized)) {
      return false;
    }
    seen.add(match.normalized);
    return true;
  });

  return filtered;
};

const extractField = (
  fieldName: string,
  config: EbmTemplateFieldConfig,
  template: EbmTemplate,
  preparedContent: string,
  preparedPages: PreparedPage[],
): EbmExtractedField => {
  if (config.parser === 'static') {
    const rawValue =
      typeof config.value === 'string'
        ? config.value
        : config.value != null
          ? JSON.stringify(config.value)
          : undefined;

    const match: EbmExtractedFieldMatch | undefined = rawValue != null
      ? {
          raw: rawValue,
          normalized: normalizeMatch(rawValue),
          value: config.value,
        }
      : undefined;

    const field: EbmExtractedField = {
      field: fieldName,
      value: config.value,
      raw: rawValue,
      pageNumber: undefined,
      matches: match ? [match] : [],
      config,
    };
    return field;
  }

  if (!config.regex) {
    textLogger.debug('Field is missing regex configuration.', {
      field: fieldName,
      template: template.templateName,
    });
    const emptyField: EbmExtractedField = {
      field: fieldName,
      value: undefined,
      raw: undefined,
      pageNumber: undefined,
      matches: [],
      config,
    };
    return emptyField;
  }

  const patterns = Array.isArray(config.regex)
    ? config.regex.filter((entry): entry is string => typeof entry === 'string')
    : [config.regex];

  let matches: EbmExtractedFieldMatch[] = [];

  for (const pattern of patterns) {
    const result = collectMatchesForPattern(
      pattern,
      fieldName,
      config,
      template,
      preparedContent,
      preparedPages,
    );

    if (result.length > 0) {
      matches = result;
      break;
    }
  }

  matches = coerceMatchValues(matches, template, config);
  matches = applyGrouping(matches, config);

  const primary = matches[0];

  const field: EbmExtractedField = {
    field: fieldName,
    value: primary?.value,
    raw:
      primary?.raw ??
      (typeof primary?.value === 'string'
        ? (primary?.value as string)
        : undefined),
    pageNumber: primary?.pageNumber,
    matches,
    config,
  };
  return field;
};

export const loadTextSnapshot = async (
  fileId: string,
): Promise<EbmTextSnapshot | null> => {
  const key = buildPagesKey(fileId);

  try {
    const exists = await serverFileStorage.exists(key);
    if (!exists) {
      textLogger.warn('No page snapshot found for file.', { fileId, key });
      return null;
    }
  } catch (error) {
    textLogger.warn('Failed to verify page snapshot existence.', {
      fileId,
      key,
      error,
    });
    return null;
  }

  try {
    const data = await readJsonFromStorage<StoredPagesPayload>(key);
    if (!data?.pages || data.pages.length === 0) {
      textLogger.warn('Page snapshot payload is empty.', { fileId });
      return null;
    }

    const pages: EbmTextPage[] = data.pages.map((page, index) => ({
      pageNumber:
        typeof page.pageNumber === 'number' ? page.pageNumber : index + 1,
      text: page.text ?? '',
    }));

    const content = pages.map((page) => page.text).join('\n\n');

    const snapshot: EbmTextSnapshot = {
      title: data.title ?? '',
      pages,
      content,
    };
    return snapshot;
  } catch (error) {
    textLogger.error('Failed to load or parse page snapshot.', {
      fileId,
      key,
      error,
    });
    return null;
  }
};

export const selectTemplateForSnapshot = async (
  snapshot: EbmTextSnapshot,
  templates?: EbmTemplate[],
): Promise<EbmTemplate | null> => {
  const candidates = templates ?? (await loadEbmTemplates());
  const preparedContent = snapshot.content;

  for (const template of candidates) {
    try {
      if (template.matchesInput(preparedContent)) {
        textLogger.debug('Matched snapshot with template.', {
          template: template.templateName,
        });
        return template;
      }
    } catch (error) {
      textLogger.warn('Template evaluation failed.', {
        template: template.templateName,
        error,
      });
    }
  }

  textLogger.info('No template matched snapshot.', {
    title: snapshot.title,
  });
  return null;
};

export const extractTextWithTemplate = (
  template: EbmTemplate,
  snapshot: EbmTextSnapshot,
): EbmTextExtraction => {
  const preparedContent = template.prepareInput(snapshot.content);
  const preparedPages: PreparedPage[] = snapshot.pages.map((page) => ({
    pageNumber: page.pageNumber,
    rawText: page.text,
    preparedText: template.prepareInput(page.text),
  }));

  const fields: Record<string, EbmExtractedField> = {};

  for (const [fieldName, config] of Object.entries(template.definition.fields)) {
    fields[fieldName] = extractField(
      fieldName,
      config,
      template,
      preparedContent,
      preparedPages,
    );
  }

  const extraction: EbmTextExtraction = {
    templateName: template.templateName,
    issuer: template.definition.issuer,
    fields,
  };
  return extraction;
};