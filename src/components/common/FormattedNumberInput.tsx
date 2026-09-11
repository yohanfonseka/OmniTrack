import React, { useState, useEffect, useRef } from 'react';
import { stripCommas, parseNumber } from '../../lib/formatters';

export interface FormattedNumberInputProps {
  value: number | string | undefined | null;
  onChange: (val: number) => void;
  placeholder?: string;
  className?: string;
  prefix?: string;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  allowDecimals?: boolean;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  name?: string;
  autoFocus?: boolean;
}

/**
 * An intuitive numeric input component that renders values formatted with thousand-separator commas
 * (e.g., 1,500,000 or 1,250.50) while typing and editing, maintaining cursor alignment and
 * emitting clean numeric values.
 */
export const FormattedNumberInput: React.FC<FormattedNumberInputProps> = ({
  value,
  onChange,
  placeholder = '0',
  className = '',
  prefix,
  suffix,
  min,
  max,
  allowDecimals = true,
  required = false,
  disabled = false,
  id,
  name,
  autoFocus = false
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  // Helper to format string with commas
  const formatRawString = (valStr: string): string => {
    if (!valStr) return '';
    const clean = valStr.replace(/,/g, '');
    if (clean === '' || clean === '-') return clean;

    const parts = clean.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return allowDecimals ? parts.join('.') : parts[0];
  };

  const initialFormatted = () => {
    if (value === undefined || value === null || value === '') return '';
    return formatRawString(String(value));
  };

  const [displayValue, setDisplayValue] = useState<string>(initialFormatted);

  // Keep displayValue in sync with value prop if updated from outside
  useEffect(() => {
    const currentNumeric = parseNumber(displayValue);
    const propNumeric = parseNumber(value);

    // Only update display value if numeric value genuinely differs
    if (propNumeric !== currentNumeric || (value === '' && displayValue !== '')) {
      setDisplayValue(initialFormatted());
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputEl = e.target;
    const rawVal = inputEl.value;
    const cursorPosition = inputEl.selectionStart || 0;

    // Count non-comma characters before the cursor
    const nonCommasBeforeCursor = rawVal.slice(0, cursorPosition).replace(/,/g, '').length;

    // Clean value
    let clean = rawVal.replace(/,/g, '');

    // Allow empty or negative sign
    if (clean === '' || clean === '-') {
      setDisplayValue(clean);
      onChange(0);
      return;
    }

    // RegEx validation: digits with optional single decimal point
    const isValidPattern = allowDecimals ? /^-?\d*\.?\d*$/ : /^-?\d*$/;
    if (!isValidPattern.test(clean)) {
      return;
    }

    // Parse and clamp min/max if applicable
    let parsed = parseFloat(clean);
    if (!isNaN(parsed)) {
      if (max !== undefined && parsed > max) parsed = max;
      if (min !== undefined && parsed < min) parsed = min;
      onChange(parsed);
    }

    // Format new display value
    const parts = clean.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const formatted = allowDecimals ? parts.join('.') : parts[0];

    setDisplayValue(formatted);

    // Restore cursor position smoothly
    requestAnimationFrame(() => {
      if (inputRef.current) {
        let newCursor = 0;
        let countedNonCommas = 0;
        for (let i = 0; i < formatted.length; i++) {
          if (formatted[i] !== ',') {
            countedNonCommas++;
          }
          if (countedNonCommas === nonCommasBeforeCursor) {
            newCursor = i + 1;
            break;
          }
        }
        inputRef.current.setSelectionRange(newCursor, newCursor);
      }
    });
  };

  const handleBlur = () => {
    const num = parseNumber(displayValue);
    if (displayValue.trim() === '') {
      setDisplayValue('');
      if (required) onChange(0);
    } else {
      setDisplayValue(formatRawString(String(num)));
    }
  };

  const baseInputClass =
    'w-full px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white transition-colors';

  return (
    <div className="relative flex items-center">
      {prefix && (
        <span className="absolute left-3 text-xs font-semibold text-slate-400 select-none pointer-events-none">
          {prefix}
        </span>
      )}
      <input
        ref={inputRef}
        type="text"
        inputMode={allowDecimals ? 'decimal' : 'numeric'}
        id={id}
        name={name}
        required={required}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={displayValue}
        onChange={handleChange}
        onBlur={handleBlur}
        className={`${baseInputClass} ${prefix ? 'pl-8' : ''} ${suffix ? 'pr-10' : ''} ${className}`}
      />
      {suffix && (
        <span className="absolute right-3 text-xs font-medium text-slate-400 select-none pointer-events-none">
          {suffix}
        </span>
      )}
    </div>
  );
};
