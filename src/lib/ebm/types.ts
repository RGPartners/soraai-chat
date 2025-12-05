export type EbmFieldType = 'string' | 'amount' | 'number' | 'date' | 'raw';

export type EbmFieldGroup = 'first' | 'last' | 'sum' | 'concat';

export interface EbmTemplateOptions {
  removeWhitespace?: boolean;
  removeAccents?: boolean;
  lowercase?: boolean;
  decimalSeparator?: string;
  dateFormats?: string[];
  replace?: [string, string][];
}

export interface EbmTemplateFieldConfig {
  parser?: 'regex' | 'static' | 'lines';
  /**
   * Regular expression(s) used for extraction. When multiple expressions are
   * provided they will be attempted in order.
   */
  regex?: string | string[];
  /** Static value returned by the template when parser === 'static'. */
  value?: unknown;
  /**
   * Region hint for future area-based extraction (x, y, width, height). The
   * validator does not yet act on this but we keep the structure to mirror the
   * invoice2data schema for compatibility with upstream research.
   */
  area?: {
    page?: number;
    top: number;
    left: number;
    width: number;
    height: number;
  };
  type?: EbmFieldType;
  group?: EbmFieldGroup;
  required?: boolean;
}

export interface EbmTemplateConfig {
  template_name: string;
  issuer?: string;
  keywords: string[];
  exclude_keywords?: string[];
  fields: Record<string, EbmTemplateFieldConfig>;
  required_fields?: string[];
  options?: EbmTemplateOptions;
}

export interface EbmTemplateDefinition {
  templateName: string;
  issuer: string;
  keywords: string[];
  excludeKeywords: string[];
  fields: Record<string, EbmTemplateFieldConfig>;
  requiredFields: string[];
  options: Required<EbmTemplateOptions>;
}

export interface EbmTextPage {
  pageNumber: number;
  text: string;
}

export interface EbmTextSnapshot {
  title: string;
  pages: EbmTextPage[];
  content: string;
}

export interface EbmExtractedFieldMatch {
  raw: string;
  normalized: string;
  value?: unknown;
  pageNumber?: number;
}

export interface EbmExtractedField {
  field: string;
  value?: unknown;
  raw?: string;
  pageNumber?: number;
  matches: EbmExtractedFieldMatch[];
  config: EbmTemplateFieldConfig;
}

export interface EbmTextExtraction {
  templateName: string;
  issuer?: string;
  fields: Record<string, EbmExtractedField>;
}

export interface EbmQrDetection {
  pageNumber: number;
  scale: number;
  text: string;
}

export interface EbmValidationSummary {
  headline: string;
  items?: string[];
}

export interface EbmQrPayload {
  raw: string;
  invoiceNumber?: string;
  tin?: string;
  buyerTin?: string;
  issueDate?: string;
  totalAmount?: number;
  vatAmount?: number;
  currency?: string;
  additional?: Record<string, unknown>;
}

export type EbmFieldMatchStatus = 'match' | 'mismatch' | 'missing' | 'unverified';

export interface EbmFieldComparison {
  field: string;
  status: EbmFieldMatchStatus;
  qrValue?: unknown;
  textValue?: unknown;
  details?: string;
  qrSource?: {
    pageNumber?: number;
    scale?: number;
  };
  textSource?: {
    pageNumber?: number;
    raw?: string;
  };
}

export interface EbmValidationResult {
  templateName?: string;
  issuer?: string;
  matches: EbmFieldComparison[];
  qrPayload?: EbmQrPayload;
  textSnapshot?: EbmTextSnapshot;
  qrDetections?: EbmQrDetection[];
  summary?: EbmValidationSummary;
  startedAt: Date;
  completedAt?: Date;
  errors?: string[];
}

export interface EbmValidationOutcome {
  result: EbmValidationResult;
  extraction?: EbmTextExtraction;
}
