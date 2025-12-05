import { format } from 'date-fns';
import { load as loadHtml } from 'cheerio';
import logger from '@/lib/logger';
import { serverFileStorage } from '@/lib/storage';
import { buildOriginalKey } from '@/lib/storage/uploaded-files';
import { normalizeTin, parseAmount, parseDateStrict } from './normalizers';
import {
  decodeQrCodesFromPdf,
  type PdfQrDecodeOptions,
  type PdfQrDecodedCode,
} from './qrDecoder';
import {
  extractTextWithTemplate,
  loadTextSnapshot,
  selectTemplateForSnapshot,
} from './textExtractor';
import type {
  EbmExtractedField,
  EbmFieldComparison,
  EbmQrDetection,
  EbmQrPayload,
  EbmTextExtraction,
  EbmValidationOutcome,
  EbmValidationResult,
} from './types';

const validatorLogger = logger.withDefaults({ tag: 'ebm:validator' });

const NUMERIC_TOLERANCE: Record<string, number> = {
  totalAmount: 1,
  vatAmount: 1,
};

const FIELD_MAPPING = new Map<string, keyof EbmQrPayload>([
  ['tin', 'tin'],
  ['seller_tin', 'tin'],
  ['seller-tin', 'tin'],
  ['supplier_tin', 'tin'],
  ['invoice_number', 'invoiceNumber'],
  ['invoice-number', 'invoiceNumber'],
  ['invoice', 'invoiceNumber'],
  ['invoice_no', 'invoiceNumber'],
  ['issue_date', 'issueDate'],
  ['invoice_date', 'issueDate'],
  ['date', 'issueDate'],
  ['total_amount', 'totalAmount'],
  ['grand_total', 'totalAmount'],
  ['amount', 'totalAmount'],
  ['total', 'totalAmount'],
  ['vat_amount', 'vatAmount'],
  ['tax_amount', 'vatAmount'],
  ['vat', 'vatAmount'],
  ['buyer_tin', 'buyerTin'],
  ['buyer-tin', 'buyerTin'],
  ['customer_tin', 'buyerTin'],
  ['currency', 'currency'],
]);

const QR_KEY_TO_FIELD = new Map<keyof EbmQrPayload, string>();
for (const [field, qrKey] of FIELD_MAPPING.entries()) {
  if (!QR_KEY_TO_FIELD.has(qrKey)) {
    QR_KEY_TO_FIELD.set(qrKey, field);
  }
}

export interface EbmFileReference {
  fileId: string;
  fileExtension: string;
  fileName?: string;
}

export interface EbmValidatorOptions {
  qr?: PdfQrDecodeOptions;
}

const toStringValue = (value: unknown): string | undefined => {
  if (value == null) {
    return undefined;
  }

  if (value instanceof Date) {
    return format(value, 'yyyy-MM-dd');
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : undefined;
  }

  return String(value);
};

const toNumberValue = (value: unknown): number | undefined => {
  if (value == null) return undefined;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string') {
    const parsed = parseAmount(value, { decimalSeparator: '.' });
    return parsed != null ? parsed : undefined;
  }
  return undefined;
};

const toDateString = (value: unknown): string | undefined => {
  if (value instanceof Date) {
    return format(value, 'yyyy-MM-dd');
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const parsed = parseDateStrict(trimmed);
    if (parsed) {
      return format(parsed, 'yyyy-MM-dd');
    }

    const [datePart] = trimmed.split(' ');
    if (datePart && datePart !== trimmed) {
      const parsedDatePart = parseDateStrict(datePart);
      if (parsedDatePart) {
        return format(parsedDatePart, 'yyyy-MM-dd');
      }
    }
  }
  return undefined;
};

const normalizeInvoiceNumber = (value: unknown): string | undefined => {
  if (value == null) {
    return undefined;
  }
  const str = String(value)
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();
  return str.length > 0 ? str : undefined;
};

const normalizeCurrency = (value: unknown): string | undefined => {
  if (value == null) return undefined;
  const str = String(value).trim().toUpperCase();
  return str.length > 0 ? str : undefined;
};

