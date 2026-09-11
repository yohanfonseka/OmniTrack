import Papa from 'papaparse';
import { db } from './db.js';
import { HealthEngine } from './healthEngine.js';
import { ImportJob, PlatformType, LineItemDailyMetric, CampaignLineItem } from './types.js';

export interface CsvPreviewResult {
  headers: string[];
  total_rows: number;
  preview_rows: Record<string, any>[];
  detected_platform?: PlatformType;
  suggested_mapping: Record<string, string>;
  distinct_campaigns: { platform_campaign_id: string; campaign_name: string; rows_count: number }[];
}

export interface ImportExecuteParams {
  agency_id: string;
  client_id: string;
  brand_id: string;
  platform: PlatformType;
  file_name: string;
  csv_content: string;
  column_mapping: Record<string, string>; // normalizedField -> csvHeader
  campaign_matches: Record<string, string>; // platform_campaign_id -> line_item_id
  currency: string;
}

export class CsvEngine {
  /**
   * Previews CSV, identifies headers, auto-detects platform patterns, and extracts distinct campaigns
   */
  static parseAndPreview(csvContent: string): CsvPreviewResult {
    const parsed = Papa.parse(csvContent.trim(), {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false
    });

    const headers = parsed.meta.fields || [];
    const rows = parsed.data as Record<string, any>[];
    const preview_rows = rows.slice(0, 5);

    // Detect platform
    const headerLower = headers.map(h => h.toLowerCase());
    let detected_platform: PlatformType = 'meta';
    if (
      headerLower.some(h => h.includes('tiktok') || h.includes('tt_') || h.includes('cost') && !headerLower.includes('amount spent'))
    ) {
      detected_platform = 'tiktok';
    }

    // Default mapping suggestions
    const suggested_mapping: Record<string, string> = {};
    const normalizedFields = [
      'report_date',
      'platform_campaign_id',
      'campaign_name',
      'ad_account_id',
      'spend',
      'impressions',
      'reach',
      'clicks',
      'conversions',
      'conversion_value',
      'video_views',
      'campaign_status',
      'objective'
    ];

    const matchRules: Record<string, string[]> = {
      report_date: ['day', 'date', 'reporting_date', 'report_date', 'time'],
      platform_campaign_id: ['campaign id', 'campaign_id', 'platform_campaign_id', 'cid'],
      campaign_name: ['campaign name', 'campaign_name', 'name'],
      ad_account_id: ['account id', 'ad account id', 'account_id', 'ad_account_id'],
      spend: ['amount spent (lkr)', 'amount spent (usd)', 'amount spent', 'cost', 'spend', 'total spend'],
      impressions: ['impressions', 'impr'],
      reach: ['reach', 'unique users'],
      clicks: ['link clicks', 'clicks', 'total clicks'],
      conversions: ['purchases', 'conversions', 'results', 'total conversions'],
      conversion_value: ['purchases conversion value', 'conversion value', 'value', 'revenue'],
      video_views: ['3-second video plays', 'video views', 'views', 'video plays'],
      campaign_status: ['campaign delivery', 'status', 'campaign status', 'state'],
      objective: ['objective', 'campaign objective']
    };

    normalizedFields.forEach(norm => {
      const candidates = matchRules[norm] || [];
      for (const h of headers) {
        const hLow = h.toLowerCase().trim();
        if (candidates.some(c => hLow === c || hLow.includes(c))) {
          suggested_mapping[norm] = h;
          break;
        }
      }
    });

    // Extract distinct platform campaigns from the CSV
    const campMap = new Map<string, { name: string; count: number }>();
    const campIdHeader = suggested_mapping['platform_campaign_id'] || headers.find(h => {
      const low = h.toLowerCase();
      return low.includes('campaign id') || low.includes('campaign_id') || low === 'cid' || low.includes('id');
    });
    const campNameHeader = suggested_mapping['campaign_name'] || headers.find(h => {
      const low = h.toLowerCase();
      return low.includes('campaign name') || low.includes('campaign_name') || low === 'name' || low.includes('campaign');
    });

    rows.forEach((row, idx) => {
      const rawId = campIdHeader ? String(row[campIdHeader] || '').trim() : '';
      const rawName = campNameHeader ? String(row[campNameHeader] || '').trim() : '';
      const id = rawId || rawName || `campaign_${idx + 1}`;
      const name = rawName || rawId || 'Unnamed Campaign';
      if (id) {
        const curr = campMap.get(id) || { name, count: 0 };
        curr.count += 1;
        campMap.set(id, curr);
      }
    });

    const distinct_campaigns = Array.from(campMap.entries()).map(([id, info]) => ({
      platform_campaign_id: id,
      campaign_name: info.name,
      rows_count: info.count
    }));

    return {
      headers,
      total_rows: rows.length,
      preview_rows,
      detected_platform,
      suggested_mapping,
      distinct_campaigns
    };
  }

