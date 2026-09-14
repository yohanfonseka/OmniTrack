import Papa from 'papaparse';
import { db } from './db.js';
import { HealthEngine } from './healthEngine.js';
import { ImportJob, PlatformType, LineItemDailyMetric, CampaignLineItem, Campaign } from './types.js';

export interface DistinctAdSet {
  item_key: string;
  csv_campaign_name: string;
  csv_ad_set_name: string;
  platform_campaign_id: string;
  rows_count: number;
  total_spend: number;
  impressions?: number;
  clicks?: number;
  reach?: number;
  conversions?: number;
}

export interface DistinctCampaignGroup {
  csv_campaign_name: string;
  rows_count: number;
  total_spend: number;
  ad_sets: DistinctAdSet[];
}

export interface CsvPreviewResult {
  headers: string[];
  total_rows: number;
  preview_rows: Record<string, any>[];
  detected_platform?: PlatformType;
  suggested_mapping: Record<string, string>;
  distinct_campaign_groups: DistinctCampaignGroup[];
  distinct_campaigns: {
    platform_campaign_id: string;
    campaign_name: string;
    csv_campaign_name: string;
    csv_ad_set_name: string;
    rows_count: number;
    total_spend?: number;
  }[];
  distinct_line_items?: {
    line_item_id: string;
    line_item_name: string;
    csv_campaign_name: string;
    csv_ad_set_name: string;
    rows_count: number;
    total_spend?: number;
  }[];
}

export interface ImportExecuteParams {
  agency_id: string;
  client_id: string;
  brand_id: string;
  campaign_id?: string;
  platform: PlatformType;
  file_name: string;
  csv_content: string;
  column_mapping: Record<string, string>; // normalizedField -> csvHeader
  campaign_matches: Record<string, string>; // platform_campaign_id or item_key -> line_item_id or camp:campaign_id
  currency: string;
  direct_to_unmapped?: boolean;
}

