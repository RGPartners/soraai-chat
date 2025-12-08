import type { CountryOverride } from '@/lib/discover/topics';

export type RwandaTopicOverrides = Record<string, CountryOverride>;

export const rwandaTopicOverrides: RwandaTopicOverrides = {
  tech: {
    label: 'Regulation & Policy',
    description:
      'Legislation, fiscal strategy, and regulatory frameworks shaping Rwanda’s tax regime.',
    domains: ['rra.gov.rw', 'minfin.gov.rw', 'bnr.rw', 'rdb.rw', 'kifc.rw'],
    queries: [
      'Rwanda tax legislation',
      'RRA tax reform announcement',
      'Rwanda fiscal strategy update',
      'RDB policy framework',
    ],
    keywords: ['rwanda', 'rra', 'rdb', 'bnr', 'policy'],
    includeBaseKeywords: true,
  },
  finance: {
    label: 'Tax Updates & Compliance',
    description:
      'Revenue statistics, policy execution updates, filing obligations, and enforcement activity from Rwanda’s fiscal authorities.',
    domains: ['rra.gov.rw', 'bnr.rw', 'minfin.gov.rw', 'kifc.rw'],
    queries: [
      'Rwanda tax compliance update',
      'Rwanda tax revenue performance',
      'RRA enforcement notice',
      'Rwanda filing reminder',
    ],
    keywords: ['rwanda', 'compliance', 'enforcement', 'update', 'revenue'],
    includeBaseKeywords: true,
  },
  art: {
    label: 'Advisory & Investment Insights',
    description:
      'Advisor commentary on planning, structuring, investment climate, and mitigation strategies.',
    domains: ['kifc.rw', 'rdb.rw', 'deloitte.com'],
    queries: [
      'Rwanda tax planning',
      'Kigali investment insight',
      'Rwanda advisory briefing',
      'deal activity Rwanda',
    ],
    keywords: ['rwanda', 'investment', 'advisory'],
    includeBaseKeywords: true,
  },
  sports: {
    label: 'Tax Alerts & Deadlines',
    description:
      'Urgent notices, filing deadlines, reminders, press briefings, and authority updates.',
    domains: ['rra.gov.rw', 'minfin.gov.rw', 'bnr.rw'],
    queries: [
      'Rwanda tax alert',
      'RRA filing reminder',
      'Rwanda press briefing tax',
      'Rwanda tax deadline notice',
    ],
    keywords: ['rwanda', 'deadline', 'alert', 'notice'],
    includeBaseKeywords: true,
  },
  entertainment: {
    label: 'News',
    description:
      'Official Ministry of Finance news and announcements covering Rwanda’s fiscal programmes and public briefings.',
    domains: ['minecofin.gov.rw'],
    queries: [
      'site:minecofin.gov.rw/news announcement',
      'Rwanda finance ministry news',
      'Minecofin press release',
      'Rwanda economic programme update',
    ],
    keywords: ['rwanda', 'minecofin', 'news', 'announcement'],
    includeBaseKeywords: true,
  },
};
