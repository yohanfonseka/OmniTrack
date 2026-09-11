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
    const { elapsed, total: days_total } = this.getElapsedDays(lineItem.start_date, lineItem.end_date, latestMetricDate);
    const days_elapsed = elapsed;

    // Expected Spend To Date = Line-Item Budget * (Elapsed Scheduled Days / Total Scheduled Days)
    const expected_spend = lineItem.budget * (days_elapsed / days_total);

    // Pacing Percentage = Actual Spend To Date / Expected Spend To Date * 100
    const pacing_percentage = expected_spend > 0 ? (total_spend / expected_spend) * 100 : 100;

    // Projected Final Spend = Actual Spend To Date / Elapsed Scheduled Days * Total Scheduled Days
    const projected_final_spend = days_elapsed > 0 ? (total_spend / days_elapsed) * days_total : lineItem.budget;

    const budget_remaining = Math.max(0, lineItem.budget - total_spend);

    // Recalculated ratio metrics (NEVER averaged)
    const actual_cpm = total_impressions > 0 ? (total_spend / total_impressions) * 1000 : 0;
    const actual_cpc = total_clicks > 0 ? total_spend / total_clicks : 0;
    const actual_ctr = total_impressions > 0 ? (total_clicks / total_impressions) * 100 : 0;
    const actual_cpa = total_conversions > 0 ? total_spend / total_conversions : 0;
    const actual_cpe = total_engagements > 0 ? total_spend / total_engagements : 0;
    const actual_roas = total_spend > 0 ? total_conversion_value / total_spend : 0;

    // Primary KPI actual & variance
    let primary_kpi_actual = 0;
    switch (lineItem.primary_kpi) {
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
      case 'impressions':
        primary_kpi_actual = total_impressions;
        break;
      case 'clicks':
        primary_kpi_actual = total_clicks;
        break;
      case 'conversions':
        primary_kpi_actual = total_conversions;
        break;
      case 'video_views':
        primary_kpi_actual = total_video_views;
        break;
      case 'spend':
        primary_kpi_actual = total_spend;
        break;
    }

    // Variance calculation
    // For cost metrics (cpm, cpc, cpa, cpe): variance = (actual - target) / target * 100 (negative is good, positive is bad)
    // For positive volume/rate metrics (ctr, roas, conversions, etc.): variance = (actual - target) / target * 100 (positive is good)
    const isCostMetric = ['cpm', 'cpc', 'cpa', 'cpe'].includes(lineItem.primary_kpi);
    let primary_kpi_variance = 0;
    if (lineItem.primary_kpi_target > 0) {
      primary_kpi_variance = ((primary_kpi_actual - lineItem.primary_kpi_target) / lineItem.primary_kpi_target) * 100;
    }

    // Line Item Data Sources mapping status
    const dataSources = db.getLineItemDataSources(agencyId, lineItem.id);
    const activeDataSources = dataSources.filter(s => s.status === 'active');
    const isConnected = activeDataSources.length > 0;

    // Health Evaluation
    const health_reasons: string[] = [];
    let health: HealthStatus = 'green';

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

    // 2. Pacing Checks
    // Tolerance e.g. 15%
    const tolerance = lineItem.pacing_tolerance || 15;
    const lowerPacingBound = 100 - tolerance;
    const upperPacingBound = 100 + tolerance;

    if (pacing_percentage < 65) {
      health = 'red';
      health_reasons.push(`Severe under-delivery: pacing at ${pacing_percentage.toFixed(0)}% of expected spend`);
    } else if (pacing_percentage > 135) {
      health = 'red';
      health_reasons.push(`Critical overspend risk: pacing at ${pacing_percentage.toFixed(0)}% of expected spend`);
    } else if (pacing_percentage < lowerPacingBound) {
      if (health !== 'red') health = 'amber';
      health_reasons.push(`Under-pacing: ${pacing_percentage.toFixed(0)}% (expected ≥${lowerPacingBound}%)`);
    } else if (pacing_percentage > upperPacingBound) {
      if (health !== 'red') health = 'amber';
      health_reasons.push(`Over-pacing: ${pacing_percentage.toFixed(0)}% (expected ≤${upperPacingBound}%)`);
    }

    // 3. Primary KPI Target Check
    if (isCostMetric) {
      // higher than target is worse
      if (primary_kpi_variance > 50) {
        health = 'red';
        health_reasons.push(`${lineItem.primary_kpi.toUpperCase()} severely exceeds target (+${primary_kpi_variance.toFixed(1)}%)`);
      } else if (primary_kpi_variance > 10) {
        if (health !== 'red') health = 'amber';
        health_reasons.push(`${lineItem.primary_kpi.toUpperCase()} higher than target (+${primary_kpi_variance.toFixed(1)}%)`);
      }
    } else {
      // lower than target is worse
      if (primary_kpi_variance < -35) {
        health = 'red';
        health_reasons.push(`${lineItem.primary_kpi.toUpperCase()} critically behind target (${primary_kpi_variance.toFixed(1)}%)`);
      } else if (primary_kpi_variance < -12) {
        if (health !== 'red') health = 'amber';
        health_reasons.push(`${lineItem.primary_kpi.toUpperCase()} below target (${primary_kpi_variance.toFixed(1)}%)`);
      }
    }

    if (health_reasons.length === 0) {
      health_reasons.push('Pacing and primary KPI are within healthy tolerance targets');
    }

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
      primary_kpi_actual,
      primary_kpi_variance,
      health,
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

      const pacing_percentage = expected_spend > 0 ? (spend / expected_spend) * 100 : 100;
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
    const overall_pacing = expected_spend > 0 ? (total_spend / expected_spend) * 100 : 100;
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

    // Campaign Health Rollup:
    // If any line item is Red -> Red
    // Else if any is Amber -> Amber
    // Else -> Green
    let overall_health: HealthStatus = 'green';
    if (lineItemCalculated.some(l => l.health === 'red')) {
      overall_health = 'red';
    } else if (lineItemCalculated.some(l => l.health === 'amber')) {
      overall_health = 'amber';
    }

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
        const metrics = this.calculateLineItemMetrics(agencyId, line);
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
