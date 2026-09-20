import React, { useState } from 'react';
import { PlatformCalculatedMetrics, LineItemCalculatedMetrics, CampaignLineItem } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { ApiService } from '../../lib/api';
import { HealthBadge } from '../common/HealthBadge';
import { LineItemDetails } from './LineItemDetails';
import { EditLineItemModal } from '../modals/EditLineItemModal';
import { ConfirmDeleteModal } from '../modals/ConfirmDeleteModal';
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
  CheckCircle2,
  Plus,
  Pencil,
  Trash2
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
  onOpenCreateLineItem?: () => void;
  /** Hides every control that changes something. Used by the client portal. */
  readOnly?: boolean;
}

export const PlatformBreakdown: React.FC<PlatformBreakdownProps> = ({
  platforms,
  currency = 'LKR',
  selectedPlatform,
  selectedLineItemId,
  onSelectPlatform,
  onSelectLineItem,
  onConnectDataSource,
  onOpenCreateLineItem,
  readOnly = false
}) => {
  const { currentAgency } = useAuth();
  const [lineItemToEdit, setLineItemToEdit] = useState<CampaignLineItem | null>(null);
  const [lineItemToDelete, setLineItemToDelete] = useState<CampaignLineItem | null>(null);

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
        <div className="flex items-center gap-2">
          {!readOnly && onOpenCreateLineItem && (
            <button
              onClick={onOpenCreateLineItem}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-all shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Line Item</span>
            </button>
          )}
          <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">
            {platforms.length} Platforms Active
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {platforms.length === 0 ? (
          <div className="p-8 text-center bg-white border border-dashed border-slate-300 rounded-xl space-y-3">
            <Layers className="w-10 h-10 text-slate-300 mx-auto" />
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-slate-700">No Line Items Configured Yet</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Add a line item to this campaign to start tracking platform budget, pacing, and delivery metrics. Newly created line items start with clean zero values.
              </p>
            </div>
            {!readOnly && onOpenCreateLineItem && (
              <button
                onClick={onOpenCreateLineItem}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-xs"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Add First Line Item</span>
              </button>
            )}
          </div>
        ) : (
          platforms.map(p => {
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
                          p.spend === 0
                            ? 'text-slate-600'
                            : (p.pacing_percentage ?? 0) < 70 || (p.pacing_percentage ?? 0) > 130
                            ? 'text-rose-600'
                            : (p.pacing_percentage ?? 0) < 85 || (p.pacing_percentage ?? 0) > 115
                            ? 'text-amber-600'
                            : 'text-emerald-600'
                        }`}
                      >
                        {(p.pacing_percentage ?? 0).toFixed(0)}%
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-medium">Recalculated CPM</span>
                      <span className="font-semibold text-slate-800">
                        {p.spend === 0 ? `${currency} 0.0` : (p.cpm && p.cpm > 0 ? `${currency} ${p.cpm.toFixed(1)}` : '—')}
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
                          <th className="py-2.5 px-3">Budget & Spend</th>
                          <th className="py-2.5 px-3">Spend Pacing</th>
                          <th className="py-2.5 px-3">Primary Deliverable KPI</th>
                          <th className="py-2.5 px-3">Deliverable Pace</th>
                          <th className="py-2.5 px-3">Buying KPI (Secondary)</th>
                          <th className="py-2.5 px-3">Rating & Health</th>
                          <th className="py-2.5 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {p.line_items.map(item => {
                          const isLineExpanded =
                            expandedLineItems[item.line_item.id] !== undefined
                              ? Boolean(expandedLineItems[item.line_item.id])
                              : selectedLineItemId === item.line_item.id;

                          const isCost = ['cpm', 'cpc', 'cpa', 'cpe', 'cpv'].includes(item.line_item.primary_kpi);
                          const isVarianceFavorable = isCost
                            ? item.primary_kpi_variance <= 0
                            : item.primary_kpi_variance >= 0;

                          const itemCur = item.line_item.currency || currency;
                          const isDifferentCurrency = itemCur.toUpperCase() !== currency.toUpperCase();

                          const isConnected = item.data_source_status === 'connected' || (item.data_sources && item.data_sources.length > 0);
                          const sourceCount = item.connected_sources_count || item.data_sources?.length || 0;

                          const isVolumeKpi = ['reach', 'impressions', 'video_views', 'clicks', 'conversions', 'engagements'].includes(item.line_item.primary_kpi);

                          const formatKpiVal = (kpi: string, val: number) => {
                            if (['reach', 'impressions', 'video_views', 'clicks', 'conversions', 'engagements'].includes(kpi)) {
                              return formatNumber(val, 0);
                            }
                            return `${itemCur === 'USD' ? '$' : 'Rs.'} ${formatNumber(val, 2)}`;
                          };

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
                                  <div>
                                    <div className="flex items-center gap-1.5">
                                      <span>{item.line_item.name}</span>
                                      {isDifferentCurrency && (
                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                          {itemCur}
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[11px] font-normal text-slate-500 block">
                                      {item.line_item.objective}
                                    </span>
                                  </div>
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
                                <td className="py-3 px-3">
                                  <div className="font-semibold text-slate-900">
                                    {formatMoney(item.total_spend, itemCur)}
                                  </div>
                                  <div className="text-[11px] text-slate-500">
                                    Budget: {formatMoney(item.line_item.budget, itemCur)}
                                  </div>
                                </td>
                                <td className="py-3 px-3">
                                  <span
                                    className={`font-semibold ${
                                      item.total_spend === 0
                                        ? 'text-slate-600'
                                        : item.pacing_percentage < 70 || item.pacing_percentage > 130
                                        ? 'text-rose-600'
                                        : item.pacing_percentage < 85 || item.pacing_percentage > 115
                                        ? 'text-amber-600'
                                        : 'text-emerald-600'
                                    }`}
                                  >
                                    {formatNumber(item.pacing_percentage, 0)}%
                                  </span>
                                  <span className="block text-[10px] text-slate-400">
                                    exp: {formatMoney(item.expected_spend, itemCur)}
                                  </span>
                                </td>
                                <td className="py-3 px-3">
                                  <div className="flex items-center gap-1.5">
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase bg-indigo-50 text-indigo-700 border border-indigo-200">
                                      {item.line_item.primary_kpi.replace('_', ' ')}
                                    </span>
                                  </div>
                                  <div className="font-bold text-slate-900 mt-0.5">
                                    {formatKpiVal(item.line_item.primary_kpi, item.primary_kpi_actual)}
                                    <span className="text-[11px] font-normal text-slate-500"> / {formatKpiVal(item.line_item.primary_kpi, item.line_item.primary_kpi_target)}</span>
                                  </div>
                                </td>
                                <td className="py-3 px-3">
                                  {item.total_spend === 0 ? (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-600">
                                      0.0%
                                    </span>
                                  ) : (
                                    <span
                                      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                                        isVarianceFavorable
                                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                                      }`}
                                    >
                                      {item.primary_kpi_variance > 0 ? '+' : ''}
                                      {formatNumber(item.primary_kpi_variance, 1)}%
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-3 text-slate-700">
                                  {item.buying_kpi && item.buying_kpi_target ? (
                                    <div>
                                      <div className="flex items-center gap-1">
                                        <span className="font-semibold text-slate-800 uppercase text-[11px]">
                                          {item.buying_kpi}:
                                        </span>
                                        <span className="font-bold text-slate-900">
                                          {itemCur === 'USD' ? '$' : 'Rs.'}{formatNumber(item.buying_kpi_actual || 0, 2)}
                                        </span>
                                      </div>
                                      <div className="text-[10px] text-slate-500 flex items-center gap-1">
                                        <span>tgt: {itemCur === 'USD' ? '$' : 'Rs.'}{formatNumber(item.buying_kpi_target, 2)}</span>
                                        {item.total_spend > 0 && typeof item.buying_kpi_variance === 'number' && !isNaN(item.buying_kpi_variance) && (
                                          <span className={item.buying_kpi_variance <= 0 ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                                            ({item.buying_kpi_variance > 0 ? '+' : ''}{item.buying_kpi_variance.toFixed(0)}%)
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-slate-400 text-[11px] italic">Not set</span>
                                  )}
                                </td>
                                <td className="py-3 px-3">
                                  <div className="flex items-center gap-1.5">
                                    <HealthBadge status={item.health} size="sm" />
                                    <span className="text-[11px] font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
                                      {item.health_score ?? 85}/100
                                    </span>
                                  </div>
                                </td>
                                <td className="py-3 px-4 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    {!readOnly && (
                                    <>
                                    <button
                                      type="button"
                                      id={`edit-line-item-btn-${item.line_item.id}`}
                                      onClick={e => {
                                        e.stopPropagation();
                                        setLineItemToEdit(item.line_item);
                                      }}
                                      className="p-1.5 text-slate-400 hover:text-indigo-600 rounded hover:bg-slate-100 transition-colors"
                                      title="Edit Line Item"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      id={`delete-line-item-btn-${item.line_item.id}`}
                                      onClick={e => {
                                        e.stopPropagation();
                                        setLineItemToDelete(item.line_item);
                                      }}
                                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors"
                                      title="Delete Line Item"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                    </>
                                    )}
                                    {!readOnly && !isConnected && onConnectDataSource && (
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
                                  <td colSpan={9} className="p-4 bg-slate-50/60 border-y border-indigo-100">
                                    <LineItemDetails
                                      metrics={item}
                                      onClose={() => toggleLineItem(item.line_item.id)}
                                      onConnectDataSource={readOnly ? undefined : onConnectDataSource}
                                      onEditLineItem={readOnly ? undefined : li => setLineItemToEdit(li)}
                                      onDeleteLineItem={readOnly ? undefined : li => setLineItemToDelete(li)}
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
        })
      )}
    </div>

    {/* Edit Line Item Modal */}
    {lineItemToEdit && (
      <EditLineItemModal
        lineItem={lineItemToEdit}
        campaignCurrency={currency}
        onClose={() => setLineItemToEdit(null)}
        onUpdated={() => {
          setLineItemToEdit(null);
          window.dispatchEvent(new CustomEvent('refresh-omnitrack'));
          window.dispatchEvent(new CustomEvent('campaigns-updated'));
        }}
      />
    )}

    {/* Confirm Delete Line Item Modal */}
    {lineItemToDelete && (
      <ConfirmDeleteModal
        title="Delete Line Item"
        itemName={lineItemToDelete.name}
        itemType="Line Item"
        warningDetails={`Deleting "${lineItemToDelete.name}" on ${lineItemToDelete.platform.toUpperCase()} (${lineItemToDelete.currency} ${lineItemToDelete.budget?.toLocaleString()}) will permanently remove its budget from this campaign, delete all associated daily tracking metrics, and recalculate parent campaign pacing and health.`}
        onClose={() => setLineItemToDelete(null)}
        onConfirm={async () => {
          if (!currentAgency) return;
          await ApiService.deleteLineItem(currentAgency.id, lineItemToDelete.id);
          window.dispatchEvent(new CustomEvent('refresh-omnitrack'));
          window.dispatchEvent(new CustomEvent('campaigns-updated'));
        }}
      />
    )}
  </div>
  );
};
