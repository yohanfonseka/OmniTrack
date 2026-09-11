import React from 'react';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

interface MetricCardProps {
  id?: string;
  label: string;
  value: string | number;
  subValue?: string;
  variance?: number; // e.g. -2% or +44%
  varianceLabel?: string;
  isPositiveGood?: boolean; // For cost metrics, negative variance is good!
  icon?: React.ReactNode;
  statusColor?: 'emerald' | 'amber' | 'rose' | 'slate' | 'indigo';
}

export const MetricCard: React.FC<MetricCardProps> = ({
  id,
  label,
  value,
  subValue,
  variance,
  varianceLabel,
  isPositiveGood = true,
  icon,
  statusColor = 'slate'
}) => {
  const getVarianceColor = () => {
    if (variance === undefined || variance === 0) return 'text-slate-500 bg-slate-100';
    const isGood = isPositiveGood ? variance > 0 : variance < 0;
    return isGood
      ? 'text-emerald-700 bg-emerald-50 border border-emerald-200'
      : 'text-rose-700 bg-rose-50 border border-rose-200';
  };

  const getVarianceIcon = () => {
    if (variance === undefined || variance === 0) return <Minus className="w-3 h-3" />;
    return variance > 0 ? (
      <ArrowUpRight className="w-3.5 h-3.5" />
    ) : (
      <ArrowDownRight className="w-3.5 h-3.5" />
    );
  };

  return (
    <div
      id={id || `metric-card-${label.toLowerCase().replace(/\s+/g, '-')}`}
      className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-colors"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-medium text-slate-500 tracking-normal uppercase truncate">{label}</span>
        {icon && <div className="text-slate-400 p-1 rounded-md bg-slate-50">{icon}</div>}
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <div className="text-2xl font-bold text-slate-900 tracking-tight">{value}</div>
        {variance !== undefined && (
          <span
            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-semibold ${getVarianceColor()}`}
            title={varianceLabel}
          >
            {getVarianceIcon()}
            {Math.abs(variance).toFixed(1)}%
          </span>
        )}
      </div>

      {(subValue || varianceLabel) && (
        <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          {subValue && <span>{subValue}</span>}
          {varianceLabel && <span className="ml-auto font-normal text-slate-400">{varianceLabel}</span>}
        </div>
      )}
    </div>
  );
};
