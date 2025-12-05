import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import {
  EbmTemplateConfig,
  EbmTemplateDefinition,
  EbmTemplateFieldConfig,
  EbmTemplateOptions,
} from './types';
import {
  applyReplacements,
  normalizeWhitespace,
  parseAmount,
  parseDateStrict,
} from './normalizers';

const DEFAULT_OPTIONS: Required<EbmTemplateOptions> = {
  removeWhitespace: false,
  removeAccents: false,
  lowercase: false,
  decimalSeparator: '.',
  dateFormats: [],
  replace: [],
};

const TEMPLATE_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'templates',
);

const combiningMarks = /[\u0300-\u036f]/g;

const toArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }
  if (value == null) {
    return [];
  }
  return [String(value)];
};

const normaliseReplace = (
  value: unknown,
): [string, string][] | undefined => {
  if (!value) return undefined;
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value
    .map((entry) => (Array.isArray(entry) ? entry.map(String) : null))
    .filter((entry): entry is string[] => Array.isArray(entry) && entry.length === 2)
    .map(([pattern, replacement]) => [pattern, replacement]);
};

export class EbmTemplate {
  readonly definition: EbmTemplateDefinition;
  private readonly keywords: string[];
  private readonly excludeKeywords: string[];

  constructor(definition: EbmTemplateDefinition) {
    this.definition = definition;
    this.keywords = definition.keywords.map((keyword) =>
      this.applyTransformations(keyword),
    );
    this.excludeKeywords = definition.excludeKeywords.map((keyword) =>
      this.applyTransformations(keyword),
    );
  }

  get templateName() {
    return this.definition.templateName;
  }

  get options() {
    return this.definition.options;
  }

  prepareInput(content: string) {
    let result = content;

    if (this.options.removeWhitespace) {
      result = result.replace(/\s+/g, '');
    } else {
      result = normalizeWhitespace(result);
    }

    if (this.options.removeAccents) {
      result = result.normalize('NFKD').replace(combiningMarks, '');
    }

    if (this.options.lowercase) {
      result = result.toLowerCase();
    }

    result = applyReplacements(result, this.options.replace);
    return result;
  }

  matchesInput(content: string) {
    const prepared = this.prepareInput(content);

    const keywordsMatch = this.keywords.every((keyword) =>
      keyword ? prepared.includes(keyword) : true,
    );

    if (!keywordsMatch) {
      return false;
    }

    if (this.excludeKeywords.length === 0) {
      return true;
    }

    return !this.excludeKeywords.some((keyword) =>
      keyword ? prepared.includes(keyword) : false,
    );
  }

  coerceValue(value: string | undefined, type?: EbmTemplateFieldConfig['type']) {
    if (value == null) {
      return undefined;
    }

    switch (type) {
      case 'amount':
      case 'number':
        return parseAmount(value, this.options);
      case 'date': {
        return parseDateStrict(value, this.options);
      }
      case 'string':
      case 'raw':
      default:
        return value.trim();
    }
  }

  private applyTransformations(value: string) {
    let output = value;
    if (this.options.removeWhitespace) {
      output = output.replace(/\s+/g, '');
    }
    if (this.options.removeAccents) {
      output = output.normalize('NFKD').replace(combiningMarks, '');
    }
    if (this.options.lowercase) {
      output = output.toLowerCase();
    }
    output = applyReplacements(output, this.options.replace);
    return output;
  }
}

let cachedTemplates: EbmTemplate[] | null = null;

const discoverTemplateFiles = async (dir: string): Promise<string[]> => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const resolved = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await discoverTemplateFiles(resolved)));
    } else if (entry.isFile() && /\.ya?ml$/i.test(entry.name)) {
      files.push(resolved);
    }
  }

  return files;
};

const loadTemplateFile = async (filePath: string): Promise<EbmTemplate | null> => {
  const rawContent = await fs.readFile(filePath, 'utf8');
  const parsed = YAML.parse(rawContent) as EbmTemplateConfig | undefined;

  if (!parsed) {
    return null;
  }

  if (!parsed.template_name) {
    throw new Error(`Template file ${filePath} is missing template_name`);
  }

  const options: Required<EbmTemplateOptions> = {
    ...DEFAULT_OPTIONS,
    ...(parsed.options ?? {}),
  };

  if (parsed.options?.replace) {
    const replace = normaliseReplace(parsed.options.replace);
    if (replace) {
      options.replace = replace;
    }
  }

  const fields: Record<string, EbmTemplateFieldConfig> = parsed.fields ?? {};

  const definition: EbmTemplateDefinition = {
    templateName: parsed.template_name,
    issuer: parsed.issuer || parsed.template_name,
    keywords: toArray(parsed.keywords),
    excludeKeywords: toArray(parsed.exclude_keywords),
    fields,
    requiredFields: parsed.required_fields
      ? toArray(parsed.required_fields)
      : [],
    options,
  };

  return new EbmTemplate(definition);
};

export const loadEbmTemplates = async () => {
  if (cachedTemplates) {
    return cachedTemplates;
  }

  const templateFiles = await discoverTemplateFiles(TEMPLATE_ROOT);
  const loaded = await Promise.all(templateFiles.map(loadTemplateFile));
  cachedTemplates = loaded.filter((template): template is EbmTemplate => Boolean(template));
  return cachedTemplates;
};

export const resetTemplateCache = () => {
  cachedTemplates = null;
};
