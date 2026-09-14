import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { useAuth } from '../../context/AuthContext';
import { Client, Brand, Campaign, CampaignLineItem, PlatformType, ImportJob } from '../../types';
import { ApiService } from '../../lib/api';
import { CreateCampaignModal } from '../modals/CreateCampaignModal';
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Layers,
  Database,
  Sliders,
  Check,
  Download,
  Clock,
  Sparkles,
  Plus,
  Wand2,
  FolderPlus,
  ShieldCheck,
  Folder,
  ChevronDown,
  ChevronRight
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
  const [collapsedCampaigns, setCollapsedCampaigns] = useState<Record<string, boolean>>({});
  const [showCreateCampaignModal, setShowCreateCampaignModal] = useState<boolean>(false);

  // Background Processing state
  const [importJob, setImportJob] = useState<ImportJob | null>(null);
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

      rows.forEach((row, idx) => {
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
        setErrorMsg('No campaigns or line items found in CSV with current column selection.');
        return;
      }

      setPreviewData((prev: any) => ({
        ...prev,
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

  // Helper to toggle campaign card collapse
  const toggleCollapseCampaign = (campName: string) => {
    setCollapsedCampaigns(prev => ({ ...prev, [campName]: !prev[campName] }));
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
  const handleExecuteImport = async (directToUnmapped = true) => {
    if (!currentAgency) return;
    setIsSubmitting(true);
    setErrorMsg(null);

    const targetClient = clients.find(c => c.id === selectedClientId);

    try {
      // Ensure platform_campaign_id and campaign_name are aligned in column_mapping
      const finalMapping = { ...mappings };
      if (!finalMapping['platform_campaign_id'] && finalMapping['campaign_name']) {
        finalMapping['platform_campaign_id'] = finalMapping['campaign_name'];
      }
      if (!finalMapping['campaign_name'] && finalMapping['platform_campaign_id']) {
        finalMapping['campaign_name'] = finalMapping['platform_campaign_id'];
      }

      const job = await ApiService.executeImport(currentAgency.id, {
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
      });

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

        {/* STEP 4: Match Uploaded Platform Campaigns / Line Items (Omitted per user request) */}
        {false && previewData && (
          <div className="mt-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                  4. Map CSV Lines to Campaign Line Items
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Each line on a CSV is equal to a line item in a campaign.
                </p>
                <div className="flex items-center gap-2 mt-2">
                  {(() => {
                    const hasGroups = previewData.distinct_campaign_groups && previewData.distinct_campaign_groups.length > 0;
                    const total = hasGroups
                      ? previewData.distinct_campaign_groups.reduce((acc: number, g: any) => acc + g.ad_sets.length, 0)
                      : previewData.distinct_campaigns.length;
                    const matched = hasGroups
                      ? previewData.distinct_campaign_groups.reduce((acc: number, g: any) => {
                          const campTarget = campaignMatches[g.csv_campaign_name];
                          const mCount = g.ad_sets.filter((as: any) => {
                            const m = campaignMatches[as.item_key] || campaignMatches[as.csv_ad_set_name] || campTarget;
                            return m && m !== '' && m !== 'unmapped';
                          }).length;
                          return acc + mCount;
                        }, 0)
                      : previewData.distinct_campaigns.filter(
                          (dc: any) => campaignMatches[dc.platform_campaign_id] && campaignMatches[dc.platform_campaign_id] !== '' && campaignMatches[dc.platform_campaign_id] !== 'unmapped'
                        ).length;
                    const allDone = total > 0 && matched === total;
                    return (
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          allDone
                            ? 'bg-emerald-100 text-emerald-800'
                            : matched > 0
                            ? 'bg-indigo-100 text-indigo-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {allDone ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <Layers className="w-3 h-3 text-indigo-600" />}
                        {matched} of {total} Line Items Assigned to Campaigns
                      </span>
                    );
                  })()}
                </div>
              </div>

              {/* Quick Matching Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                {selectedCampaignId && selectedCampaignId !== 'auto_create' && (
                  <button
                    type="button"
                    onClick={() => handleAutoCreateAllAsLineItems(selectedCampaignId)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 text-xs font-bold text-indigo-800 shadow-2xs transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Auto-Create Line Items in Target Campaign</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleAutoMatchByName}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-colors"
                >
                  <Wand2 className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Auto-Match by Name</span>
                </button>
                <button
                  type="button"
                  onClick={handleSetAllUnmatchedToUnmapped}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50/70 hover:bg-amber-100/70 text-xs font-semibold text-amber-800 shadow-2xs transition-colors"
                >
                  <span>Route All to Unallocated</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateCampaignModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-800 hover:bg-slate-900 text-xs font-semibold text-white shadow-2xs transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Campaign</span>
                </button>
              </div>
            </div>

            {/* Ingestion Rule & Target Campaign Bar */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Layers className="w-4 h-4 text-indigo-600 shrink-0" />
                  <div>
                    <span className="text-xs font-bold text-slate-900">Campaign Assignment for CSV Line Items:</span>
                    <span className="text-xs text-slate-500 ml-1.5">
                      Select an overarching campaign for these lines, or configure individually below.
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={selectedCampaignId}
                    onChange={e => {
                      const newId = e.target.value;
                      setSelectedCampaignId(newId);
                      if (newId && newId !== 'auto_create') {
                        handleAutoCreateAllAsLineItems(newId);
                      }
                    }}
                    className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-medium text-slate-800 bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    <option value="">— Assign per line item below —</option>
                    <option value="auto_create">+ Create New Campaign for this CSV</option>
                    {campaigns.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.currency})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Explicit Rule Banner */}
              <div className="p-3 rounded-lg bg-indigo-50/70 border border-indigo-100 flex items-start gap-2.5 text-xs text-indigo-950">
                <Sparkles className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
                <div className="leading-relaxed">
                  <strong>Granularity Note:</strong> Each line on the CSV is equal to a line item in a campaign. When imported, each distinct line will be created or updated as an individual media execution line item under the designated campaign, preserving all ad-set and creative metrics.
                </div>
              </div>
            </div>

            {/* Campaign Ingestion Guardrail Notice */}
            <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
              <div className="text-xs text-blue-900 leading-relaxed">
                <span className="font-bold">Campaign Ingestion Guardrail:</span> Only identified campaigns and line items will have their performance data ingested into campaign analytics. Any line item marked <strong>Unallocated</strong> will be routed to the <strong>Unmapped Campaigns</strong> section.
              </div>
            </div>

            {/* If no existing campaigns */}
            {campaigns.length === 0 && (
              <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <FolderPlus className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <span className="text-xs font-bold text-amber-900">No Existing Campaigns for this Brand</span>
                    <p className="text-[11px] text-amber-700 mt-0.5">
                      Unmatched line items will automatically route to Unallocated. You can also create a new campaign above or link below.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateCampaignModal(true)}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 shrink-0"
                >
                  Create Campaign First
                </button>
              </div>
            )}

            {/* Hierarchical Campaign Groups & Ad Sets Mapping */}
            {previewData.distinct_campaign_groups && previewData.distinct_campaign_groups.length > 0 ? (
              <div className="space-y-4">
                {previewData.distinct_campaign_groups.map((group: any) => {
                  const isCollapsed = !!collapsedCampaigns[group.csv_campaign_name];
                  const campTargetVal = campaignMatches[group.csv_campaign_name] || '';
                  const mappedCount = group.ad_sets.filter((as: any) => {
                    const m = campaignMatches[as.item_key] || campaignMatches[as.csv_ad_set_name] || campTargetVal;
                    return m && m !== '' && m !== 'unmapped';
                  }).length;

                  return (
                    <div
                      key={group.csv_campaign_name}
                      className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs hover:border-slate-300 transition-colors"
                    >
                      {/* Campaign Group Header (Column A) */}
                      <div className="p-4 bg-slate-50/90 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => toggleCollapseCampaign(group.csv_campaign_name)}
                            className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-600 mt-0.5 cursor-pointer shrink-0 transition-colors"
                            title={isCollapsed ? 'Expand Ad Sets' : 'Collapse Ad Sets'}
                          >
                            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 mb-1.5">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                                Column A Campaign
                              </span>
                              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                                mappedCount === group.ad_sets.length 
                                  ? 'text-emerald-700 bg-emerald-50 border-emerald-200' 
                                  : 'text-indigo-700 bg-indigo-50 border-indigo-200'
                              }`}>
                                {mappedCount} of {group.ad_sets.length} Line Items Mapped
                              </span>
                            </div>
                            <h4 
                              className="text-sm font-bold text-slate-900 leading-snug break-words selection:bg-indigo-100" 
                              title={group.csv_campaign_name}
                            >
                              {group.csv_campaign_name}
                            </h4>
                            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-2">
                              <span>{group.ad_sets.length} Ad Sets / Line Items</span>
                              <span>•</span>
                              <span>{group.rows_count} Total Rows</span>
                              <span>•</span>
                              <span className="font-semibold text-slate-700">
                                Total Spend: {group.total_spend.toLocaleString()} {importCurrency}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Campaign-Level Target Action */}
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 shrink-0 bg-white lg:bg-slate-100/70 p-2.5 lg:p-2 rounded-lg border border-slate-200">
                          <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">
                            Map Campaign to:
                          </span>
                          <select
                            value={campTargetVal}
                            onChange={e => handleSetCampaignTarget(group.csv_campaign_name, e.target.value)}
                            className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-medium text-slate-900 bg-white outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-auto min-w-[240px] max-w-sm"
                          >
                            <option value="">— Select Target Campaign —</option>
                            <option value={`create_new:${group.csv_campaign_name}`}>
                              ✨ Auto-Create Campaign "{group.csv_campaign_name}"
                            </option>
                            <option value="unmapped">
                              ⚠️ Route entire campaign to Unallocated
                            </option>
                            {campaigns.map(c => (
                              <option key={c.id} value={`camp:${c.id}`}>
                                Existing Campaign: {c.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Nested Ad Sets / Line Items (Column B) */}
                      {!isCollapsed && (
                        <div className="p-4 space-y-3 divide-y divide-slate-100">
                          {group.ad_sets.map((as: any, idx: number) => {
                            const matchVal = campaignMatches[as.item_key] || campaignMatches[as.csv_ad_set_name] || campTargetVal || '';
                            const isLineLink = matchVal.startsWith('line:');
                            const isCampLink = matchVal.startsWith('camp:');
                            const isAutoCreate = matchVal.startsWith('create_new:');
                            const isUnmapped = !matchVal || matchVal === 'unmapped';

                            let targetCampName = '';
                            if (isCampLink) {
                              const cId = matchVal.replace('camp:', '');
                              const c = campaigns.find(item => item.id === cId);
                              if (c) targetCampName = c.name;
                            }

                            return (
                              <div
                                key={as.item_key || idx}
                                className={`pt-3 first:pt-0 flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 p-3 rounded-xl transition-colors ${
                                  isUnmapped ? 'bg-amber-50/40 border border-amber-100' : 'hover:bg-slate-50 border border-transparent'
                                }`}
                              >
                                <div className="flex-1 min-w-0 pr-0 lg:pr-4">
                                  {/* Badges */}
                                  <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded shrink-0">
                                      Col B Line Item
                                    </span>
                                    {isLineLink ? (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                        <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                                        Direct Line Item Match
                                      </span>
                                    ) : isCampLink ? (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                                        <Sparkles className="w-3 h-3 text-indigo-600 shrink-0" />
                                        Line Item in {targetCampName || 'Campaign'}
                                      </span>
                                    ) : isAutoCreate ? (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                                        <Sparkles className="w-3 h-3 text-indigo-600 shrink-0" />
                                        Auto-Create Campaign
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                        Unallocated (Routes to Unmapped)
                                      </span>
                                    )}
                                  </div>

                                  {/* Full Ad Set Name without truncating */}
                                  <div
                                    className="text-xs font-semibold text-slate-900 leading-relaxed break-words selection:bg-indigo-100"
                                    title={as.csv_ad_set_name}
                                  >
                                    {as.csv_ad_set_name}
                                  </div>

                                  {/* Metrics */}
                                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 mt-1.5">
                                    <span>{as.rows_count} {as.rows_count === 1 ? 'row' : 'rows'}</span>
                                    <span>•</span>
                                    <span className="font-medium text-slate-700">Spend: {as.total_spend.toLocaleString()} {importCurrency}</span>
                                  </div>
                                </div>

                                <div className="w-full lg:w-80 xl:w-96 shrink-0">
                                  <select
                                    value={matchVal}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setCampaignMatches(prev => ({
                                        ...prev,
                                        [as.item_key]: val,
                                        [as.csv_ad_set_name]: val
                                      }));
                                    }}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-900 bg-white outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                                  >
                                    <option value="unmapped">
                                      ⚠️ Unallocated (Send to Unmapped)
                                    </option>
                                    <option value={`create_new:${group.csv_campaign_name}`}>
                                      ✨ Auto-Create Line Item under "{group.csv_campaign_name}"
                                    </option>
                                    {campaigns.map(c => {
                                      const linesForCamp = lineItems.filter(l => l.campaign_id === c.id);
                                      return (
                                        <optgroup key={c.id} label={`Campaign: ${c.name}`}>
                                          <option value={`camp:${c.id}`}>
                                            Ingest as Line Item in "{c.name}"
                                          </option>
                                          {linesForCamp.map(l => (
                                            <option key={l.id} value={`line:${l.id}`}>
                                              ↳ Match Line: {l.name}
                                            </option>
                                          ))}
                                        </optgroup>
                                      );
                                    })}
                                  </select>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Flat list fallback */
              <div className="space-y-3">
                {previewData.distinct_campaigns.map((dc: any) => {
                  const matchVal = campaignMatches[dc.platform_campaign_id] || '';
                  const isUnmapped = !matchVal || matchVal === 'unmapped';
                  const isLineLink = matchVal.startsWith('line:');
                  const isCampLink = matchVal.startsWith('camp:');
                  const isAutoCreate = matchVal.startsWith('create_new:');
                  const isIdentified = isLineLink || isCampLink;
                  const isMatched = isIdentified || isAutoCreate;

                  // Find campaign name if camp: link
                  let targetCampName = '';
                  if (isCampLink) {
                    const campId = matchVal.replace('camp:', '');
                    const c = campaigns.find(item => item.id === campId);
                    if (c) targetCampName = c.name;
                  }

                  return (
                    <div
                      key={dc.platform_campaign_id}
                      className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-2xs"
                    >
                      <div className="flex-1 min-w-0 pr-0 lg:pr-4">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                            {selectedPlatform}
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700">
                            Line ID: {dc.platform_campaign_id}
                          </span>
                          {isLineLink ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                              <Check className="w-3 h-3 text-emerald-600" />
                              Direct Line Item Match
                            </span>
                          ) : isCampLink ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                              <Sparkles className="w-3 h-3 text-indigo-600" />
                              Will Ingest as Line Item in {targetCampName || 'Campaign'}
                            </span>
                          ) : isAutoCreate ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                              <Sparkles className="w-3 h-3 text-indigo-600" />
                              Auto-Create Campaign
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                              Unallocated (Routes to Unmapped)
                            </span>
                          )}
                        </div>
                        <h4
                          className="font-bold text-slate-900 text-xs leading-snug break-words selection:bg-indigo-100"
                          title={dc.campaign_name}
                        >
                          {dc.campaign_name}
                        </h4>
                        <p className="text-[11px] text-slate-500 mt-1">
                          {dc.rows_count} reporting {dc.rows_count === 1 ? 'row' : 'rows'} detected in CSV
                          {dc.total_spend !== undefined && ` • Spend: ${dc.total_spend.toLocaleString()} ${importCurrency}`}
                        </p>
                      </div>

                      <div className="w-full lg:w-80 xl:w-96 shrink-0">
                        <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                          Target Campaign / Line Item
                        </label>
                        <select
                          value={matchVal}
                          onChange={e =>
                            setCampaignMatches({
                              ...campaignMatches,
                              [dc.platform_campaign_id]: e.target.value
                            })
                          }
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-900 bg-white outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                        >
                          <option value="unmapped">
                            ⚠️ Unallocated (Send to Unmapped Campaigns)
                          </option>
                          <option value={`create_new:${dc.campaign_name}`}>
                            ✨ Auto-Create New Campaign "{dc.campaign_name}"
                          </option>
                          {campaigns.map(c => {
                            const linesForCamp = lineItems.filter(l => l.campaign_id === c.id);
                            return (
                              <optgroup key={c.id} label={`Campaign: ${c.name}`}>
                                <option value={`camp:${c.id}`}>
                                  Ingest as Line Item in "{c.name}"
                                </option>
                                {linesForCamp.map(l => (
                                  <option key={l.id} value={`line:${l.id}`}>
                                    ↳ Existing Line: {l.name} ({l.platform.toUpperCase()} - {l.currency} {l.budget.toLocaleString()})
                                  </option>
                                ))}
                              </optgroup>
                            );
                          })}
                        </select>
                        <p className="text-[10px] text-slate-500 mt-1">
                          {matchVal === 'unmapped' && 'Will be saved in Unmapped Campaigns to review and attribute later.'}
                          {isLineLink && 'Directly maps performance metrics into the selected existing line item.'}
                          {isCampLink && `Creates/updates line item under "${targetCampName || 'Campaign'}" with metrics from this CSV line.`}
                          {isAutoCreate && 'A new campaign will be created with this line item upon ingestion.'}
                          {!isMatched && 'Select a target campaign or leave unmapped.'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex justify-between pt-4 border-t border-slate-100">
              <button
                onClick={() => setStep(3)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Back to Mapping
              </button>
              <button
                onClick={handleExecuteImport}
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-xs"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Processing Ingestion Job...</span>
                  </>
                ) : (
                  <>
                    <Database className="w-4 h-4" />
                    <span>Confirm & Ingest Metrics</span>
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
                <strong>Deduplication Verified: </strong>
                Daily metrics are keyed by composite tuple <code>(agency_id, line_item_id, platform_campaign_id, report_date)</code>.
                Re-uploading records for existing dates automatically refreshes values without inflating or double-counting spend.
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Campaign Modal */}
      {showCreateCampaignModal && (
        <CreateCampaignModal
          onClose={() => setShowCreateCampaignModal(false)}
          onCreated={() => {
            setShowCreateCampaignModal(false);
            loadCampaigns();
          }}
        />
      )}
    </div>
  );
};
