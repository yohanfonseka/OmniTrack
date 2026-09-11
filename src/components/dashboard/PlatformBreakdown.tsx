import React, { useState } from 'react';
import { PlatformCalculatedMetrics, LineItemCalculatedMetrics, CampaignLineItem } from '../../types';
import { HealthBadge } from '../common/HealthBadge';
import { LineItemDetails } from './LineItemDetails';
import {
  ChevronDown,
  ChevronRight,
  Layers,
  TrendingUp,
  Target,
  DollarSign,
  AlertTriangle,
  ArrowRightLeft,
  Link2,
  CheckCircle2
} from 'lucide-react';
import { formatMoney as formatCurrencyMoney, formatNumber } from '../../lib/formatters';

interface PlatformBreakdownProps {
  platforms: PlatformCalculatedMetrics[];
  currency?: string;
  selectedPlatform?: string;
  selectedLineItemId?: string;
  onSelectPlatform?: (platform: string) => void;
  onSelectLineItem?: (lineItemId: string) => void;
  onConnectDataSource?: (lineItem: CampaignLineItem) => void;
}

export const PlatformBreakdown: React.FC<PlatformBreakdownProps> = ({
  platforms,
  currency = 'LKR',
  selectedPlatform,
  selectedLineItemId,
  onSelectPlatform,
  onSelectLineItem,
  onConnectDataSource
}) => {
  // Keep track of expanded platform rows
  const [expandedPlatforms, setExpandedPlatforms] = useState<Record<string, boolean>>({
    meta: true,
    tiktok: true,
    google: true
  });

  // Keep track of expanded line item details
  const [expandedLineItems, setExpandedLineItems] = useState<Record<string, boolean>>({});

  const togglePlatform = (plat: string) => {
    setExpandedPlatforms(prev => ({ ...prev, [plat]: !prev[plat] }));
    if (onSelectPlatform) {
      onSelectPlatform(plat);
    }
  };

  const toggleLineItem = (lineId: string) => {
    const isCurrentlyExpanded =
      expandedLineItems[lineId] !== undefined
        ? Boolean(expandedLineItems[lineId])
        : selectedLineItemId === lineId;
    const nextState = !isCurrentlyExpanded;
    setExpandedLineItems(prev => ({ ...prev, [lineId]: nextState }));
    if (onSelectLineItem) {
      onSelectLineItem(nextState ? lineId : undefined);
    }
  };

  const formatMoney = (val: number, cur = currency) => {
    return formatCurrencyMoney(val, cur, cur === 'USD' ? 2 : 0);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900 tracking-tight uppercase">Platform Breakdown (Level 2)</h3>
        </div>
        <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">
          {platforms.length} Platforms Active
        </span>
      </div>

      <div className="space-y-3">
        {platforms.map(p => {
          const isExpanded = expandedPlatforms[p.platform] ?? true;
          return (
            <div
              key={p.platform}
              id={`platform-card-${p.platform}`}
              className="bg-white border border-slate-200/90 rounded-xl overflow-hidden shadow-2xs transition-all"
            >
              {/* Platform Header / Summary Row */}
              <div
                onClick={() => togglePlatform(p.platform)}
                className="p-4 bg-slate-50/70 hover:bg-slate-100/70 cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/60 select-none"
              >
                <div className="flex items-center gap-3">
                  <button className="text-slate-400 hover:text-slate-600">
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>

                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-base capitalize">{p.platform} Ads</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200/70 text-slate-700 font-medium">
                      {p.line_items_count} {p.line_items_count === 1 ? 'Line Item' : 'Line Items'}
                    </span>
                  </div>

                  <HealthBadge status={p.health} size="sm" />
                </div>

                {/* Metrics Summary Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-medium">Budget Allocated</span>
                    <span className="font-bold text-slate-800">{formatMoney(p.budget)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-medium">Spend To Date</span>
                    <span className="font-bold text-slate-900">{formatMoney(p.spend)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-medium">Pacing %</span>
                    <span
                      className={`font-bold ${
                        p.pacing_percentage < 70 || p.pacing_percentage > 130
                          ? 'text-rose-600'
                          : p.pacing_percentage < 85 || p.pacing_percentage > 115
                          ? 'text-amber-600'
                          : 'text-emerald-600'
                      }`}
                    >
                      {p.pacing_percentage.toFixed(0)}%
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-medium">Recalculated CPM</span>
                    <span className="font-semibold text-slate-800">
                      {p.cpm > 0 ? `${currency} ${p.cpm.toFixed(1)}` : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Nested Line Items Table / Rows */}
              {isExpanded && (
                <div className="divide-y divide-slate-100">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50/50 text-slate-400 font-semibold uppercase text-[10px]">
                        <tr>
                          <th className="py-2.5 px-4">Line Item (Level 3)</th>
                          <th className="py-2.5 px-3">Data Source</th>
                          <th className="py-2.5 px-3">Objective</th>
                          <th className="py-2.5 px-3">Budget</th>
                          <th className="py-2.5 px-3">Spend To Date</th>
                          <th className="py-2.5 px-3">Pacing</th>
                          <th className="py-2.5 px-3">Primary KPI Target</th>
                          <th className="py-2.5 px-3">Actual Result</th>
                          <th className="py-2.5 px-3">Variance</th>
                          <th className="py-2.5 px-3">Health</th>
                          <th className="py-2.5 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {p.line_items.map(item => {
                          const isLineExpanded =
                            expandedLineItems[item.line_item.id] !== undefined
                              ? Boolean(expandedLineItems[item.line_item.id])
                              : selectedLineItemId === item.line_item.id;

                          const isCost = ['cpm', 'cpc', 'cpa', 'cpe'].includes(item.line_item.primary_kpi);
                          const isVarianceFavorable = isCost
                            ? item.primary_kpi_variance <= 0
                            : item.primary_kpi_variance >= 0;

                          const itemCur = item.line_item.currency || currency;
                          const isDifferentCurrency = itemCur.toUpperCase() !== currency.toUpperCase();

                          const isConnected = item.data_source_status === 'connected' || (item.data_sources && item.data_sources.length > 0);
                          const sourceCount = item.connected_sources_count || item.data_sources?.length || 0;

                          return (
                            <React.Fragment key={item.line_item.id}>
                              <tr
                                id={`line-row-${item.line_item.id}`}
                                className={`hover:bg-slate-50/80 transition-colors cursor-pointer ${
                                  isLineExpanded ? 'bg-indigo-50/40' : ''
                                }`}
                                onClick={() => toggleLineItem(item.line_item.id)}
                              >
                                <td className="py-3 px-4 font-semibold text-slate-900 flex items-center gap-2">
                                  <span className="text-slate-400">
                                    {isLineExpanded ? (
                                      <ChevronDown className="w-3.5 h-3.5 text-indigo-600" />
                                    ) : (
                                      <ChevronRight className="w-3.5 h-3.5" />
                                    )}
                                  </span>
                                  <span>{item.line_item.name}</span>
                                  {isDifferentCurrency && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                      {itemCur}
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-3">
                                  {isConnected ? (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                      <span>Connected ({sourceCount})</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                                      <AlertTriangle className="w-3 h-3 text-amber-500" />
                                      <span>Not Connected</span>
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-3 text-slate-600">{item.line_item.objective}</td>
                                <td className="py-3 px-3 font-medium text-slate-800">
                                  {formatMoney(item.line_item.budget, itemCur)}
                                </td>
                                <td className="py-3 px-3 font-semibold text-slate-900">
                                  {formatMoney(item.total_spend, itemCur)}
                                </td>
                                <td className="py-3 px-3">
                                  <span
                                    className={`font-semibold ${
                                      item.pacing_percentage < 70 || item.pacing_percentage > 130
                                        ? 'text-rose-600'
                                        : item.pacing_percentage < 85 || item.pacing_percentage > 115
                                        ? 'text-amber-600'
                                        : 'text-emerald-600'
                                    }`}
                                  >
                                    {formatNumber(item.pacing_percentage, 0)}%
                                  </span>
                                </td>
                                <td className="py-3 px-3 font-medium text-slate-700 uppercase">
                                  {item.line_item.primary_kpi}: {itemCur === 'USD' ? '$' : 'Rs.'} {formatNumber(item.line_item.primary_kpi_target, 2)}
                                </td>
                                <td className="py-3 px-3 font-bold text-slate-900">
                                  {itemCur === 'USD' ? '$' : 'Rs.'} {formatNumber(item.primary_kpi_actual, 2)}
                                </td>
                                <td className="py-3 px-3">
                                  <span
                                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold ${
                                      isVarianceFavorable
                                        ? 'bg-emerald-50 text-emerald-700'
                                        : 'bg-rose-50 text-rose-700'
                                    }`}
                                  >
                                    {item.primary_kpi_variance > 0 ? '+' : ''}
                                    {formatNumber(item.primary_kpi_variance, 1)}%
                                  </span>
                                </td>
                                <td className="py-3 px-3">
                                  <HealthBadge status={item.health} size="sm" />
                                </td>
                                <td className="py-3 px-4 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    {!isConnected && onConnectDataSource && (
                                      <button
                                        onClick={e => {
                                          e.stopPropagation();
                                          onConnectDataSource(item.line_item);
                                        }}
                                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-2 py-1 rounded shadow-2xs transition-colors"
                                      >
                                        <Link2 className="w-3 h-3" />
                                        <span>Connect</span>
                                      </button>
                                    )}
                                    <button
                                      onClick={e => {
                                        e.stopPropagation();
                                        toggleLineItem(item.line_item.id);
                                      }}
                                      className="text-xs font-medium text-indigo-600 hover:text-indigo-900 px-2 py-1 rounded hover:bg-indigo-50 transition-colors"
                                    >
                                      {isLineExpanded ? 'Hide Drill-Down' : 'View Drill-Down'}
                                    </button>
                                  </div>
                                </td>
                              </tr>

                              {/* Level 3 Expanded Details Row */}
                              {isLineExpanded && (
                                <tr>
                                  <td colSpan={11} className="p-4 bg-slate-50/60 border-y border-indigo-100">
                                    <LineItemDetails
                                      metrics={item}
                                      onClose={() => toggleLineItem(item.line_item.id)}
                                      onConnectDataSource={onConnectDataSource}
                                    />
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
