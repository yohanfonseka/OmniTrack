import {
  CampaignLineItem,
  Campaign,
  LineItemDailyMetric,
  LineItemCalculatedMetrics,
  PlatformCalculatedMetrics,
  CampaignCalculatedMetrics,
  HealthStatus,
  KpiMetricType,
  Alert
} from './types.js';
import { db } from './db.js';

export class HealthEngine {
  /**
   * Calculates difference in days between two YYYY-MM-DD dates inclusive
   */
  static getDaysDifference(startDateStr: string, endDateStr: string): number {
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    return Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1);
  }

  /**
   * Calculates elapsed days from start_date up to reference date (default: today 2026-09-08 or latest metric date)
   */
  static getElapsedDays(startDateStr: string, endDateStr: string, refDateStr?: string): { elapsed: number; total: number } {
    const total = this.getDaysDifference(startDateStr, endDateStr);
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    const ref = refDateStr ? new Date(refDateStr) : new Date('2026-09-08T23:59:59Z');

    if (ref < start) {
      return { elapsed: 0, total };
    }
    if (ref >= end) {
      return { elapsed: total, total };
    }
    const diffTime = Math.max(0, ref.getTime() - start.getTime());
    const elapsed = Math.min(total, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    return { elapsed: Math.max(1, elapsed), total };
  }

  /**
   * Calculates full metric rollup for a single line item
   */
  static calculateLineItemMetrics(
    agencyId: string,
    lineItem: CampaignLineItem,
    allMetrics?: LineItemDailyMetric[]
  ): LineItemCalculatedMetrics {
    const metrics = allMetrics || db.getDailyMetrics(agencyId, lineItem.id);
    const client = db.getClientById(agencyId, lineItem.client_id);
    const brand = db.getBrandById(agencyId, lineItem.brand_id);
    const campaign = db.getCampaignById(agencyId, lineItem.campaign_id);

    // Sum all aggregatable raw numbers
    const total_spend = metrics.reduce((sum, m) => sum + (Number(m.spend) || 0), 0);
    const total_impressions = metrics.reduce((sum, m) => sum + (Number(m.impressions) || 0), 0);
    const total_reach = metrics.reduce((sum, m) => sum + (Number(m.reach) || 0), 0);
    const total_clicks = metrics.reduce((sum, m) => sum + (Number(m.clicks) || 0), 0);
    const total_conversions = metrics.reduce((sum, m) => sum + (Number(m.conversions) || 0), 0);
    const total_conversion_value = metrics.reduce((sum, m) => sum + (Number(m.conversion_value) || 0), 0);
    const total_video_views = metrics.reduce((sum, m) => sum + (Number(m.video_views) || 0), 0);
    const total_engagements = metrics.reduce((sum, m) => sum + (Number(m.engagements) || 0), 0);

    // Latest date recorded
    const sortedDates = [...metrics].map(m => m.report_date).sort();
    const latestMetricDate = sortedDates.length > 0 ? sortedDates[sortedDates.length - 1] : undefined;
    const last_updated = latestMetricDate || lineItem.updated_at;

    // Schedule days and pacing
    const hasMetrics = metrics.length > 0 && (total_spend > 0 || total_impressions > 0 || total_clicks > 0);
    const { elapsed, total: days_total } = this.getElapsedDays(lineItem.start_date, lineItem.end_date, latestMetricDate);
    const days_elapsed = hasMetrics ? elapsed : 0;

    // Expected Spend To Date = Line-Item Budget * (Elapsed Scheduled Days / Total Scheduled Days)
    // For newly created line items with zero delivery data, expected spend is initialized to 0
    const expected_spend = hasMetrics ? lineItem.budget * (days_elapsed / days_total) : 0;

    // Pacing Percentage = Actual Spend To Date / Expected Spend To Date * 100
    const pacing_percentage = expected_spend > 0 ? (total_spend / expected_spend) * 100 : 0;

    // Projected Final Spend = Actual Spend To Date / Elapsed Scheduled Days * Total Scheduled Days
    const projected_final_spend = hasMetrics && days_elapsed > 0 ? (total_spend / days_elapsed) * days_total : (hasMetrics ? lineItem.budget : 0);

    const budget_remaining = Math.max(0, lineItem.budget - total_spend);

    // Recalculated ratio metrics (NEVER averaged)
    const actual_cpm = total_impressions > 0 ? (total_spend / total_impressions) * 1000 : 0;
    const actual_cpc = total_clicks > 0 ? total_spend / total_clicks : 0;
    const actual_ctr = total_impressions > 0 ? (total_clicks / total_impressions) * 100 : 0;
    const actual_cpa = total_conversions > 0 ? total_spend / total_conversions : 0;
    const actual_cpe = total_engagements > 0 ? total_spend / total_engagements : 0;
    const actual_roas = total_spend > 0 ? total_conversion_value / total_spend : 0;
    const actual_cpv = total_video_views > 0 ? total_spend / total_video_views : 0;

    // Primary Deliverable KPI actual
    let primary_kpi_actual = 0;
    switch (lineItem.primary_kpi) {
      case 'reach':
        primary_kpi_actual = total_reach;
        break;
      case 'impressions':
        primary_kpi_actual = total_impressions;
        break;
      case 'video_views':
        primary_kpi_actual = total_video_views;
        break;
      case 'clicks':
        primary_kpi_actual = total_clicks;
        break;
      case 'conversions':
        primary_kpi_actual = total_conversions;
        break;
      case 'engagements':
        primary_kpi_actual = total_engagements;
        break;
      case 'cpm':
        primary_kpi_actual = actual_cpm;
        break;
      case 'cpc':
        primary_kpi_actual = actual_cpc;
        break;
      case 'cpa':
        primary_kpi_actual = actual_cpa;
        break;
      case 'ctr':
        primary_kpi_actual = actual_ctr;
        break;
      case 'cpe':
        primary_kpi_actual = actual_cpe;
        break;
      case 'roas':
        primary_kpi_actual = actual_roas;
        break;
      case 'spend':
        primary_kpi_actual = total_spend;
        break;
      default:
        primary_kpi_actual = total_impressions;
        break;
    }

    const isVolumeMetric = ['reach', 'impressions', 'video_views', 'clicks', 'conversions', 'engagements'].includes(lineItem.primary_kpi);
    const isCostMetric = ['cpm', 'cpc', 'cpa', 'cpe', 'cpv'].includes(lineItem.primary_kpi);

    // Schedule expected deliverable volume to date
    const scheduleRatio = days_total > 0 ? Math.min(1, Math.max(0, days_elapsed / days_total)) : 0;
    const primary_kpi_expected = hasMetrics && lineItem.primary_kpi_target > 0 && isVolumeMetric
      ? Math.round(lineItem.primary_kpi_target * scheduleRatio)
      : (hasMetrics ? lineItem.primary_kpi_target : 0);

    // Primary KPI Pacing vs scheduled pace (%):
    // e.g. 100% means delivering on exact flight pace; >100% means delivering ahead of pace; <100% behind pace
    const primary_kpi_pacing = isVolumeMetric
      ? (primary_kpi_expected > 0 ? (primary_kpi_actual / primary_kpi_expected) * 100 : (primary_kpi_actual > 0 ? 100 : 0))
      : (lineItem.primary_kpi_target > 0 ? (primary_kpi_actual / lineItem.primary_kpi_target) * 100 : 100);

    // Overall completion percentage towards total flight target
    const primary_kpi_progress = lineItem.primary_kpi_target > 0
      ? (primary_kpi_actual / lineItem.primary_kpi_target) * 100
      : 0;

    // Variance calculation:
    // For volume deliverables: percentage ahead (+) or behind (-) scheduled expected pace
    // For cost metrics: percentage higher (+) or lower (-) than target buying cost
    let primary_kpi_variance = 0;
    if (hasMetrics && lineItem.primary_kpi_target > 0) {
      if (isVolumeMetric && primary_kpi_expected > 0) {
        primary_kpi_variance = ((primary_kpi_actual - primary_kpi_expected) / primary_kpi_expected) * 100;
      } else {
        primary_kpi_variance = ((primary_kpi_actual - lineItem.primary_kpi_target) / lineItem.primary_kpi_target) * 100;
      }
    }

    // Secondary / Buying KPI
    const buying_kpi = lineItem.buying_kpi;
    const buying_kpi_target = (lineItem.buying_kpi_target !== undefined && lineItem.buying_kpi_target > 0)
      ? lineItem.buying_kpi_target
      : (lineItem.secondary_kpi_targets && buying_kpi ? lineItem.secondary_kpi_targets[buying_kpi] : undefined);

    let buying_kpi_actual: number | undefined = undefined;
    let buying_kpi_variance: number | undefined = undefined;

    if (buying_kpi) {
      switch (buying_kpi) {
        case 'cpm': buying_kpi_actual = actual_cpm; break;
        case 'cpc': buying_kpi_actual = actual_cpc; break;
        case 'cpv': buying_kpi_actual = actual_cpv; break;
        case 'cpa': buying_kpi_actual = actual_cpa; break;
        case 'cpe': buying_kpi_actual = actual_cpe; break;
        case 'ctr': buying_kpi_actual = actual_ctr; break;
        case 'roas': buying_kpi_actual = actual_roas; break;
      }

      if (buying_kpi_actual !== undefined && buying_kpi_target && buying_kpi_target > 0 && hasMetrics) {
        buying_kpi_variance = ((buying_kpi_actual - buying_kpi_target) / buying_kpi_target) * 100;
      }
    }

    // Line Item Data Sources mapping status
    const dataSources = db.getLineItemDataSources(agencyId, lineItem.id);
    const activeDataSources = dataSources.filter(s => s.status === 'active');
    const isConnected = activeDataSources.length > 0;

    // Health Evaluation & Diagnostics
    const health_reasons: string[] = [];
    let health: HealthStatus = 'green';

    if (!hasMetrics) {
      // Clean zero-value state for newly created line items awaiting delivery data
      if (!isConnected) {
        health = 'amber';
        health_reasons.push('Pending data source connection: No advertising platform campaign linked');
      } else {
        health = 'green';
        health_reasons.push('New line item created. Initial delivery metrics set to 0. Ready for reporting data.');
      }
    } else {
      // 1. Check Delivery / Stopped / Data Source Mapping
      if (lineItem.status === 'paused') {
        health = 'amber';
        health_reasons.push('Campaign line item is paused');
      } else if (lineItem.status === 'completed') {
        health = 'green';
        health_reasons.push('Campaign line item flight completed');
      } else if (!isConnected) {
        health = 'amber';
        health_reasons.push('Pending data source connection: No advertising platform campaign linked');
      } else if (days_elapsed > 1 && total_spend === 0) {
        health = 'red';
        health_reasons.push('Zero delivery after scheduled start');
      }

      // 2. Spend Pacing Checks
      const tolerance = lineItem.pacing_tolerance || 15;
      const lowerPacingBound = 100 - tolerance;
      const upperPacingBound = 100 + tolerance;

      if (pacing_percentage < 65) {
        health = 'red';
        health_reasons.push(`Severe budget under-delivery: spend pacing at ${pacing_percentage.toFixed(0)}% of scheduled run rate`);
      } else if (pacing_percentage > 135) {
        health = 'red';
        health_reasons.push(`Critical budget overspend risk: spend pacing at ${pacing_percentage.toFixed(0)}% of scheduled run rate`);
      } else if (pacing_percentage < lowerPacingBound) {
        if (health !== 'red') health = 'amber';
        health_reasons.push(`Spend under-pacing: ${pacing_percentage.toFixed(0)}% (expected ≥${lowerPacingBound}%)`);
      } else if (pacing_percentage > upperPacingBound) {
        if (health !== 'red') health = 'amber';
        health_reasons.push(`Spend over-pacing: ${pacing_percentage.toFixed(0)}% (expected ≤${upperPacingBound}%)`);
      }

      // 3. Primary KPI Target & Deliverable Pacing Checks
      const formattedKpiName = lineItem.primary_kpi.replace('_', ' ').toUpperCase();
      if (isVolumeMetric) {
        if (primary_kpi_pacing < 65) {
          health = 'red';
          health_reasons.push(`Severe ${formattedKpiName} under-delivery: deliverable pacing at ${primary_kpi_pacing.toFixed(0)}% of scheduled flight target`);
        } else if (primary_kpi_pacing < 85) {
          if (health !== 'red') health = 'amber';
          health_reasons.push(`${formattedKpiName} pacing behind schedule (${primary_kpi_variance.toFixed(1)}%)`);
        } else if (primary_kpi_pacing > 140) {
          health_reasons.push(`${formattedKpiName} delivering ahead of flight pace (+${primary_kpi_variance.toFixed(1)}%)`);
        }
      } else if (isCostMetric) {
        if (primary_kpi_variance > 45) {
          health = 'red';
          health_reasons.push(`${formattedKpiName} severely exceeds target (+${primary_kpi_variance.toFixed(1)}%)`);
        } else if (primary_kpi_variance > 15) {
          if (health !== 'red') health = 'amber';
          health_reasons.push(`${formattedKpiName} higher than target (+${primary_kpi_variance.toFixed(1)}%)`);
        }
      }

      // 4. Secondary / Buying KPI Check
      if (buying_kpi && buying_kpi_variance !== undefined) {
        const isBuyingCost = ['cpm', 'cpc', 'cpa', 'cpe', 'cpv'].includes(buying_kpi);
        const formattedBuying = buying_kpi.toUpperCase();
        if (isBuyingCost) {
          if (buying_kpi_variance > 40) {
            if (health !== 'red') health = 'amber';
            health_reasons.push(`Buying ${formattedBuying} exceeds buying efficiency cap (+${buying_kpi_variance.toFixed(1)}%)`);
          } else if (buying_kpi_variance <= -5) {
            health_reasons.push(`Buying ${formattedBuying} cost-efficient (${buying_kpi_variance.toFixed(1)}%)`);
          }
        }
      }

      if (health_reasons.length === 0) {
        health_reasons.push('Primary deliverable pacing and buying efficiency are on target');
      }
    }

    // Calculate Line Item Health Score (0 - 100)
    let deliverableScore = 38;
    if (hasMetrics) {
      if (isVolumeMetric) {
        if (primary_kpi_pacing >= 90 && primary_kpi_pacing <= 125) deliverableScore = 40;
        else if (primary_kpi_pacing >= 80 && primary_kpi_pacing < 90) deliverableScore = 32;
        else if (primary_kpi_pacing >= 65 && primary_kpi_pacing < 80) deliverableScore = 22;
        else if (primary_kpi_pacing < 65) deliverableScore = 10;
        else deliverableScore = 36;
      } else if (isCostMetric) {
        if (primary_kpi_variance <= 0) deliverableScore = 40;
        else if (primary_kpi_variance <= 15) deliverableScore = 32;
        else if (primary_kpi_variance <= 35) deliverableScore = 20;
        else deliverableScore = 10;
      }
    }

    let spendScore = 33;
    if (hasMetrics && days_elapsed > 0) {
      if (pacing_percentage >= 85 && pacing_percentage <= 115) spendScore = 35;
      else if ((pacing_percentage >= 70 && pacing_percentage < 85) || (pacing_percentage > 115 && pacing_percentage <= 130)) spendScore = 26;
      else spendScore = 12;
    }

    let buyingScore = 25;
    if (hasMetrics && buying_kpi && buying_kpi_variance !== undefined) {
      const isBuyingCost = ['cpm', 'cpc', 'cpa', 'cpe', 'cpv'].includes(buying_kpi);
      if (isBuyingCost) {
        if (buying_kpi_variance <= 0) buyingScore = 25;
        else if (buying_kpi_variance <= 15) buyingScore = 20;
        else if (buying_kpi_variance <= 35) buyingScore = 14;
        else buyingScore = 6;
      }
    }

    let health_score = Math.min(100, Math.max(0, deliverableScore + spendScore + buyingScore));
    if (health === 'red' && health_score > 58) health_score = 55;
    if (health === 'amber' && health_score > 74) health_score = 72;

    return {
      line_item: lineItem,
      client_name: client ? client.name : 'Unknown Client',
      brand_name: brand ? brand.name : 'Unknown Brand',
      campaign_name: campaign ? campaign.name : 'Unknown Campaign',
      total_spend,
      expected_spend,
      budget_remaining,
      pacing_percentage,
      projected_final_spend,
      total_impressions,
      total_reach,
      total_clicks,
      total_conversions,
      total_conversion_value,
      total_video_views,
      total_engagements,
      actual_cpm,
      actual_cpc,
      actual_ctr,
      actual_cpa,
      actual_cpe,
      actual_roas,
      actual_cpv,
      primary_kpi: lineItem.primary_kpi,
      primary_kpi_target: lineItem.primary_kpi_target,
      primary_kpi_actual,
      primary_kpi_expected,
      primary_kpi_pacing,
      primary_kpi_progress,
      primary_kpi_variance,
      buying_kpi,
      buying_kpi_target,
      buying_kpi_actual,
      buying_kpi_variance,
      health,
      health_score,
      health_reasons,
      days_elapsed,
      days_total,
      last_updated,
      data_sources: dataSources,
      data_source_status: isConnected ? 'connected' : 'not_connected',
      connected_sources_count: activeDataSources.length
    };
  }

  /**
   * Aggregates line items into platform groups and recalculates blended ratios
   */
  static calculatePlatformBreakdown(
    lineItemMetrics: LineItemCalculatedMetrics[],
    campaign?: Campaign
  ): PlatformCalculatedMetrics[] {
    const platformMap = new Map<string, LineItemCalculatedMetrics[]>();
    lineItemMetrics.forEach(item => {
      const plat = item.line_item.platform;
      const list = platformMap.get(plat) || [];
      list.push(item);
      platformMap.set(plat, list);
    });

    const campaignCurrency = (campaign?.currency || 'LKR').toUpperCase();
    const rate = campaign?.usd_to_lkr_rate || 305;

    const toCampaignCurr = (amt: number, fromCurrency?: string) => {
      const from = (fromCurrency || campaignCurrency).toUpperCase();
      const to = campaignCurrency;
      if (from === to) return amt;
      if (from === 'USD' && to === 'LKR') return amt * rate;
      if (from === 'LKR' && to === 'USD') return amt / rate;
      return amt;
    };

    const results: PlatformCalculatedMetrics[] = [];

    platformMap.forEach((items, platformStr) => {
      const platform = platformStr as any;

      const distinctCurrencies = Array.from(new Set(items.map(i => (i.line_item.currency || campaignCurrency).toUpperCase())));
      const isSingleCurrency = distinctCurrencies.length === 1;
      const platformCurrency = isSingleCurrency ? distinctCurrencies[0] : campaignCurrency;

      const budget = isSingleCurrency
        ? items.reduce((sum, i) => sum + i.line_item.budget, 0)
        : items.reduce((sum, i) => sum + toCampaignCurr(i.line_item.budget, i.line_item.currency), 0);

      const spend = isSingleCurrency
        ? items.reduce((sum, i) => sum + i.total_spend, 0)
        : items.reduce((sum, i) => sum + toCampaignCurr(i.total_spend, i.line_item.currency), 0);

      const expected_spend = isSingleCurrency
        ? items.reduce((sum, i) => sum + i.expected_spend, 0)
        : items.reduce((sum, i) => sum + toCampaignCurr(i.expected_spend, i.line_item.currency), 0);

      const converted_budget = items.reduce((sum, i) => sum + toCampaignCurr(i.line_item.budget, i.line_item.currency), 0);
      const converted_spend = items.reduce((sum, i) => sum + toCampaignCurr(i.total_spend, i.line_item.currency), 0);

      const pacing_percentage = expected_spend > 0 ? (spend / expected_spend) * 100 : (spend === 0 ? 0 : 100);
      const budget_remaining = Math.max(0, budget - spend);

      const impressions = items.reduce((sum, i) => sum + i.total_impressions, 0);
      const clicks = items.reduce((sum, i) => sum + i.total_clicks, 0);
      const conversions = items.reduce((sum, i) => sum + i.total_conversions, 0);
      const video_views = items.reduce((sum, i) => sum + i.total_video_views, 0);
      const engagements = items.reduce((sum, i) => sum + i.total_engagements, 0);
      const conversion_value = items.reduce((sum, i) => sum + i.total_conversion_value, 0);

      // Recalculated ratio metrics (NEVER averaged!)
      const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      const cpc = clicks > 0 ? spend / clicks : 0;
      const cpa = conversions > 0 ? spend / conversions : 0;
      const cpe = engagements > 0 ? spend / engagements : 0;
      const roas = spend > 0 ? conversion_value / spend : 0;

      let health: HealthStatus = 'green';
      if (items.some(i => i.health === 'red')) {
        health = 'red';
      } else if (items.some(i => i.health === 'amber')) {
        health = 'amber';
      }

      results.push({
        platform,
        currency: platformCurrency,
        converted_budget,
        converted_spend,
        line_items_count: items.length,
        budget,
        spend,
        budget_remaining,
        expected_spend,
        pacing_percentage,
        impressions,
        clicks,
        conversions,
        video_views,
        engagements,
        cpm,
        ctr,
        cpc,
        cpa,
        cpe,
        roas,
        health,
        line_items: items
      });
    });

    return results;
  }

  /**
   * Aggregates entire business campaign overview metrics across all line items
   */
  static calculateCampaignMetrics(agencyId: string, campaign: Campaign): CampaignCalculatedMetrics {
    const lineItems = db.getLineItems(agencyId, campaign.id);
    const client = db.getClientById(agencyId, campaign.client_id);
    const brand = db.getBrandById(agencyId, campaign.brand_id);

    const lineItemCalculated = lineItems.map(item => this.calculateLineItemMetrics(agencyId, item));
    const platforms = this.calculatePlatformBreakdown(lineItemCalculated, campaign);

    const rate = campaign.usd_to_lkr_rate || 305;
    const campaignCurrency = (campaign.currency || 'LKR').toUpperCase();

    const toCampaignCurrency = (amt: number, fromCurrency?: string) => {
      const from = (fromCurrency || campaignCurrency).toUpperCase();
      const to = campaignCurrency;
      if (from === to) return amt;
      if (from === 'USD' && to === 'LKR') return amt * rate;
      if (from === 'LKR' && to === 'USD') return amt / rate;
      return amt;
    };

    // Calculate currency breakdown
    const currencyMap: Record<string, { budget: number; spend: number; expected_spend: number }> = {};
    lineItemCalculated.forEach(l => {
      const c = (l.line_item.currency || campaignCurrency).toUpperCase();
      if (!currencyMap[c]) {
        currencyMap[c] = { budget: 0, spend: 0, expected_spend: 0 };
      }
      currencyMap[c].budget += l.line_item.budget;
      currencyMap[c].spend += l.total_spend;
      currencyMap[c].expected_spend += l.expected_spend;
    });

    const currency_breakdown = Object.entries(currencyMap).map(([currencyName, vals]) => ({
      currency: currencyName,
      budget: vals.budget,
      spend: vals.spend,
      expected_spend: vals.expected_spend
    }));

    const has_multiple_currencies = currency_breakdown.length > 1;

    const connected_line_items_count = lineItemCalculated.filter(l => l.data_source_status === 'connected').length;
    const unconnected_line_items_count = lineItemCalculated.length - connected_line_items_count;
    const currency_budgets: Record<string, number> = {};
    currency_breakdown.forEach(c => {
      currency_budgets[c.currency] = c.budget;
    });

    // Convert line items budget and spend into campaign base currency
    const total_budget = lineItemCalculated.length > 0
      ? lineItemCalculated.reduce((sum, l) => sum + toCampaignCurrency(l.line_item.budget, l.line_item.currency), 0)
      : (campaign.total_budget || 0);

    const total_spend = lineItemCalculated.reduce(
      (sum, l) => sum + toCampaignCurrency(l.total_spend, l.line_item.currency),
      0
    );

    const expected_spend = lineItemCalculated.reduce(
      (sum, l) => sum + toCampaignCurrency(l.expected_spend, l.line_item.currency),
      0
    );

    const budget_remaining = Math.max(0, total_budget - total_spend);
    const budget_used_percentage = total_budget > 0 ? (total_spend / total_budget) * 100 : 0;
    const overall_pacing = expected_spend > 0 ? (total_spend / expected_spend) * 100 : (total_spend === 0 ? 0 : 100);
    const projected_final_spend = lineItemCalculated.reduce(
      (sum, l) => sum + toCampaignCurrency(l.projected_final_spend, l.line_item.currency),
      0
    );

    const total_impressions = lineItemCalculated.reduce((sum, l) => sum + l.total_impressions, 0);
    const total_reach = lineItemCalculated.reduce((sum, l) => sum + l.total_reach, 0);
    const total_clicks = lineItemCalculated.reduce((sum, l) => sum + l.total_clicks, 0);
    const total_conversions = lineItemCalculated.reduce((sum, l) => sum + l.total_conversions, 0);
    const total_conversion_value = lineItemCalculated.reduce((sum, l) => sum + l.total_conversion_value, 0);
    const total_video_views = lineItemCalculated.reduce((sum, l) => sum + l.total_video_views, 0);
    const total_engagements = lineItemCalculated.reduce((sum, l) => sum + l.total_engagements, 0);

    // Blended recalculations
    const blended_cpm = total_impressions > 0 ? (total_spend / total_impressions) * 1000 : 0;
    const blended_ctr = total_impressions > 0 ? (total_clicks / total_impressions) * 100 : 0;
    const blended_cpa = total_conversions > 0 ? total_spend / total_conversions : 0;
    const blended_cpc = total_clicks > 0 ? total_spend / total_clicks : 0;
    const blended_roas = total_spend > 0 ? total_conversion_value / total_spend : 0;

    // Primary KPIs Summary Rollup across all line items
    const primaryKpiMap = new Map<string, { target: number; actual: number; expected: number }>();
    const kpiLabelMap: Record<string, string> = {
      reach: 'Target Unique Reach',
      impressions: 'Target Impressions',
      video_views: 'Target Video Views',
      clicks: 'Target Link Clicks',
      conversions: 'Target Conversions',
      engagements: 'Target Engagements',
      cpm: 'Target CPM',
      cpc: 'Target CPC',
      cpa: 'Target CPA',
      cpe: 'Target CPE',
      roas: 'Target ROAS',
      spend: 'Target Spend'
    };

    lineItemCalculated.forEach(l => {
      const kpi = l.line_item.primary_kpi;
      const current = primaryKpiMap.get(kpi) || { target: 0, actual: 0, expected: 0 };
      current.target += l.line_item.primary_kpi_target || 0;
      current.actual += l.primary_kpi_actual || 0;
      current.expected += l.primary_kpi_expected || 0;
      primaryKpiMap.set(kpi, current);
    });

    const primary_kpis_summary = Array.from(primaryKpiMap.entries()).map(([kpiStr, data]) => {
      const kpi = kpiStr as any;
      const isVolume = ['reach', 'impressions', 'video_views', 'clicks', 'conversions', 'engagements'].includes(kpi);
      const pacing_percentage = isVolume
        ? (data.expected > 0 ? (data.actual / data.expected) * 100 : (data.actual > 0 ? 100 : 0))
        : (data.target > 0 ? (data.actual / data.target) * 100 : 100);

      const progress_percentage = data.target > 0 ? (data.actual / data.target) * 100 : 0;
      const variance = isVolume
        ? (data.expected > 0 ? ((data.actual - data.expected) / data.expected) * 100 : 0)
        : (data.target > 0 ? ((data.actual - data.target) / data.target) * 100 : 0);

      let status: HealthStatus = 'green';
      if (isVolume) {
        if (pacing_percentage < 65) status = 'red';
        else if (pacing_percentage < 85) status = 'amber';
      } else {
        if (variance > 40) status = 'red';
        else if (variance > 15) status = 'amber';
      }

      return {
        kpi,
        label: kpiLabelMap[kpi] || kpi.toUpperCase(),
        target: data.target,
        actual: data.actual,
        expected: data.expected,
        pacing_percentage,
        progress_percentage,
        variance,
        status
      };
    });

    // Buying KPIs Summary Rollup
    const buyingKpiMap = new Map<string, { totalSpend: number; totalVolume: number; target: number; count: number; currency: string }>();
    lineItemCalculated.forEach(l => {
      const bkpi = l.buying_kpi;
      if (!bkpi || !l.buying_kpi_target) return;
      const cur = l.line_item.currency || campaignCurrency;
      const key = `${bkpi}_${cur}`;
      const entry = buyingKpiMap.get(key) || { totalSpend: 0, totalVolume: 0, target: 0, count: 0, currency: cur };
      entry.totalSpend += l.total_spend;
      entry.target += l.buying_kpi_target;
      entry.count += 1;
      switch (bkpi) {
        case 'cpm': entry.totalVolume += l.total_impressions / 1000; break;
        case 'cpc': entry.totalVolume += l.total_clicks; break;
        case 'cpv': entry.totalVolume += l.total_video_views; break;
        case 'cpa': entry.totalVolume += l.total_conversions; break;
        case 'cpe': entry.totalVolume += l.total_engagements; break;
        default: entry.totalVolume += l.total_impressions / 1000; break;
      }
      buyingKpiMap.set(key, entry);
    });

    const buying_kpis_summary = Array.from(buyingKpiMap.entries()).map(([key, data]) => {
      const bkpi = key.split('_')[0] as any;
      const avgTarget = data.count > 0 ? data.target / data.count : 0;
      const actual = data.totalVolume > 0 ? data.totalSpend / data.totalVolume : 0;
      const variance = avgTarget > 0 ? ((actual - avgTarget) / avgTarget) * 100 : 0;
      let status: HealthStatus = 'green';
      if (variance > 40) status = 'red';
      else if (variance > 15) status = 'amber';

      return {
        kpi: bkpi,
        label: `Buying ${bkpi.toUpperCase()} Efficiency`,
        target: avgTarget,
        actual,
        variance,
        currency: data.currency,
        status
      };
    });

    // Campaign Health & Rating Calculation
    // Campaign rating directly accounts for:
    // 1. Line item health scores (which factor in primary KPI deliverable delivery)
    // 2. Aggregate primary deliverable pace
    // 3. Pacing tolerance
    let campaign_rating_score = 100;
    if (lineItemCalculated.length > 0) {
      const totalBudgetWeight = lineItemCalculated.reduce((sum, l) => sum + (l.line_item.budget || 1), 0);
      const weightedScoreSum = lineItemCalculated.reduce((sum, l) => {
        const weight = (l.line_item.budget || 1) / totalBudgetWeight;
        return sum + (l.health_score * weight);
      }, 0);
      campaign_rating_score = Math.round(weightedScoreSum);
    }

    // Health Rollup
    let overall_health: HealthStatus = 'green';
    if (lineItemCalculated.some(l => l.health === 'red') || primary_kpis_summary.some(k => k.status === 'red') || campaign_rating_score < 60) {
      overall_health = 'red';
      if (campaign_rating_score > 58) campaign_rating_score = 56;
    } else if (lineItemCalculated.some(l => l.health === 'amber') || primary_kpis_summary.some(k => k.status === 'amber') || campaign_rating_score < 75) {
      overall_health = 'amber';
      if (campaign_rating_score > 74) campaign_rating_score = 72;
    }

    let campaign_rating_label = 'Optimal';
    if (campaign_rating_score >= 90) campaign_rating_label = 'Optimal';
    else if (campaign_rating_score >= 75) campaign_rating_label = 'On Track';
    else if (campaign_rating_score >= 60) campaign_rating_label = 'Needs Attention';
    else campaign_rating_label = 'Critical Risk';

    const active_line_items_count = lineItems.filter(l => l.status === 'active').length;
    const requiring_attention_count = lineItemCalculated.filter(l => l.health === 'red' || l.health === 'amber').length;

    // Latest successful update across all line items
    const updateDates = lineItemCalculated.map(l => l.last_updated).filter(Boolean).sort();
    const last_successful_update = updateDates.length > 0 ? updateDates[updateDates.length - 1] : campaign.updated_at;

    // Schedule days and pacing for campaign flight
    const { elapsed: days_elapsed, total: days_total } = this.getElapsedDays(
      campaign.start_date,
      campaign.end_date,
      last_successful_update
    );

    return {
      campaign,
      client_name: client ? client.name : 'Unknown Client',
      brand_name: brand ? brand.name : 'Unknown Brand',
      total_budget,
      total_spend,
      budget_used_percentage,
      budget_remaining,
      expected_spend,
      overall_pacing,
      projected_final_spend,
      overall_health,
      campaign_rating_score,
      campaign_rating_label,
      primary_kpis_summary,
      buying_kpis_summary,
      days_elapsed,
      days_total,
      total_impressions,
      total_reach,
      total_clicks,
      blended_ctr,
      blended_cpm,
      total_conversions,
      blended_cpa,
      blended_cpc,
      blended_roas,
      total_video_views,
      total_engagements,
      active_line_items_count,
      requiring_attention_count,
      last_successful_update,
      platforms,
      has_multiple_currencies,
      exchange_rate: rate,
      line_items_count: lineItemCalculated.length,
      connected_line_items_count,
      unconnected_line_items_count,
      currency_budgets,
      currency_breakdown
    };
  }

  /**
   * Syncs automated alerts based on current health status
   */
  static syncAlertsForAgency(agencyId: string) {
    const campaigns = db.getCampaigns(agencyId);
    campaigns.forEach(campaign => {
      const lineItems = db.getLineItems(agencyId, campaign.id);
      lineItems.forEach(line => {
        const daily = db.getDailyMetrics(agencyId, line.id);
        if (daily.length === 0) {
          // Do not generate alerts for newly created line items awaiting performance data
          return;
        }
        const metrics = this.calculateLineItemMetrics(agencyId, line, daily);
        if (metrics.health === 'red') {
          db.createAlert({
            agency_id: agencyId,
            client_id: line.client_id,
            brand_id: line.brand_id,
            campaign_id: line.campaign_id,
            line_item_id: line.id,
            platform: line.platform,
            alert_type: metrics.pacing_percentage < 70 ? 'underspending' : 'cpm_above_target',
            severity: 'red',
            title: `Critical: ${line.name} requires attention`,
            message: metrics.health_reasons.join('; '),
            status: 'active'
          });
        } else if (metrics.health === 'amber') {
          db.createAlert({
            agency_id: agencyId,
            client_id: line.client_id,
            brand_id: line.brand_id,
            campaign_id: line.campaign_id,
            line_item_id: line.id,
            platform: line.platform,
            alert_type: metrics.pacing_percentage > 115 ? 'overspending' : 'cpm_above_target',
            severity: 'amber',
            title: `Warning: ${line.name} off target`,
            message: metrics.health_reasons.join('; '),
            status: 'active'
          });
        }
      });
    });
  }
}