  /**
   * Executes the import job in the background with deduplication
   */
  static processImportAsync(params: ImportExecuteParams): ImportJob {
    const job = db.createImportJob({
      agency_id: params.agency_id,
      client_id: params.client_id,
      brand_id: params.brand_id,
      platform: params.platform,
      file_name: params.file_name,
      status: 'processing',
      total_rows: 0,
      processed_rows: 0,
      inserted_count: 0,
      updated_count: 0,
      skipped_count: 0,
      errors: []
    });

    // Run asynchronously to allow instant UI response and simulate background worker processing
    setTimeout(() => {
      try {
        const parsed = Papa.parse(params.csv_content.trim(), {
          header: true,
          skipEmptyLines: true
        });

        const rows = parsed.data as Record<string, any>[];
        job.total_rows = rows.length;

        const map = params.column_mapping;
        const matches = params.campaign_matches || {};

        let inserted = 0;
        let updated = 0;
        let skipped = 0;
        let unallocatedCount = 0;
        const errors: string[] = [];
        const unmappedCollector = new Map<string, { info: any; metrics: any[] }>();

        rows.forEach((row, idx) => {
          try {
            const rawCampId = String(row[map['platform_campaign_id']] || '').trim();
            const rawCampName = String(row[map['campaign_name']] || 'Imported Campaign').trim();
            const rawDate = String(row[map['report_date']] || '').trim();

            // Helper to parse numeric fields safely
            const parseRowVal = (val: any) => {
              if (val === undefined || val === null || val === '') return 0;
              const clean = String(val).replace(/[^0-9.-]/g, '');
              const num = parseFloat(clean);
              return isNaN(num) ? 0 : num;
            };

            // Look up target mapping by raw ID, raw Name, or fallback keys
            const targetId = matches[rawCampId] ||
                             matches[rawCampName] ||
                             (rawCampId ? matches[rawCampId.toLowerCase()] : '') ||
                             (rawCampName ? matches[rawCampName.toLowerCase()] : '');

            // Clean id prefixes if passed like "line:xyz" or "camp:xyz"
            const cleanTargetId = targetId ? targetId.replace(/^(line:|camp:)/, '') : '';

            // If user explicitly marked as unmapped or unallocated, collect for Unmapped Campaigns
            if (cleanTargetId === 'unmapped' || cleanTargetId === 'leave_unmapped' || cleanTargetId === 'unallocated') {
              const uKey = rawCampId || rawCampName;
              if (!unmappedCollector.has(uKey)) {
                unmappedCollector.set(uKey, {
                  info: {
                    rawCampId,
                    rawCampName,
                    adAccountId: String(row[map['ad_account_id']] || 'act_auto'),
                    objective: String(row[map['objective']] || 'Conversions'),
                    currency: params.currency || 'LKR'
                  },
                  metrics: []
                });
              }

              let formattedDate = rawDate;
              if (rawDate && rawDate.includes('/')) {
                const parts = rawDate.split('/');
                if (parts.length === 3) {
                  if (parts[2].length === 4) {
                    formattedDate = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
                  } else if (parts[0].length === 4) {
                    formattedDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
                  }
                }
              }

              const spendVal = parseRowVal(row[map['spend']]);
              const imprVal = parseRowVal(row[map['impressions']]);
              const clicksVal = parseRowVal(row[map['clicks']]);
              const convVal = parseRowVal(row[map['conversions']]);

              unmappedCollector.get(uKey)!.metrics.push({
                report_date: formattedDate || '2026-09-08',
                spend: spendVal,
                impressions: imprVal,
                reach: parseRowVal(row[map['reach']]) || Math.round(imprVal * 0.85),
                clicks: clicksVal,
                conversions: convVal,
                conversion_value: parseRowVal(row[map['conversion_value']]),
                video_views: parseRowVal(row[map['video_views']]),
                engagements: clicksVal * 1.5
              });

              unallocatedCount += 1;
              return;
            }

            let targetLine: CampaignLineItem | undefined;

            if (cleanTargetId) {
              // 1. Check if cleanTargetId is an existing line item
              targetLine = db.getLineItemById(params.agency_id, cleanTargetId);

              // 2. If not a line item, check if cleanTargetId is an existing Campaign
              if (!targetLine) {
                const targetCampaign = db.getCampaignById(params.agency_id, cleanTargetId);
                if (targetCampaign) {
                  const existingLines = db.getLineItems(params.agency_id, targetCampaign.id).filter(
                    l => l.platform.toLowerCase() === params.platform.toLowerCase()
                  );
                  if (existingLines.length > 0) {
                    targetLine = existingLines[0];
                  }
                }
              }
            }

            // 3. Fallback: Check if this platform campaign ID is already linked via LineItemDataSource
            if (!targetLine && rawCampId) {
              const existingDs = db.findDataSourceByPlatformCampaign(params.agency_id, params.platform, rawCampId);
              if (existingDs) {
                targetLine = db.getLineItemById(params.agency_id, existingDs.line_item_id);
              }
            }

            // 4. Fallback: Check if an existing line item directly references this platform campaign ID
            if (!targetLine && rawCampId) {
              const allLines = db.getLineItems(params.agency_id);
              targetLine = allLines.find(
                l => l.platform.toLowerCase() === params.platform.toLowerCase() &&
                     l.platform_campaign_id === rawCampId
              );
            }

            // 5. Fallback: Auto-match by Campaign Name against existing campaigns for this client/brand
            if (!targetLine && rawCampName) {
              const allCamps = db.getCampaigns(params.agency_id, params.client_id, params.brand_id);
              const matchedCamp = allCamps.find(c =>
                c.name.toLowerCase() === rawCampName.toLowerCase() ||
                c.name.toLowerCase().includes(rawCampName.toLowerCase()) ||
                rawCampName.toLowerCase().includes(c.name.toLowerCase())
              );

              if (matchedCamp) {
                const existingLines = db.getLineItems(params.agency_id, matchedCamp.id).filter(
                  l => l.platform.toLowerCase() === params.platform.toLowerCase()
                );
                if (existingLines.length > 0) {
                  targetLine = existingLines[0];
                }
              }
            }

            // 6. IF NOT IDENTIFIED: Strictly route to Unallocated / Unmapped Campaigns!
            // Do NOT create new unrequested campaigns. Keep ingest data ONLY for identified campaigns.
            if (!targetLine) {
              const uKey = rawCampId || rawCampName || `unallocated_${Date.now()}`;
              if (!unmappedCollector.has(uKey)) {
                unmappedCollector.set(uKey, {
                  info: {
                    rawCampId,
                    rawCampName,
                    adAccountId: String(row[map['ad_account_id']] || 'act_auto'),
                    objective: String(row[map['objective']] || 'Conversions'),
                    currency: params.currency || 'LKR'
                  },
                  metrics: []
                });
              }

              let formattedDate = rawDate;
              if (rawDate && rawDate.includes('/')) {
                const parts = rawDate.split('/');
                if (parts.length === 3) {
                  if (parts[2].length === 4) {
                    formattedDate = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
                  } else if (parts[0].length === 4) {
                    formattedDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
                  }
                }
              }

              const spendVal = parseRowVal(row[map['spend']]);
              const imprVal = parseRowVal(row[map['impressions']]);
              const clicksVal = parseRowVal(row[map['clicks']]);
              const convVal = parseRowVal(row[map['conversions']]);

              unmappedCollector.get(uKey)!.metrics.push({
                report_date: formattedDate || '2026-09-08',
                spend: spendVal,
                impressions: imprVal,
                reach: parseRowVal(row[map['reach']]) || Math.round(imprVal * 0.85),
                clicks: clicksVal,
                conversions: convVal,
                conversion_value: parseRowVal(row[map['conversion_value']]),
                video_views: parseRowVal(row[map['video_views']]),
                engagements: clicksVal * 1.5
              });

              unallocatedCount += 1;
              return; // Halt: do not ingest row into daily_metrics!
            }

            // If targetLine exists (Campaign is IDENTIFIED), ensure Line Item Data Source is registered
            if (targetLine && rawCampId) {
              db.ensureLineItemDataSource(params.agency_id, {
                line_item_id: targetLine.id,
                platform: params.platform,
                platform_account_id: String(row[map['ad_account_id']] || targetLine.platform_account_id || 'act_auto'),
                platform_campaign_id: rawCampId,
                platform_campaign_name: rawCampName
              });
            }

            // Parse numeric fields safely
            const parseNum = (val: any) => {
              if (val === undefined || val === null || val === '') return 0;
              const clean = String(val).replace(/[^0-9.-]/g, '');
              const num = parseFloat(clean);
              return isNaN(num) ? 0 : num;
            };

            // Format date YYYY-MM-DD
            let formattedDate = rawDate;
            if (rawDate.includes('/')) {
              // MM/DD/YYYY or DD/MM/YYYY
              const parts = rawDate.split('/');
              if (parts.length === 3) {
                const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
                formattedDate = `${year}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
              }
            }

            const metricData: Omit<LineItemDailyMetric, 'id' | 'created_at'> = {
              agency_id: params.agency_id,
              client_id: params.client_id,
              brand_id: params.brand_id,
              campaign_id: targetLine.campaign_id,
              line_item_id: targetLine.id,
              platform: params.platform,
              ad_account_id: String(row[map['ad_account_id']] || targetLine.platform_account_id || 'act_default'),
              platform_campaign_id: rawCampId,
              campaign_name: rawCampName,
              report_date: formattedDate || '2026-09-08',
              currency: params.currency || targetLine.currency,
              spend: parseNum(row[map['spend']]),
              impressions: parseNum(row[map['impressions']]),
              reach: parseNum(row[map['reach']]),
              clicks: parseNum(row[map['clicks']]),
              conversions: parseNum(row[map['conversions']]),
              conversion_value: parseNum(row[map['conversion_value']]),
              video_views: parseNum(row[map['video_views']]),
              engagements: parseNum(row[map['clicks']]) * 1.5,
              campaign_status: String(row[map['campaign_status']] || 'ACTIVE'),
              objective: targetLine.objective,
              import_id: job.id
            };

            // Deduplication upsert!
            const res = db.upsertDailyMetric(metricData);
            if (res.inserted) {
              inserted += 1;
            } else {
              updated += 1; // Overwrote existing date metric without double-counting!
            }
          } catch (rowErr: any) {
            skipped += 1;
            errors.push(`Row ${idx + 1}: ${rowErr.message}`);
          }
        });

        // Persist any unmapped campaigns collected during import
        for (const [_, val] of unmappedCollector.entries()) {
          const totSpend = val.metrics.reduce((s, m) => s + m.spend, 0);
          const totImpr = val.metrics.reduce((s, m) => s + m.impressions, 0);
          const totClicks = val.metrics.reduce((s, m) => s + m.clicks, 0);
          const totConv = val.metrics.reduce((s, m) => s + m.conversions, 0);
          const totConvVal = val.metrics.reduce((s, m) => s + m.conversion_value, 0);
          const totVideo = val.metrics.reduce((s, m) => s + m.video_views, 0);

          const sortedDates = [...val.metrics].map(m => m.report_date).sort();

          db.createUnmappedCampaign({
            agency_id: params.agency_id,
            client_id: params.client_id,
            brand_id: params.brand_id,
            platform: params.platform,
            platform_account_id: val.info.adAccountId,
            platform_campaign_id: val.info.rawCampId || `cid_${Date.now()}`,
            platform_campaign_name: val.info.rawCampName,
            objective: val.info.objective,
            currency: val.info.currency,
            total_spend: totSpend,
            total_impressions: totImpr,
            total_clicks: totClicks,
            total_conversions: totConv,
            total_conversion_value: totConvVal,
            total_video_views: totVideo,
            first_report_date: sortedDates[0],
            last_report_date: sortedDates[sortedDates.length - 1],
            row_count: val.metrics.length,
            status: 'unmapped',
            pulled_at: new Date().toISOString(),
            metrics: val.metrics
          });
        }

        // Update job completion
        db.updateImportJob(job.id, {
          status: 'completed',
          processed_rows: rows.length,
          inserted_count: inserted,
          updated_count: updated,
          skipped_count: skipped + unallocatedCount,
          errors: errors.slice(0, 10),
          completed_at: new Date().toISOString()
        });

        // Re-evaluate campaign budgets and alerts
        HealthEngine.syncAlertsForAgency(params.agency_id);

        db.addAuditLog({
          agency_id: params.agency_id,
          user_id: 'system',
          user_name: 'CSV Processor',
          action: 'COMPLETED_CSV_IMPORT',
          entity_type: 'import',
          entity_id: job.id,
          details: `Processed ${rows.length} rows (${inserted} identified rows inserted, ${updated} deduplicated, ${unallocatedCount} unallocated rows routed to unmapped campaigns)`
        });
      } catch (err: any) {
        db.updateImportJob(job.id, {
          status: 'failed',
          errors: [err.message],
          completed_at: new Date().toISOString()
        });
      }
    }, 400);

    return job;
  }

  /**
   * Generates sample CSV data for Meta Ads
   */
  static getSampleMetaCsv(): string {
    return `Day,Campaign ID,Campaign Name,Account ID,Amount Spent (LKR),Impressions,Reach,Link Clicks,Purchases,Purchases Conversion Value,3-Second Video Plays,Campaign Delivery
2026-09-06,23849102401,BrandA_Launch_Meta_Awareness,act_491024810,16200,66122,54220,925,28,0,29754,ACTIVE
2026-09-07,23849102401,BrandA_Launch_Meta_Awareness,act_491024810,15800,64489,52880,902,27,0,29020,ACTIVE
2026-09-08,23849102401,BrandA_Launch_Meta_Awareness,act_491024810,16500,67346,55224,943,29,0,30305,ACTIVE
2026-09-06,23849102402,BrandA_Launch_Meta_Engagement,act_491024810,9100,15166,12891,318,0,0,9858,ACTIVE
2026-09-07,23849102402,BrandA_Launch_Meta_Engagement,act_491024810,8900,14833,12608,311,0,0,9641,ACTIVE
2026-09-08,23849102402,BrandA_Launch_Meta_Engagement,act_491024810,9250,15416,13104,324,0,0,10020,ACTIVE`;
  }

  /**
   * Generates sample CSV data for TikTok Ads
   */
  static getSampleTikTokCsv(): string {
    return `Date,Campaign ID,Campaign name,Ad account ID,Cost,Impressions,Reach,Clicks,Conversions,Video Views,Status
2026-09-06,7291840192001,BrandA_Launch_TikTok_Awareness,tt_7291840192,6200,30243,27218,272,0,22682,ACTIVE
2026-09-07,7291840192001,BrandA_Launch_TikTok_Awareness,tt_7291840192,5900,28780,25902,259,0,21585,ACTIVE
2026-09-08,7291840192001,BrandA_Launch_TikTok_Awareness,tt_7291840192,6150,30000,27000,270,0,22500,ACTIVE`;
  }
}
