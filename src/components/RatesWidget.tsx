"use client";

import { useEffect, useState } from 'react';

const FX_ROTATION_INTERVAL_MS = 8000;

const percentFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const currencyFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

type RatesResponse = {
  fetchedAt: string;
  policyRate: {
    value: number | null;
    month: string | null;
  };
  inflation: {
    value: number | null;
    month: string | null;
  };
  fx: Array<{
    code: string;
    label: string;
    average: number | null;
    buying: number | null;
    selling: number | null;
    asOf: string | null;
  }>;
};

const toPercent = (value: number | null) => {
  if (value == null) {
    return '—';
  }

  return `${percentFormatter.format(value)}%`;
};

const toCurrency = (value: number | null) => {
  if (value == null) {
    return '—';
  }

  return currencyFormatter.format(value);
};

const formatMonthLabel = (value: string | null) => {
  if (!value) {
    return '—';
  }

  return value.replace(/[-_]/g, ' ');
};

const formatAsOfLabel = (value: string | null) => {
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
  });
};

const RatesWidget = () => {
  const [data, setData] = useState<RatesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeFxIndex, setActiveFxIndex] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      setLoading(true);
      setError(false);

      try {
        const res = await fetch('/api/rates', {
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`Rates request failed with status ${res.status}`);
        }

        const response: RatesResponse = await res.json();
        setData(response);
        setActiveFxIndex(0);
      } catch (err) {
        if (!controller.signal.aborted) {
          console.error('Failed to load rates widget data:', err);
          setError(true);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const total = data?.fx?.length ?? 0;
    if (total <= 1) {
      return;
    }

    const id = window.setInterval(() => {
      setActiveFxIndex((prev) => {
        const next = prev + 1;
        return next >= total ? 0 : next;
      });
    }, FX_ROTATION_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [data?.fx?.length]);

  useEffect(() => {
    if (!data?.fx?.length) {
      setActiveFxIndex(0);
      return;
    }

    setActiveFxIndex((prev) =>
      prev >= data.fx.length ? data.fx.length - 1 : prev,
    );
  }, [data?.fx?.length]);

  const fxEntry = data?.fx?.length
    ? data.fx[Math.min(activeFxIndex, data.fx.length - 1)]
    : undefined;

  return (
    <div className="bg-light-secondary dark:bg-dark-secondary rounded-2xl border border-light-200 dark:border-dark-200 shadow-sm shadow-light-200/10 dark:shadow-black/25 flex flex-row items-center w-full min-h-[112px] px-4 py-3 gap-4">
      {loading ? (
        <div className="flex flex-row items-center justify-between w-full h-full animate-pulse">
          <div className="flex flex-col justify-between h-full flex-1 pr-3">
            <div className="h-3 w-16 rounded bg-light-200 dark:bg-dark-200" />
            <div className="h-6 w-20 rounded bg-light-200 dark:bg-dark-200" />
            <div className="h-3 w-12 rounded bg-light-200 dark:bg-dark-200" />
          </div>
          <div className="flex flex-col justify-between h-full flex-1 pl-3 border-l border-light-200/40 dark:border-dark-200/40">
            <div className="h-3 w-20 rounded bg-light-200 dark:bg-dark-200" />
            <div className="h-6 w-16 rounded bg-light-200 dark:bg-dark-200" />
            <div className="h-3 w-16 rounded bg-light-200 dark:bg-dark-200" />
          </div>
        </div>
      ) : error ? (
        <div className="text-xs text-red-400">Could not load rates.</div>
      ) : (
        <div className="flex flex-col justify-between w-full h-full">
          <div className="flex flex-row items-stretch h-full gap-3">
            <div className="flex flex-col justify-between flex-1 pr-3 border-r border-light-200/40 dark:border-dark-200/40">
              <span className="text-[10px] uppercase tracking-[0.14rem] text-black/50 dark:text-white/50">
                Policy Rate
              </span>
              <span className="text-2xl font-semibold text-black dark:text-white">
                {toPercent(data?.policyRate.value ?? null)}
              </span>
              <span className="text-[10px] text-black/60 dark:text-white/60">
                {formatMonthLabel(data?.policyRate.month ?? null)}
              </span>
            </div>
            <div className="flex flex-col justify-between flex-1 pl-3">
              <span className="text-[10px] uppercase tracking-[0.14rem] text-black/50 dark:text-white/50">
                Inflation
              </span>
              <span className="text-2xl font-semibold text-black dark:text-white">
                {toPercent(data?.inflation.value ?? null)}
              </span>
              <span className="text-[10px] text-black/60 dark:text-white/60">
                {formatMonthLabel(data?.inflation.month ?? null)}
              </span>
            </div>
          </div>
          <div className="flex flex-row items-center text-[11px] text-black/65 dark:text-white/65 pt-3 mt-1 border-t border-light-200/40 dark:border-dark-200/40">
            {fxEntry ? (
              <span className="flex flex-row items-center gap-3 w-full overflow-x-auto">
                <span className="font-medium whitespace-nowrap">
                  {fxEntry.label}{' '}
                  {toCurrency(fxEntry.average)}
                </span>
                <span className="text-[10px] text-black/50 dark:text-white/50 whitespace-nowrap">
                  Buy {toCurrency(fxEntry.buying)} · Sell {toCurrency(fxEntry.selling)} · As of{' '}
                  {formatAsOfLabel(fxEntry.asOf)}
                </span>
              </span>
            ) : (
              <span className="text-[10px] text-black/50 dark:text-white/50">
                Exchange rates unavailable.
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default RatesWidget;
