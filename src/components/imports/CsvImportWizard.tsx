import React, { useState, useEffect } from 'react';
import { formatNumber } from '../../lib/formatters';
import Papa from 'papaparse';
import { useAuth } from '../../context/AuthContext';
import { Client, Brand, Campaign, CampaignLineItem, PlatformType, ImportJob } from '../../types';
import { ApiService } from '../../lib/api';
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Undo2,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Layers,
  Sparkles
} from 'lucide-react';

interface CsvImportWizardProps {
  onImportComplete?: () => void;
  onNavigateToUnmapped?: () => void;
}

export const CsvImportWizard: React.FC<CsvImportWizardProps> = ({ onImportComplete, onNavigateToUnmapped }) => {
  const { currentAgency } = useAuth();

  // Wizard Steps: 1: Select Hierarchy & Platform -> 2: Upload / Sample -> 3: Preview & Map -> 4: Match Campaigns -> 5: Process & Summary
  const [step, setStep] = useState<number>(1);

  // Selection state
  const [clients, setClients] = useState<Client[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [lineItems, setLineItems] = useState<CampaignLineItem[]>([]);

  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [selectedBrandId, setSelectedBrandId] = useState<string>('');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformType>('meta');

  // CSV Content state
  const [fileName, setFileName] = useState<string>('');
  const [csvContent, setCsvContent] = useState<string>('');
  const [previewData, setPreviewData] = useState<any>(null);

  // Column Mappings (normalizedField -> csvHeader)
  const [mappings, setMappings] = useState<Record<string, string>>({});

  // Campaign matches (platform_campaign_id -> line_item_id or camp:campaign_id or create_new:name)
  const [campaignMatches, setCampaignMatches] = useState<Record<string, string>>({});

  // Background Processing state
  const [importJob, setImportJob] = useState<ImportJob | null>(null);
  const [impact, setImpact] = useState<any | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [revertingId, setRevertingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [recentImports, setRecentImports] = useState<ImportJob[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  // Read from the uploaded file when it states one; null means the user still has to pick.
  const [importCurrency, setImportCurrency] = useState<string | null>(null);
  const [currencySource, setCurrencySource] = useState<'column' | 'header' | null>(null);

  // Load clients & brands
  useEffect(() => {
    if (!currentAgency) return;
    ApiService.getClients(currentAgency.id).then(list => {
      setClients(list);
      if (list.length > 0 && !selectedClientId) {
        setSelectedClientId(list[0].id);
      }
    });
    loadRecentImports();
  }, [currentAgency]);

  useEffect(() => {
    if (!currentAgency || !selectedClientId) return;
    ApiService.getBrands(currentAgency.id, selectedClientId).then(list => {
      setBrands(list);
      if (list.length > 0) {
        setSelectedBrandId(list[0].id);
      } else {
        setSelectedBrandId('');
      }
    });
  }, [currentAgency, selectedClientId]);

  // Load campaigns & line items for matching
  const loadCampaigns = async () => {
    if (!currentAgency) return;
    try {
      const campMetrics = await ApiService.getCampaigns(
        currentAgency.id,
        selectedClientId || undefined,
        selectedBrandId || undefined
      );
      const camps = campMetrics.map(c => c.campaign);
      setCampaigns(camps);

      // Collect line items
      const allLines: CampaignLineItem[] = [];
      campMetrics.forEach(cm => {
        cm.platforms.forEach(p => {
          p.line_items.forEach(li => {
            allLines.push(li.line_item);
          });
        });
      });
      setLineItems(allLines);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadCampaigns();
  }, [currentAgency, selectedClientId, selectedBrandId, selectedPlatform]);

  const loadRecentImports = async () => {
    if (!currentAgency) return;
    try {
      const list = await ApiService.getImports(currentAgency.id);
      setRecentImports(list);
    } catch {
      // ignore
    }
  };

  // Load Sample Meta or TikTok CSV
  const handleLoadSample = async (plat: PlatformType) => {
    setSelectedPlatform(plat);
    try {
      const res = await ApiService.getSampleCsv(plat);
      setCsvContent(res.csv);
      setFileName(`${plat}_sample_ad_report.csv`);
      await handleParsePreview(res.csv, plat);
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  // Process uploaded or dropped file
  const processFile = (file: File) => {
    if (!file) return;
    const lowerName = file.name.toLowerCase();
    const isSpreadsheet = lowerName.endsWith('.xlsx') || lowerName.endsWith('.xlsm');

    if (!isSpreadsheet && !lowerName.endsWith('.csv') && file.type && !file.type.includes('csv') && !file.type.includes('text')) {
      setErrorMsg('Please upload a .csv or .xlsx ad performance report file.');
      return;
    }
    setFileName(file.name);
    setErrorMsg(null);

    const reader = new FileReader();
    reader.onerror = () => {
      setErrorMsg(`Could not read the uploaded ${isSpreadsheet ? 'spreadsheet' : 'CSV'} file. Please try again.`);
    };

    if (isSpreadsheet) {
      // Spreadsheets are converted to CSV server-side, then follow the same path as a .csv upload.
      reader.onload = async event => {
        try {
          const bytes = new Uint8Array(event.target?.result as ArrayBuffer);
          let binary = '';
          for (let i = 0; i < bytes.length; i += 8192) {
            binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
          }
          const { csv } = await ApiService.convertXlsxToCsv(btoa(binary));
          setCsvContent(csv);
          await handleParsePreview(csv, selectedPlatform);
        } catch (err: any) {
          setErrorMsg(err.message || 'Could not read the uploaded spreadsheet.');
        }
      };
      reader.readAsArrayBuffer(file);
      return;
    }

    reader.onload = async event => {
      const content = event.target?.result as string;
      setCsvContent(content);
      await handleParsePreview(content, selectedPlatform);
    };
    reader.readAsText(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    if (!isDragging) setIsDragging(true);
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Only deactivate if leaving the container element entirely
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  // Parse and preview with server engine
  const handleParsePreview = async (rawCsv: string, plat: PlatformType) => {
    setErrorMsg(null);
    try {
      const preview = await ApiService.previewCsv(rawCsv);
      setPreviewData(preview);
      setMappings(preview.suggested_mapping || {});
      setImportCurrency(preview.detected_currency || null);
      setCurrencySource(preview.detected_currency_source || null);

      // Auto-match campaigns if ids or names correspond
      const matches: Record<string, string> = {};
      preview.distinct_campaigns.forEach((dc: any) => {
        // 1. Try matching line items
        const foundLine = lineItems.find(
          l =>
            (l.platform_campaign_id && l.platform_campaign_id === dc.platform_campaign_id) ||
            l.name.toLowerCase().includes(dc.campaign_name.toLowerCase()) ||
            dc.campaign_name.toLowerCase().includes(l.name.toLowerCase())
        );
        if (foundLine) {
          matches[dc.platform_campaign_id] = `line:${foundLine.id}`;
          return;
        }

        // 2. Try matching existing campaign by name
        const foundCamp = campaigns.find(
          c =>
            c.name.toLowerCase().includes(dc.campaign_name.toLowerCase()) ||
            dc.campaign_name.toLowerCase().includes(c.name.toLowerCase())
        );
        if (foundCamp) {
          matches[dc.platform_campaign_id] = `camp:${foundCamp.id}`;
          return;
        }

        // 3. Fallbacks
        if (lineItems.length > 0) {
          matches[dc.platform_campaign_id] = `line:${lineItems[0].id}`;
        } else if (campaigns.length > 0) {
          matches[dc.platform_campaign_id] = `camp:${campaigns[0].id}`;
        } else {
          matches[dc.platform_campaign_id] = `create_new:${dc.campaign_name}`;
        }
      });
      setCampaignMatches(matches);
      setStep(3); // Go to Preview & Map step
    } catch (err: any) {
      setErrorMsg(`Failed to parse CSV: ${err.message}`);
    }
  };

  // Process column mapping and transition to Campaign Matching step
  const handleProceedToMatching = () => {
    setErrorMsg(null);
    const dateCol = mappings['report_date'];
    const campCol = mappings['campaign_name'] || mappings['platform_campaign_id'];
    const lineCol = mappings['line_item_name'] || mappings['ad_set_name'];
    const idCol = mappings['platform_campaign_id'];
    const spendCol = mappings['spend'];

    if (!dateCol || (!campCol && !lineCol && !idCol) || !spendCol) {
      setErrorMsg('Please map Report Date, Campaign Name (or Line Item Name), and Spend Amount.');
      return;
    }

    try {
      const parsed = Papa.parse(csvContent.trim(), { header: true, skipEmptyLines: true });
      const rows = parsed.data as Record<string, any>[];

      const parseRowVal = (val: any) => {
        if (val === undefined || val === null || val === '') return 0;
        const clean = String(val).replace(/[^0-9.-]/g, '');
        const num = parseFloat(clean);
        return isNaN(num) ? 0 : num;
      };

      // Mirrors CsvEngine.isEmptyMetricRow on the server, which is what
      // actually decides what gets stored. Applied here too so the matching
      // step lists only ad sets that will really be imported.
      const deliveryCols = [
        mappings['spend'],
        mappings['impressions'],
        mappings['reach'],
        mappings['clicks'],
        mappings['conversions'],
        mappings['conversion_value'],
        mappings['video_views']
      ].filter(Boolean);

      const isEmptyRow = (row: Record<string, any>) =>
        deliveryCols.length > 0 && deliveryCols.every(col => parseRowVal(row[col]) === 0);

      // Hierarchical grouping by Campaign (Col A) -> Ad Set / Line Item (Col B)
      const campaignGroupsMap = new Map<string, {
        csv_campaign_name: string;
        rows_count: number;
        total_spend: number;
        ad_sets: Map<string, {
          item_key: string;
          csv_campaign_name: string;
          csv_ad_set_name: string;
          platform_campaign_id: string;
          rows_count: number;
          total_spend: number;
        }>;
      }>();

      let emptyRowCount = 0;

      rows.forEach((row, idx) => {
        if (isEmptyRow(row)) {
          emptyRowCount += 1;
          return;
        }

        const rawCamp = campCol ? String(row[campCol] || '').trim() : '';
        const rawAdSet = lineCol ? String(row[lineCol] || '').trim() : '';
        const rawId = idCol ? String(row[idCol] || '').trim() : '';
        const spendVal = spendCol ? parseRowVal(row[spendCol]) : 0;

        const csvCampName = rawCamp || (rawAdSet ? 'General Campaign' : `Campaign ${idx + 1}`);
        const csvAdSetName = rawAdSet || (rawCamp ? `Ad Set ${idx + 1}` : (rawId || `Line Item ${idx + 1}`));
        const itemKey = rawId || `${csvCampName}:::${csvAdSetName}`;

        let group = campaignGroupsMap.get(csvCampName);
        if (!group) {
          group = {
            csv_campaign_name: csvCampName,
            rows_count: 0,
            total_spend: 0,
            ad_sets: new Map()
          };
          campaignGroupsMap.set(csvCampName, group);
        }

        group.rows_count += 1;
        group.total_spend += spendVal;

        let as = group.ad_sets.get(csvAdSetName);
        if (!as) {
          as = {
            item_key: itemKey,
            csv_campaign_name: csvCampName,
            csv_ad_set_name: csvAdSetName,
            platform_campaign_id: rawId || itemKey,
            rows_count: 0,
            total_spend: 0
          };
          group.ad_sets.set(csvAdSetName, as);
        }
        as.rows_count += 1;
        as.total_spend += spendVal;
      });

      const distinctGroups = Array.from(campaignGroupsMap.values()).map(g => ({
        csv_campaign_name: g.csv_campaign_name,
        rows_count: g.rows_count,
        total_spend: Math.round(g.total_spend * 100) / 100,
        ad_sets: Array.from(g.ad_sets.values()).map(as => ({
          ...as,
          total_spend: Math.round(as.total_spend * 100) / 100
        }))
      }));

      // Flattened list for flat preview
      const distinctFlat: any[] = [];
      distinctGroups.forEach(g => {
        g.ad_sets.forEach(as => {
          distinctFlat.push({
            platform_campaign_id: as.item_key,
            campaign_name: `${as.csv_campaign_name} › ${as.csv_ad_set_name}`,
            csv_campaign_name: as.csv_campaign_name,
            csv_ad_set_name: as.csv_ad_set_name,
            rows_count: as.rows_count,
            total_spend: as.total_spend
          });
        });
      });

      if (distinctFlat.length === 0) {
        setErrorMsg(
          emptyRowCount === rows.length && rows.length > 0
            ? `All ${rows.length} rows report zero spend, impressions and clicks, so there is nothing to import.`
            : 'No campaigns or line items found in CSV with current column selection.'
        );
        return;
      }

      setPreviewData((prev: any) => ({
        ...prev,
        empty_rows: emptyRowCount,
        distinct_campaign_groups: distinctGroups,
        distinct_campaigns: distinctFlat
      }));

      // Set matches for all extracted items
      const updatedMatches: Record<string, string> = { ...campaignMatches };

      distinctGroups.forEach(g => {
        // Find existing campaign by name
        const foundCamp = campaigns.find(
          c =>
            c.name.toLowerCase().includes(g.csv_campaign_name.toLowerCase()) ||
            g.csv_campaign_name.toLowerCase().includes(c.name.toLowerCase())
        );

        if (foundCamp && !updatedMatches[g.csv_campaign_name]) {
          updatedMatches[g.csv_campaign_name] = `camp:${foundCamp.id}`;
        } else if (!updatedMatches[g.csv_campaign_name]) {
          updatedMatches[g.csv_campaign_name] = `create_new:${g.csv_campaign_name}`;
        }

        g.ad_sets.forEach(as => {
          if (updatedMatches[as.item_key]) return;

          // 1. Direct line item match
          const foundLine = lineItems.find(
            l =>
              (l.platform_campaign_id && (l.platform_campaign_id === as.platform_campaign_id || l.platform_campaign_id === as.item_key)) ||
              l.name.toLowerCase().includes(as.csv_ad_set_name.toLowerCase()) ||
              as.csv_ad_set_name.toLowerCase().includes(l.name.toLowerCase())
          );
          if (foundLine) {
            updatedMatches[as.item_key] = `line:${foundLine.id}`;
            updatedMatches[as.csv_ad_set_name] = `line:${foundLine.id}`;
            return;
          }

          // 2. Existing campaign match
          if (foundCamp) {
            const lineInCamp = lineItems.find(
              l =>
                l.campaign_id === foundCamp.id &&
                (l.name.toLowerCase().includes(as.csv_ad_set_name.toLowerCase()) ||
                  as.csv_ad_set_name.toLowerCase().includes(l.name.toLowerCase()))
            );
            if (lineInCamp) {
              updatedMatches[as.item_key] = `line:${lineInCamp.id}`;
              updatedMatches[as.csv_ad_set_name] = `line:${lineInCamp.id}`;
              return;
            }
            updatedMatches[as.item_key] = `camp:${foundCamp.id}`;
            updatedMatches[as.csv_ad_set_name] = `camp:${foundCamp.id}`;
            return;
          }

          // 3. User selected target campaign in wizard
          if (selectedCampaignId && selectedCampaignId !== 'auto_create') {
            updatedMatches[as.item_key] = `camp:${selectedCampaignId}`;
            updatedMatches[as.csv_ad_set_name] = `camp:${selectedCampaignId}`;
            return;
          }

          // 4. Default: Auto-create campaign with this campaign name
          updatedMatches[as.item_key] = `create_new:${as.csv_campaign_name}`;
          updatedMatches[as.csv_ad_set_name] = `create_new:${as.csv_campaign_name}`;
        });
      });

      setCampaignMatches(updatedMatches);
      setStep(4);
    } catch (err: any) {
      setErrorMsg(`Failed to extract campaigns from CSV: ${err.message}`);
    }
  };

  // Helper to set all ad sets under a specific campaign to a target
  const handleSetCampaignTarget = (csvCampName: string, targetVal: string) => {
    const updated = { ...campaignMatches };
    updated[csvCampName] = targetVal;
    const grp = previewData?.distinct_campaign_groups?.find((g: any) => g.csv_campaign_name === csvCampName);
    if (grp) {
      grp.ad_sets.forEach((as: any) => {
        updated[as.item_key] = targetVal;
        updated[as.csv_ad_set_name] = targetVal;
      });
    }
    setCampaignMatches(updated);
  };

  // Helper to re-match all distinct campaigns and ad sets using smart fuzzy heuristic
  const handleAutoMatchByName = () => {
    if (!previewData) return;
    const updated: Record<string, string> = {};

    if (previewData.distinct_campaign_groups && previewData.distinct_campaign_groups.length > 0) {
      previewData.distinct_campaign_groups.forEach((g: any) => {
        const foundCamp = campaigns.find(
          c =>
            c.name.toLowerCase().includes(g.csv_campaign_name.toLowerCase()) ||
            g.csv_campaign_name.toLowerCase().includes(c.name.toLowerCase())
        );

        if (foundCamp) {
          updated[g.csv_campaign_name] = `camp:${foundCamp.id}`;
        } else {
          updated[g.csv_campaign_name] = `create_new:${g.csv_campaign_name}`;
        }

        g.ad_sets.forEach((as: any) => {
          const foundLine = lineItems.find(
            l =>
              (l.platform_campaign_id && (l.platform_campaign_id === as.platform_campaign_id || l.platform_campaign_id === as.item_key)) ||
              l.name.toLowerCase().includes(as.csv_ad_set_name.toLowerCase()) ||
              as.csv_ad_set_name.toLowerCase().includes(l.name.toLowerCase())
          );
          if (foundLine) {
            updated[as.item_key] = `line:${foundLine.id}`;
            updated[as.csv_ad_set_name] = `line:${foundLine.id}`;
            return;
          }

          if (foundCamp) {
            const lineInCamp = lineItems.find(
              l =>
                l.campaign_id === foundCamp.id &&
                (l.name.toLowerCase().includes(as.csv_ad_set_name.toLowerCase()) ||
                  as.csv_ad_set_name.toLowerCase().includes(l.name.toLowerCase()))
            );
            if (lineInCamp) {
              updated[as.item_key] = `line:${lineInCamp.id}`;
              updated[as.csv_ad_set_name] = `line:${lineInCamp.id}`;
              return;
            }
            updated[as.item_key] = `camp:${foundCamp.id}`;
            updated[as.csv_ad_set_name] = `camp:${foundCamp.id}`;
            return;
          }

          updated[as.item_key] = `create_new:${as.csv_campaign_name}`;
          updated[as.csv_ad_set_name] = `create_new:${as.csv_campaign_name}`;
        });
      });
    } else if (previewData.distinct_campaigns) {
      previewData.distinct_campaigns.forEach((dc: any) => {
        const foundLine = lineItems.find(
          l =>
            (l.platform_campaign_id && l.platform_campaign_id === dc.platform_campaign_id) ||
            l.name.toLowerCase().includes(dc.campaign_name.toLowerCase()) ||
            dc.campaign_name.toLowerCase().includes(l.name.toLowerCase())
        );
        if (foundLine) {
          updated[dc.platform_campaign_id] = `line:${foundLine.id}`;
          return;
        }
        const foundCamp = campaigns.find(
          c =>
            c.name.toLowerCase().includes(dc.campaign_name.toLowerCase()) ||
            dc.campaign_name.toLowerCase().includes(c.name.toLowerCase())
        );
        if (foundCamp) {
          updated[dc.platform_campaign_id] = `camp:${foundCamp.id}`;
          return;
        }
        updated[dc.platform_campaign_id] = 'unmapped';
      });
    }

    setCampaignMatches(updated);
  };

  // Helper to set all CSV lines to create/map as line items in the chosen campaign
  const handleAutoCreateAllAsLineItems = (campId?: string) => {
    const targetId = campId || selectedCampaignId;
    if (!previewData || !targetId || targetId === 'auto_create') return;
    const updated = { ...campaignMatches };
    if (previewData.distinct_campaign_groups) {
      previewData.distinct_campaign_groups.forEach((g: any) => {
        updated[g.csv_campaign_name] = `camp:${targetId}`;
        g.ad_sets.forEach((as: any) => {
          updated[as.item_key] = `camp:${targetId}`;
          updated[as.csv_ad_set_name] = `camp:${targetId}`;
        });
      });
    }
    if (previewData.distinct_campaigns) {
      previewData.distinct_campaigns.forEach((dc: any) => {
        updated[dc.platform_campaign_id] = `camp:${targetId}`;
      });
    }
    setCampaignMatches(updated);
  };

  // Helper to set all unmatched rows to auto-create new campaign
  const handleAutoCreateMissingCampaigns = () => {
    if (!previewData) return;
    const updated = { ...campaignMatches };
    if (previewData.distinct_campaign_groups) {
      previewData.distinct_campaign_groups.forEach((g: any) => {
        const cur = updated[g.csv_campaign_name];
        if (!cur || cur === 'unmapped') {
          updated[g.csv_campaign_name] = `create_new:${g.csv_campaign_name}`;
        }
        g.ad_sets.forEach((as: any) => {
          const asCur = updated[as.item_key];
          if (!asCur || asCur === 'unmapped') {
            updated[as.item_key] = `create_new:${as.csv_campaign_name}`;
            updated[as.csv_ad_set_name] = `create_new:${as.csv_campaign_name}`;
          }
        });
      });
    }
    if (previewData.distinct_campaigns) {
      previewData.distinct_campaigns.forEach((dc: any) => {
        if (!updated[dc.platform_campaign_id] || updated[dc.platform_campaign_id] === '' || updated[dc.platform_campaign_id] === 'unmapped') {
          updated[dc.platform_campaign_id] = `create_new:${dc.campaign_name}`;
        }
      });
    }
    setCampaignMatches(updated);
  };

  // Helper to mark all unmapped campaigns to go to Unmapped Campaigns section
  const handleSetAllUnmatchedToUnmapped = () => {
    if (!previewData) return;
    const updated = { ...campaignMatches };
    if (previewData.distinct_campaign_groups) {
      previewData.distinct_campaign_groups.forEach((g: any) => {
        if (!updated[g.csv_campaign_name]) {
          updated[g.csv_campaign_name] = 'unmapped';
        }
        g.ad_sets.forEach((as: any) => {
          if (!updated[as.item_key]) {
            updated[as.item_key] = 'unmapped';
            updated[as.csv_ad_set_name] = 'unmapped';
          }
        });
      });
    }
    if (previewData.distinct_campaigns) {
      previewData.distinct_campaigns.forEach((dc: any) => {
        if (!updated[dc.platform_campaign_id] || updated[dc.platform_campaign_id] === '') {
          updated[dc.platform_campaign_id] = 'unmapped';
        }
      });
    }
    setCampaignMatches(updated);
  };

  // Execute Background Import - Direct to Unmapped Campaigns
  // One payload, used for both the dry run and the real thing, so the warning
  // can never describe a different import from the one that executes.
  const buildImportPayload = (directToUnmapped: boolean) => {
    const targetClient = clients.find(c => c.id === selectedClientId);
    const finalMapping = { ...mappings };
    if (!finalMapping['platform_campaign_id'] && finalMapping['campaign_name']) {
      finalMapping['platform_campaign_id'] = finalMapping['campaign_name'];
    }
    if (!finalMapping['campaign_name'] && finalMapping['platform_campaign_id']) {
      finalMapping['campaign_name'] = finalMapping['platform_campaign_id'];
    }
    return {
      client_id: selectedClientId,
      brand_id: selectedBrandId,
      campaign_id: selectedCampaignId && selectedCampaignId !== 'auto_create' ? selectedCampaignId : undefined,
      platform: selectedPlatform,
      file_name: fileName || `${selectedPlatform}_import.csv`,
      csv_content: csvContent,
      column_mapping: finalMapping,
      campaign_matches: {},
      currency: importCurrency || targetClient?.currency || 'LKR',
      direct_to_unmapped: directToUnmapped
    };
  };

  // Dry run on entering the review step, and again whenever the mapping or the
  // destination changes - both alter where rows land.
  useEffect(() => {
    if (step !== 3 || !currentAgency || !selectedClientId || !selectedBrandId || !csvContent) return;
    if (!mappings['report_date'] || !mappings['spend']) return;

    let cancelled = false;
    setImpactLoading(true);
    ApiService.previewImportImpact(currentAgency.id, buildImportPayload(true))
      .then(res => { if (!cancelled) setImpact(res); })
      .catch(() => { if (!cancelled) setImpact(null); })
      .finally(() => { if (!cancelled) setImpactLoading(false); });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, currentAgency?.id, selectedClientId, selectedBrandId, selectedCampaignId, csvContent, JSON.stringify(mappings), importCurrency]);

  const handleRevertImport = async (job: ImportJob) => {
    if (!currentAgency) return;
    if (!window.confirm(`Remove the data "${job.file_name}" imported?\n\nDays it overwrote will be left empty rather than restored to their previous values - re-import the correct file to refill them.`)) return;
    setRevertingId(job.id);
    try {
      const res = await ApiService.revertImport(currentAgency.id, job.id);
      const empty = res.line_items_left_empty || [];
      alert(
        `Removed ${res.metrics_removed} daily metric rows` +
        (res.unmapped_rows_removed ? ` and ${res.unmapped_rows_removed} unmapped rows` : '') + '.' +
        (empty.length ? `\n\n${empty.length} line item(s) now hold no data: ${empty.map((l: any) => l.name).join(', ')}` : '')
      );
      window.dispatchEvent(new CustomEvent('refresh-omnitrack'));
      window.dispatchEvent(new CustomEvent('campaigns-updated'));
      loadRecentImports();
    } catch (err: any) {
      alert(err.message || 'Failed to revert import');
    } finally {
      setRevertingId(null);
    }
  };

  const handleExecuteImport = async (directToUnmapped = true) => {
    if (!currentAgency) return;
    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const job = await ApiService.executeImport(currentAgency.id, buildImportPayload(directToUnmapped));

      setImportJob(job);
      setStep(4); // Summary / Ingestion step

      // Poll until completed
      const interval = setInterval(async () => {
        try {
          const imports = await ApiService.getImports(currentAgency.id);
          const updated = imports.find(i => i.id === job.id);
          if (updated) {
            setImportJob(updated);
            if (updated.status === 'completed' || updated.status === 'failed') {
              clearInterval(interval);
              setIsSubmitting(false);
              loadRecentImports();
              loadCampaigns();
              window.dispatchEvent(new CustomEvent('refresh-omnitrack'));
              window.dispatchEvent(new CustomEvent('unmapped-campaigns-updated'));
              if (onImportComplete) onImportComplete();
              if (directToUnmapped && onNavigateToUnmapped) {
                setTimeout(() => {
                  onNavigateToUnmapped();
                }, 900);
              }
            }
          }
        } catch {
          // keep polling
        }
      }, 500);
    } catch (err: any) {
      setErrorMsg(err.message);
      setIsSubmitting(false);
    }
  };

  const normalizedRequiredFields = [
    { key: 'report_date', label: 'Report Date / Day', required: true },
    { key: 'campaign_name', label: 'Campaign Name (Column A in Meta CSV)', required: false },
    { key: 'line_item_name', label: 'Line Item / Ad Set Name (Column B in Meta CSV)', required: false },
    { key: 'platform_campaign_id', label: 'Platform ID (Campaign / Ad Set ID)', required: false },
    { key: 'spend', label: 'Spend Amount', required: true },
    { key: 'budget', label: 'Budget Amount (Optional)', required: false },
    { key: 'impressions', label: 'Impressions', required: false },
    { key: 'reach', label: 'Reach', required: false },
    { key: 'clicks', label: 'Clicks', required: false },
    { key: 'conversions', label: 'Conversions', required: false },
    { key: 'video_views', label: 'Video Views', required: false }
  ];

  return (
    <div className="space-y-6">
      {/* Wizard Header */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <UploadCloud className="w-5 h-5 text-indigo-600" />
              CSV Metrics Ingestion Center
            </h2>
          </div>

          {/* Step Indicator */}
          <div className="flex items-center gap-1 text-xs">
            <span
              className={`px-2.5 py-1 rounded-md font-semibold ${
                step === 1 ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              1. Setup
            </span>
            <span className="text-slate-300">→</span>
            <span
              className={`px-2.5 py-1 rounded-md font-semibold ${
                step === 2 ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              2. Upload
            </span>
            <span className="text-slate-300">→</span>
            <span
              className={`px-2.5 py-1 rounded-md font-semibold ${
                step === 3 ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              3. Review & Ingest
            </span>
            <span className="text-slate-300">→</span>
            <span
              className={`px-2.5 py-1 rounded-md font-semibold ${
                step === 4 ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              4. Ingest to Unmapped
            </span>
          </div>
        </div>

        {errorMsg && (
          <div className="mt-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* STEP 1: Select Hierarchy & Platform */}
        {step === 1 && (
          <div className="mt-6 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">1. Target Client</label>
                <select
                  value={selectedClientId}
                  onChange={e => setSelectedClientId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.currency})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">2. Target Brand</label>
                <select
                  value={selectedBrandId}
                  onChange={e => setSelectedBrandId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  {brands.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">3. Target Campaign</label>
                <select
                  value={selectedCampaignId}
                  onChange={e => setSelectedCampaignId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="">— Direct to Unmapped Campaigns (Default) —</option>
                  <option value="auto_create">+ Create New Campaign for this CSV</option>
                  {campaigns.map(c => (
                    <option key={c.id} value={c.id}>
                      Attribute to: {c.name} ({c.currency})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">4. Source Platform</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedPlatform('meta')}
                    className={`px-3 py-2 rounded-lg text-xs font-bold border transition-colors flex items-center justify-center gap-1.5 ${
                      selectedPlatform === 'meta'
                        ? 'bg-blue-50 border-blue-400 text-blue-800'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Meta Ads</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedPlatform('tiktok')}
                    className={`px-3 py-2 rounded-lg text-xs font-bold border transition-colors flex items-center justify-center gap-1.5 ${
                      selectedPlatform === 'tiktok'
                        ? 'bg-slate-900 border-slate-900 text-white'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>TikTok Ads</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Note about Direct to Unmapped Workflow */}
            <div className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-100 flex items-start gap-3 text-xs text-indigo-950">
              <Sparkles className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block text-indigo-900 mb-0.5">
                  Direct Ingestion to Unmapped Campaigns
                </span>
                <span className="text-indigo-800/90 leading-relaxed">
                  Campaign matching and manual alignment steps are omitted. Once your CSV file is uploaded, all campaigns and ad sets are sent directly into the <strong>Unmapped Campaigns</strong> queue. You can assign, create campaigns, or link them anytime.
                </span>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100">
              <button
                onClick={() => setStep(2)}
                disabled={!selectedClientId || !selectedBrandId}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-xs"
              >
                <span>Continue to Upload</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Upload CSV or Instant Sample */}
        {step === 2 && (
          <div className="mt-6 space-y-6">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setStep(1)}
                className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 font-medium"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Setup</span>
              </button>
              <div className="text-xs text-slate-500">
                Selected Platform: <strong className="capitalize text-slate-900">{selectedPlatform}</strong>
              </div>
            </div>

            {/* Quick-Load Samples for rapid evaluator testing */}
            <div className="p-4 rounded-xl bg-indigo-50/60 border border-indigo-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  Instant Testing Data
                </h4>
                <p className="text-[11px] text-indigo-800">
                  Click to immediately test real Meta Ads or TikTok Ads export structures without leaving the app.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleLoadSample('meta')}
                  className="px-3 py-1.5 rounded-lg bg-white border border-indigo-200 text-indigo-700 text-xs font-semibold hover:bg-indigo-50 shadow-2xs"
                >
                  Load Meta Sample CSV
                </button>
                <button
                  type="button"
                  onClick={() => handleLoadSample('tiktok')}
                  className="px-3 py-1.5 rounded-lg bg-white border border-indigo-200 text-indigo-700 text-xs font-semibold hover:bg-indigo-50 shadow-2xs"
                >
                  Load TikTok Sample CSV
                </button>
              </div>
            </div>

            {/* Drag and Drop Zone */}
            <div
              onDragOver={handleDragOver}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all ${
                isDragging
                  ? 'border-indigo-600 bg-indigo-50/90 scale-[1.01] shadow-lg ring-4 ring-indigo-200'
                  : 'border-slate-300 hover:border-indigo-400 bg-slate-50/50'
              }`}
            >
              <div className={isDragging ? 'pointer-events-none' : ''}>
                <UploadCloud
                  className={`w-12 h-12 mx-auto mb-2 transition-transform duration-200 ${
                    isDragging ? 'text-indigo-600 scale-110 animate-bounce' : 'text-slate-400'
                  }`}
                />
                <p className="text-sm font-bold text-slate-800">
                  {isDragging ? 'Drop your report file right here!' : 'Drag & drop your exported report here'}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Supports CSV and Excel (.xlsx) reports from Meta Ads Manager, TikTok Ads, and Google Ads
                </p>
                <div className="mt-4">
                  <label className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer shadow-2xs hover:border-slate-400 transition-colors">
                    <span>Browse Local File</span>
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xlsm,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Preview Data & Map Columns */}
        {step === 3 && previewData && (
          <div className="mt-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase">3. Review Column Mapping & Ingest</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Confirm mapped columns. All line items will be ingested directly into Unmapped Campaigns.
                </p>
              </div>
              <button
                onClick={() => setStep(2)}
                className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1"
              >
                <ArrowLeft className="w-3 h-3" />
                <span>Change File</span>
              </button>
            </div>

            {/* Currency: detected from the file, or asked for when the file does not say */}
            {importCurrency ? (
              <div className="p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <span className="font-bold block text-emerald-900">
                      Report currency detected: {importCurrency}
                    </span>
                    <p className="text-[11px] text-emerald-800 mt-0.5">
                      {currencySource === 'column'
                        ? "Read from the file's currency column."
                        : currencySource === 'header'
                        ? `Read from the spend column header (${mappings['spend'] || 'spend'}).`
                        : 'Set manually for this import.'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setImportCurrency(null);
                    setCurrencySource(null);
                  }}
                  className="text-[11px] font-semibold text-emerald-800 hover:text-emerald-950 underline underline-offset-2 shrink-0 self-start sm:self-auto"
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <span className="font-bold block text-amber-900">Set the report currency</span>
                    <p className="text-[11px] text-amber-800 mt-0.5">
                      This file does not state a single currency, so spend cannot be labelled automatically. Choose the currency of the figures inside it before ingesting.
                    </p>
                  </div>
                </div>
                <div className="inline-flex rounded-lg p-1 bg-white border border-amber-300 shadow-2xs shrink-0">
                  {(['USD', 'LKR'] as const).map(code => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => {
                        setImportCurrency(code);
                        setCurrencySource(null);
                      }}
                      className="px-3 py-1 text-xs font-semibold rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-all"
                    >
                      {code === 'USD' ? 'USD ($)' : 'LKR (Rs.)'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Direct to Unmapped Banner */}
            <div className="p-3.5 rounded-xl bg-indigo-50/80 border border-indigo-200/80 flex items-start gap-3">
              <Sparkles className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <div className="text-xs text-indigo-950">
                <span className="font-bold block text-indigo-900">
                  Direct Ingestion to Unmapped Campaigns
                </span>
                <p className="text-[11px] text-indigo-800 mt-0.5 leading-relaxed">
                  Campaign matching has been omitted. Confirm the column mappings below and click <strong>Upload & Send Directly to Unmapped Campaigns</strong>. All rows will be safely collected in your unmapped queue with deduplication guaranteed.
                </p>
              </div>
            </div>

            {/* Column Mapping Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {normalizedRequiredFields.map(field => (
                <div key={field.key} className="p-3 rounded-lg border border-slate-200 bg-slate-50">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-slate-800">
                      {field.label} {field.required && <span className="text-rose-500">*</span>}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">{field.key}</span>
                  </div>
                  <select
                    value={mappings[field.key] || ''}
                    onChange={e => setMappings({ ...mappings, [field.key]: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded text-xs font-medium text-slate-900 bg-white outline-none"
                  >
                    <option value="">— Select CSV Column —</option>
                    {previewData.headers.map((h: string) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {previewData.empty_rows > 0 && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600">
                <strong className="text-slate-800">{previewData.empty_rows}</strong> of{' '}
                <strong className="text-slate-800">{previewData.total_rows}</strong> rows report no spend,
                impressions, clicks or conversions - days the ad set did not run. They will be skipped so
                they do not create empty line items or stretch campaign date ranges.
              </div>
            )}

            {/* Data Preview Table (First 5 Rows) */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-700 uppercase">First 5 Sample Rows</span>
              <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-48">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-600 font-semibold uppercase text-[10px]">
                    <tr>
                      {previewData.headers.map((h: string) => (
                        <th key={h} className="py-2 px-3 whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previewData.preview_rows.map((row: any, i: number) => (
                      <tr key={i} className="hover:bg-slate-50">
                        {previewData.headers.map((h: string) => (
                          <td key={h} className="py-2 px-3 whitespace-nowrap text-slate-700 font-mono text-[11px]">
                            {String(row[h] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* What this import will actually do, computed server-side from the
                same payload the ingest button sends. */}
            {impactLoading && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-500 flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Checking what this file will change...</span>
              </div>
            )}

            {!impactLoading && impact && (
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                  <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">Before you import</span>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {impact.file_first_date
                      ? <>This file covers <strong className="text-slate-700">{impact.file_first_date}</strong> to <strong className="text-slate-700">{impact.file_last_date}</strong>.</>
                      : 'No dated rows found in this file.'}
                  </p>
                </div>

                <div className="p-4 space-y-3">
                  {impact.summary.overlap_days > 0 && (
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-700">
                      <strong className="text-slate-900">{impact.summary.overlap_days} day(s)</strong> across{' '}
                      <strong className="text-slate-900">{impact.summary.existing_targets}</strong> existing line item(s)
                      already hold data and will be <strong>replaced</strong> by this file
                      {impact.summary.overlap_existing_spend > 0 && <> (currently {formatNumber(impact.summary.overlap_existing_spend, 2)} spend)</>}.
                      Re-uploading the same days is safe - they overwrite rather than add up.
                    </div>
                  )}

                  {impact.summary.new_targets > 0 && (
                    <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <strong className="block text-amber-950">
                            {impact.summary.new_targets} ad set(s) in this file match nothing you already have
                          </strong>
                          <p className="mt-0.5 leading-relaxed">
                            They will be created as new records. That is correct for genuinely new ad sets. If any of
                            them is one you already track that was <strong>renamed on the platform</strong>, importing
                            now counts its spend twice, under both names. Your export has no ad set ID column to
                            recognise a rename by - adding one (Meta: Ad Set ID, TikTok: Ad group ID) prevents this.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {impact.summary.overlap_days === 0 && impact.summary.new_targets === 0 && (
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600">
                      Nothing in this file overlaps existing data and nothing new will be created.
                    </div>
                  )}

                  <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-56">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-slate-50 text-slate-500 font-semibold uppercase text-[10px] sticky top-0">
                        <tr>
                          <th className="py-2 px-3">Ad set in file</th>
                          <th className="py-2 px-3">Destination</th>
                          <th className="py-2 px-3">Days</th>
                          <th className="py-2 px-3">Overlapping days</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {impact.targets.map((t: any) => {
                          const isNew = t.destination === 'new_line_item' || t.destination === 'new_unmapped';
                          return (
                            <tr key={t.item_key} className={isNew ? 'bg-amber-50/40' : ''}>
                              <td className="py-2 px-3 text-slate-800 font-medium truncate max-w-[240px]" title={t.label}>{t.label}</td>
                              <td className="py-2 px-3">
                                <span className={`px-1.5 py-0.5 rounded font-semibold ${isNew ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>
                                  {isNew ? 'Created new' : 'Existing'}
                                </span>
                                {t.line_item_name && <span className="text-slate-400 ml-1.5 truncate">{t.line_item_name}</span>}
                              </td>
                              <td className="py-2 px-3 text-slate-600">{t.days}</td>
                              <td className="py-2 px-3 text-slate-600">
                                {t.overlap_days > 0 ? `${t.overlap_days} (${t.overlap_first}..${t.overlap_last})` : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-between items-center pt-4 border-t border-slate-100">
              <button
                onClick={() => setStep(2)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Back to Upload
              </button>
              <button
                onClick={() => handleExecuteImport(true)}
                disabled={
                  isSubmitting ||
                  !importCurrency ||
                  !mappings['report_date'] ||
                  (!mappings['platform_campaign_id'] && !mappings['campaign_name'] && !mappings['line_item_name'] && !mappings['ad_set_name']) ||
                  !mappings['spend']
                }
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold disabled:opacity-50 shadow-xs transition-all cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Ingesting to Unmapped Campaigns...</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-4 h-4" />
                    <span>Upload & Send Directly to Unmapped Campaigns</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: Background Ingestion Status & Deduplication Summary */}
        {step === 4 && importJob && (
          <div className="mt-6 space-y-6">
            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  {importJob.status === 'completed' ? (
                    <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                  ) : importJob.status === 'processing' ? (
                    <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center">
                      <RefreshCw className="w-5 h-5 animate-spin" />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center">
                      <AlertCircle className="w-5 h-5" />
                    </div>
                  )}

                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      {importJob.status === 'completed'
                        ? 'Ingestion Completed — Queued in Unmapped Campaigns'
                        : importJob.status === 'processing'
                        ? 'Ingesting Rows to Unmapped Campaigns...'
                        : 'Ingestion Encountered Issues'}
                    </h3>
                    <p className="text-xs text-slate-500">File: {importJob.file_name}</p>
                  </div>
                </div>

                <span
                  className={`text-xs font-bold uppercase px-2.5 py-1 rounded-full ${
                    importJob.status === 'completed'
                      ? 'bg-emerald-100 text-emerald-800'
                      : importJob.status === 'processing'
                      ? 'bg-indigo-100 text-indigo-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {importJob.status}
                </span>
              </div>

              {/* Ingestion Metrics Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <div className="p-3 rounded-xl bg-white border border-slate-200">
                  <span className="text-[10px] text-slate-400 uppercase font-medium block">Total Rows Ingested</span>
                  <span className="text-lg font-bold text-slate-900">{importJob.total_rows}</span>
                </div>
                <div className="p-3 rounded-xl bg-white border border-slate-200">
                  <span className="text-[10px] text-slate-400 uppercase font-medium block">Sent to Unmapped</span>
                  <span className="text-lg font-bold text-emerald-700">+{importJob.skipped_count || importJob.total_rows}</span>
                </div>
                <div className="p-3 rounded-xl bg-white border border-slate-200">
                  <span className="text-[10px] text-slate-400 uppercase font-medium block" title="Prevented double-counting">
                    Deduplicated / Overwritten
                  </span>
                  <span className="text-lg font-bold text-indigo-700">{importJob.updated_count}</span>
                </div>
                <div className="p-3 rounded-xl bg-white border border-slate-200">
                  <span className="text-[10px] text-slate-400 uppercase font-medium block">Status</span>
                  <span className="text-lg font-bold text-emerald-600 capitalize">{importJob.status}</span>
                </div>
              </div>

              {(importJob.empty_rows_count || 0) > 0 && (
                <p className="text-[11px] text-slate-500">
                  {importJob.empty_rows_count} empty rows omitted (no spend, impressions, clicks or conversions).
                </p>
              )}

              {/* Direct to Unmapped Navigation Callout */}
              <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="font-bold block text-indigo-950">Queued in Unmapped Campaigns</span>
                  <p className="text-[11px] text-indigo-800 mt-0.5">
                    All line items from <strong>{importJob.file_name}</strong> have been ingested directly into the Unmapped Campaigns queue with metrics deduplicated.
                  </p>
                </div>
                {onNavigateToUnmapped && (
                  <button
                    onClick={onNavigateToUnmapped}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors shrink-0 cursor-pointer"
                  >
                    <span>View Unmapped Campaigns</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Deduplication Guarantee Note */}
              <div className="p-3 rounded-lg bg-emerald-50/80 border border-emerald-200 text-xs text-emerald-900">
                <strong>Deduplication: </strong>
                Daily metrics are keyed by <code>(agency_id, line_item_id, platform_campaign_id, report_date)</code>, so
                re-uploading the same days refreshes them instead of adding them up. An ad set renamed on the platform
                reads as a new one, though - include an ad set ID column in your export so renames are recognised.
                Any import can be undone from the history below.
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => {
                    setStep(1);
                    setCsvContent('');
                    setFileName('');
                    setPreviewData(null);
                  }}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Upload Another CSV
                </button>
                {onNavigateToUnmapped && (
                  <button
                    onClick={onNavigateToUnmapped}
                    className="px-4 py-2 rounded-lg border border-indigo-300 bg-indigo-50 text-indigo-700 text-xs font-semibold hover:bg-indigo-100"
                  >
                    Review Unmapped Campaigns
                  </button>
                )}
                {onImportComplete && (
                  <button
                    onClick={onImportComplete}
                    className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
                  >
                    View Updated Dashboard
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Recent Imports History Log */}
      {recentImports.length > 0 && (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-3">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Historical Ingestion Jobs</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase font-semibold">
                <tr>
                  <th className="py-2.5 px-3">File Name</th>
                  <th className="py-2.5 px-3">Platform</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Rows Processed</th>
                  <th className="py-2.5 px-3">Deduplicated Updates</th>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3 text-right">Undo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentImports.map(imp => (
                  <tr key={imp.id} className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-3 font-medium text-slate-800">{imp.file_name}</td>
                    <td className="py-2.5 px-3 uppercase text-[11px] font-bold text-slate-600">{imp.platform}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          imp.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : imp.status === 'processing'
                            ? 'bg-indigo-100 text-indigo-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {imp.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">{imp.processed_rows}</td>
                    <td className="py-2.5 px-3 text-indigo-600 font-semibold">{imp.updated_count}</td>
                    <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">
                      {imp.started_at ? new Date(imp.started_at).toLocaleTimeString() : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {imp.status === 'completed' && (
                        <button
                          type="button"
                          onClick={() => handleRevertImport(imp)}
                          disabled={revertingId === imp.id}
                          title="Remove the rows this import wrote"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-rose-700 bg-rose-50/80 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          {revertingId === imp.id
                            ? <RefreshCw className="w-3 h-3 animate-spin" />
                            : <Undo2 className="w-3 h-3" />}
                          <span>Revert</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
};
