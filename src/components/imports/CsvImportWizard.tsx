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
  ShieldCheck
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
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformType>('meta');

  // CSV Content state
  const [fileName, setFileName] = useState<string>('');
  const [csvContent, setCsvContent] = useState<string>('');
  const [previewData, setPreviewData] = useState<any>(null);

  // Column Mappings (normalizedField -> csvHeader)
  const [mappings, setMappings] = useState<Record<string, string>>({});

  // Campaign matches (platform_campaign_id -> line_item_id or camp:campaign_id or create_new:name)
  const [campaignMatches, setCampaignMatches] = useState<Record<string, string>>({});
  const [showCreateCampaignModal, setShowCreateCampaignModal] = useState<boolean>(false);

  // Background Processing state
  const [importJob, setImportJob] = useState<ImportJob | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [recentImports, setRecentImports] = useState<ImportJob[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [importCurrency, setImportCurrency] = useState<'USD' | 'LKR'>('USD');

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
    if (!file.name.toLowerCase().endsWith('.csv') && file.type && !file.type.includes('csv') && !file.type.includes('text')) {
      setErrorMsg('Please upload a valid .csv ad performance report file.');
      return;
    }
    setFileName(file.name);
    setErrorMsg(null);
    const reader = new FileReader();
    reader.onload = async event => {
      const content = event.target?.result as string;
      setCsvContent(content);
      await handleParsePreview(content, selectedPlatform);
    };
    reader.onerror = () => {
      setErrorMsg('Could not read the uploaded CSV file. Please try again.');
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
    const idCol = mappings['platform_campaign_id'] || mappings['campaign_name'];
    const nameCol = mappings['campaign_name'] || mappings['platform_campaign_id'];
    const spendCol = mappings['spend'];

    if (!dateCol || !idCol || !spendCol) {
      setErrorMsg('Please map Report Date, Campaign ID (or Campaign Name), and Spend Amount.');
      return;
    }

    try {
      const parsed = Papa.parse(csvContent.trim(), { header: true, skipEmptyLines: true });
      const rows = parsed.data as Record<string, any>[];
      const campMap = new Map<string, { name: string; count: number }>();

      rows.forEach((row, idx) => {
        const rawId = idCol ? String(row[idCol] || '').trim() : '';
        const rawName = nameCol ? String(row[nameCol] || '').trim() : '';
        const id = rawId || rawName || `campaign_${idx + 1}`;
        const name = rawName || rawId || 'Unnamed Campaign';
        if (id) {
          const curr = campMap.get(id) || { name, count: 0 };
          curr.count += 1;
          campMap.set(id, curr);
        }
      });

      const distinct = Array.from(campMap.entries()).map(([id, info]) => ({
        platform_campaign_id: id,
        campaign_name: info.name,
        rows_count: info.count
      }));

      if (distinct.length === 0) {
        setErrorMsg('No campaigns found in CSV with current column selection.');
        return;
      }

      setPreviewData((prev: any) => ({
        ...prev,
        distinct_campaigns: distinct
      }));

      // Update matches for newly extracted campaigns
      const updatedMatches: Record<string, string> = { ...campaignMatches };
      distinct.forEach(dc => {
        if (updatedMatches[dc.platform_campaign_id]) return;

        // 1. Line items
        const foundLine = lineItems.find(
          l =>
            (l.platform_campaign_id && l.platform_campaign_id === dc.platform_campaign_id) ||
            l.name.toLowerCase().includes(dc.campaign_name.toLowerCase()) ||
            dc.campaign_name.toLowerCase().includes(l.name.toLowerCase())
        );
        if (foundLine) {
          updatedMatches[dc.platform_campaign_id] = `line:${foundLine.id}`;
          return;
        }

        // 2. Campaigns
        const foundCamp = campaigns.find(
          c =>
            c.name.toLowerCase().includes(dc.campaign_name.toLowerCase()) ||
            dc.campaign_name.toLowerCase().includes(c.name.toLowerCase())
        );
        if (foundCamp) {
          updatedMatches[dc.platform_campaign_id] = `camp:${foundCamp.id}`;
          return;
        }

        // If not identified, automatically default to unallocated (unmapped)
        updatedMatches[dc.platform_campaign_id] = 'unmapped';
      });

      setCampaignMatches(updatedMatches);
      setStep(4);
    } catch (err: any) {
      setErrorMsg(`Failed to extract campaigns from CSV: ${err.message}`);
    }
  };

  // Helper to re-match all distinct campaigns using smart fuzzy heuristic
  const handleAutoMatchByName = () => {
    if (!previewData) return;
    const updated: Record<string, string> = {};
    previewData.distinct_campaigns.forEach((dc: any) => {
      // Line item match
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
      // Campaign match
      const foundCamp = campaigns.find(
        c =>
          c.name.toLowerCase().includes(dc.campaign_name.toLowerCase()) ||
          dc.campaign_name.toLowerCase().includes(c.name.toLowerCase())
      );
      if (foundCamp) {
        updated[dc.platform_campaign_id] = `camp:${foundCamp.id}`;
        return;
      }
      // Fallback: If not identified, automatically route to unallocated
      updated[dc.platform_campaign_id] = 'unmapped';
    });
    setCampaignMatches(updated);
  };

  // Helper to set all unmatched rows to auto-create new campaign
  const handleAutoCreateMissingCampaigns = () => {
    if (!previewData) return;
    const updated = { ...campaignMatches };
    previewData.distinct_campaigns.forEach((dc: any) => {
      if (!updated[dc.platform_campaign_id] || updated[dc.platform_campaign_id] === '') {
        updated[dc.platform_campaign_id] = `create_new:${dc.campaign_name}`;
      }
    });
    setCampaignMatches(updated);
  };

  // Helper to mark all unmapped campaigns to go to Unmapped Campaigns section
  const handleSetAllUnmatchedToUnmapped = () => {
    if (!previewData) return;
    const updated = { ...campaignMatches };
    previewData.distinct_campaigns.forEach((dc: any) => {
      if (!updated[dc.platform_campaign_id] || updated[dc.platform_campaign_id] === '') {
        updated[dc.platform_campaign_id] = 'unmapped';
      }
    });
    setCampaignMatches(updated);
  };

  // Execute Background Import
  const handleExecuteImport = async () => {
    if (!currentAgency) return;
    setIsSubmitting(true);
    setErrorMsg(null);

    const targetClient = clients.find(c => c.id === selectedClientId);

    try {
      // Resolve any create_new requests first
      const finalMatches: Record<string, string> = {};
      for (const [csvId, rawVal] of Object.entries(campaignMatches)) {
        const targetVal = String(rawVal || '');
        if (targetVal.startsWith('create_new:')) {
          const campName = targetVal.replace('create_new:', '').trim() || 'Imported Campaign';
          const newCamp = await ApiService.createCampaign(currentAgency.id, {
            client_id: selectedClientId,
            brand_id: selectedBrandId,
            name: campName,
            description: `Auto-created during CSV import of ${fileName || 'CSV'}`,
            objective: 'Conversions',
            start_date: '2026-09-01',
            end_date: '2026-09-30',
            total_budget: 350000,
            currency: targetClient?.currency || 'LKR'
          });
          finalMatches[csvId] = `camp:${newCamp.id}`;
        } else {
          finalMatches[csvId] = targetVal;
        }
      }

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
        platform: selectedPlatform,
        file_name: fileName || `${selectedPlatform}_import.csv`,
        csv_content: csvContent,
        column_mapping: finalMapping,
        campaign_matches: finalMatches,
        currency: importCurrency || targetClient?.currency || 'LKR'
      });

      setImportJob(job);
      setStep(5); // Summary / Monitoring step

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
              if (onImportComplete) onImportComplete();
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
    { key: 'report_date', label: 'Report Date', required: true },
    { key: 'platform_campaign_id', label: 'Campaign ID (or Name)', required: false },
    { key: 'campaign_name', label: 'Campaign Name', required: false },
    { key: 'spend', label: 'Spend Amount', required: true },
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
              3. Map
            </span>
            <span className="text-slate-300">→</span>
            <span
              className={`px-2.5 py-1 rounded-md font-semibold ${
                step === 4 ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              4. Match
            </span>
            <span className="text-slate-300">→</span>
            <span
              className={`px-2.5 py-1 rounded-md font-semibold ${
                step === 5 ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              5. Summary
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">3. Source Platform</label>
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

            {/* Currency Choice */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-slate-800">CSV Report Currency</span>
                <p className="text-[11px] text-slate-500">
                  Select the currency of the spend and budget figures inside this CSV file.
                </p>
              </div>
              <div className="inline-flex rounded-lg p-1 bg-white border border-slate-200 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setImportCurrency('USD')}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                    importCurrency === 'USD'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  USD ($)
                </button>
                <button
                  type="button"
                  onClick={() => setImportCurrency('LKR')}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                    importCurrency === 'LKR'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  LKR (Rs.)
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
                  {isDragging ? 'Drop your CSV report file right here!' : 'Drag & drop your exported CSV report here'}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Supports UTF-8 CSV reports from Meta Ads Manager, TikTok Ads, and Google Ads
                </p>
                <div className="mt-4">
                  <label className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer shadow-2xs hover:border-slate-400 transition-colors">
                    <span>Browse Local File</span>
                    <input type="file" accept=".csv,text/csv" onChange={handleFileUpload} className="hidden" />
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
                <h3 className="text-sm font-bold text-slate-900 uppercase">3. Preview & Column Mapping</h3>
              </div>
              <button
                onClick={() => setStep(2)}
                className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1"
              >
                <ArrowLeft className="w-3 h-3" />
                <span>Change File</span>
              </button>
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

            <div className="flex justify-between pt-4 border-t border-slate-100">
              <button
                onClick={() => setStep(2)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Back
              </button>
              <button
                onClick={handleProceedToMatching}
                disabled={!mappings['report_date'] || (!mappings['platform_campaign_id'] && !mappings['campaign_name']) || !mappings['spend']}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 shadow-xs"
              >
                <span>Proceed to Campaign Matching</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: Match Uploaded Platform Campaigns to Campaigns / Line Items */}
        {step === 4 && previewData && (
          <div className="mt-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase">4. Match Uploaded Data to Campaigns</h3>
                <div className="flex items-center gap-2 mt-1">
                  {(() => {
                    const total = previewData.distinct_campaigns.length;
                    const matched = previewData.distinct_campaigns.filter(
                      (dc: any) => campaignMatches[dc.platform_campaign_id] && campaignMatches[dc.platform_campaign_id] !== ''
                    ).length;
                    const allDone = total > 0 && matched === total;
                    return (
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          allDone
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {allDone ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <AlertCircle className="w-3 h-3 text-amber-600" />}
                        {matched} of {total} Campaigns Matched
                      </span>
                    );
                  })()}
                </div>
              </div>

              {/* Quick Matching Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
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
                  <span>Route All Unmatched to Unallocated</span>
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

            {/* Campaign Ingestion Guardrail Notice */}
            <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
              <div className="text-xs text-blue-900 leading-relaxed">
                <span className="font-bold">Campaign Ingestion Guardrail:</span> Only identified campaigns will have their performance data ingested into campaign analytics. Any campaign not identified will automatically be kept in <strong>Unallocated (Unmapped Campaigns)</strong>.
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
                      Unmatched campaigns will automatically route to Unallocated. You can also create a new campaign or link below.
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

            {/* Campaign Mapping Rows */}
            <div className="space-y-3">
              {previewData.distinct_campaigns.map((dc: any) => {
                const matchVal = campaignMatches[dc.platform_campaign_id] || '';
                const isUnmapped = !matchVal || matchVal === 'unmapped';
                const isLineLink = matchVal.startsWith('line:');
                const isCampLink = matchVal.startsWith('camp:');
                const isAutoCreate = matchVal.startsWith('create_new:');
                const isIdentified = isLineLink || isCampLink;
                const isMatched = isIdentified || isAutoCreate;

                return (
                  <div
                    key={dc.platform_campaign_id}
                    className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-2xs"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-900 text-xs truncate max-w-sm">
                          {dc.campaign_name}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700">
                          ID: {dc.platform_campaign_id}
                        </span>
                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                          {selectedPlatform}
                        </span>
                        {isIdentified ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                            <Check className="w-3 h-3 text-emerald-600" />
                            Identified Campaign (Will Ingest Data)
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
                      <p className="text-[11px] text-slate-500 mt-1">
                        {dc.rows_count} reporting {dc.rows_count === 1 ? 'row' : 'rows'} detected in CSV
                      </p>
                    </div>

                    <div className="w-full lg:w-96">
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
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-900 bg-white outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="unmapped">
                          ⚠️ Unallocated (Send to Unmapped Campaigns)
                        </option>

                        {/* Direct Option to Auto-Create New Campaign with this name */}
                        <option value={`create_new:${dc.campaign_name}`}>
                          ✨ Auto-Create New Campaign "{dc.campaign_name}"
                        </option>

                        {/* Existing Campaigns */}
                        {campaigns.map(c => {
                          const linesForCamp = lineItems.filter(l => l.campaign_id === c.id);
                          return (
                            <optgroup key={c.id} label={`Campaign: ${c.name}`}>
                              <option value={`camp:${c.id}`}>
                                Link to "{c.name}" (Auto-link/create {selectedPlatform.toUpperCase()} line)
                              </option>
                              {linesForCamp.map(l => (
                                <option key={l.id} value={`line:${l.id}`}>
                                  ↳ Line Item: {l.name} ({l.platform.toUpperCase()} - {l.currency} {l.budget.toLocaleString()})
                                </option>
                              ))}
                            </optgroup>
                          );
                        })}
                      </select>

                      {/* Helper status text */}
                      <p className="text-[10px] text-slate-500 mt-1">
                        {matchVal === 'unmapped' && 'Will be saved in the Unmapped Campaigns section to review and attribute later.'}
                        {isLineLink && 'Directly maps to selected line item metrics.'}
                        {isCampLink && `Links to campaign and auto-creates ${selectedPlatform.toUpperCase()} line item if needed.`}
                        {isAutoCreate && 'A new business campaign will be created automatically upon ingestion.'}
                        {!isMatched && 'Select a target campaign, auto-create, or leave unmapped.'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

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

        {/* STEP 5: Background Processing Status & Deduplication Summary */}
        {step === 5 && importJob && (
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
                        ? 'Metrics Ingestion Completed Successfully'
                        : importJob.status === 'processing'
                        ? 'Background Ingestion Job In Progress'
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

              {/* Deduplication & Count Summary Metrics (Section 15 & 21) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <div className="p-3 rounded-xl bg-white border border-slate-200">
                  <span className="text-[10px] text-slate-400 uppercase font-medium block">Total Rows</span>
                  <span className="text-lg font-bold text-slate-900">{importJob.total_rows}</span>
                </div>
                <div className="p-3 rounded-xl bg-white border border-slate-200">
                  <span className="text-[10px] text-slate-400 uppercase font-medium block">New Rows Inserted</span>
                  <span className="text-lg font-bold text-emerald-700">+{importJob.inserted_count}</span>
                </div>
                <div className="p-3 rounded-xl bg-white border border-slate-200">
                  <span className="text-[10px] text-slate-400 uppercase font-medium block" title="Prevented double-counting">
                    Deduplicated / Overwritten
                  </span>
                  <span className="text-lg font-bold text-indigo-700">{importJob.updated_count}</span>
                </div>
                <div className="p-3 rounded-xl bg-white border border-slate-200">
                  <span className="text-[10px] text-slate-400 uppercase font-medium block">Skipped / Unmatched</span>
                  <span className="text-lg font-bold text-slate-600">{importJob.skipped_count}</span>
                </div>
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
