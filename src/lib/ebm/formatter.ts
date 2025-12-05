import { Document } from '@langchain/core/documents';
import type {
  EbmExtractedFieldMatch,
  EbmFieldComparison,
  EbmValidationOutcome,
  EbmValidationResult,
} from './types';

const joinLines = (lines: string[]) => lines.filter(Boolean).join('\n');

const formatComparisonLine = (comparison: EbmFieldComparison) => {
  const statusIcon = {
    match: '✅',
    mismatch: '❌',
    missing: '⚠️',
    unverified: '❔',
  }[comparison.status];

  const sourceHint = comparison.textSource?.pageNumber
    ? ` (page ${comparison.textSource.pageNumber})`
    : '';

  const qrValue = comparison.qrValue == null ? '—' : String(comparison.qrValue);
  const textValue = comparison.textValue == null ? '—' : String(comparison.textValue);

  const detail = comparison.details ? ` — ${comparison.details}` : '';

  return `${statusIcon} ${comparison.field}${sourceHint}: QR=${qrValue} | Text=${textValue}${detail}`;
};

const summariseComparisons = (result: EbmValidationResult) => {
  const matchCount = result.matches.filter((item) => item.status === 'match').length;
  const mismatchCount = result.matches.filter((item) => item.status === 'mismatch').length;
  const missingCount = result.matches.filter((item) => item.status === 'missing').length;
  const unverifiedCount = result.matches.filter((item) => item.status === 'unverified').length;

  return {
    matchCount,
    mismatchCount,
    missingCount,
    unverifiedCount,
  };
};

const sanitiseFieldMatch = (match: EbmExtractedFieldMatch) => ({
  raw: match.raw,
  normalized: match.normalized,
  value: match.value,
  pageNumber: match.pageNumber,
});

export const serialiseValidationOutcome = (
  outcome: EbmValidationOutcome,
) => {
  const { result, extraction } = outcome;

  const serialisableExtraction = extraction
    ? Object.fromEntries(
        Object.entries(extraction.fields).map(([field, value]) => [
          field,
          {
            value: value.value,
            raw: value.raw,
            pageNumber: value.pageNumber,
            matches: value.matches.map(sanitiseFieldMatch),
          },
        ]),
      )
    : undefined;

  return {
    templateName: result.templateName,
    issuer: result.issuer,
    summary: result.summary,
    errors: result.errors,
    counts: summariseComparisons(result),
    matches: result.matches.map((comparison) => ({
      field: comparison.field,
      status: comparison.status,
      qrValue: comparison.qrValue,
      textValue: comparison.textValue,
      details: comparison.details,
      qrSource: comparison.qrSource,
      textSource: comparison.textSource,
    })),
    qrPayload: result.qrPayload,
    qrDetections: result.qrDetections,
    extraction: serialisableExtraction,
    startedAt: result.startedAt?.toISOString(),
    completedAt: result.completedAt?.toISOString(),
  };
};

export const buildValidationSources = (
  outcome: EbmValidationOutcome,
): Document[] => {
  const { result, extraction } = outcome;
  const documents: Document[] = [];

  const summaryLines: string[] = [];
  summaryLines.push(result.summary?.headline ?? 'EBM validation summary');
  if (result.summary?.items?.length) {
    summaryLines.push('');
    summaryLines.push(...result.summary.items.map((item) => `• ${item}`));
  }

  if (result.errors?.length) {
    summaryLines.push('');
    summaryLines.push('Errors:');
    summaryLines.push(...result.errors.map((error) => `• ${error}`));
  }

  const summaryDoc = new Document({
    pageContent: joinLines(summaryLines),
    metadata: {
      url: 'File',
      title: 'EBM validation summary',
      note: result.summary?.headline,
      type: 'ebm-validation-summary',
      completedAt: result.completedAt?.toISOString(),
    },
  });
  documents.push(summaryDoc);

  const flaggedComparisons = result.matches.filter(
    (comparison) => comparison.status === 'mismatch' || comparison.status === 'missing',
  );

  if (flaggedComparisons.length > 0) {
    const flaggedLines = flaggedComparisons.map(formatComparisonLine);

    documents.push(
      new Document({
        pageContent: joinLines(['Field discrepancies:', '', ...flaggedLines]),
        metadata: {
          url: 'File',
          title: 'EBM mismatches',
          type: 'ebm-validation-mismatch',
        },
      }),
    );
  }

  if (result.qrPayload?.raw) {
    const qrLines = [
      'Raw QR payload:',
      '',
      result.qrPayload.raw,
    ];

    documents.push(
      new Document({
        pageContent: joinLines(qrLines),
        metadata: {
          url: 'File',
          title: 'QR payload',
          type: 'ebm-validation-qr',
        },
      }),
    );
  }

  const serialisableResult = serialiseValidationOutcome(outcome);

  documents.push(
    new Document({
      pageContent: JSON.stringify(serialisableResult, null, 2),
      metadata: {
        url: 'File',
        title: 'EBM validation details (JSON)',
        type: 'ebm-validation-json',
      },
    }),
  );

  return documents;
};

export const formatValidationMessage = (outcome: EbmValidationOutcome) => {
  const { result } = outcome;
  const summary = result.summary;
  const counts = summariseComparisons(result);

  const lines: string[] = [];
  if (summary?.headline) {
    lines.push(summary.headline);
  } else {
    lines.push('EBM validation completed.');
  }

  lines.push(
    `Matches: ${counts.matchCount}, mismatches: ${counts.mismatchCount}, missing: ${counts.missingCount}, unverified: ${counts.unverifiedCount}.`,
  );

  if (summary?.items?.length) {
    lines.push('');
    lines.push(...summary.items);
  }

  if (result.errors?.length) {
    lines.push('');
    lines.push('Errors:');
    lines.push(...result.errors.map((error) => `- ${error}`));
  }

  if (result.matches.length > 0) {
    const notable = result.matches
      .filter((item) => item.status === 'mismatch' || item.status === 'missing')
      .slice(0, 3)
      .map((item) => formatComparisonLine(item));

    if (notable.length > 0) {
      lines.push('');
      lines.push('Key discrepancies:');
      lines.push(...notable);
    }
  }

  if (result.qrPayload?.invoiceNumber) {
    lines.push('');
    lines.push(`Invoice number (QR): ${result.qrPayload.invoiceNumber}`);
  }

  return joinLines(lines);
};