export class CsvEngine {
  /**
   * Previews CSV, identifies headers, auto-detects platform patterns, and extracts distinct line items
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
      headerLower.some(h => h.includes('tiktok') || h.includes('tt_') || (h.includes('cost') && !headerLower.includes('amount spent')))
    ) {
      detected_platform = 'tiktok';
    }

    // Default mapping suggestions
    const suggested_mapping: Record<string, string> = {};
    const normalizedFields = [
      'report_date',
      'campaign_name',
      'line_item_name',
      'ad_name',
      'platform_campaign_id',
      'ad_account_id',
      'spend',
      'budget',
      'impressions',
      'reach',
      'clicks',
      'conversions',
      'conversion_value',
      'video_views',
      'campaign_status',
      'objective'
    ];

    // Note: Column A in Meta is 'Campaign name', Column B is 'Ad set name'
    // Order of match rules is strictly prioritized so 'campaign_name' does not match 'ad set name'.
    const matchRules: Record<string, string[]> = {
      campaign_name: ['campaign name', 'campaign_name', 'campaign', 'campaigns'],
      line_item_name: ['ad set name', 'adset name', 'adset_name', 'line item name', 'line_item_name', 'ad group name', 'placement', 'line item'],
      ad_name: ['ad name', 'ad_name', 'creative name', 'ad'],
      report_date: ['reporting starts', 'reporting start', 'starts', 'report_date', 'reporting_date', 'start date', 'day', 'date', 'time'],
      platform_campaign_id: ['ad set id', 'adset id', 'line item id', 'campaign id', 'campaign_id', 'platform_campaign_id', 'cid', 'id'],
      ad_account_id: ['account id', 'ad account id', 'account_id', 'ad_account_id'],
      spend: ['amount spent (lkr)', 'amount spent (usd)', 'amount spent', 'cost', 'spend', 'total spend'],
      budget: ['budget', 'line item budget', 'daily budget', 'planned spend', 'total budget'],
      impressions: ['impressions', 'impr'],
      reach: ['reach', 'unique users'],
      clicks: ['link clicks', 'clicks', 'total clicks'],
      conversions: ['results', 'purchases', 'conversions', 'total conversions'],
      conversion_value: ['purchases conversion value', 'conversion value', 'value', 'revenue'],
      video_views: ['3-second video plays', 'video views', 'views', 'video plays'],
      campaign_status: ['delivery status', 'campaign delivery', 'status', 'campaign status', 'state'],
      objective: ['result type', 'objective', 'campaign objective']
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

    // Extract distinct platform line items / campaigns from the CSV.
    // In Meta exports: Column A = Campaign name, Column B = Ad set name (Line Item).
    const campHeader = suggested_mapping['campaign_name'] || headers.find(h => {
      const low = h.toLowerCase().trim();
      return low === 'campaign name' || low === 'campaign';
    });
    const adSetHeader = suggested_mapping['line_item_name'] || headers.find(h => {
      const low = h.toLowerCase().trim();
      return low === 'ad set name' || low === 'adset name' || low === 'line item name' || low.includes('ad set') || low.includes('line item');
    });
    const idHeader = suggested_mapping['platform_campaign_id'] || headers.find(h => {
      const low = h.toLowerCase().trim();
      return low.includes('ad set id') || low.includes('line item id') || low.includes('campaign id') || low === 'id';
    });
    const spendHeader = suggested_mapping['spend'] || headers.find(h => {
      const low = h.toLowerCase().trim();
      return low.includes('spend') || low.includes('cost');
    });
    const imprHeader = suggested_mapping['impressions'];
    const reachHeader = suggested_mapping['reach'];
    const clicksHeader = suggested_mapping['clicks'];
    const convHeader = suggested_mapping['conversions'];

    // Grouping map: csv_campaign_name -> group info
    const campaignGroupsMap = new Map<string, {
      csv_campaign_name: string;
      rows_count: number;
      total_spend: number;
      ad_sets: Map<string, DistinctAdSet>;
    }>();

    rows.forEach((row, idx) => {
      const rawCamp = campHeader ? String(row[campHeader] || '').trim() : '';
      const rawAdSet = adSetHeader ? String(row[adSetHeader] || '').trim() : '';
      const rawId = idHeader ? String(row[idHeader] || '').trim() : '';

      const csvCampName = rawCamp || 'General Campaign';
      const csvAdSetName = rawAdSet || (rawCamp ? `Ad Set ${idx + 1}` : `Line Item ${idx + 1}`);
      const itemKey = rawId || `${csvCampName}:::${csvAdSetName}`;

      const spendClean = spendHeader ? String(row[spendHeader] || '0').replace(/[^0-9.-]/g, '') : '0';
      const spendVal = parseFloat(spendClean) || 0;

      const imprClean = imprHeader ? String(row[imprHeader] || '0').replace(/[^0-9.-]/g, '') : '0';
      const imprVal = parseFloat(imprClean) || 0;

      const reachClean = reachHeader ? String(row[reachHeader] || '0').replace(/[^0-9.-]/g, '') : '0';
      const reachVal = parseFloat(reachClean) || 0;

      const clicksClean = clicksHeader ? String(row[clicksHeader] || '0').replace(/[^0-9.-]/g, '') : '0';
      const clicksVal = parseFloat(clicksClean) || 0;

      const convClean = convHeader ? String(row[convHeader] || '0').replace(/[^0-9.-]/g, '') : '0';
      const convVal = parseFloat(convClean) || 0;

      let group = campaignGroupsMap.get(csvCampName);
      if (!group) {
        group = {
          csv_campaign_name: csvCampName,
          rows_count: 0,
          total_spend: 0,
          ad_sets: new Map<string, DistinctAdSet>()
        };
        campaignGroupsMap.set(csvCampName, group);
      }

      group.rows_count += 1;
      group.total_spend += spendVal;

      let adSet = group.ad_sets.get(csvAdSetName);
      if (!adSet) {
        adSet = {
          item_key: itemKey,
          csv_campaign_name: csvCampName,
          csv_ad_set_name: csvAdSetName,
          platform_campaign_id: itemKey,
          rows_count: 0,
          total_spend: 0,
          impressions: 0,
          clicks: 0,
          reach: 0,
          conversions: 0
        };
        group.ad_sets.set(csvAdSetName, adSet);
      }

      adSet.rows_count += 1;
      adSet.total_spend += spendVal;
      adSet.impressions = (adSet.impressions || 0) + imprVal;
      adSet.clicks = (adSet.clicks || 0) + clicksVal;
      adSet.reach = Math.max(adSet.reach || 0, reachVal);
      adSet.conversions = (adSet.conversions || 0) + convVal;
    });

    const distinct_campaign_groups: DistinctCampaignGroup[] = Array.from(campaignGroupsMap.values()).map(g => ({
      csv_campaign_name: g.csv_campaign_name,
      rows_count: g.rows_count,
      total_spend: Math.round(g.total_spend * 100) / 100,
      ad_sets: Array.from(g.ad_sets.values()).map(as => ({
        ...as,
        total_spend: Math.round(as.total_spend * 100) / 100
      }))
    }));

    // Flatten for distinct_campaigns / distinct_line_items
    const flattenedItems: {
      platform_campaign_id: string;
      campaign_name: string;
      csv_campaign_name: string;
      csv_ad_set_name: string;
      rows_count: number;
      total_spend: number;
    }[] = [];

    distinct_campaign_groups.forEach(g => {
      g.ad_sets.forEach(as => {
        flattenedItems.push({
          platform_campaign_id: as.item_key,
          campaign_name: `${as.csv_campaign_name} › ${as.csv_ad_set_name}`,
          csv_campaign_name: as.csv_campaign_name,
          csv_ad_set_name: as.csv_ad_set_name,
          rows_count: as.rows_count,
          total_spend: as.total_spend
        });
      });
    });

    return {
      headers,
      total_rows: rows.length,
      preview_rows,
      detected_platform,
      suggested_mapping,
      distinct_campaign_groups,
      distinct_campaigns: flattenedItems,
      distinct_line_items: flattenedItems.map(item => ({
        line_item_id: item.platform_campaign_id,
        line_item_name: item.csv_ad_set_name,
        csv_campaign_name: item.csv_campaign_name,
        csv_ad_set_name: item.csv_ad_set_name,
        rows_count: item.rows_count,
        total_spend: item.total_spend
      }))
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
        const defaultCampaign = params.campaign_id ? db.getCampaignById(params.agency_id, params.campaign_id) : undefined;

        let inserted = 0;
        let updated = 0;
        let skipped = 0;
        let unallocatedCount = 0;
        const errors: string[] = [];
        const unmappedCollector = new Map<string, { info: any; metrics: any[] }>();

        // Accumulator for daily metrics within this import batch to correctly sum
        // multiple rows (e.g., multiple ads within the same ad set on the same date)
        const batchMetricsAccumulator = new Map<string, {
          metricData: Omit<LineItemDailyMetric, 'id' | 'created_at'>;
          line_item_id: string;
        }>();

        // Cache of campaigns created during this import execution
        const createdCampaignsCache = new Map<string, Campaign>();

        rows.forEach((row, idx) => {
          try {
            const rawCamp = String(row[map['campaign_name']] || '').trim();
            const rawAdSet = String(row[map['line_item_name']] || '').trim();
            const rawCampId = String(row[map['platform_campaign_id']] || '').trim();
            const rawAdName = String(row[map['ad_name']] || '').trim();

            const csvCampName = rawCamp || (defaultCampaign ? defaultCampaign.name : 'General Campaign');
            const csvAdSetName = rawAdSet || (rawCamp ? `Ad Set ${idx + 1}` : `Line Item ${idx + 1}`);
            const itemKey = rawCampId || `${csvCampName}:::${csvAdSetName}`;
            const rawDate = String(row[map['report_date']] || '').trim();

            // Helper to parse numeric fields safely
            const parseRowVal = (val: any) => {
              if (val === undefined || val === null || val === '') return 0;
              const clean = String(val).replace(/[^0-9.-]/g, '');
              const num = parseFloat(clean);
              return isNaN(num) ? 0 : num;
            };

            // Look up target mapping hierarchically:
            // 1. Specific (Campaign + Ad Set) key: "Campaign:::Ad Set"
            // 2. Platform Campaign ID (if provided)
            // 3. Ad Set Name
            // 4. Campaign Name mapping (e.g., "camp:xyz" or "create_camp:xyz")
            // 5. Default campaign if selected in import wizard
            const targetId = matches[itemKey] ||
                             (rawCampId ? matches[rawCampId] : '') ||
                             matches[csvAdSetName] ||
                             (rawCamp ? matches[rawCamp] : '') ||
                             (rawCampId ? matches[rawCampId.toLowerCase()] : '') ||
                             (csvAdSetName ? matches[csvAdSetName.toLowerCase()] : '') ||
                             (defaultCampaign ? `camp:${defaultCampaign.id}` : '');

            // Clean id prefixes if passed like "line:xyz" or "camp:xyz" or "create_line:xyz" or "create_camp:xyz"
            const cleanTargetId = targetId ? targetId.replace(/^(line:|camp:|create_line:|create_camp:)/, '').trim() : '';

            // If direct_to_unmapped is true, or explicitly marked as unmapped or unallocated, collect for Unmapped Campaigns queue
            if (params.direct_to_unmapped || cleanTargetId === 'unmapped' || cleanTargetId === 'leave_unmapped' || cleanTargetId === 'unallocated' || targetId === 'unallocated') {
              const uKey = itemKey;
              if (!unmappedCollector.has(uKey)) {
                let displayName = csvCampName;
                if (rawCamp && rawAdSet && rawCamp.trim() !== rawAdSet.trim()) {
                  displayName = `${rawCamp.trim()} › ${rawAdSet.trim()}`;
                } else if (rawAdSet && rawAdSet.trim()) {
                  displayName = rawAdSet.trim();
                } else if (rawCamp && rawCamp.trim()) {
                  displayName = rawCamp.trim();
                }

                unmappedCollector.set(uKey, {
                  info: {
                    rawCampId: rawCampId || itemKey,
                    rawCampName: displayName,
                    csvCampName,
                    csvAdSetName,
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

            // 1. Direct line item mapping: "line:xyz"
            if (targetId.startsWith('line:') && cleanTargetId) {
              targetLine = db.getLineItemById(params.agency_id, cleanTargetId);
            }

            // 2. Mapped to an existing Campaign: "camp:xyz"
            if (!targetLine && targetId.startsWith('camp:') && cleanTargetId) {
              const targetCampaign = db.getCampaignById(params.agency_id, cleanTargetId);
              if (targetCampaign) {
                // Look for existing line item in this campaign matching Ad Set Name or rawCampId
                const campLines = db.getLineItems(params.agency_id, targetCampaign.id);
                targetLine = campLines.find(
                  l => (rawCampId && l.platform_campaign_id === rawCampId) ||
                       (csvAdSetName && l.name.toLowerCase() === csvAdSetName.toLowerCase())
                );

                // If no line item exists with this Ad Set name under the campaign, auto-create it!
                // "each line on a csv is equal to a line item in a campaign"
                if (!targetLine) {
                  const lineSpend = parseRowVal(row[map['spend']]);
                  const lineBudget = parseRowVal(row[map['budget']]) || (lineSpend > 0 ? Math.round(lineSpend * 1.5) : 150000);
                  targetLine = db.createLineItem({
                    agency_id: params.agency_id,
                    campaign_id: targetCampaign.id,
                    client_id: targetCampaign.client_id,
                    brand_id: targetCampaign.brand_id,
                    platform: params.platform,
                    platform_account_id: String(row[map['ad_account_id']] || 'act_auto'),
                    platform_campaign_id: rawCampId || itemKey,
                    name: csvAdSetName,
                    objective: targetCampaign.objective || 'Conversions',
                    start_date: targetCampaign.start_date,
                    end_date: targetCampaign.end_date,
                    budget: lineBudget,
                    currency: params.currency || targetCampaign.currency || 'LKR',
                    primary_kpi: 'cpa',
                    primary_kpi_target: 2500,
                    secondary_kpi_targets: {},
                    status: 'active',
                    pacing_tolerance: 10
                  });
                } else if (rawCampId && !targetLine.platform_campaign_id) {
                  targetLine.platform_campaign_id = rawCampId;
                  db.updateLineItem(params.agency_id, targetLine.id, { platform_campaign_id: rawCampId });
                }
              }
            }

            // 3. Auto-Create New Campaign for this group: "create_camp:Campaign Name"
            if (!targetLine && targetId.startsWith('create_camp:')) {
              const desiredCampName = cleanTargetId || csvCampName;
              let createdCamp = createdCampaignsCache.get(desiredCampName.toLowerCase());

              if (!createdCamp) {
                // Check if already in DB
                const allCamps = db.getCampaigns(params.agency_id, params.client_id, params.brand_id);
                createdCamp = allCamps.find(c => c.name.toLowerCase() === desiredCampName.toLowerCase());
              }

              if (!createdCamp) {
                createdCamp = db.createCampaign({
                  agency_id: params.agency_id,
                  client_id: params.client_id,
                  brand_id: params.brand_id,
                  name: desiredCampName,
                  description: `Imported from ${params.platform.toUpperCase()} multi-campaign CSV`,
                  objective: String(row[map['objective']] || 'Conversions'),
                  start_date: '2026-09-01',
                  end_date: '2026-09-30',
                  total_budget: 0,
                  currency: params.currency || 'LKR',
                  status: 'active'
                });
                createdCampaignsCache.set(desiredCampName.toLowerCase(), createdCamp);
              }

              // Create or find Line Item under this campaign
              const campLines = db.getLineItems(params.agency_id, createdCamp.id);
              targetLine = campLines.find(
                l => (rawCampId && l.platform_campaign_id === rawCampId) ||
                     (csvAdSetName && l.name.toLowerCase() === csvAdSetName.toLowerCase())
              );

              if (!targetLine) {
                const lineSpend = parseRowVal(row[map['spend']]);
                const lineBudget = parseRowVal(row[map['budget']]) || (lineSpend > 0 ? Math.round(lineSpend * 1.5) : 150000);
                targetLine = db.createLineItem({
                  agency_id: params.agency_id,
                  campaign_id: createdCamp.id,
                  client_id: createdCamp.client_id,
                  brand_id: createdCamp.brand_id,
                  platform: params.platform,
                  platform_account_id: String(row[map['ad_account_id']] || 'act_auto'),
                  platform_campaign_id: rawCampId || itemKey,
                  name: csvAdSetName,
                  objective: createdCamp.objective || 'Conversions',
                  start_date: createdCamp.start_date,
                  end_date: createdCamp.end_date,
                  budget: lineBudget,
                  currency: params.currency || createdCamp.currency || 'LKR',
                  primary_kpi: 'cpa',
                  primary_kpi_target: 2500,
                  secondary_kpi_targets: {},
                  status: 'active',
                  pacing_tolerance: 10
                });
              }
            }

            // 4. Direct Line Item Creation under existing campaign: "create_line:xyz"
            if (!targetLine && targetId.startsWith('create_line:')) {
              const camp = defaultCampaign;
              if (camp) {
                const lineSpend = parseRowVal(row[map['spend']]);
                const lineBudget = parseRowVal(row[map['budget']]) || (lineSpend > 0 ? Math.round(lineSpend * 1.5) : 150000);
                targetLine = db.createLineItem({
                  agency_id: params.agency_id,
                  campaign_id: camp.id,
                  client_id: camp.client_id,
                  brand_id: camp.brand_id,
                  platform: params.platform,
                  platform_account_id: String(row[map['ad_account_id']] || 'act_auto'),
                  platform_campaign_id: rawCampId || itemKey,
                  name: csvAdSetName,
                  objective: camp.objective || 'Conversions',
                  start_date: camp.start_date,
                  end_date: camp.end_date,
                  budget: lineBudget,
                  currency: params.currency || camp.currency || 'LKR',
                  primary_kpi: 'cpa',
                  primary_kpi_target: 2500,
                  secondary_kpi_targets: {},
                  status: 'active',
                  pacing_tolerance: 10
                });
              }
            }

            // 5. Fallback: Check if this platform campaign ID is already linked via LineItemDataSource
            if (!targetLine && rawCampId) {
              const existingDs = db.findDataSourceByPlatformCampaign(params.agency_id, params.platform, rawCampId);
              if (existingDs) {
                targetLine = db.getLineItemById(params.agency_id, existingDs.line_item_id);
              }
            }

            // 6. Fallback: Check existing line item by Ad Set name
            if (!targetLine && csvAdSetName) {
              const allCamps = db.getCampaigns(params.agency_id, params.client_id, params.brand_id);
              for (const camp of allCamps) {
                const campLines = db.getLineItems(params.agency_id, camp.id);
                const matchedLine = campLines.find(l =>
                  l.name.toLowerCase() === csvAdSetName.toLowerCase() ||
                  l.name.toLowerCase().includes(csvAdSetName.toLowerCase())
                );
                if (matchedLine) {
                  targetLine = matchedLine;
                  break;
                }
              }
            }

            // 7. IF NOT IDENTIFIED: Strictly route to Unallocated / Unmapped Campaigns!
            // Do NOT create unwanted dummy campaigns; preserve in Unmapped Queue
            if (!targetLine) {
              const uKey = itemKey;
              if (!unmappedCollector.has(uKey)) {
                unmappedCollector.set(uKey, {
                  info: {
                    rawCampId: rawCampId || itemKey,
                    rawCampName: `${csvCampName} › ${csvAdSetName}`,
                    csvCampName,
                    csvAdSetName,
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
              return; // Halt: do not ingest row into daily_metrics
            }

            // If targetLine exists (Campaign is IDENTIFIED), ensure Line Item Data Source is registered
            if (targetLine) {
              db.ensureLineItemDataSource(params.agency_id, {
                line_item_id: targetLine.id,
                platform: params.platform,
                platform_account_id: String(row[map['ad_account_id']] || targetLine.platform_account_id || 'act_auto'),
                platform_campaign_id: rawCampId || itemKey,
                platform_campaign_name: `${csvCampName} › ${csvAdSetName}`
              });
            }

            // Format date YYYY-MM-DD
            let formattedDate = rawDate;
            if (rawDate.includes('/')) {
              const parts = rawDate.split('/');
              if (parts.length === 3) {
                const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
                formattedDate = `${year}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
              }
            }

            const rowSpend = parseRowVal(row[map['spend']]);
            const rowImpr = parseRowVal(row[map['impressions']]);
            const rowReach = parseRowVal(row[map['reach']]);
            const rowClicks = parseRowVal(row[map['clicks']]);
            const rowConv = parseRowVal(row[map['conversions']]);
            const rowConvVal = parseRowVal(row[map['conversion_value']]);
            const rowVideo = parseRowVal(row[map['video_views']]);

            const dateKey = `${targetLine.id}:::${formattedDate || '2026-09-08'}`;
            let existingAccum = batchMetricsAccumulator.get(dateKey);

            if (!existingAccum) {
              existingAccum = {
                line_item_id: targetLine.id,
                metricData: {
                  agency_id: params.agency_id,
                  client_id: params.client_id,
                  brand_id: params.brand_id,
                  campaign_id: targetLine.campaign_id,
                  line_item_id: targetLine.id,
                  platform: params.platform,
                  ad_account_id: String(row[map['ad_account_id']] || targetLine.platform_account_id || 'act_default'),
                  platform_campaign_id: rawCampId || itemKey,
                  campaign_name: `${csvCampName} › ${csvAdSetName}`,
                  report_date: formattedDate || '2026-09-08',
                  currency: params.currency || targetLine.currency,
                  spend: rowSpend,
                  impressions: rowImpr,
                  reach: rowReach,
                  clicks: rowClicks,
                  conversions: rowConv,
                  conversion_value: rowConvVal,
                  video_views: rowVideo,
                  engagements: rowClicks * 1.5,
                  campaign_status: String(row[map['campaign_status']] || 'ACTIVE'),
                  objective: targetLine.objective,
                  import_id: job.id
                }
              };
              batchMetricsAccumulator.set(dateKey, existingAccum);
            } else {
              // Aggregate metrics across multiple rows on the same report date for this Ad Set
              existingAccum.metricData.spend += rowSpend;
              existingAccum.metricData.impressions += rowImpr;
              existingAccum.metricData.reach = Math.max(existingAccum.metricData.reach, rowReach);
              existingAccum.metricData.clicks += rowClicks;
              existingAccum.metricData.conversions += rowConv;
              existingAccum.metricData.conversion_value += rowConvVal;
              existingAccum.metricData.video_views += rowVideo;
              existingAccum.metricData.engagements += rowClicks * 1.5;
            }
          } catch (rowErr: any) {
            skipped += 1;
            errors.push(`Row ${idx + 1}: ${rowErr.message}`);
          }
        });

        // Insert or update accumulated daily metrics
        for (const [_, accum] of batchMetricsAccumulator.entries()) {
          const res = db.upsertDailyMetric(accum.metricData);
          if (res.inserted) {
            inserted += 1;
          } else {
            updated += 1;
          }
        }

        // Persist any unmapped campaigns collected during import
        for (const [_, val] of unmappedCollector.entries()) {
          const totSpend = val.metrics.reduce((s, m) => s + m.spend, 0);
          const totImpr = val.metrics.reduce((s, m) => s + m.impressions, 0);
          const totClicks = val.metrics.reduce((s, m) => s + m.clicks, 0);
          const totConv = val.metrics.reduce((s, m) => s + m.conversions, 0);
          const totConvVal = val.metrics.reduce((s, m) => s + m.conversion_value, 0);
          const totVideo = val.metrics.reduce((s, m) => s + m.video_views, 0);

          const sortedDates = [...val.metrics].map(m => m.report_date).sort();

          const existingUnmapped = db.getUnmappedCampaigns(params.agency_id).find(
            u => u.platform === params.platform &&
                 u.status === 'unmapped' &&
                 (u.platform_campaign_id === (val.info.rawCampId || val.info.rawCampName) || u.platform_campaign_name === val.info.rawCampName)
          );

          if (existingUnmapped) {
            const existingMetrics = existingUnmapped.metrics || [];
            const mergedMap = new Map<string, any>();
            existingMetrics.forEach(m => mergedMap.set(m.report_date, { ...m }));
            val.metrics.forEach(m => mergedMap.set(m.report_date, { ...m }));
            const mergedMetrics = Array.from(mergedMap.values());
            const newSortedDates = mergedMetrics.map(m => m.report_date).sort();

            db.updateUnmappedCampaign(params.agency_id, existingUnmapped.id, {
              total_spend: mergedMetrics.reduce((s, m) => s + m.spend, 0),
              total_impressions: mergedMetrics.reduce((s, m) => s + m.impressions, 0),
              total_clicks: mergedMetrics.reduce((s, m) => s + m.clicks, 0),
              total_conversions: mergedMetrics.reduce((s, m) => s + m.conversions, 0),
              total_conversion_value: mergedMetrics.reduce((s, m) => s + m.conversion_value, 0),
              total_video_views: mergedMetrics.reduce((s, m) => s + m.video_views, 0),
              first_report_date: newSortedDates[0],
              last_report_date: newSortedDates[newSortedDates.length - 1],
              row_count: mergedMetrics.length,
              pulled_at: new Date().toISOString(),
              metrics: mergedMetrics
            });
          } else {
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
   * Generates sample CSV data for Meta Ads (each line is a Line Item in a campaign)
   */
  static getSampleMetaCsv(): string {
    return `Day,Line Item ID,Line Item Name,Campaign Name,Account ID,Amount Spent (LKR),Impressions,Reach,Link Clicks,Purchases,Purchases Conversion Value,3-Second Video Plays,Campaign Delivery
2026-09-06,23849102401,BrandA_Awareness_Feed_Video,BrandA_Launch_Q3,act_491024810,16200,66122,54220,925,28,0,29754,ACTIVE
2026-09-07,23849102401,BrandA_Awareness_Feed_Video,BrandA_Launch_Q3,act_491024810,15800,64489,52880,902,27,0,29020,ACTIVE
2026-09-08,23849102401,BrandA_Awareness_Feed_Video,BrandA_Launch_Q3,act_491024810,16500,67346,55224,943,29,0,30305,ACTIVE
2026-09-06,23849102402,BrandA_Engagement_Stories_Carousel,BrandA_Launch_Q3,act_491024810,9100,15166,12891,318,0,0,9858,ACTIVE
2026-09-07,23849102402,BrandA_Engagement_Stories_Carousel,BrandA_Launch_Q3,act_491024810,8900,14833,12608,311,0,0,9641,ACTIVE
2026-09-08,23849102402,BrandA_Engagement_Stories_Carousel,BrandA_Launch_Q3,act_491024810,9250,15416,13104,324,0,0,10020,ACTIVE`;
  }