const assignFieldFromObject = (
  obj: Record<string, unknown>,
  payload: EbmQrPayload,
  additional: Record<string, unknown>,
) => {
  for (const [key, value] of Object.entries(obj)) {
    assignKeyValue(key, value, payload, additional);
  }
};

const assignKeyValue = (
  key: string,
  value: unknown,
  payload: EbmQrPayload,
  additional: Record<string, unknown>,
) => {
  const normalizedKey = key
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  const stringValue = toStringValue(value);

  switch (normalizedKey) {
    case 'tin':
    case 'sellertin':
    case 'suppliertin':
    case 'tradetin':
      payload.tin = stringValue ? normalizeTin(stringValue) : undefined;
      break;
    case 'buyertin':
    case 'customertin':
    case 'receivertin':
      payload.buyerTin = stringValue ? normalizeTin(stringValue) : undefined;
      break;
    case 'invoice':
    case 'invoicenumber':
    case 'invoiceno':
    case 'invoiceid':
    case 'receipt':
      payload.invoiceNumber = stringValue ? normalizeInvoiceNumber(stringValue) : undefined;
      break;
    case 'issuedate':
    case 'invoicedate':
    case 'date':
    case 'transactiondate':
      payload.issueDate = stringValue ? toDateString(stringValue) : undefined;
      break;
    case 'totalamount':
    case 'grandtotal':
    case 'totalsales':
    case 'amount':
    case 'total': {
      const numeric = stringValue != null ? toNumberValue(stringValue) : undefined;
      payload.totalAmount = numeric;
      break;
    }
    case 'vatamount':
    case 'taxamount':
    case 'totaltax':
    case 'vat': {
      const numeric = stringValue != null ? toNumberValue(stringValue) : undefined;
      payload.vatAmount = numeric;
      break;
    }
    case 'currency':
    case 'curr':
      payload.currency = stringValue ? normalizeCurrency(stringValue) : undefined;
      break;
    default:
      if (stringValue != null) {
        additional[normalizedKey] = stringValue;
      }
  }
};

const parseStructuredString = (
  text: string,
  payload: EbmQrPayload,
  additional: Record<string, unknown>,
) => {
  const delimiters = /[\n;,|]+/;
  const tokens = text
    .split(delimiters)
    .map((token) => token.trim())
    .filter(Boolean);

  let orphanIndex = 0;

  for (const token of tokens) {
    const separatorIndex = token.indexOf(':') !== -1 ? token.indexOf(':') : token.indexOf('=');

    if (separatorIndex !== -1) {
      const key = token.slice(0, separatorIndex);
      const value = token.slice(separatorIndex + 1);
      assignKeyValue(key, value, payload, additional);
    } else {
      additional[`token_${orphanIndex}`] = token;
      orphanIndex += 1;
    }
  }
};

const RRA_QR_HOSTNAMES = new Set(['myrra.rra.gov.rw']);

const sanitizeText = (value: string) => value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

