import React, { useState, useMemo } from 'react';
import {
  Tag,
  Calendar,
  Users,
  Target,
  Layers,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  CornerDownRight,
  Hash,
  FileText
} from 'lucide-react';

export interface CampaignNameDisplayProps {
  rawName: string;
  platformCampaignId?: string;
  compact?: boolean;
  className?: string;
  nameLabel?: string;
  rawLabel?: string;
}

interface ParsedSegment {
  text: string;
  category: 'title' | 'po' | 'date' | 'metric' | 'audience' | 'placement' | 'general';
}

export const CampaignNameDisplay: React.FC<CampaignNameDisplayProps> = ({
  rawName,
  platformCampaignId,
  compact = false,
  className = '',
  nameLabel,
  rawLabel
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  // Parse hierarchy and segments
  const parsed = useMemo(() => {
    if (!rawName) {
      return {
        primaryTitle: 'Untitled Campaign',
        subTier: null,
        tags: [],
        raw: ''
      };
    }

    // Step 1: Check for hierarchy split (e.g. "Campaign › Ad Set / Placement")
    const hierarchySplit = rawName.split(/\s+[›>]\s+|\s+-->\s+|\s+\/\/\s+/);
    const campaignTier = hierarchySplit[0].trim();
    const adsetTier = hierarchySplit.length > 1 ? hierarchySplit.slice(1).join(' › ').trim() : null;

    // Step 2: Split campaign tier by pipe or dash delimiters
    const tokens = campaignTier
      .split('|')
      .map(t => t.trim())
      .filter(Boolean);

    let primaryTitle = tokens[0] || campaignTier;

    // If first token is brand or short prefix (e.g. "Ratthi"), and second token has campaign title
    if (tokens.length > 1 && tokens[0].length < 30 && tokens[1].length > 5) {
      // Check if second token is not just a date or code
      const isDate = /\d{1,2}-[A-Za-z]{3}-\d{4}|\d{4}-\d{2}-\d{2}/.test(tokens[1]);
      const isCode = /^(PO|WI|WO|ID|#)\s*\d+/i.test(tokens[1]);
      if (!isDate && !isCode) {
        primaryTitle = `${tokens[0]} • ${tokens[1]}`;
      }
    }

    // Extract structured tags from remaining tokens in campaign tier and adset tier
    const rawTokens = [
      ...tokens.slice(primaryTitle.includes('•') ? 2 : 1),
      ...(adsetTier ? adsetTier.split('|').map(t => t.trim()).filter(Boolean) : [])
    ];

    const tags: ParsedSegment[] = [];
    const seenTexts = new Set<string>();

    rawTokens.forEach(token => {
      const trimmed = token.trim();
      if (!trimmed || seenTexts.has(trimmed.toLowerCase())) return;
      seenTexts.add(trimmed.toLowerCase());

      // Don't tag if it's already part of the primary title
      if (primaryTitle.toLowerCase().includes(trimmed.toLowerCase())) return;

      // 1. PO / Work Order / Reference IDs
      if (/^(PO|WI|WO|SO|IO|REF|JOB|#)\s*[\d\w-]+/i.test(trimmed)) {
        tags.push({ text: trimmed, category: 'po' });
      }
      // 2. Dates (e.g. 08-Sep-2026, 2026-09-08)
      else if (/\d{1,2}-[A-Za-z]{3}-\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}/.test(trimmed)) {
        tags.push({ text: trimmed, category: 'date' });
      }
      // 3. Buying Model / Goals / Metrics (e.g. CPM, CPC, Auction Reach, Conversions)
      else if (/\b(CPM|CPC|CPA|CPE|ROAS|Auction|Reach|Conversions?|Traffic|Engagement|Views?|Launch|Awareness)\b/i.test(trimmed)) {
        tags.push({ text: trimmed, category: 'metric' });
      }
      // 4. Demographic / Audience (e.g. 18-40, Both, Sinhala, Tamil, English, Students, Workers)
      else if (/\b(\d{1,2}\s*-\s*\d{1,2}|Both|Male|Female|Sinhala|Tamil|English|Students?|Workers?|Young|Adults?|Demographic)\b/i.test(trimmed)) {
        tags.push({ text: trimmed, category: 'audience' });
      }
      // 5. Placements (e.g. FB & Insta, Reels, Feed)
      else if (/\b(FB|Insta|Instagram|Facebook|TikTok|Feed|Stories|Reels?|Multiple)\b/i.test(trimmed)) {
        tags.push({ text: trimmed, category: 'placement' });
      }
      // 6. Other relevant attributes (shorter tokens)
      else if (trimmed.length > 2 && trimmed.length <= 40) {
        tags.push({ text: trimmed, category: 'general' });
      }
    });

    // Also extract adset primary display string
    let adsetCleanTitle = null;
    if (adsetTier) {
      const adsetTokens = adsetTier.split('|').map(t => t.trim()).filter(Boolean);
      adsetCleanTitle = adsetTokens.slice(0, 2).join(' • ');
    }

    return {
      primaryTitle,
      adsetCleanTitle,
      tags: tags.slice(0, 8), // Keep top 8 most meaningful tags
      raw: rawName
    };
  }, [rawName]);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(rawName);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getTagStyle = (category: ParsedSegment['category']) => {
    switch (category) {
      case 'po':
        return 'bg-blue-50 text-blue-700 border-blue-200/80 font-mono';
      case 'date':
        return 'bg-amber-50 text-amber-800 border-amber-200/80';
      case 'metric':
        return 'bg-purple-50 text-purple-700 border-purple-200/80 font-semibold';
      case 'audience':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200/80';
      case 'placement':
        return 'bg-cyan-50 text-cyan-800 border-cyan-200/80';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getTagIcon = (category: ParsedSegment['category']) => {
    switch (category) {
      case 'po':
        return <Hash className="w-2.5 h-2.5 shrink-0 opacity-70" />;
      case 'date':
        return <Calendar className="w-2.5 h-2.5 shrink-0 opacity-70" />;
      case 'metric':
        return <Target className="w-2.5 h-2.5 shrink-0 opacity-70" />;
      case 'audience':
        return <Users className="w-2.5 h-2.5 shrink-0 opacity-70" />;
      case 'placement':
        return <Layers className="w-2.5 h-2.5 shrink-0 opacity-70" />;
      default:
        return <Tag className="w-2.5 h-2.5 shrink-0 opacity-60" />;
    }
  };

  if (compact) {
    return (
      <div className={`min-w-0 ${className}`}>
        <h4 className="font-bold text-slate-900 text-xs leading-snug line-clamp-1" title={rawName}>
          {parsed.primaryTitle}
        </h4>
        {parsed.adsetCleanTitle && (
          <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5 flex items-center gap-1">
            <CornerDownRight className="w-3 h-3 text-slate-400 shrink-0" />
            <span className="truncate">{parsed.adsetCleanTitle}</span>
          </p>
        )}
      </div>
    );
  }

  const toggleLabel = nameLabel || 'Campaign Name';
  const rawStringLabel = rawLabel || 'Full Ingestion / Platform String';

  return (
    <div className={`space-y-2.5 ${className}`}>
      {/* Primary Clean Title */}
      <div>
        <h3 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight leading-snug break-words">
          {parsed.primaryTitle}
        </h3>

        {/* Ad Set / Sub-tier Breadcrumb (if compound name) */}
        {parsed.adsetCleanTitle && (
          <div className="flex items-start gap-1.5 mt-1 text-xs text-indigo-700 font-medium bg-indigo-50/60 border border-indigo-100/80 px-2.5 py-1 rounded-lg w-fit max-w-full">
            <CornerDownRight className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
            <span className="text-[11px] uppercase font-bold text-indigo-500 tracking-wider shrink-0">
              Ad Set / Placement:
            </span>
            <span className="truncate">{parsed.adsetCleanTitle}</span>
          </div>
        )}
      </div>

      {/* Extracted Structured Attribute Chips */}
      {parsed.tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {parsed.tags.map((tag, idx) => (
            <span
              key={idx}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] border ${getTagStyle(tag.category)}`}
            >
              {getTagIcon(tag.category)}
              <span>{tag.text}</span>
            </span>
          ))}
        </div>
      )}

      {/* Collapsible Verbatim Raw Platform / Full Campaign String */}
      <div className="pt-1">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer group"
        >
          <FileText className="w-3 h-3 text-slate-400 group-hover:text-slate-600" />
          <span>{isExpanded ? `Hide Full ${toggleLabel}` : `View Full ${toggleLabel}`}</span>
          <span className="text-[10px] text-slate-400 font-mono">({rawName.length} chars)</span>
          {isExpanded ? (
            <ChevronUp className="w-3 h-3 text-slate-400" />
          ) : (
            <ChevronDown className="w-3 h-3 text-slate-400" />
          )}
        </button>

        {isExpanded && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="mt-2 p-3 bg-slate-900 text-slate-200 rounded-xl text-xs font-mono border border-slate-800 shadow-inner relative group/box animate-in fade-in duration-150 text-left"
          >
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-[10px] text-slate-400 font-sans">
              <span className="font-semibold uppercase tracking-wider">{rawStringLabel}</span>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded text-[10px] transition-colors cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span className="text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copy Name</span>
                  </>
                )}
              </button>
            </div>
            <div className="break-all whitespace-pre-wrap leading-relaxed select-all text-slate-300 text-[11px]">
              {rawName}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
