import React from 'react';
import { HealthStatus } from '../../types';
import { CheckCircle2, AlertTriangle, AlertOctagon } from 'lucide-react';

interface HealthBadgeProps {
  status: HealthStatus;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  tooltip?: string;
}

export const HealthBadge: React.FC<HealthBadgeProps> = ({
  status,
  label,
  size = 'md',
  showIcon = true,
  tooltip
}) => {
  const configs = {
    green: {
      bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icon: CheckCircle2,
      defaultLabel: 'On Track',
      dot: 'bg-emerald-500'
    },
    amber: {
      bg: 'bg-amber-50 text-amber-800 border-amber-200',
      icon: AlertTriangle,
      defaultLabel: 'Attention',
      dot: 'bg-amber-500'
    },
    red: {
      bg: 'bg-rose-50 text-rose-800 border-rose-200',
      icon: AlertOctagon,
      defaultLabel: 'Critical Risk',
      dot: 'bg-rose-500'
    }
  };

  const current = configs[status] || configs.green;
  const Icon = current.icon;
  const text = label || current.defaultLabel;

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs gap-1',
    md: 'px-2.5 py-1 text-xs font-medium gap-1.5',
    lg: 'px-3 py-1.5 text-sm font-medium gap-2'
  };

  return (
    <span
      id={`health-badge-${status}-${Math.random().toString(36).substring(2, 6)}`}
      title={tooltip}
      className={`inline-flex items-center rounded-full border ${current.bg} ${sizeClasses[size]} transition-all cursor-default select-none`}
    >
      {showIcon ? (
        <Icon className={size === 'sm' ? 'w-3 h-3' : size === 'lg' ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
      ) : (
        <span className={`w-1.5 h-1.5 rounded-full ${current.dot}`} />
      )}
      <span>{text}</span>
    </span>
  );
};