const parseRraReceiptHtml = (html: string, url: URL): Partial<EbmQrPayload> | null => {
  const $ = loadHtml(html);
  const container = $('.cnt-wrap');

  if (!container.length) {
    return null;
  }

  const topInfoText = container.find('.topinfo.detail').text();
  const buyListText = container.find('.buylist-section').text();
  const totalsSection = container.find('.total-detail').first();
  const sdcSections = container.find('.total-detail.sdc');

  const matchValue = (text: string, label: string) => {
    const regex = new RegExp(`${label}\\s*:\\s*([\\s\\S]+?)($|\\n)`, 'i');
    const match = regex.exec(text.replace(/\r/g, '\n'));
    return match ? sanitizeText(match[1]) : undefined;
  };

  const sellerTin = matchValue(topInfoText, 'TIN');
  const buyerTin = matchValue(buyListText, 'CLIENT\\s+TIN');
  const clientName = matchValue(buyListText, 'CLIENT\\s+NAME');

  let totalAmountText: string | undefined;
  let vatAmountText: string | undefined;

  totalsSection.find('div').each((_, element) => {
    const block = $(element);
    const title = sanitizeText(block.find('.tit').text())
      .replace(/:$/, '')
      .trim()
      .toUpperCase();
    const value = sanitizeText(block.find('.value').text());

    if (!totalAmountText && title === 'TOTAL') {
      totalAmountText = value;
    }

    if (!vatAmountText && (title === 'TOTAL TAX' || title === 'TOTAL TAX-B')) {
      vatAmountText = value;
    }
  });

  let invoiceNumber: string | undefined;
  let issueDateRaw: string | undefined;
  let sdcId: string | undefined;
  let internalData: string | undefined;
  let receiptSignature: string | undefined;
  let mrc: string | undefined;
  let currencyCode: string | undefined;

  sdcSections.each((_, section) => {
    const block = $(section);

    block.find('div, .block-type').each((__, item) => {
      const element = $(item);
      const title = sanitizeText(element.find('.tit').text())
        .replace(/:$/, '')
        .trim()
        .toUpperCase();
      const value = sanitizeText(element.find('.value').text());

      if (!value) {
        return;
      }

      switch (title) {
        case 'DATE':
          if (!issueDateRaw) issueDateRaw = value;
          break;
        case 'RECEIPT NUMBER':
          if (!invoiceNumber) invoiceNumber = value;
          break;
        case 'SDC ID':
          if (!sdcId) sdcId = value;
          break;
        case 'INTERNAL DATA':
          if (!internalData) internalData = value;
          break;
        case 'RECEIPT SINGNATURE':
          if (!receiptSignature) receiptSignature = value;
          break;
        case 'MRC':
          if (!mrc) mrc = value;
          break;
        default:
          break;
      }
    });
  });

  if (!invoiceNumber) {
    invoiceNumber = matchValue(sdcSections.text(), 'Receipt Number') ?? invoiceNumber;
  }

  if (!issueDateRaw) {
    issueDateRaw = matchValue(sdcSections.text(), 'Date') ?? issueDateRaw;
  }

  if (!currencyCode) {
    const totalsText = container.find('.total-detail').text();
    const currencyMatch = totalsText.match(/(rwf)/i);
    if (currencyMatch) {
      currencyCode = currencyMatch[1].toUpperCase();
    }
  }

  const partial: Partial<EbmQrPayload> = {};
  const additional: Record<string, unknown> = {
    rraReceiptUrl: url.toString(),
  };

  if (sellerTin) {
    partial.tin = normalizeTin(sellerTin);
  }

  if (buyerTin) {
    partial.buyerTin = normalizeTin(buyerTin);
  }

  if (invoiceNumber) {
    partial.invoiceNumber = normalizeInvoiceNumber(invoiceNumber);
  }

  if (issueDateRaw) {
    const normalizedDate = toDateString(issueDateRaw);
    if (normalizedDate) {
      partial.issueDate = normalizedDate;
    }
  }

  if (totalAmountText) {
    const total = toNumberValue(totalAmountText);
    if (total != null) {
      partial.totalAmount = total;
    }
  }

  if (vatAmountText) {
    const vat = toNumberValue(vatAmountText);
    if (vat != null) {
      partial.vatAmount = vat;
    }
  }

  if (clientName) {
    additional.clientName = clientName;
  }

  if (sdcId) {
    additional.sdcId = sdcId;
  }

  if (internalData) {
    additional.internalData = internalData;
  }

  if (receiptSignature) {
    additional.receiptSignature = receiptSignature;
  }

  if (mrc) {
    additional.mrc = mrc;
  }

  if (currencyCode) {
    additional.currency = currencyCode;
    partial.currency = currencyCode;
  }

  partial.additional = additional;

  return partial;
};

const mergeQrPayload = (
  base: EbmQrPayload,
  updates: Partial<EbmQrPayload> | null,
): EbmQrPayload => {
  if (!updates) {
    return base;
  }

  const merged: EbmQrPayload = { ...base };

  if (updates.tin != null && (!merged.tin || merged.tin === '')) {
    merged.tin = updates.tin;
  }

  if (updates.buyerTin != null && (!merged.buyerTin || merged.buyerTin === '')) {
    merged.buyerTin = updates.buyerTin;
  }

  if (updates.invoiceNumber != null && (!merged.invoiceNumber || merged.invoiceNumber === '')) {
    merged.invoiceNumber = updates.invoiceNumber;
  }

  if (updates.issueDate != null && (!merged.issueDate || merged.issueDate === '')) {
    merged.issueDate = updates.issueDate;
  }

  if (updates.totalAmount != null && (merged.totalAmount == null)) {
    merged.totalAmount = updates.totalAmount;
  }

  if (updates.vatAmount != null && (merged.vatAmount == null)) {
    merged.vatAmount = updates.vatAmount;
  }

  if (updates.currency != null && (!merged.currency || merged.currency === '')) {
    merged.currency = updates.currency;
  }

  if (updates.additional) {
    merged.additional = {
      ...updates.additional,
      ...(merged.additional ?? {}),
    };
  }

  return merged;
};