  /**
   * Generates sample CSV data for TikTok Ads (each line is a Line Item in a campaign)
   */
  static getSampleTikTokCsv(): string {
    return `Date,Line Item ID,Line Item Name,Campaign Name,Ad account ID,Cost,Impressions,Reach,Clicks,Conversions,Video Views,Status
2026-09-06,7291840192001,BrandA_InFeed_Video_Reach,BrandA_Launch_Q3,tt_7291840192,6200,30243,27218,272,0,22682,ACTIVE
2026-09-07,7291840192001,BrandA_InFeed_Video_Reach,BrandA_Launch_Q3,tt_7291840192,5900,28780,25902,259,0,21585,ACTIVE
2026-09-08,7291840192001,BrandA_InFeed_Video_Reach,BrandA_Launch_Q3,tt_7291840192,6150,30000,27000,270,0,22500,ACTIVE
2026-09-06,7291840192002,BrandA_TopView_Immersive_Brand,BrandA_Launch_Q3,tt_7291840192,8400,42100,38000,420,0,31500,ACTIVE
2026-09-07,7291840192002,BrandA_TopView_Immersive_Brand,BrandA_Launch_Q3,tt_7291840192,8100,41000,37200,412,0,30900,ACTIVE
2026-09-08,7291840192002,BrandA_TopView_Immersive_Brand,BrandA_Launch_Q3,tt_7291840192,8500,42500,38500,430,0,32000,ACTIVE`;
  }
}
