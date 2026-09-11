/**
 * Formatting utilities for numbers and currencies across OmniTrack.
 * Enforces strict comma separation on all numeric displays and entries.
 */

export const stripCommas = (val: string | number | null | undefined): string => {
  if (val === null || val === undefined) return '';
  return String(val).replace(/,/g, '').trim();
};

export const parseNumber = (val: string | number | null | undefined): number => {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const clean = stripCommas(val);
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
};

export const formatNumber = (
  val: number | string | null | undefined,
  maximumFractionDigits = 2
): string => {
  if (val === null || val === undefined || val === '') return '0';
  const num = typeof val === 'number' ? val : parseNumber(val);
  return num.toLocaleString('en-US', {
    maximumFractionDigits,
    minimumFractionDigits: 0
  });
};

export const formatNumberWithDecimals = (
  val: number | string | null | undefined,
  decimals = 1
): string => {
  if (val === null || val === undefined || val === '') return '0.0';
  const num = typeof val === 'number' ? val : parseNumber(val);
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
};

export const formatMoney = (
  val: number | null | undefined,
  currency = 'LKR',
  maximumFractionDigits = 0
): string => {
  if (val === null || val === undefined) return `${currency} 0`;
  const formatted = val.toLocaleString('en-US', {
    maximumFractionDigits,
    minimumFractionDigits: 0
  });
  const currUpper = (currency || 'LKR').toUpperCase();
  if (currUpper === 'USD') {
    return `$ ${formatted}`;
  }
  return `${currUpper} ${formatted}`;
};

export const formatPercent = (
  val: number | null | undefined,
  decimals = 1
): string => {
  if (val === null || val === undefined) return '0%';
  const num = typeof val === 'number' ? val : parseNumber(val);
  return `${num.toFixed(decimals)}%`;
};