const attemptRraQrEnrichment = async (payload: EbmQrPayload) => {
  if (!payload.raw) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(payload.raw);
  } catch (error) {
    return null;
  }

  if (!RRA_QR_HOSTNAMES.has(url.hostname.toLowerCase())) {
    return null;
  }

  try {
    const response = await fetch(url.toString());
    if (!response.ok) {
      validatorLogger.warn('Failed to fetch RRA receipt via QR payload.', {
        url: url.toString(),
        status: response.status,
      });
      return null;
    }

    const html = await response.text();
    return parseRraReceiptHtml(html, url);
  } catch (error) {
    validatorLogger.warn('Error while enriching RRA QR payload.', {
      url: url.toString(),
      error,
    });
    return null;
  }
};

const parseEbmQrPayload = (raw: string): EbmQrPayload => {
  const payload: EbmQrPayload = {
    raw,
    additional: {},
  };

  if (!raw || !raw.trim()) {
    return payload;
  }

  const trimmed = raw.trim();
  const additional: Record<string, unknown> = {};

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object') {
      assignFieldFromObject(parsed as Record<string, unknown>, payload, additional);
    }
  } catch (error) {
    // ignore JSON parse failure
  }

  if (trimmed.includes('://')) {
    try {
      const url = new URL(trimmed);
      if (url.search) {
        const params = new URLSearchParams(url.search);
        params.forEach((value, key) => {
          assignKeyValue(key, value, payload, additional);
        });
      }
      if (url.hash) {
        const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
        hashParams.forEach((value, key) => {
          assignKeyValue(key, value, payload, additional);
        });
      }
    } catch (error) {
      // ignore URL parse failure
    }
  }

  if (Object.keys(payload).length <= 2) {
    parseStructuredString(trimmed, payload, additional);
  }

  if (Object.keys(additional).length > 0) {
    payload.additional = additional;
  } else {
    delete payload.additional;
  }

  return payload;
};

const buildComparison = (
  fieldName: string,
  qrKey: keyof EbmQrPayload,
  qrValue: unknown,
  textField: EbmExtractedField | undefined,
  qrSource?: PdfQrDecodedCode,
): EbmFieldComparison => {
  const comparison: EbmFieldComparison = {
    field: fieldName,
    status: 'unverified',
    qrValue: qrValue ?? undefined,
    textValue: toStringValue(textField?.value ?? textField?.raw),
    qrSource: qrSource
      ? {
          pageNumber: qrSource.pageNumber,
          scale: qrSource.scale,
        }
      : undefined,
    textSource: textField
      ? {
          pageNumber: textField.pageNumber,
          raw: textField.raw,
        }
      : undefined,
  };

  const textValue = textField?.value ?? textField?.raw ?? null;

  if (qrValue == null && (textValue == null || textValue === '')) {
    comparison.status = 'unverified';
    comparison.details = 'QR payload and text snapshot both missing this field.';
    return comparison;
  }

  if (qrValue == null) {
    comparison.status = 'missing';
    comparison.details = 'QR payload does not provide this field.';
    return comparison;
  }

  if (textValue == null || textValue === '') {
    comparison.status = 'missing';
    comparison.details = 'Invoice text does not provide this field.';
    return comparison;
  }

  switch (qrKey) {
    case 'tin':
    case 'buyerTin': {
      const qrTin = normalizeTin(String(qrValue));
      const textTin = normalizeTin(String(textValue));
      comparison.qrValue = qrTin;
      comparison.textValue = textTin;
      if (qrTin && textTin && qrTin === textTin) {
        comparison.status = 'match';
      } else {
        comparison.status = 'mismatch';
        comparison.details = 'TIN values differ between QR payload and text.';
      }
      break;
    }
    case 'invoiceNumber': {
      const qrNumber = normalizeInvoiceNumber(qrValue);
      const textNumber = normalizeInvoiceNumber(textValue);
      comparison.qrValue = qrNumber;
      comparison.textValue = textNumber;
      if (qrNumber && textNumber && qrNumber === textNumber) {
        comparison.status = 'match';
      } else {
        comparison.status = 'mismatch';
        comparison.details = 'Invoice numbers do not match.';
      }
      break;
    }
    case 'issueDate': {
      const qrDate = toDateString(qrValue);
      const textDate = toDateString(textValue);
      comparison.qrValue = qrDate;
      comparison.textValue = textDate;
      if (qrDate && textDate && qrDate === textDate) {
        comparison.status = 'match';
      } else {
        comparison.status = 'mismatch';
        comparison.details = 'Issue dates differ.';
      }
      break;
    }
    case 'totalAmount':
    case 'vatAmount': {
      const qrNumber = toNumberValue(qrValue);
      const textNumber = toNumberValue(textValue);
      comparison.qrValue = qrNumber;
      comparison.textValue = textNumber;

      if (qrNumber != null && textNumber != null) {
        const tolerance = NUMERIC_TOLERANCE[qrKey] ?? 0;
        if (Math.abs(qrNumber - textNumber) <= tolerance) {
          comparison.status = 'match';
        } else {
          comparison.status = 'mismatch';
          comparison.details = `Values differ beyond tolerance of ±${tolerance} RWF.`;
        }
      } else {
        comparison.status = 'missing';
        comparison.details = 'Unable to parse numeric value for comparison.';
      }
      break;
    }
    case 'currency': {
      const qrCurrency = normalizeCurrency(qrValue);
      const textCurrency = normalizeCurrency(textValue);
      comparison.qrValue = qrCurrency;
      comparison.textValue = textCurrency;
      if (qrCurrency && textCurrency && qrCurrency === textCurrency) {
        comparison.status = 'match';
      } else {
        comparison.status = 'mismatch';
        comparison.details = 'Currency codes differ.';
      }
      break;
    }
    default:
      comparison.status = 'unverified';
      comparison.details = 'No comparator implemented for this field.';
      break;
  }

  return comparison;
};

const computeComparisons = (
  qrPayload: EbmQrPayload | undefined,
  extraction: EbmTextExtraction | undefined,
  qrDetections: PdfQrDecodedCode[],
): EbmFieldComparison[] => {
  if (!extraction) {
    return [];
  }

  const comparisons: EbmFieldComparison[] = [];
  const qrSource = qrDetections[0];

  for (const [fieldName, extracted] of Object.entries(extraction.fields)) {
    const lookupKey = FIELD_MAPPING.get(fieldName.toLowerCase());
    if (!lookupKey) {
      continue;
    }

    const qrValue = qrPayload ? qrPayload[lookupKey] : undefined;
    comparisons.push(buildComparison(fieldName, lookupKey, qrValue, extracted, qrSource));
  }

  if (qrPayload) {
    (['tin', 'buyerTin', 'invoiceNumber', 'issueDate', 'totalAmount', 'vatAmount', 'currency'] as Array<keyof EbmQrPayload>).forEach(
      (qrKey) => {
        if (qrKey === 'raw' || qrKey === 'additional') {
          return;
        }

        const targetField = QR_KEY_TO_FIELD.get(qrKey);
        const alreadyTracked = comparisons.some(
          (comparison) => FIELD_MAPPING.get(comparison.field.toLowerCase()) === qrKey,
        );

        if (!alreadyTracked) {
          comparisons.push(
            buildComparison(
              targetField ?? qrKey,
              qrKey,
              qrPayload[qrKey],
              undefined,
              qrSource,
            ),
          );
        }
      },
    );
  }

  return comparisons;
};

const buildSummary = (comparisons: EbmFieldComparison[], errors: string[]) => {
  const summary = {
    headline: 'EBM validation incomplete.',
    items: [] as string[],
  };

  const matchCount = comparisons.filter((item) => item.status === 'match').length;
  const mismatchCount = comparisons.filter((item) => item.status === 'mismatch').length;
  const missingCount = comparisons.filter((item) => item.status === 'missing').length;

  if (errors.length === 0 && mismatchCount === 0 && missingCount === 0) {
    summary.headline = 'Invoice details match QR payload.';
    summary.items.push(`Validated fields: ${matchCount}`);
  } else {
    summary.headline = 'Invoice validation reported issues.';

    if (matchCount > 0) {
      summary.items.push(`Matched fields: ${matchCount}`);
    }

    if (mismatchCount > 0) {
      summary.items.push(`Mismatched fields: ${mismatchCount}`);
    }

    if (missingCount > 0) {
      summary.items.push(`Missing fields: ${missingCount}`);
    }

    if (errors.length > 0) {
      summary.items.push(`Errors: ${errors.length}`);
    }
  }

  return summary;
};

const toQrDetections = (
  detections: PdfQrDecodedCode[],
): EbmQrDetection[] =>
  detections.map((detection) => ({
    pageNumber: detection.pageNumber,
    scale: detection.scale,
    text: detection.text,
  }));

export const validateEbmInvoice = async (
  file: EbmFileReference,
  options: EbmValidatorOptions = {},
): Promise<EbmValidationOutcome> => {
  const startedAt = new Date();
  const errors: string[] = [];

  const snapshot = await loadTextSnapshot(file.fileId);
  if (!snapshot) {
    errors.push('Failed to load invoice text snapshot.');
  }

  const templates = snapshot ? await selectTemplateForSnapshot(snapshot) : null;
  if (snapshot && !templates) {
    errors.push('No EBM template matched the invoice text.');
  }

  const extraction = snapshot && templates ? extractTextWithTemplate(templates, snapshot) : undefined;

  let qrDetections: PdfQrDecodedCode[] = [];
  let qrPayload: EbmQrPayload | undefined;

  if (file.fileExtension.toLowerCase() !== 'pdf') {
    errors.push('QR validation currently supports PDF invoices only.');
  } else {
    try {
      const originalKey = buildOriginalKey(file.fileId, file.fileExtension);
      const pdfBuffer = await serverFileStorage.download(originalKey);
      qrDetections = await decodeQrCodesFromPdf(pdfBuffer, options.qr);
      if (qrDetections.length === 0) {
        errors.push('No QR codes detected in the invoice.');
      } else {
        qrPayload = parseEbmQrPayload(qrDetections[0].text);
        const enrichment = await attemptRraQrEnrichment(qrPayload);
        qrPayload = mergeQrPayload(qrPayload, enrichment);
      }
    } catch (error) {
      errors.push('Failed to decode QR codes from the invoice.');
      validatorLogger.error('QR decoding failed.', {
        fileId: file.fileId,
        error,
      });
    }
  }

  if (qrPayload && !qrPayload.tin && !qrPayload.invoiceNumber && !qrPayload.totalAmount) {
    errors.push('QR payload did not include recognizable invoice fields.');
  }

  if (qrPayload && extraction && (!qrPayload.currency || qrPayload.currency === '')) {
    const currencyField = extraction.fields.currency;
    const currencyValue = currencyField?.value ?? currencyField?.raw;
    const normalizedCurrency = normalizeCurrency(currencyValue);

    if (normalizedCurrency) {
      qrPayload.currency = normalizedCurrency;
      if (!qrPayload.additional) {
        qrPayload.additional = {};
      }
      qrPayload.additional.currencySource = 'textSnapshot';
    }
  }

  const comparisons = computeComparisons(qrPayload, extraction, qrDetections);

  const result: EbmValidationResult = {
    templateName: templates?.templateName,
    issuer: templates?.definition.issuer,
    matches: comparisons,
    qrPayload,
    textSnapshot: snapshot ?? undefined,
    qrDetections: toQrDetections(qrDetections),
    summary: buildSummary(comparisons, errors),
    startedAt,
    completedAt: new Date(),
    errors: errors.length > 0 ? errors : undefined,
  };

  const outcome: EbmValidationOutcome = {
    result,
    extraction,
  };
  return outcome;
};
