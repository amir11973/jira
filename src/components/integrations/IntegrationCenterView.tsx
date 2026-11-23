import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookmarkCheck,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Database,
  Download,
  Eye,
  FileSpreadsheet,
  FolderPlus,
  GitCompare,
  History,
  Layers,
  Link2,
  Loader2,
  Pause,
  Play,
  Plug,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  Unplug,
  Upload,
  Wand2,
} from 'lucide-react';
import { useJira } from '../../context/JiraContext';
import {
  ConflictPolicy,
  DestinationModule,
  ExcelParsedWorkbook,
  ExcelTemplateType,
  FieldMappingRule,
  IntegrationAuditLogRecord,
  IntegrationAuthMethod,
  IntegrationConfigRecord,
  IntegrationConflictRecord,
  IntegrationConnectionSummary,
  IntegrationImportResult,
  IntegrationJobRecord,
  IntegrationSource,
  MappingTemplate,
  SourceFieldMeta,
  TransformationType,
} from '../../types/jira';
import {
  formatLocalizedDateTime,
  formatLocalizedNumber,
} from '../../utils/i18n';
import {
  buildIntegrationPayload,
  checkFieldCompatibility,
  DESTINATION_FIELDS_BY_MODULE,
  mapStatusValue,
  suggestAutoMappings,
  validateMappingRules,
} from '../../utils/integrationEngine';
import {
  ConfluenceBrandIcon,
  ExcelBrandIcon,
  JiraBrandIcon,
} from './IntegrationIcons';

type CenterTab =
  | 'overview'
  | 'wizard'
  | 'jobs'
  | 'conflicts'
  | 'templates_schedules'
  | 'history';

const TRANSFORM_LABELS: Record<
  TransformationType,
  { en: string; fa: string }
> = {
  direct: { en: 'Direct Copy', fa: 'انتقال مستقیم' },
  rich_text: { en: 'Rich Text -> Clean Text', fa: 'تبدیل متن غنی / HTML' },
  user_lookup: { en: 'User Lookup (Email/Name)', fa: 'تطبیق کاربر' },
  date_normalize: { en: 'Date Normalization (Jalali/ISO)', fa: 'نرمال‌سازی تاریخ (شمسی/میلادی)' },
  status_map: { en: 'Status Mapping', fa: 'نگاشت وضعیت گردش‌کار' },
  priority_normalize: { en: 'Priority Normalization', fa: 'نرمال‌سازی اولویت' },
  number_parse: { en: 'Number Parse', fa: 'تبدیل عددی' },
  list_split: { en: 'List Split (CSV/Array)', fa: 'تفکیک فهرست برچسب‌ها' },
  constant: { en: 'Constant / Default Only', fa: 'مقدار ثابت پیش‌فرض' },
};

const DESTINATION_MODULE_LABELS: Record<
  DestinationModule,
  { en: string; fa: string }
> = {
  work_items: { en: 'Work Items (Tasks / Stories / Bugs)', fa: 'موارد کاری (تسک / استوری / باگ)' },
  wbs: { en: 'WBS (Work Breakdown Structure)', fa: 'ساختار شکست کار (WBS)' },
  epics: { en: 'Epics (Roadmap Initiatives)', fa: 'اپیک‌ها (نقشه راه)' },
  projects: { en: 'Projects / Spaces', fa: 'پروژه‌ها / فضاهای کاری' },
  documents: { en: 'Space Documents (Docs)', fa: 'مستندات و دانش فضا (Docs)' },
  resources: { en: 'Resources (Users / Teams / Assets)', fa: 'منابع (کاربران / تیم‌ها / دارایی‌ها)' },
  schedules: { en: 'Schedules (Sprints & Timelines)', fa: 'زمان‌بندی و اسپرینت‌ها' },
  risks: { en: 'Risks Register', fa: 'ثبت و مدیریت ریسک‌ها' },
  budgets: { en: 'Project Budgets & Costs', fa: 'بودجه و هزینه‌های پروژه' },
  milestones: { en: 'Milestones', fa: 'نقاط عطف (Milestones)' },
};

const EXCEL_TEMPLATE_BUTTONS: Array<{
  type: ExcelTemplateType;
  labelEn: string;
  labelFa: string;
}> = [
  { type: 'project', labelEn: 'Project', labelFa: 'پروژه' },
  { type: 'task', labelEn: 'Task / Work Item', labelFa: 'وظایف' },
  { type: 'wbs', labelEn: 'WBS & Schedule', labelFa: 'ساختار شکست (WBS)' },
  { type: 'resource', labelEn: 'Resource', labelFa: 'منابع' },
  { type: 'risk', labelEn: 'Risk', labelFa: 'ریسک' },
  { type: 'all', labelEn: 'Full Multi-Sheet', labelFa: 'قالب کامل (همه)' },
];

const CONFLICT_POLICY_LABELS: Record<
  ConflictPolicy,
  { en: string; fa: string }
> = {
  manual_review: { en: 'Flag for Manual Review', fa: 'ثبت برای بررسی دستی (پیشنهادی)' },
  source_wins: { en: 'Source Always Wins', fa: 'اولویت با داده منبع (Source Wins)' },
  destination_wins: { en: 'Keep Local Changes', fa: 'حفظ تغییرات محلی (Local Wins)' },
};

export const IntegrationCenterView: React.FC = () => {
  const {
    language,
    projects,
    currentProject,
    workflows,
    users,
    issues,
    currentUser,
    apiFetch,
    importIntegrationData,
    updateIssue,
    recentExcelImports,
    addRecentExcelImport,
    mappingTemplates,
    saveMappingTemplate,
    deleteMappingTemplate,
    syncHistory,
    addSyncHistoryRecord,
    setCurrentProjectId,
    setActiveView,
    showToast,
  } = useJira();

  const isFa = language === 'fa';
  const [activeTab, setActiveTab] = useState<CenterTab>('overview');

  // Server summary state
  const [connections, setConnections] = useState<{
    jira: IntegrationConnectionSummary | null;
    confluence: IntegrationConnectionSummary | null;
  }>({ jira: null, confluence: null });
  const [loadingState, setLoadingState] = useState<boolean>(true);
  const [checkingHealth, setCheckingHealth] = useState<'jira' | 'confluence' | null>(null);
  const [syncingProvider, setSyncingProvider] = useState<IntegrationSource | null>(null);
  const [downloadingTemplate, setDownloadingTemplate] = useState<ExcelTemplateType | null>(null);

  // Jobs, Conflicts, Configs, Audit state
  const [jobs, setJobs] = useState<IntegrationJobRecord[]>([]);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [expandedJobDetails, setExpandedJobDetails] = useState<IntegrationJobRecord | null>(null);
  const [conflicts, setConflicts] = useState<IntegrationConflictRecord[]>([]);
  const [conflictFilter, setConflictFilter] = useState<'all' | 'pending' | 'resolved'>('pending');
  const [conflictMergeChoices, setConflictMergeChoices] = useState<
    Record<string, Record<string, 'source' | 'destination'>>
  >({});
  const [resolvingConflictId, setResolvingConflictId] = useState<string | null>(null);
  const [configs, setConfigs] = useState<IntegrationConfigRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<IntegrationAuditLogRecord[]>([]);
  const [auditProviderFilter, setAuditProviderFilter] = useState<string>('all');

  // Sync Config builder form
  const [cfgName, setCfgName] = useState('');
  const [cfgProvider, setCfgProvider] = useState<'jira' | 'confluence'>('jira');
  const [cfgTargetProjectId, setCfgTargetProjectId] = useState(currentProject.id);
  const [cfgDestinationModule, setCfgDestinationModule] = useState<DestinationModule>('work_items');
  const [cfgScopesText, setCfgScopesText] = useState('');
  const [cfgJql, setCfgJql] = useState('');
  const [cfgSyncMode, setCfgSyncMode] = useState<'manual' | 'scheduled'>('scheduled');
  const [cfgIntervalMinutes, setCfgIntervalMinutes] = useState<number>(60);
  const [cfgConflictPolicy, setCfgConflictPolicy] = useState<ConflictPolicy>('manual_review');
  const [cfgEnabled, setCfgEnabled] = useState<boolean>(true);
  const [savingConfig, setSavingConfig] = useState(false);

  // Wizard state
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedSource, setSelectedSource] = useState<IntegrationSource>('jira');

  // Step 2: Jira & Confluence auth form
  const [serverUrl, setServerUrl] = useState('');
  const [authMethod, setAuthMethod] = useState<IntegrationAuthMethod>('api_token');
  const [authEmail, setAuthEmail] = useState('');
  const [authUsername, setAuthUsername] = useState('');
  const [authSecret, setAuthSecret] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  // Step 2: Excel parse state
  const [excelWorkbook, setExcelWorkbook] = useState<ExcelParsedWorkbook | null>(null);
  const [lastExcelPayload, setLastExcelPayload] = useState<{
    fileName: string;
    base64Data: string;
  } | null>(null);
  const [selectedSheetName, setSelectedSheetName] = useState<string>('');
  const [manualHeaderRow, setManualHeaderRow] = useState<string>('');
  const [showRawMatrix, setShowRawMatrix] = useState(false);
  const [parsingExcel, setParsingExcel] = useState(false);
  const [excelError, setExcelError] = useState<string | null>(null);

  // Step 3: Scope, Incremental & Target configuration
  const [selectedRemoteKeys, setSelectedRemoteKeys] = useState<string[]>([]);
  const [jiraJql, setJiraJql] = useState('');
  const [incrementalOnly, setIncrementalOnly] = useState(false);
  const [updatedSinceInput, setUpdatedSinceInput] = useState('');
  const [destinationModule, setDestinationModule] = useState<DestinationModule>('work_items');
  const [conflictPolicy, setConflictPolicy] = useState<ConflictPolicy>('manual_review');
  const [targetSpaceMode, setTargetSpaceMode] = useState<'existing' | 'new'>('existing');
  const [targetProjectId, setTargetProjectId] = useState<string>(currentProject.id);
  const [newSpaceKey, setNewSpaceKey] = useState('IMP');
  const [newSpaceName, setNewSpaceName] = useState('');
  const [newSpaceNameFa, setNewSpaceNameFa] = useState('');
  const [newSpaceTemplate, setNewSpaceTemplate] = useState<'scrum' | 'kanban' | 'business'>('scrum');
  const [discovering, setDiscovering] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);

  // Step 4: Discovered fields, raw data, mappings, status map & preview
  const [sourceFields, setSourceFields] = useState<SourceFieldMeta[]>([]);
  const [rawRows, setRawRows] = useState<Array<Record<string, unknown>>>([]);
  const [discoveredSprints, setDiscoveredSprints] = useState<
    Array<{ id: string; name: string; goal: string; state: string; startDate?: string; endDate?: string }>
  >([]);
  const [discoveredStatuses, setDiscoveredStatuses] = useState<string[]>([]);
  const [mappings, setMappings] = useState<FieldMappingRule[]>([]);
  const [statusMap, setStatusMap] = useState<Record<string, string>>({});
  const [autoCreateMissingStatuses, setAutoCreateMissingStatuses] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [templateNameInput, setTemplateNameInput] = useState('');
  const [executingImport, setExecutingImport] = useState(false);
  const [queueingJob, setQueueingJob] = useState(false);
  const [importResult, setImportResult] = useState<IntegrationImportResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const refreshServerState = useCallback(async () => {
    setLoadingState(true);
    try {
      const [stateRes, conflictsRes, auditRes] = await Promise.all([
        apiFetch('/api/integrations/state'),
        apiFetch('/api/integrations/conflicts'),
        apiFetch('/api/integrations/audit'),
      ]);
      if (stateRes.ok) {
        const data = (await stateRes.json()) as {
          connections?: {
            jira: IntegrationConnectionSummary | null;
            confluence: IntegrationConnectionSummary | null;
          };
          configs?: IntegrationConfigRecord[];
          jobs?: IntegrationJobRecord[];
        };
        if (data.connections) setConnections(data.connections);
        if (data.configs) setConfigs(data.configs);
        if (data.jobs) setJobs(data.jobs);
      }
      if (conflictsRes.ok) {
        const cData = (await conflictsRes.json()) as {
          conflicts?: IntegrationConflictRecord[];
        };
        if (cData.conflicts) setConflicts(cData.conflicts);
      }
      if (auditRes.ok) {
        const aData = (await auditRes.json()) as {
          logs?: IntegrationAuditLogRecord[];
        };
        if (aData.logs) setAuditLogs(aData.logs);
      }
    } catch {
      // keep existing UI state gracefully
    } finally {
      setLoadingState(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    void refreshServerState();
  }, [refreshServerState]);

  const hasActiveJobs = useMemo(
    () => jobs.some(j => j.status === 'queued' || j.status === 'running'),
    [jobs]
  );

  // Poll jobs every 2 seconds while any job is active or user is viewing Jobs tab
  useEffect(() => {
    if (!hasActiveJobs && activeTab !== 'jobs') return;
    const timer = window.setInterval(async () => {
      try {
        const res = await apiFetch('/api/integrations/jobs');
        if (res.ok) {
          const data = (await res.json()) as { jobs?: IntegrationJobRecord[] };
          if (data.jobs) setJobs(data.jobs);
        }
        if (expandedJobId) {
          const det = await apiFetch(`/api/integrations/jobs/${expandedJobId}`);
          if (det.ok) {
            const detData = (await det.json()) as { job?: IntegrationJobRecord };
            if (detData.job) setExpandedJobDetails(detData.job);
          }
        }
      } catch {
        // ignore transient polling error
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [apiFetch, hasActiveJobs, activeTab, expandedJobId]);

  const pendingConflictsCount = useMemo(
    () => conflicts.filter(c => c.status === 'pending').length,
    [conflicts]
  );

  const activeJobsCount = useMemo(
    () => jobs.filter(j => j.status === 'queued' || j.status === 'running').length,
    [jobs]
  );

  const targetWorkflow = useMemo(() => {
    return workflows.find(w => w.projectId === targetProjectId) || workflows[0];
  }, [workflows, targetProjectId]);

  const targetStatuses = targetWorkflow?.statuses || [];

  const openWizardForSource = (source: IntegrationSource, startStep: 1 | 2 | 3 = 2) => {
    setSelectedSource(source);
    setConnectError(null);
    setExcelError(null);
    setDiscoverError(null);
    setImportResult(null);

    if (source === 'jira') {
      setDestinationModule('work_items');
      const existing = connections.jira;
      if (existing) {
        setServerUrl(existing.serverUrl);
        setAuthMethod(existing.authMethod);
        setAuthEmail(existing.email || '');
        setAuthUsername(existing.username || '');
        setUpdatedSinceInput(existing.lastSyncedAt || '');
        if (existing.projectsOrSpaces.length > 0 && selectedRemoteKeys.length === 0) {
          setSelectedRemoteKeys([existing.projectsOrSpaces[0].key]);
        }
        setWizardStep(startStep === 3 && existing.connected ? 3 : 2);
      } else {
        setWizardStep(2);
      }
    } else if (source === 'confluence') {
      setDestinationModule('documents');
      const existing = connections.confluence;
      if (existing) {
        setServerUrl(existing.serverUrl);
        setAuthMethod(existing.authMethod);
        setAuthEmail(existing.email || '');
        setAuthUsername(existing.username || '');
        setUpdatedSinceInput(existing.lastSyncedAt || '');
        if (existing.projectsOrSpaces.length > 0 && selectedRemoteKeys.length === 0) {
          setSelectedRemoteKeys([existing.projectsOrSpaces[0].key]);
        }
        setWizardStep(startStep === 3 && existing.connected ? 3 : 2);
      } else {
        setWizardStep(2);
      }
    } else {
      setDestinationModule('work_items');
      setWizardStep(2);
    }
    setActiveTab('wizard');
  };

  // Health Check
  const handleHealthCheck = async (provider: 'jira' | 'confluence') => {
    setCheckingHealth(provider);
    try {
      const res = await apiFetch(`/api/integrations/${provider}/health`, {
        method: 'POST',
      });
      const data = (await res.json()) as {
        connection?: IntegrationConnectionSummary | null;
        error?: string;
      };
      if (res.ok && data.connection) {
        setConnections(prev => ({ ...prev, [provider]: data.connection! }));
        const status = data.connection.healthStatus;
        showToast(
          status === 'healthy' ? 'success' : 'error',
          data.connection.healthMessage ||
            (status === 'healthy'
              ? isFa
                ? 'اتصال سالم و فعال است.'
                : 'Connection is healthy.'
              : isFa
              ? 'مشکل در سلامت اتصال.'
              : 'Connection health check reported an issue.')
        );
      } else {
        showToast('error', data.error || (isFa ? 'خطا در بررسی سلامت.' : 'Health check failed.'));
      }
    } catch {
      showToast('error', isFa ? 'خطای شبکه در بررسی سلامت.' : 'Network error during health check.');
    } finally {
      setCheckingHealth(null);
    }
  };

  // Connect & Test Jira or Confluence
  const handleTestAndConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedSource === 'excel') return;
    setConnecting(true);
    setConnectError(null);
    try {
      const res = await apiFetch(`/api/integrations/${selectedSource}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverUrl: serverUrl.trim(),
          authMethod,
          email: authEmail.trim(),
          username: authUsername.trim(),
          secret: authSecret.trim(),
        }),
      });
      const data = (await res.json()) as {
        connection?: IntegrationConnectionSummary;
        error?: string;
      };
      if (!res.ok || !data.connection) {
        setConnectError(
          data.error ||
            (isFa ? 'خطا در برقراری ارتباط با سرور.' : 'Unable to connect to remote server.')
        );
        return;
      }

      setConnections(prev => ({
        ...prev,
        [selectedSource]: data.connection!,
      }));
      setAuthSecret('');
      const firstKeys = data.connection.projectsOrSpaces.slice(0, 1).map(p => p.key);
      setSelectedRemoteKeys(firstKeys);
      showToast(
        'success',
        isFa
          ? `اتصال به ${selectedSource === 'jira' ? 'جیرا' : 'کانفلوئنس'} با موفقیت برقرار شد.`
          : `Authenticated to ${selectedSource} as ${data.connection.account.displayName}.`
      );
      void refreshServerState();
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async (provider: 'jira' | 'confluence') => {
    try {
      const res = await apiFetch(`/api/integrations/connections/${provider}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        showToast('error', err.error || (isFa ? 'عدم دسترسی یا خطا در قطع اتصال.' : 'Failed to disconnect.'));
        return;
      }
      setConnections(prev => ({ ...prev, [provider]: null }));
      showToast(
        'info',
        isFa ? `اتصال ${provider} قطع شد.` : `Disconnected ${provider} integration.`
      );
      void refreshServerState();
    } catch {
      showToast('error', isFa ? 'خطا در قطع اتصال.' : 'Failed to disconnect.');
    }
  };

  // Parse Excel / CSV with optional manual header row override
  const parseExcelPayload = async (
    fileName: string,
    base64Data: string,
    headerRowNum?: number
  ) => {
    setParsingExcel(true);
    setExcelError(null);
    setImportResult(null);
    try {
      const res = await apiFetch('/api/integrations/excel/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName,
          base64Data,
          ...(headerRowNum && headerRowNum >= 1 ? { headerRow: headerRowNum } : {}),
        }),
      });
      const data = (await res.json()) as ExcelParsedWorkbook & {
        error?: string;
        code?: string;
      };
      if (!res.ok || !data.sheets) {
        if (data.code === 'UNSUPPORTED_LEGACY_XLS') {
          setExcelError(
            isFa
              ? 'فایل با فرمت قدیمی باینری .xls تشخیص داده شد. لطفاً در Excel گزینه Save As -> .xlsx یا .csv را انتخاب و مجدداً بارگذاری کنید.'
              : data.error || 'Legacy .xls format detected. Save as .xlsx or .csv and retry.'
          );
        } else {
          setExcelError(data.error || (isFa ? 'خطا در خواندن فایل اکسل.' : 'Failed to parse file.'));
        }
        return;
      }

      setExcelWorkbook(data);
      const firstSheet = data.sheets[0];
      setSelectedSheetName(prev =>
        data.sheets.some(s => s.name === prev) ? prev : firstSheet?.name || ''
      );
      if (!headerRowNum && firstSheet) {
        setManualHeaderRow(String(firstSheet.headerRowUsed || 1));
      }

      // Smart destination module suggestion based on sheet name
      const sheetLower = (firstSheet?.name || '').toLowerCase();
      if (sheetLower.includes('wbs')) setDestinationModule('wbs');
      else if (sheetLower.includes('risk')) setDestinationModule('risks');
      else if (sheetLower.includes('budget')) setDestinationModule('budgets');
      else if (sheetLower.includes('milestone')) setDestinationModule('milestones');
      else if (sheetLower.includes('project')) setDestinationModule('projects');
      else if (sheetLower.includes('resource') || sheetLower.includes('user'))
        setDestinationModule('resources');
      else if (sheetLower.includes('sched') || sheetLower.includes('sprint'))
        setDestinationModule('schedules');
      else if (sheetLower.includes('doc')) setDestinationModule('documents');
      else setDestinationModule('work_items');

      showToast(
        'success',
        isFa
          ? `فایل ${data.fileName} (${data.detectedFormat}${
              data.detectedEncoding ? ` · ${data.detectedEncoding}` : ''
            }) با ${formatLocalizedNumber(data.sheetCount, language)} کاربرگ خوانده شد.`
          : `Parsed ${data.fileName} (${data.detectedFormat}) with ${data.sheetCount} sheet(s).`
      );
    } catch (err) {
      setExcelError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setParsingExcel(false);
    }
  };

  const handleExcelUpload = async (file: File) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const base64Data = btoa(binary);
      setLastExcelPayload({ fileName: file.name, base64Data });
      await parseExcelPayload(file.name, base64Data);
    } catch (err) {
      setExcelError(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  const handleReparseHeaderRow = async () => {
    if (!lastExcelPayload) return;
    const rowNum = Number.parseInt(manualHeaderRow, 10);
    if (!Number.isFinite(rowNum) || rowNum < 1) {
      showToast('error', isFa ? 'شماره ردیف سرستون باید عدد ۱ یا بزرگ‌تر باشد.' : 'Header row must be >= 1.');
      return;
    }
    await parseExcelPayload(lastExcelPayload.fileName, lastExcelPayload.base64Data, rowNum);
  };

  // Download specific or full .xlsx import template
  const handleDownloadTemplate = async (templateType: ExcelTemplateType = 'all') => {
    setDownloadingTemplate(templateType);
    try {
      const res = await apiFetch(`/api/integrations/excel/template?type=${templateType}`);
      if (!res.ok) {
        showToast('error', isFa ? 'خطا در دانلود قالب اکسل.' : 'Failed to download template.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `jiraflow-${templateType}-template.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast(
        'success',
        isFa
          ? `قالب استاندارد (${templateType.toUpperCase()}) دانلود شد.`
          : `Downloaded ${templateType.toUpperCase()} Excel template.`
      );
    } catch {
      showToast('error', isFa ? 'خطا در دانلود فایل قالب.' : 'Download failed.');
    } finally {
      setDownloadingTemplate(null);
    }
  };

  // Helper to populate Step 4 fields, mappings & Persian-aware default status map
  const initializeStep4Mapping = (
    fields: SourceFieldMeta[],
    rows: Array<Record<string, unknown>>,
    statuses: string[],
    mod: DestinationModule,
    src: IntegrationSource
  ) => {
    const fieldsWithSamples = fields.map(f => {
      const firstRow = rows.find(
        r => r[f.key] !== undefined && r[f.key] !== null && String(r[f.key]).trim() !== ''
      );
      const sample = firstRow ? String(firstRow[f.key]).slice(0, 60) : '';
      return { ...f, sampleValue: sample };
    });

    setSourceFields(fieldsWithSamples);
    setRawRows(rows);
    setDiscoveredStatuses(statuses);

    const suggested = suggestAutoMappings(fieldsWithSamples, mod, src);
    setMappings(suggested);

    const initialStatusMap: Record<string, string> = {};
    for (const st of statuses) {
      initialStatusMap[st] = mapStatusValue(st, {}, targetStatuses);
    }
    setStatusMap(initialStatusMap);
    setImportResult(null);
    setShowPreview(false);
  };

  // Step 3 -> Step 4: Discover Jira/Confluence live data or prepare Excel sheet
  const handleProceedToMapping = async () => {
    setDiscoverError(null);

    if (selectedSource === 'excel') {
      if (!excelWorkbook) {
        setDiscoverError(
          isFa ? 'ابتدا یک فایل اکسل یا CSV بارگذاری کنید.' : 'Please upload an Excel or CSV file first.'
        );
        return;
      }
      const sheet =
        excelWorkbook.sheets.find(s => s.name === selectedSheetName) || excelWorkbook.sheets[0];
      if (!sheet) {
        setDiscoverError(isFa ? 'کاربرگی برای نگاشت انتخاب نشده است.' : 'No sheet selected.');
        return;
      }

      const statusCol = sheet.columns.find(
        c => c.type === 'status' || /status|state|وضعیت/i.test(c.key)
      );
      const distinctSt = statusCol
        ? Array.from(
            new Set(
              sheet.rows
                .map(r => String(r[statusCol.key] ?? '').trim())
                .filter(Boolean)
            )
          )
        : [];

      initializeStep4Mapping(sheet.columns, sheet.rows, distinctSt, destinationModule, 'excel');
      setWizardStep(4);
      return;
    }

    setDiscovering(true);
    try {
      const endpoint =
        selectedSource === 'jira'
          ? '/api/integrations/jira/discover'
          : '/api/integrations/confluence/discover';

      const body =
        selectedSource === 'jira'
          ? {
              projectKeys: selectedRemoteKeys,
              jql: jiraJql.trim(),
              maxResults: 200,
              ...(incrementalOnly && updatedSinceInput.trim()
                ? { updatedSince: updatedSinceInput.trim() }
                : {}),
            }
          : {
              spaceKeys: selectedRemoteKeys,
              maxResults: 150,
              ...(incrementalOnly && updatedSinceInput.trim()
                ? { updatedSince: updatedSinceInput.trim() }
                : {}),
            };

      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = (await res.json()) as {
        sourceFields?: SourceFieldMeta[];
        distinctStatuses?: string[];
        issues?: Array<Record<string, unknown>>;
        pages?: Array<Record<string, unknown>>;
        projects?: Array<Record<string, unknown>>;
        sprints?: Array<{
          id: string;
          name: string;
          goal: string;
          state: string;
          startDate?: string;
          endDate?: string;
        }>;
        error?: string;
      };

      if (!res.ok) {
        setDiscoverError(
          data.error || (isFa ? 'خطا در دریافت داده‌ها از سرور.' : 'Failed to fetch source records.')
        );
        return;
      }

      if (selectedSource === 'jira') {
        setDiscoveredSprints(data.sprints || []);
        const rows =
          destinationModule === 'projects' ? data.projects || [] : data.issues || [];
        const fields =
          destinationModule === 'projects'
            ? [
                { key: 'key', label: 'Project Key', type: 'text' as const },
                { key: 'name', label: 'Project Name', type: 'text' as const },
                { key: 'type', label: 'Project Type', type: 'text' as const },
                { key: 'description', label: 'Description', type: 'text' as const },
              ]
            : data.sourceFields || [];

        initializeStep4Mapping(
          fields,
          rows,
          data.distinctStatuses || [],
          destinationModule,
          'jira'
        );
      } else {
        setDiscoveredSprints([]);
        initializeStep4Mapping(
          data.sourceFields || [],
          data.pages || [],
          data.distinctStatuses || [],
          destinationModule,
          'confluence'
        );
      }
      setWizardStep(4);
    } catch (err) {
      setDiscoverError(err instanceof Error ? err.message : 'Discovery failed');
    } finally {
      setDiscovering(false);
    }
  };

  // Validation & Preview computation (including cellIssues + circular dependencies)
  const validation = useMemo(
    () => validateMappingRules(mappings, destinationModule),
    [mappings, destinationModule]
  );

  const builtPreview = useMemo(() => {
    if (wizardStep !== 4 || rawRows.length === 0) {
      return { previewRows: [], payload: null, cellIssues: [] };
    }
    const { payload, previewRows, cellIssues } = buildIntegrationPayload({
      source: selectedSource,
      destinationModule,
      rawRows,
      mappings,
      statusMap,
      workflowStatuses: targetStatuses,
      users,
      currentUserId: currentUser?.id || users[0]?.id || 'user-1',
      targetProjectId: targetSpaceMode === 'existing' ? targetProjectId : undefined,
      conflictPolicy,
      createNewSpace:
        targetSpaceMode === 'new' && newSpaceKey.trim() && newSpaceName.trim()
          ? {
              key: newSpaceKey.trim(),
              name: newSpaceName.trim(),
              nameFa: newSpaceNameFa.trim() || newSpaceName.trim(),
              template: newSpaceTemplate,
            }
          : undefined,
    });
    return {
      previewRows: previewRows.slice(0, 8),
      payload,
      cellIssues,
    };
  }, [
    wizardStep,
    rawRows,
    selectedSource,
    destinationModule,
    mappings,
    statusMap,
    targetStatuses,
    users,
    currentUser,
    targetSpaceMode,
    targetProjectId,
    conflictPolicy,
    newSpaceKey,
    newSpaceName,
    newSpaceNameFa,
    newSpaceTemplate,
  ]);

  const cellErrorsCount = useMemo(
    () => builtPreview.cellIssues.filter(c => c.severity === 'error').length,
    [builtPreview.cellIssues]
  );

  // Build payload helper
  const buildFullPayloadForExecution = () => {
    const { payload } = buildIntegrationPayload({
      source: selectedSource,
      destinationModule,
      rawRows,
      mappings,
      statusMap,
      workflowStatuses: targetStatuses,
      users,
      currentUserId: currentUser?.id || users[0]?.id || 'user-1',
      targetProjectId: targetSpaceMode === 'existing' ? targetProjectId : undefined,
      conflictPolicy,
      createNewSpace:
        targetSpaceMode === 'new' && newSpaceKey.trim() && newSpaceName.trim()
          ? {
              key: newSpaceKey.trim(),
              name: newSpaceName.trim(),
              nameFa: newSpaceNameFa.trim() || newSpaceName.trim(),
              template: newSpaceTemplate,
            }
          : undefined,
      extraSprints: discoveredSprints,
      sourceProjects:
        selectedSource === 'jira'
          ? connections.jira?.projectsOrSpaces.filter(p =>
              selectedRemoteKeys.includes(p.key)
            )
          : undefined,
    });

    if (autoCreateMissingStatuses && discoveredStatuses.length > 0) {
      const missing: NonNullable<typeof payload.missingStatusesToAdd> = [];
      for (const stName of discoveredStatuses) {
        const exists = targetStatuses.some(
          s => s.name.toLowerCase() === stName.toLowerCase() || s.id === statusMap[stName]
        );
        if (!exists) {
          const slug = stName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_|_$/g, '');
          missing.push({
            id: `${slug || 'st'}_${Date.now().toString().slice(-3)}`,
            name: stName,
            nameFa: stName,
            category: /done|closed|complete|انجام\s*شده/i.test(stName)
              ? 'done'
              : /progress|review|doing|بررسی|در حال/i.test(stName)
              ? 'inprogress'
              : 'todo',
          });
        }
      }
      if (missing.length > 0) payload.missingStatusesToAdd = missing;
    }

    return payload;
  };

  // Execute Immediate Import & Sync + Persist externalLinks & history
  const handleExecuteImport = async () => {
    if (!validation.valid) {
      showToast(
        'error',
        isFa
          ? 'لطفاً فیلدهای اجباری را نگاشت کرده و خطاهای ناسازگاری نوع داده را برطرف کنید.'
          : 'Resolve required field mappings and type compatibility errors first.'
      );
      return;
    }

    setExecutingImport(true);
    try {
      const payload = buildFullPayloadForExecution();
      const result = importIntegrationData(payload);
      setImportResult(result);

      const sourceLabel =
        selectedSource === 'excel'
          ? `${excelWorkbook?.fileName || 'Excel'} (${selectedSheetName})`
          : `${selectedSource.toUpperCase()}: ${selectedRemoteKeys.join(', ') || 'All'}`;

      if (selectedSource === 'excel' && excelWorkbook) {
        addRecentExcelImport({
          id: `exl-${Date.now()}`,
          fileName: excelWorkbook.fileName,
          format: excelWorkbook.detectedFormat,
          sheetName: selectedSheetName,
          destinationModule,
          targetSpaceKey: result.targetProjectKey,
          createdCount: result.createdCount,
          updatedCount: result.updatedCount,
          timestamp: new Date().toISOString(),
        });
      }

      if (result.importedLinks && result.importedLinks.length > 0) {
        await apiFetch('/api/integrations/external-links/record', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: selectedSource,
            connectionId:
              selectedSource === 'jira'
                ? connections.jira?.id
                : selectedSource === 'confluence'
                ? connections.confluence?.id
                : 'excel-upload',
            links: result.importedLinks.map(l => ({
              ...l,
              localProjectId: result.targetProjectId,
            })),
          }),
        }).catch(() => null);
      }

      const histRec = {
        id: `sync-${Date.now()}`,
        provider: selectedSource,
        status: 'success' as const,
        sourceLabel,
        targetSpaceKey: result.targetProjectKey,
        createdCount: result.createdCount,
        updatedCount: result.updatedCount,
        skippedCount: result.skippedCount,
        timestamp: new Date().toISOString(),
      };
      addSyncHistoryRecord(histRec);

      await apiFetch('/api/integrations/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(histRec),
      }).catch(() => null);

      await refreshServerState();

      showToast(
        'success',
        isFa
          ? `همگام‌سازی کامل شد: ${formatLocalizedNumber(
              result.createdCount,
              language
            )} ایجاد و ${formatLocalizedNumber(result.updatedCount, language)} به‌روزرسانی شد.`
          : `Sync completed: ${result.createdCount} created, ${result.updatedCount} updated in ${result.targetProjectKey}.`
      );
    } finally {
      setExecutingImport(false);
    }
  };

  // Queue Background Sync Job on Server Worker
  const handleQueueBackgroundJob = async () => {
    if (!validation.valid) {
      showToast(
        'error',
        isFa
          ? 'پیش از ثبت کار پس‌زمینه، خطاهای نگاشت را برطرف کنید.'
          : 'Resolve mapping validation errors first.'
      );
      return;
    }

    setQueueingJob(true);
    try {
      const targetProj = projects.find(p => p.id === targetProjectId) || currentProject;
      const sourceLabel =
        selectedSource === 'excel'
          ? `${excelWorkbook?.fileName || 'Excel'} (${selectedSheetName})`
          : `${selectedSource.toUpperCase()}: ${selectedRemoteKeys.join(', ') || 'All'}`;

      const res = await apiFetch('/api/integrations/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId:
            selectedSource === 'jira'
              ? connections.jira?.id
              : selectedSource === 'confluence'
              ? connections.confluence?.id
              : undefined,
          provider: selectedSource,
          mode: incrementalOnly ? 'incremental' : 'full',
          sourceLabel,
          targetSpaceKey:
            targetSpaceMode === 'new' && newSpaceKey.trim()
              ? newSpaceKey.trim().toUpperCase()
              : targetProj.key,
          destinationModule,
          conflictPolicy,
          sourceScopes: selectedRemoteKeys,
          jqlOrCql: jiraJql.trim() || undefined,
          items: rawRows,
        }),
      });

      const data = (await res.json()) as { job?: IntegrationJobRecord; error?: string };
      if (!res.ok || !data.job) {
        showToast('error', data.error || (isFa ? 'خطا در صف کار پس‌زمینه.' : 'Failed to queue job.'));
        return;
      }

      setJobs(prev => [data.job!, ...prev]);
      setActiveTab('jobs');
      showToast(
        'success',
        isFa
          ? 'عملیات در صف پردازش پس‌زمینه ثبت و آغاز شد.'
          : 'Background sync job queued and running.'
      );
    } catch {
      showToast('error', isFa ? 'خطای شبکه در ثبت کار.' : 'Network error queueing job.');
    } finally {
      setQueueingJob(false);
    }
  };

  // Direct "Sync Now" from Jira or Confluence overview card
  const handleQuickSyncProvider = async (provider: 'jira' | 'confluence') => {
    const conn = connections[provider];
    if (!conn) return;
    setSyncingProvider(provider);
    try {
      const endpoint =
        provider === 'jira'
          ? '/api/integrations/jira/discover'
          : '/api/integrations/confluence/discover';

      const keys = conn.projectsOrSpaces.slice(0, 3).map(p => p.key);
      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          provider === 'jira'
            ? {
                projectKeys: keys,
                maxResults: 150,
                ...(conn.lastSyncedAt ? { updatedSince: conn.lastSyncedAt } : {}),
              }
            : {
                spaceKeys: keys,
                maxResults: 100,
                ...(conn.lastSyncedAt ? { updatedSince: conn.lastSyncedAt } : {}),
              }
        ),
      });

      const data = (await res.json()) as {
        sourceFields?: SourceFieldMeta[];
        distinctStatuses?: string[];
        issues?: Array<Record<string, unknown>>;
        pages?: Array<Record<string, unknown>>;
        sprints?: Array<{
          id: string;
          name: string;
          goal: string;
          state: string;
          startDate?: string;
          endDate?: string;
        }>;
        error?: string;
      };

      if (!res.ok) {
        showToast('error', data.error || (isFa ? 'خطا در همگام‌سازی.' : 'Sync failed.'));
        return;
      }

      const mod: DestinationModule = provider === 'jira' ? 'work_items' : 'documents';
      const rows = provider === 'jira' ? data.issues || [] : data.pages || [];
      const savedTpl = mappingTemplates.find(
        tpl => tpl.source === provider && tpl.destinationModule === mod
      );
      const rules =
        savedTpl?.mappings || suggestAutoMappings(data.sourceFields || [], mod, provider);
      const sMap = savedTpl?.statusMap || {};

      const { payload } = buildIntegrationPayload({
        source: provider,
        destinationModule: mod,
        rawRows: rows,
        mappings: rules,
        statusMap: sMap,
        workflowStatuses: targetStatuses,
        users,
        currentUserId: currentUser?.id || users[0]?.id || 'user-1',
        targetProjectId: currentProject.id,
        extraSprints: data.sprints,
      });

      const result = importIntegrationData(payload);

      if (result.importedLinks && result.importedLinks.length > 0) {
        await apiFetch('/api/integrations/external-links/record', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider,
            connectionId: conn.id,
            links: result.importedLinks.map(l => ({
              ...l,
              localProjectId: result.targetProjectId,
            })),
          }),
        }).catch(() => null);
      }

      const rec = {
        id: `sync-${Date.now()}`,
        provider,
        status: 'success' as const,
        sourceLabel: `${provider.toUpperCase()} Sync (${keys.join(', ') || 'All'})`,
        targetSpaceKey: result.targetProjectKey,
        createdCount: result.createdCount,
        updatedCount: result.updatedCount,
        skippedCount: result.skippedCount,
        timestamp: new Date().toISOString(),
      };
      addSyncHistoryRecord(rec);
      await apiFetch('/api/integrations/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rec),
      }).catch(() => null);
      await refreshServerState();

      showToast(
        'success',
        isFa
          ? `همگام‌سازی ${provider === 'jira' ? 'جیرا' : 'کانفلوئنس'} انجام شد (${formatLocalizedNumber(
              result.createdCount,
              language
            )} جدید، ${formatLocalizedNumber(result.updatedCount, language)} به‌روزرسانی).`
          : `${provider.toUpperCase()} synced: ${result.createdCount} created, ${result.updatedCount} updated.`
      );
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Sync failed.');
    } finally {
      setSyncingProvider(null);
    }
  };

  // Job Controls (Pause, Resume, Cancel, Retry, Inspect Items)
  const handleJobAction = async (
    jobId: string,
    action: 'pause' | 'resume' | 'cancel' | 'retry'
  ) => {
    try {
      const res = await apiFetch(`/api/integrations/jobs/${jobId}/${action}`, {
        method: 'POST',
      });
      const data = (await res.json()) as { job?: IntegrationJobRecord; error?: string };
      if (!res.ok || !data.job) {
        showToast('error', data.error || 'Job action failed');
        return;
      }
      setJobs(prev => prev.map(j => (j.id === jobId ? data.job! : j)));
      if (expandedJobId === jobId) setExpandedJobDetails(data.job);
    } catch {
      showToast('error', isFa ? 'خطا در کنترل عملیات پس‌زمینه.' : 'Failed to update job.');
    }
  };

  const toggleExpandJob = async (jobId: string) => {
    if (expandedJobId === jobId) {
      setExpandedJobId(null);
      setExpandedJobDetails(null);
      return;
    }
    setExpandedJobId(jobId);
    try {
      const res = await apiFetch(`/api/integrations/jobs/${jobId}`);
      if (res.ok) {
        const data = (await res.json()) as { job?: IntegrationJobRecord };
        if (data.job) setExpandedJobDetails(data.job);
      }
    } catch {
      // ignore
    }
  };

  // Conflict Resolution Handler
  const handleResolveConflict = async (
    conflict: IntegrationConflictRecord,
    resolution: 'resolved_source' | 'resolved_destination' | 'resolved_merged' | 'dismissed'
  ) => {
    setResolvingConflictId(conflict.id);
    try {
      const mergedFields = conflictMergeChoices[conflict.id] || {};
      const res = await apiFetch(`/api/integrations/conflicts/${conflict.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution, mergedFields }),
      });
      const data = (await res.json()) as {
        conflict?: IntegrationConflictRecord;
        error?: string;
      };
      if (!res.ok || !data.conflict) {
        showToast('error', data.error || (isFa ? 'خطا در رفع تعارض.' : 'Failed to resolve conflict.'));
        return;
      }

      // Apply source or merged values locally if matching issue exists
      if (resolution === 'resolved_source' || resolution === 'resolved_merged') {
        const localIssue = issues.find(
          i => i.id === conflict.localEntityId || i.key === conflict.externalKey
        );
        if (localIssue) {
          const patch: Record<string, unknown> = {};
          for (const diff of conflict.fieldDiffs) {
            const pick =
              resolution === 'resolved_source'
                ? 'source'
                : mergedFields[diff.field] || 'source';
            if (pick === 'source' && diff.sourceValue !== undefined) {
              patch[diff.field] = diff.sourceValue;
            }
          }
          if (Object.keys(patch).length > 0) {
            updateIssue(localIssue.id, patch as Partial<typeof localIssue>);
          }
        }
      }

      setConflicts(prev => prev.map(c => (c.id === conflict.id ? data.conflict! : c)));
      showToast(
        'success',
        isFa ? `تعارض ${conflict.externalKey} برطرف شد.` : `Resolved conflict for ${conflict.externalKey}.`
      );
    } finally {
      setResolvingConflictId(null);
    }
  };

  // Sync Config Save & Trigger
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cfgName.trim()) {
      showToast('error', isFa ? 'نام پروفایل همگام‌سازی را وارد کنید.' : 'Enter a profile name.');
      return;
    }
    setSavingConfig(true);
    try {
      const scopes = cfgScopesText
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      const res = await apiFetch('/api/integrations/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId: connections[cfgProvider]?.id || `${cfgProvider}-default`,
          provider: cfgProvider,
          name: cfgName.trim(),
          targetProjectId: cfgTargetProjectId,
          destinationModule: cfgDestinationModule,
          sourceScopes: scopes,
          jqlOrCqlFilter: cfgJql.trim() || undefined,
          syncMode: cfgSyncMode,
          syncIntervalMinutes: Math.max(5, Number(cfgIntervalMinutes || 60)),
          conflictPolicy: cfgConflictPolicy,
          enabled: cfgEnabled,
        }),
      });
      const data = (await res.json()) as {
        config?: IntegrationConfigRecord;
        error?: string;
      };
      if (!res.ok || !data.config) {
        showToast('error', data.error || 'Failed to save sync configuration.');
        return;
      }
      setConfigs(prev => [data.config!, ...prev.filter(c => c.id !== data.config!.id)]);
      setCfgName('');
      setCfgScopesText('');
      setCfgJql('');
      showToast(
        'success',
        isFa ? `پروفایل زمان‌بندی "${data.config.name}" ذخیره شد.` : `Saved sync config "${data.config.name}".`
      );
      void refreshServerState();
    } finally {
      setSavingConfig(false);
    }
  };

  const handleRunConfigNow = async (cfg: IntegrationConfigRecord) => {
    try {
      const proj = projects.find(p => p.id === cfg.targetProjectId);
      const res = await apiFetch('/api/integrations/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          configId: cfg.id,
          connectionId: cfg.connectionId,
          provider: cfg.provider,
          mode: 'incremental',
          sourceLabel: cfg.name,
          targetSpaceKey: proj?.key || cfg.targetProjectId,
          destinationModule: cfg.destinationModule,
          conflictPolicy: cfg.conflictPolicy,
          sourceScopes: cfg.sourceScopes,
          jqlOrCql: cfg.jqlOrCqlFilter,
        }),
      });
      const data = (await res.json()) as { job?: IntegrationJobRecord; error?: string };
      if (!res.ok || !data.job) {
        showToast('error', data.error || 'Failed to trigger sync job.');
        return;
      }
      setJobs(prev => [data.job!, ...prev]);
      setActiveTab('jobs');
      showToast('success', isFa ? `همگام‌سازی "${cfg.name}" آغاز شد.` : `Started sync job for "${cfg.name}".`);
    } catch {
      showToast('error', isFa ? 'خطا در اجرای همگام‌سازی.' : 'Failed to start job.');
    }
  };

  const handleDeleteConfig = async (id: string) => {
    const res = await apiFetch(`/api/integrations/configs/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      showToast('error', err.error || (isFa ? 'خطا در حذف پروفایل.' : 'Failed to delete profile.'));
      return;
    }
    setConfigs(prev => prev.filter(c => c.id !== id));
    showToast('info', isFa ? 'پروفایل زمان‌بندی حذف شد.' : 'Sync configuration removed.');
  };

  const handleSaveTemplate = async () => {
    const clean = templateNameInput.trim();
    if (!clean) {
      showToast('error', isFa ? 'نام قالب نگاشت را وارد کنید.' : 'Enter a mapping template name.');
      return;
    }
    const tpl: MappingTemplate = {
      id: `tpl-${Date.now()}`,
      name: clean,
      source: selectedSource,
      destinationModule,
      mappings,
      statusMap,
      updatedAt: new Date().toISOString(),
    };
    saveMappingTemplate(tpl);
    await apiFetch('/api/integrations/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tpl),
    }).catch(() => null);
    setTemplateNameInput('');
    showToast(
      'success',
      isFa ? `قالب "${clean}" ذخیره شد.` : `Saved mapping template "${clean}".`
    );
  };

  const handleApplyTemplate = (tplId: string) => {
    const tpl = mappingTemplates.find(t => t.id === tplId);
    if (!tpl) return;
    const remapped = sourceFields.map((sf, idx) => {
      const found = tpl.mappings.find(m => m.sourceKey === sf.key);
      if (found) return { ...found, id: `map-${idx}-${sf.key}` };
      return {
        id: `map-${idx}-${sf.key}`,
        sourceKey: sf.key,
        sourceLabel: sf.label,
        sourceType: sf.type,
        destinationField: '__ignore__',
        transformation: 'direct' as TransformationType,
        defaultValue: '',
        required: false,
      };
    });
    setMappings(remapped);
    setStatusMap(prev => ({ ...prev, ...tpl.statusMap }));
    showToast(
      'info',
      isFa ? `قالب "${tpl.name}" اعمال شد.` : `Applied mapping template "${tpl.name}".`
    );
  };

  const updateMappingRow = (ruleId: string, patch: Partial<FieldMappingRule>) => {
    const destDefs = DESTINATION_FIELDS_BY_MODULE[destinationModule];
    setMappings(prev =>
      prev.map(r => {
        if (r.id !== ruleId) return r;
        const next = { ...r, ...patch };
        if (patch.destinationField) {
          const def = destDefs.find(d => d.id === patch.destinationField);
          next.required = Boolean(def?.required);
          if (def && !def.allowedTransforms.includes(next.transformation)) {
            next.transformation = def.allowedTransforms[0];
          }
        }
        return next;
      })
    );
  };

  const compatibleTemplates = mappingTemplates.filter(
    tpl => tpl.source === selectedSource && tpl.destinationModule === destinationModule
  );

  const selectedSheetObj =
    excelWorkbook?.sheets.find(s => s.name === selectedSheetName) || excelWorkbook?.sheets[0];

  const activeConnection =
    selectedSource === 'jira'
      ? connections.jira
      : selectedSource === 'confluence'
      ? connections.confluence
      : null;

  const filteredConflicts = useMemo(() => {
    if (conflictFilter === 'all') return conflicts;
    if (conflictFilter === 'pending') return conflicts.filter(c => c.status === 'pending');
    return conflicts.filter(c => c.status !== 'pending');
  }, [conflicts, conflictFilter]);

  const filteredAuditLogs = useMemo(() => {
    if (auditProviderFilter === 'all') return auditLogs;
    return auditLogs.filter(l => l.provider === auditProviderFilter);
  }, [auditLogs, auditProviderFilter]);

  const renderHealthBadge = (conn: IntegrationConnectionSummary | null) => {
    if (!conn || !conn.connected) {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
          {isFa ? 'متصل نیست' : 'Disconnected'}
        </span>
      );
    }
    const hs = conn.healthStatus || 'healthy';
    if (hs === 'needs_reauth') {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
          {isFa ? 'نیازمند احراز مجدد' : 'Needs Re-Auth'}
        </span>
      );
    }
    if (hs === 'degraded' || hs === 'unreachable') {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
          {isFa ? 'خطای اتصال' : hs === 'degraded' ? 'Degraded' : 'Unreachable'}
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
        {isFa ? 'متصل · سالم' : 'Healthy'}
      </span>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/60 dark:bg-slate-950 p-4 sm:p-6 space-y-6">
      {/* Header & 6-Tab Navigation */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <Plug className="w-5 h-5 text-blue-600 shrink-0" />
            <span>
              {isFa
                ? 'مرکز یکپارچه‌سازی و همگام‌سازی سازمانی'
                : 'Enterprise Integration Center'}
            </span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {isFa
              ? 'اتصال رمزنگاری‌شده، نگاشت سلسله‌مراتبی، پردازش پس‌زمینه، مدیریت تعارض و همگام‌سازی زمان‌بندی‌شده با Jira، Confluence و Excel.'
              : 'Encrypted connectors, hierarchical mapping, background sync jobs, conflict resolution, and scheduled syncs across Jira, Confluence, and Excel.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 bg-slate-200/70 dark:bg-slate-800/80 p-1 rounded-lg text-xs">
          {[
            {
              id: 'overview' as const,
              label: isFa ? 'نمای کلی' : 'Overview',
              icon: Layers,
            },
            {
              id: 'wizard' as const,
              label: isFa ? 'ویزارد ورود' : 'Import Wizard',
              icon: Wand2,
            },
            {
              id: 'jobs' as const,
              label: isFa
                ? `صف پردازش (${formatLocalizedNumber(jobs.length, language)})`
                : `Sync Jobs (${jobs.length})`,
              badge: activeJobsCount,
              badgeTone: 'blue',
              icon: Activity,
            },
            {
              id: 'conflicts' as const,
              label: isFa
                ? `تعارض‌ها (${formatLocalizedNumber(pendingConflictsCount, language)})`
                : `Conflicts (${pendingConflictsCount})`,
              badge: pendingConflictsCount,
              badgeTone: 'amber',
              icon: GitCompare,
            },
            {
              id: 'templates_schedules' as const,
              label: isFa ? 'قالب‌ها و زمان‌بندی' : 'Templates & Schedules',
              icon: CalendarClock,
            },
            {
              id: 'history' as const,
              label: isFa ? 'تاریخچه و ممیزی' : 'History & Audit',
              icon: History,
            },
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-md font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                  activeTab === tab.id
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ======================== TAB 1: OVERVIEW CARDS ======================== */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {loadingState && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              <span>{isFa ? 'در حال بررسی وضعیت اتصال‌ها...' : 'Loading integration status...'}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* JIRA INTEGRATION CARD */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <JiraBrandIcon className="w-10 h-10 shrink-0" />
                    <div>
                      <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                        {isFa ? 'یکپارچه‌سازی Jira' : 'Jira Integration'}
                      </h2>
                      <p className="text-[11px] text-slate-500">Cloud & Data Center REST API</p>
                    </div>
                  </div>
                  {renderHealthBadge(connections.jira)}
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {isFa
                    ? 'ورود و همگام‌سازی سلسله‌مراتبی پروژه، اپیک، استوری، زیروظیفه، اسپرینت، نسخه، پیوست و فیلدهای سفارشی.'
                    : 'Hierarchical sync for Projects, Epics, Stories, Subtasks, Sprints, Versions, Links, Attachments, and Custom Fields.'}
                </p>

                <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 rounded-lg p-3 text-[11px] space-y-1.5">
                  {connections.jira ? (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-500">{isFa ? 'حساب متصل:' : 'Account:'}</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                          {connections.jira.account.displayName}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-500">{isFa ? 'نشانی سرور:' : 'Server:'}</span>
                        <span className="font-mono text-slate-700 dark:text-slate-300 truncate max-w-[180px]" dir="ltr">
                          {connections.jira.serverUrl}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-500">{isFa ? 'پروژه‌های در دسترس:' : 'Projects:'}</span>
                        <span className="font-mono tabular-nums font-bold text-blue-600">
                          {formatLocalizedNumber(connections.jira.projectsOrSpaces.length, language)}
                        </span>
                      </div>
                      {connections.jira.healthMessage && (
                        <div className="text-[10px] text-slate-500 truncate" title={connections.jira.healthMessage}>
                          {connections.jira.healthMessage}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-slate-500">
                      {isFa
                        ? 'برای همگام‌سازی پروژه‌ها و تسک‌ها با سرور Jira احراز هویت کنید.'
                        : 'Authenticate with API Token, PAT, Basic Auth, or OAuth Bearer.'}
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/70 dark:border-slate-700/70">
                    <span className="text-slate-500">{isFa ? 'آخرین همگام‌سازی:' : 'Last Sync:'}</span>
                    <span className="font-medium tabular-nums text-slate-700 dark:text-slate-300">
                      {formatLocalizedDateTime(connections.jira?.lastSyncedAt, language)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  onClick={() => openWizardForSource('jira', 2)}
                  className="flex-1 min-w-[110px] px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Link2 className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {connections.jira?.healthStatus === 'needs_reauth'
                      ? isFa
                        ? 'احراز مجدد'
                        : 'Re-Authenticate'
                      : connections.jira
                      ? isFa
                        ? 'ورود و نگاشت'
                        : 'Import & Map'
                      : isFa
                      ? 'اتصال و ورود'
                      : 'Connect & Import'}
                  </span>
                </button>
                {connections.jira && (
                  <>
                    <button
                      onClick={() => void handleQuickSyncProvider('jira')}
                      disabled={syncingProvider === 'jira'}
                      className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-md text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50"
                    >
                      {syncingProvider === 'jira' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      <span>{isFa ? 'همگام‌سازی' : 'Sync'}</span>
                    </button>
                    <button
                      onClick={() => void handleHealthCheck('jira')}
                      disabled={checkingHealth === 'jira'}
                      title={isFa ? 'بررسی سلامت اتصال' : 'Check Connection Health'}
                      className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-md shrink-0 disabled:opacity-50"
                    >
                      {checkingHealth === 'jira' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ShieldCheck className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => void handleDisconnect('jira')}
                      title={isFa ? 'قطع اتصال' : 'Disconnect'}
                      className="p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-md shrink-0"
                    >
                      <Unplug className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* CONFLUENCE INTEGRATION CARD */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <ConfluenceBrandIcon className="w-10 h-10 shrink-0" />
                    <div>
                      <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                        {isFa ? 'یکپارچه‌سازی Confluence' : 'Confluence Integration'}
                      </h2>
                      <p className="text-[11px] text-slate-500">Cloud & Data Center Pages API</p>
                    </div>
                  </div>
                  {renderHealthBadge(connections.confluence)}
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {isFa
                    ? 'ورود فضاهای دانش، درخت صفحات فرزند، جداول، سرصفحه‌ها، نسخه‌ها، دیدگاه‌ها و پیوست‌ها با تبدیل ایمن XHTML.'
                    : 'Import spaces, nested page trees, structured tables, headings, versions, comments, and attachments safely.'}
                </p>

                <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 rounded-lg p-3 text-[11px] space-y-1.5">
                  {connections.confluence ? (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-500">{isFa ? 'حساب متصل:' : 'Account:'}</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                          {connections.confluence.account.displayName}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-500">{isFa ? 'نشانی سرور:' : 'Server:'}</span>
                        <span className="font-mono text-slate-700 dark:text-slate-300 truncate max-w-[180px]" dir="ltr">
                          {connections.confluence.serverUrl}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-500">{isFa ? 'فضاهای در دسترس:' : 'Spaces:'}</span>
                        <span className="font-mono tabular-nums font-bold text-indigo-600">
                          {formatLocalizedNumber(connections.confluence.projectsOrSpaces.length, language)}
                        </span>
                      </div>
                      {connections.confluence.healthMessage && (
                        <div className="text-[10px] text-slate-500 truncate" title={connections.confluence.healthMessage}>
                          {connections.confluence.healthMessage}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-slate-500">
                      {isFa
                        ? 'برای انتقال درخت مستندات تیمی به بخش Docs فضاهای کاری متصل شوید.'
                        : 'Connect to Atlassian Confluence Cloud or Data Center to sync hierarchical knowledge bases.'}
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/70 dark:border-slate-700/70">
                    <span className="text-slate-500">{isFa ? 'آخرین همگام‌سازی:' : 'Last Sync:'}</span>
                    <span className="font-medium tabular-nums text-slate-700 dark:text-slate-300">
                      {formatLocalizedDateTime(connections.confluence?.lastSyncedAt, language)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  onClick={() => openWizardForSource('confluence', 2)}
                  className="flex-1 min-w-[110px] px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Link2 className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {connections.confluence?.healthStatus === 'needs_reauth'
                      ? isFa
                        ? 'احراز مجدد'
                        : 'Re-Authenticate'
                      : connections.confluence
                      ? isFa
                        ? 'ورود مستندات'
                        : 'Import & Map'
                      : isFa
                      ? 'اتصال و ورود'
                      : 'Connect & Import'}
                  </span>
                </button>
                {connections.confluence && (
                  <>
                    <button
                      onClick={() => void handleQuickSyncProvider('confluence')}
                      disabled={syncingProvider === 'confluence'}
                      className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-md text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50"
                    >
                      {syncingProvider === 'confluence' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      <span>{isFa ? 'همگام‌سازی' : 'Sync'}</span>
                    </button>
                    <button
                      onClick={() => void handleHealthCheck('confluence')}
                      disabled={checkingHealth === 'confluence'}
                      title={isFa ? 'بررسی سلامت اتصال' : 'Check Connection Health'}
                      className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-md shrink-0 disabled:opacity-50"
                    >
                      {checkingHealth === 'confluence' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ShieldCheck className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => void handleDisconnect('confluence')}
                      title={isFa ? 'قطع اتصال' : 'Disconnect'}
                      className="p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-md shrink-0"
                    >
                      <Unplug className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* EXCEL / CSV INTEGRATION CARD */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <ExcelBrandIcon className="w-10 h-10 shrink-0" />
                    <div>
                      <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                        {isFa ? 'ورود از Excel و CSV' : 'Microsoft Excel & CSV'}
                      </h2>
                      <p className="text-[11px] text-slate-500">XLSX · CSV UTF-8 & Windows-1256 · Jalali</p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                    {isFa ? 'آماده' : 'Ready'}
                  </span>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {isFa
                    ? 'خواندن چندکاربرگه اکسل و CSV فارسی، تشخیص خودکار ردیف سرستون و تاریخ شمسی، بررسی وابستگی حلقوی و ۵ قالب آماده.'
                    : 'Multi-sheet XLSX & Persian CSV parser, manual header-row selector, Jalali dates, cycle detection, and 5 templates.'}
                </p>

                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-slate-500">
                    {isFa ? 'دانلود قالب‌های استاندارد (.xlsx):' : 'Download Standard Templates (.xlsx):'}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {EXCEL_TEMPLATE_BUTTONS.map(btn => (
                      <button
                        key={btn.type}
                        onClick={() => void handleDownloadTemplate(btn.type)}
                        disabled={downloadingTemplate !== null}
                        className="px-2 py-1.5 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded text-[11px] font-semibold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1 whitespace-nowrap shrink-0 disabled:opacity-50"
                      >
                        {downloadingTemplate === btn.type ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Download className="w-3 h-3 text-emerald-600" />
                        )}
                        <span className="truncate">{isFa ? btn.labelFa : btn.labelEn}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  onClick={() => openWizardForSource('excel', 2)}
                  className="flex-1 min-w-[120px] px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Upload className="w-3.5 h-3.5 shrink-0" />
                  <span>{isFa ? 'بارگذاری و ورود اکسل / CSV' : 'Upload Excel / CSV'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Operational Summary Strip (Jobs, Conflicts, Sync Profiles) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <button
              onClick={() => setActiveTab('jobs')}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-start hover:border-blue-400 transition-colors flex items-center justify-between"
            >
              <div>
                <div className="text-[11px] text-slate-500">
                  {isFa ? 'صف عملیات پس‌زمینه' : 'Background Sync Jobs'}
                </div>
                <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                  {formatLocalizedNumber(jobs.length, language)}
                </div>
              </div>
              <Activity className="w-5 h-5 text-blue-600 shrink-0" />
            </button>

            <button
              onClick={() => setActiveTab('conflicts')}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-start hover:border-amber-400 transition-colors flex items-center justify-between"
            >
              <div>
                <div className="text-[11px] text-slate-500">
                  {isFa ? 'تعارض‌های نیازمند بررسی' : 'Pending Sync Conflicts'}
                </div>
                <div className="text-lg font-bold font-mono tabular-nums text-amber-600 mt-0.5">
                  {formatLocalizedNumber(pendingConflictsCount, language)}
                </div>
              </div>
              <GitCompare className="w-5 h-5 text-amber-600 shrink-0" />
            </button>

            <button
              onClick={() => setActiveTab('templates_schedules')}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-start hover:border-emerald-400 transition-colors flex items-center justify-between"
            >
              <div>
                <div className="text-[11px] text-slate-500">
                  {isFa ? 'پروفایل‌های زمان‌بندی‌شده' : 'Scheduled Sync Profiles'}
                </div>
                <div className="text-lg font-bold font-mono tabular-nums text-emerald-600 mt-0.5">
                  {formatLocalizedNumber(configs.filter(c => c.enabled).length, language)}
                </div>
              </div>
              <CalendarClock className="w-5 h-5 text-emerald-600 shrink-0" />
            </button>
          </div>

          {/* Recent Excel Imports Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {isFa ? 'ورودهای اخیر فایل Excel / CSV' : 'Recent Excel & CSV Imports'}
                </h3>
              </div>
              <button
                onClick={() => openWizardForSource('excel', 2)}
                className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{isFa ? 'ورود فایل جدید' : 'Import workbook'}</span>
              </button>
            </div>

            {recentExcelImports.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 space-y-2">
                <FileSpreadsheet className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto" />
                <div className="font-semibold text-slate-700 dark:text-slate-300">
                  {isFa
                    ? 'هیچ ورود داده‌ای از اکسل ثبت نشده است'
                    : 'No Excel or CSV imports recorded yet'}
                </div>
                <p>
                  {isFa
                    ? 'یکی از ۵ قالب استاندارد را دانلود کنید یا فایل اکسل خود را برای نگاشت ستون‌ها بارگذاری نمایید.'
                    : 'Download one of our 5 specialized templates or upload your spreadsheet.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-start border-collapse">
                  <thead className="bg-slate-100/80 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                    <tr>
                      <th className="p-3 text-start">{isFa ? 'نام فایل' : 'File Name'}</th>
                      <th className="p-3 text-start">{isFa ? 'فرمت / کاربرگ' : 'Format / Sheet'}</th>
                      <th className="p-3 text-start">{isFa ? 'ماژول مقصد' : 'Destination'}</th>
                      <th className="p-3 text-start">{isFa ? 'فضای هدف' : 'Target Space'}</th>
                      <th className="p-3 text-end">{isFa ? 'ایجاد / بروزرسانی' : 'Created / Updated'}</th>
                      <th className="p-3 text-end">{isFa ? 'زمان' : 'Imported At'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                    {recentExcelImports.map(rec => (
                      <tr key={rec.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="p-3 font-semibold text-slate-900 dark:text-white">{rec.fileName}</td>
                        <td className="p-3 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                          {rec.format} · {rec.sheetName}
                        </td>
                        <td className="p-3 text-slate-600 dark:text-slate-300">
                          {isFa
                            ? DESTINATION_MODULE_LABELS[rec.destinationModule]?.fa || rec.destinationModule
                            : DESTINATION_MODULE_LABELS[rec.destinationModule]?.en || rec.destinationModule}
                        </td>
                        <td className="p-3 font-mono font-bold text-blue-600">{rec.targetSpaceKey}</td>
                        <td className="p-3 text-end font-mono tabular-nums">
                          <span className="text-emerald-600 font-bold">
                            +{formatLocalizedNumber(rec.createdCount, language)}
                          </span>{' '}
                          /{' '}
                          <span className="text-blue-600 font-bold">
                            ~{formatLocalizedNumber(rec.updatedCount, language)}
                          </span>
                        </td>
                        <td className="p-3 text-end tabular-nums text-slate-500">
                          {formatLocalizedDateTime(rec.timestamp, language)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================== TAB 2: 4-STEP IMPORT & SYNC WIZARD ======================== */}
      {activeTab === 'wizard' && (
        <div className="space-y-5">
          {/* Stepper Indicator */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              {[
                { step: 1 as const, titleEn: '1. Select Source', titleFa: '۱. انتخاب منبع داده' },
                {
                  step: 2 as const,
                  titleEn:
                    selectedSource === 'excel'
                      ? '2. Upload & Read Workbook'
                      : '2. Connect & Authenticate',
                  titleFa:
                    selectedSource === 'excel'
                      ? '۲. بارگذاری و خواندن فایل'
                      : '۲. اتصال و احراز هویت',
                },
                { step: 3 as const, titleEn: '3. Scope, Module & Policy', titleFa: '۳. محدوده، ماژول و تعارض' },
                { step: 4 as const, titleEn: '4. Mapping, Validation & Sync', titleFa: '۴. نگاشت، اعتبارسنجی و اجرا' },
              ].map(item => {
                const isActive = wizardStep === item.step;
                const isDone = wizardStep > item.step;
                const canJump =
                  item.step === 1 ||
                  item.step <= wizardStep ||
                  (item.step === 3 &&
                    ((selectedSource === 'excel' && Boolean(excelWorkbook)) ||
                      Boolean(activeConnection?.connected)));
                return (
                  <button
                    key={item.step}
                    disabled={!canJump}
                    onClick={() => canJump && setWizardStep(item.step)}
                    className={`p-2.5 rounded-lg border text-start flex items-center gap-2 transition-colors ${
                      isActive
                        ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold'
                        : isDone
                        ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300 font-semibold'
                        : 'border-slate-200 dark:border-slate-800 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    {isDone ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <span
                        className={`w-5 h-5 rounded-full text-[11px] font-mono flex items-center justify-center shrink-0 ${
                          isActive ? 'bg-blue-600 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                        }`}
                      >
                        {formatLocalizedNumber(item.step, language)}
                      </span>
                    )}
                    <span className="truncate">{isFa ? item.titleFa : item.titleEn}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* STEP 1: SELECT SOURCE */}
          {wizardStep === 1 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  {isFa ? 'گام ۱: منبع ورود و همگام‌سازی را انتخاب کنید' : 'Step 1: Select Integration Source'}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  {isFa
                    ? 'سیستم مبدا را برای برقراری اتصال، استخراج ساختار فیلدها و نگاشت به جیرافلو انتخاب نمایید.'
                    : 'Choose the external source platform or workbook format to import and synchronize.'}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  {
                    id: 'jira' as const,
                    title: 'Atlassian Jira',
                    titleFa: 'آتلاسین جیرا (Jira)',
                    desc: 'Import Projects, Epics, Stories, Subtasks, Sprints, Versions, Issue Links & Custom Fields.',
                    descFa: 'ورود پروژه‌ها، اپیک‌ها، استوری‌ها، زیروظایف، اسپرینت‌ها، نسخه‌ها و فیلدهای سفارشی.',
                    icon: JiraBrandIcon,
                  },
                  {
                    id: 'confluence' as const,
                    title: 'Atlassian Confluence',
                    titleFa: 'کانفلوئنس (Confluence)',
                    desc: 'Import Spaces, Nested Page Trees, Structured Tables, Versions, Comments & Attachments.',
                    descFa: 'ورود فضاها، درخت صفحات فرزند، جداول ساختاریافته، نسخه‌ها، دیدگاه‌ها و پیوست‌ها.',
                    icon: ConfluenceBrandIcon,
                  },
                  {
                    id: 'excel' as const,
                    title: 'Microsoft Excel / CSV',
                    titleFa: 'مایکروسافت اکسل / CSV',
                    desc: 'Upload .xlsx / .csv for Tasks, WBS, Projects, Resources, Schedules, Risks, Budgets & Milestones.',
                    descFa: 'بارگذاری فایل اکسل/CSV برای وظایف، WBS، پروژه‌ها، منابع، زمان‌بندی، ریسک‌ها و بودجه.',
                    icon: ExcelBrandIcon,
                  },
                ].map(card => {
                  const Icon = card.icon;
                  const active = selectedSource === card.id;
                  return (
                    <button
                      key={card.id}
                      onClick={() => openWizardForSource(card.id, 2)}
                      className={`p-5 rounded-xl border text-start transition-all space-y-3 ${
                        active
                          ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/30 ring-2 ring-blue-500/20'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <Icon className="w-10 h-10" />
                      <div>
                        <div className="font-bold text-sm text-slate-900 dark:text-white">
                          {isFa ? card.titleFa : card.title}
                        </div>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                          {isFa ? card.descFa : card.desc}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 2: ESTABLISH CONNECTION (JIRA / CONFLUENCE) */}
          {wizardStep === 2 && (selectedSource === 'jira' || selectedSource === 'confluence') && (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
              <form
                onSubmit={handleTestAndConnect}
                className="lg:col-span-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4 text-xs"
              >
                <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                  {selectedSource === 'jira' ? (
                    <JiraBrandIcon className="w-8 h-8" />
                  ) : (
                    <ConfluenceBrandIcon className="w-8 h-8" />
                  )}
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                      {selectedSource === 'jira'
                        ? isFa
                          ? 'گام ۲: اتصال رمزنگاری‌شده به سرور Jira'
                          : 'Step 2: Establish Jira Connection'
                        : isFa
                        ? 'گام ۲: اتصال رمزنگاری‌شده به سرور Confluence'
                        : 'Step 2: Establish Confluence Connection'}
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      {isFa
                        ? 'توکن‌ها با رمزنگاری AES-256-GCM در خزانه سرور نگهداری و با محافظ SSRF اعتبارسنجی می‌شوند.'
                        : 'Secrets are stored encrypted with AES-256-GCM and validated against SSRF rules.'}
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold mb-1">
                    {isFa ? 'نشانی سرور (Server URL) *' : 'Server URL *'}
                  </label>
                  <input
                    type="url"
                    required
                    dir="ltr"
                    value={serverUrl}
                    onChange={e => setServerUrl(e.target.value)}
                    placeholder="https://your-org.atlassian.net"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1">
                    {isFa ? 'روش احراز هویت' : 'Authentication Method'}
                  </label>
                  <select
                    value={authMethod}
                    onChange={e => setAuthMethod(e.target.value as IntegrationAuthMethod)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
                  >
                    <option value="api_token">
                      {isFa ? 'Atlassian Cloud API Token (ایمیل + توکن)' : 'Atlassian Cloud API Token (Email + Token)'}
                    </option>
                    <option value="pat">
                      {isFa ? 'توکن دسترسی شخصی (Personal Access Token / PAT)' : 'Personal Access Token (Bearer PAT)'}
                    </option>
                    <option value="basic">
                      {isFa ? 'احراز هویت پایه (نام کاربری + رمز عبور)' : 'Basic Auth (Username + Password)'}
                    </option>
                    <option value="oauth_bearer">
                      {isFa ? 'توکن OAuth 2.0 Bearer' : 'OAuth 2.0 Bearer Access Token'}
                    </option>
                  </select>
                </div>

                {authMethod === 'api_token' && (
                  <div>
                    <label className="block font-semibold mb-1">
                      {isFa ? 'ایمیل حساب Atlassian *' : 'Atlassian Account Email *'}
                    </label>
                    <input
                      type="email"
                      required
                      dir="ltr"
                      value={authEmail}
                      onChange={e => setAuthEmail(e.target.value)}
                      placeholder="user@company.com"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
                    />
                  </div>
                )}

                {authMethod === 'basic' && (
                  <div>
                    <label className="block font-semibold mb-1">
                      {isFa ? 'نام کاربری *' : 'Username *'}
                    </label>
                    <input
                      type="text"
                      required
                      dir="ltr"
                      value={authUsername}
                      onChange={e => setAuthUsername(e.target.value)}
                      placeholder="jira.admin"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
                    />
                  </div>
                )}

                <div>
                  <label className="block font-semibold mb-1">
                    {authMethod === 'basic'
                      ? isFa
                        ? 'رمز عبور *'
                        : 'Password *'
                      : isFa
                      ? 'توکن دسترسی (API Token / PAT) *'
                      : 'Access Token / API Token *'}
                  </label>
                  <input
                    type="password"
                    required
                    dir="ltr"
                    value={authSecret}
                    onChange={e => setAuthSecret(e.target.value)}
                    placeholder="••••••••••••••••••••"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
                  />
                </div>

                {connectError && (
                  <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{connectError}</span>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setWizardStep(1)}
                    className="px-3 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md font-semibold flex items-center gap-1 whitespace-nowrap shrink-0"
                  >
                    {isFa ? <ArrowRight className="w-3.5 h-3.5" /> : <ArrowLeft className="w-3.5 h-3.5" />}
                    <span>{isFa ? 'بازگشت' : 'Back'}</span>
                  </button>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="submit"
                      disabled={connecting}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-60"
                    >
                      {connecting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Plug className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {connecting
                          ? isFa
                            ? 'در حال آزمایش اتصال...'
                            : 'Testing Connection...'
                          : isFa
                          ? 'تست اتصال و ذخیره'
                          : 'Test & Save Connection'}
                      </span>
                    </button>
                    {activeConnection?.connected && (
                      <button
                        type="button"
                        onClick={() => setWizardStep(3)}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0"
                      >
                        <span>{isFa ? 'مرحله بعد: انتخاب داده‌ها' : 'Next: Choose Data'}</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </form>

              {/* Right Panel: Connection Status & Accessible Projects/Spaces */}
              <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {isFa ? 'وضعیت اتصال و منابع' : 'Account & Accessible Resources'}
                  </h3>
                  {renderHealthBadge(activeConnection)}
                </div>

                {activeConnection ? (
                  <div className="space-y-4">
                    <div className="p-3.5 rounded-lg bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 space-y-1.5">
                      <div className="font-bold text-slate-900 dark:text-white">
                        {activeConnection.account.displayName}
                      </div>
                      {activeConnection.account.email && (
                        <div className="font-mono text-[11px] text-slate-500">
                          {activeConnection.account.email}
                        </div>
                      )}
                      <div className="font-mono text-[11px] text-slate-500" dir="ltr">
                        {activeConnection.serverUrl}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="font-semibold text-slate-700 dark:text-slate-300">
                        {selectedSource === 'jira'
                          ? isFa
                            ? `پروژه‌های قابل دسترس (${formatLocalizedNumber(
                                activeConnection.projectsOrSpaces.length,
                                language
                              )})`
                            : `Accessible Projects (${activeConnection.projectsOrSpaces.length})`
                          : isFa
                          ? `فضاهای قابل دسترس (${formatLocalizedNumber(
                              activeConnection.projectsOrSpaces.length,
                              language
                            )})`
                          : `Accessible Spaces (${activeConnection.projectsOrSpaces.length})`}
                      </div>
                      <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                        {activeConnection.projectsOrSpaces.length === 0 ? (
                          <div className="p-4 text-center text-slate-400">
                            {isFa ? 'موردی یافت نشد.' : 'No accessible items returned.'}
                          </div>
                        ) : (
                          activeConnection.projectsOrSpaces.map(item => (
                            <div key={item.id} className="p-2.5 flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                                  {item.name}
                                </div>
                                <div className="text-[10px] text-slate-400">{item.type || 'standard'}</div>
                              </div>
                              <span className="font-mono font-bold text-[11px] text-blue-600 shrink-0">
                                {item.key}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg space-y-2">
                    <Database className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700" />
                    <div>
                      {isFa
                        ? 'پس از تست اتصال موفق، حساب کاربری تاییدشده و فهرست پروژه‌ها یا فضاها در اینجا نمایش داده می‌شوند.'
                        : 'Test your connection to verify your account and inspect accessible projects or spaces.'}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 2: EXCEL UPLOAD & SHEET READER WITH HEADER OVERRIDE */}
          {wizardStep === 2 && selectedSource === 'excel' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <ExcelBrandIcon className="w-8 h-8" />
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                      {isFa ? 'گام ۲: بارگذاری و تحلیل فایل Excel / CSV' : 'Step 2: Upload & Read Excel / CSV'}
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      {isFa
                        ? 'پشتیبانی از XLSX، CSV (UTF-8 و Windows-1256 فارسی)، تشخیص سرستون و ایمن‌سازی فرمول‌ها.'
                        : 'Supports XLSX, UTF-8 & Windows-1256 CSV, automatic/manual header row detection, and formula sanitization.'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(['project', 'task', 'wbs', 'resource', 'risk'] as ExcelTemplateType[]).map(t => (
                    <button
                      key={t}
                      onClick={() => void handleDownloadTemplate(t)}
                      disabled={downloadingTemplate !== null}
                      className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded font-semibold flex items-center gap-1 whitespace-nowrap shrink-0"
                    >
                      <Download className="w-3 h-3 text-emerald-600" />
                      <span className="capitalize">{t}</span>
                    </button>
                  ))}
                </div>
              </div>

              <label
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) void handleExcelUpload(f);
                }}
                className="block border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 rounded-xl p-8 text-center cursor-pointer transition-colors bg-slate-50/70 dark:bg-slate-800/30"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) void handleExcelUpload(f);
                  }}
                />
                {parsingExcel ? (
                  <div className="flex flex-col items-center gap-2 text-emerald-600">
                    <Loader2 className="w-8 h-8 animate-spin" />
                    <span className="font-semibold">
                      {isFa ? 'در حال پردازش و تشخیص ستون‌ها...' : 'Parsing workbook and detecting columns...'}
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="w-8 h-8 text-emerald-600" />
                    <div className="font-bold text-sm text-slate-900 dark:text-white">
                      {isFa
                        ? 'فایل Excel (.xlsx) یا CSV را اینجا بکشید یا انتخاب کنید'
                        : 'Drag & drop or click to upload an Excel (.xlsx) or CSV file'}
                    </div>
                    <div className="text-slate-500">
                      {isFa
                        ? 'حداکثر حجم مجاز: ۱۵ مگابایت · پشتیبانی از جداکننده ویرگول، سمی‌کولن، تب و تاریخ شمسی'
                        : 'Max size: 15 MB · Supports comma/semicolon/tab delimiters, Persian encoding & Jalali dates'}
                    </div>
                  </div>
                )}
              </label>

              {excelError && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{excelError}</span>
                </div>
              )}

              {excelWorkbook && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                    <div className="flex flex-wrap items-center gap-2 font-semibold text-emerald-800 dark:text-emerald-300">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{excelWorkbook.fileName}</span>
                      <span className="font-mono px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px]">
                        {excelWorkbook.detectedFormat}
                      </span>
                      {excelWorkbook.detectedEncoding && (
                        <span className="font-mono px-1.5 py-0.5 rounded bg-slate-700 text-white text-[10px]">
                          {excelWorkbook.detectedEncoding}
                        </span>
                      )}
                    </div>
                    <div className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                      {formatLocalizedNumber(excelWorkbook.sheetCount, language)}{' '}
                      {isFa ? 'کاربرگ شناسایی شد' : 'sheet(s) detected'}
                    </div>
                  </div>

                  {/* Sheet Selector + Manual Header Row Override */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-2">
                      {excelWorkbook.sheets.map(sh => (
                        <button
                          key={sh.name}
                          onClick={() => {
                            setSelectedSheetName(sh.name);
                            setManualHeaderRow(String(sh.headerRowUsed || 1));
                          }}
                          className={`px-3 py-2 rounded-lg border font-semibold flex items-center gap-2 ${
                            selectedSheetName === sh.name
                              ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                              : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5" />
                          <span>{sh.name}</span>
                          <span className="font-mono text-[10px] text-slate-400">
                            ({formatLocalizedNumber(sh.rowCount, language)} {isFa ? 'ردیف' : 'rows'})
                          </span>
                        </button>
                      ))}
                    </div>

                    {lastExcelPayload && (
                      <div className="flex flex-wrap items-center gap-2 bg-slate-50 dark:bg-slate-800/70 p-2 rounded-lg border border-slate-200 dark:border-slate-700">
                        <label className="font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {isFa ? 'ردیف سرستون:' : 'Header Row:'}
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          dir="ltr"
                          value={manualHeaderRow}
                          onChange={e => setManualHeaderRow(e.target.value)}
                          className="w-16 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded font-mono text-center"
                        />
                        <button
                          type="button"
                          onClick={() => void handleReparseHeaderRow()}
                          disabled={parsingExcel}
                          className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold whitespace-nowrap shrink-0"
                        >
                          {isFa ? 'بازخوانی' : 'Re-Parse'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowRawMatrix(v => !v)}
                          className="px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap shrink-0"
                        >
                          {showRawMatrix
                            ? isFa
                              ? 'نمایش جدول داده‌ها'
                              : 'Show Parsed Rows'
                            : isFa
                            ? 'پیش‌نمایش ماتریس خام'
                            : 'Raw Matrix Preview'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Duplicate Keys Warning */}
                  {selectedSheetObj && selectedSheetObj.duplicateKeys.length > 0 && (
                    <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                      <div>
                        <span className="font-bold">
                          {isFa ? 'هشدار کلید تکراری در فایل:' : 'Duplicate Keys Detected:'}
                        </span>{' '}
                        <span className="font-mono">
                          {selectedSheetObj.duplicateKeys.slice(0, 10).join(', ')}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Preview table or Raw Matrix */}
                  {selectedSheetObj && (
                    <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
                      {showRawMatrix && selectedSheetObj.rawPreviewMatrix ? (
                        <table className="w-full text-xs text-start border-collapse">
                          <thead className="bg-slate-100/80 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800">
                            <tr>
                              <th className="p-2 text-start font-mono w-14">#</th>
                              {(selectedSheetObj.rawPreviewMatrix[0] || []).map((_, cIdx) => (
                                <th key={cIdx} className="p-2 text-start font-mono text-[10px]">
                                  Col {cIdx + 1}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {selectedSheetObj.rawPreviewMatrix.map((rowVals, rIdx) => {
                              const isHeader = rIdx + 1 === selectedSheetObj.headerRowUsed;
                              return (
                                <tr
                                  key={rIdx}
                                  className={
                                    isHeader ? 'bg-blue-50/80 dark:bg-blue-950/30 font-bold' : ''
                                  }
                                >
                                  <td className="p-2 font-mono text-slate-400">
                                    {rIdx + 1} {isHeader ? '★' : ''}
                                  </td>
                                  {rowVals.map((val, cIdx) => (
                                    <td
                                      key={cIdx}
                                      className="p-2 text-slate-700 dark:text-slate-300 max-w-[200px] truncate"
                                    >
                                      {val}
                                    </td>
                                  ))}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      ) : (
                        <table className="w-full text-xs text-start border-collapse">
                          <thead className="bg-slate-100/80 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800">
                            <tr>
                              {selectedSheetObj.columns.map(col => (
                                <th key={col.key} className="p-2.5 text-start whitespace-nowrap">
                                  <div className="font-bold text-slate-800 dark:text-slate-200">
                                    {col.label}
                                  </div>
                                  <div className="text-[10px] font-mono text-blue-600 uppercase">
                                    {col.type}
                                  </div>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {selectedSheetObj.rows.slice(0, 6).map((r, idx) => (
                              <tr key={idx}>
                                {selectedSheetObj.columns.map(col => (
                                  <td
                                    key={col.key}
                                    className="p-2.5 text-slate-600 dark:text-slate-300 max-w-[220px] truncate"
                                  >
                                    {String(r[col.key] ?? '')}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={() => setWizardStep(1)}
                  className="px-3 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md font-semibold flex items-center gap-1 whitespace-nowrap shrink-0"
                >
                  {isFa ? <ArrowRight className="w-3.5 h-3.5" /> : <ArrowLeft className="w-3.5 h-3.5" />}
                  <span>{isFa ? 'بازگشت' : 'Back'}</span>
                </button>
                <button
                  disabled={!excelWorkbook}
                  onClick={() => setWizardStep(3)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50"
                >
                  <span>{isFa ? 'مرحله بعد: انتخاب مقصد و ماژول' : 'Next: Choose What to Import'}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: CHOOSE WHAT TO IMPORT & POLICY */}
          {wizardStep === 3 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-6 text-xs">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  {isFa ? 'گام ۳: انتخاب محدوده، ماژول مقصد و سیاست تعارض' : 'Step 3: Choose Scope, Destination Module & Conflict Policy'}
                </h2>
                <p className="text-slate-500 mt-0.5">
                  {isFa
                    ? 'پروژه‌ها/کاربرگ‌ها، همگام‌سازی افزایشی، ماژول مقصد و نحوه برخورد با تداخل داده‌ها را مشخص کنید.'
                    : 'Configure remote scope, incremental delta filtering, local module, target space, and conflict handling.'}
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Source Selection */}
                <div className="space-y-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30">
                  <h3 className="font-bold text-slate-900 dark:text-white">
                    {isFa ? '۱. انتخاب از منبع' : '1. Source Selection'}
                  </h3>

                  {selectedSource === 'excel' && excelWorkbook && (
                    <div>
                      <label className="block font-semibold mb-1">
                        {isFa ? 'کاربرگ مبدا (Sheet)' : 'Source Worksheet'}
                      </label>
                      <select
                        value={selectedSheetName}
                        onChange={e => setSelectedSheetName(e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md"
                      >
                        {excelWorkbook.sheets.map(sh => (
                          <option key={sh.name} value={sh.name}>
                            {sh.name} ({formatLocalizedNumber(sh.rowCount, language)} {isFa ? 'ردیف' : 'rows'})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {(selectedSource === 'jira' || selectedSource === 'confluence') && activeConnection && (
                    <div className="space-y-3">
                      <label className="block font-semibold">
                        {selectedSource === 'jira'
                          ? isFa
                            ? 'پروژه‌های Jira برای ورود:'
                            : 'Select Jira Project(s):'
                          : isFa
                          ? 'فضاهای Confluence برای ورود:'
                          : 'Select Confluence Space(s):'}
                      </label>
                      <div className="max-h-40 overflow-y-auto space-y-1.5 border border-slate-200 dark:border-slate-700 rounded-lg p-2 bg-white dark:bg-slate-900">
                        {activeConnection.projectsOrSpaces.map(item => {
                          const checked = selectedRemoteKeys.includes(item.key);
                          return (
                            <label
                              key={item.id}
                              className="flex items-center justify-between gap-2 p-1.5 rounded hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              <span className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    setSelectedRemoteKeys(prev =>
                                      prev.includes(item.key)
                                        ? prev.filter(k => k !== item.key)
                                        : [...prev, item.key]
                                    )
                                  }
                                  className="rounded border-slate-300 text-blue-600"
                                />
                                <span className="font-medium">{item.name}</span>
                              </span>
                              <span className="font-mono text-[11px] font-bold text-blue-600">{item.key}</span>
                            </label>
                          );
                        })}
                      </div>

                      {selectedSource === 'jira' && (
                        <div>
                          <label className="block font-semibold mb-1">
                            {isFa ? 'فیلتر سفارشی JQL (اختیاری)' : 'Optional JQL Filter Override'}
                          </label>
                          <input
                            type="text"
                            dir="ltr"
                            value={jiraJql}
                            onChange={e => setJiraJql(e.target.value)}
                            placeholder="e.g. status != Closed ORDER BY updated DESC"
                            className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
                          />
                        </div>
                      )}

                      <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 space-y-2">
                        <label className="flex items-center gap-2 font-semibold cursor-pointer">
                          <input
                            type="checkbox"
                            checked={incrementalOnly}
                            onChange={e => setIncrementalOnly(e.target.checked)}
                            className="rounded border-slate-300 text-blue-600"
                          />
                          <span>
                            {isFa
                              ? 'همگام‌سازی افزایشی (فقط تغییرات جدیدتر از تاریخ مشخص)'
                              : 'Incremental Sync (Only items updated since timestamp)'}
                          </span>
                        </label>
                        {incrementalOnly && (
                          <input
                            type="text"
                            dir="ltr"
                            value={updatedSinceInput}
                            onChange={e => setUpdatedSinceInput(e.target.value)}
                            placeholder="2026-01-01T00:00:00Z or 2026-01-01"
                            className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded font-mono text-[11px]"
                          />
                        )}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block font-semibold mb-1">
                      {isFa ? 'ماژول مقصد در جیرافلو' : 'Destination Module Mapping'}
                    </label>
                    <select
                      value={destinationModule}
                      onChange={e => setDestinationModule(e.target.value as DestinationModule)}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md font-semibold"
                    >
                      {(selectedSource === 'jira'
                        ? (['work_items', 'wbs', 'epics', 'projects', 'schedules', 'documents'] as DestinationModule[])
                        : selectedSource === 'confluence'
                        ? (['documents', 'work_items'] as DestinationModule[])
                        : (['work_items', 'wbs', 'projects', 'resources', 'schedules', 'epics', 'documents', 'risks', 'budgets', 'milestones'] as DestinationModule[])
                      ).map(mod => (
                        <option key={mod} value={mod}>
                          {isFa ? DESTINATION_MODULE_LABELS[mod].fa : DESTINATION_MODULE_LABELS[mod].en}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold mb-1">
                      {isFa ? 'سیاست مدیریت تعارض (Conflict Policy)' : 'Conflict Resolution Policy'}
                    </label>
                    <select
                      value={conflictPolicy}
                      onChange={e => setConflictPolicy(e.target.value as ConflictPolicy)}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md"
                    >
                      {(Object.keys(CONFLICT_POLICY_LABELS) as ConflictPolicy[]).map(cp => (
                        <option key={cp} value={cp}>
                          {isFa ? CONFLICT_POLICY_LABELS[cp].fa : CONFLICT_POLICY_LABELS[cp].en}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Target Space Configuration */}
                <div className="space-y-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30">
                  <h3 className="font-bold text-slate-900 dark:text-white">
                    {isFa ? '۲. فضای کاری هدف (Target Space)' : '2. Target Local Space'}
                  </h3>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setTargetSpaceMode('existing')}
                      className={`flex-1 py-2 px-3 rounded-md border font-semibold ${
                        targetSpaceMode === 'existing'
                          ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {isFa ? 'فضای موجود' : 'Existing Space'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTargetSpaceMode('new')}
                      className={`flex-1 py-2 px-3 rounded-md border font-semibold flex items-center justify-center gap-1.5 ${
                        targetSpaceMode === 'new'
                          ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <FolderPlus className="w-3.5 h-3.5" />
                      <span>{isFa ? 'ایجاد فضای جدید' : 'Create New Space'}</span>
                    </button>
                  </div>

                  {targetSpaceMode === 'existing' ? (
                    <div>
                      <label className="block font-semibold mb-1">
                        {isFa ? 'انتخاب فضای مقصد' : 'Choose Destination Space'}
                      </label>
                      <select
                        value={targetProjectId}
                        onChange={e => setTargetProjectId(e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md"
                      >
                        {projects.map(p => (
                          <option key={p.id} value={p.id}>
                            [{p.key}] {isFa ? p.nameFa : p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-semibold mb-1">{isFa ? 'کلید فضا *' : 'Space Key *'}</label>
                        <input
                          type="text"
                          dir="ltr"
                          maxLength={8}
                          value={newSpaceKey}
                          onChange={e => setNewSpaceKey(e.target.value.toUpperCase())}
                          placeholder="IMP"
                          className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md font-mono uppercase"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold mb-1">{isFa ? 'الگو' : 'Template'}</label>
                        <select
                          value={newSpaceTemplate}
                          onChange={e =>
                            setNewSpaceTemplate(e.target.value as 'scrum' | 'kanban' | 'business')
                          }
                          className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md"
                        >
                          <option value="scrum">Scrum</option>
                          <option value="kanban">Kanban</option>
                          <option value="business">Business</option>
                        </select>
                      </div>
                      <div>
                        <label className="block font-semibold mb-1">{isFa ? 'نام انگلیسی فضا *' : 'Space Name (EN) *'}</label>
                        <input
                          type="text"
                          value={newSpaceName}
                          onChange={e => setNewSpaceName(e.target.value)}
                          placeholder="Imported Platform"
                          className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold mb-1">{isFa ? 'نام فارسی فضا' : 'Space Name (FA)'}</label>
                        <input
                          type="text"
                          value={newSpaceNameFa}
                          onChange={e => setNewSpaceNameFa(e.target.value)}
                          placeholder="فضای واردشده"
                          className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {discoverError && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{discoverError}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={() => setWizardStep(2)}
                  className="px-3 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md font-semibold flex items-center gap-1 whitespace-nowrap shrink-0"
                >
                  {isFa ? <ArrowRight className="w-3.5 h-3.5" /> : <ArrowLeft className="w-3.5 h-3.5" />}
                  <span>{isFa ? 'بازگشت' : 'Back'}</span>
                </button>
                <button
                  onClick={() => void handleProceedToMapping()}
                  disabled={discovering}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50"
                >
                  {discovering ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {discovering
                      ? isFa
                        ? 'در حال استخراج فیلدها و رکوردها...'
                        : 'Fetching live fields & data...'
                      : isFa
                      ? 'مرحله ۴: نگاشت فیلدها و اعتبارسنجی'
                      : 'Step 4: Field Mapping & Validation'}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: INTERACTIVE FIELD MAPPING, CELL VALIDATION & EXECUTION */}
          {wizardStep === 4 && (
            <div className="space-y-5 text-xs">
              {/* Completion Banner */}
              {importResult && (
                <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl p-5 space-y-3">
                  <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-200 text-sm font-bold">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span>
                      {isFa
                        ? `عملیات ورود و همگام‌سازی در فضای ${importResult.targetProjectKey} انجام شد`
                        : `Import & Synchronization Complete (${importResult.targetProjectKey})`}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-xs font-mono tabular-nums">
                    <span>
                      {isFa ? 'ایجاد:' : 'Created:'}{' '}
                      <strong className="text-emerald-700 dark:text-emerald-300">
                        {formatLocalizedNumber(importResult.createdCount, language)}
                      </strong>
                    </span>
                    <span>
                      {isFa ? 'به‌روزرسانی:' : 'Updated:'}{' '}
                      <strong className="text-blue-700 dark:text-blue-300">
                        {formatLocalizedNumber(importResult.updatedCount, language)}
                      </strong>
                    </span>
                    <span>
                      {isFa ? 'تکراری/رد شده:' : 'Skipped:'}{' '}
                      <strong>{formatLocalizedNumber(importResult.skippedCount, language)}</strong>
                    </span>
                    {Boolean(importResult.conflictCount) && (
                      <span className="text-amber-700 dark:text-amber-300">
                        {isFa ? 'تعارض:' : 'Conflicts:'}{' '}
                        <strong>{formatLocalizedNumber(importResult.conflictCount || 0, language)}</strong>
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      onClick={() => {
                        setCurrentProjectId(importResult.targetProjectId);
                        setActiveView(
                          destinationModule === 'documents'
                            ? 'docs'
                            : destinationModule === 'resources'
                            ? 'teams'
                            : destinationModule === 'risks' ||
                              destinationModule === 'budgets' ||
                              destinationModule === 'milestones'
                            ? 'summary'
                            : 'board'
                        );
                      }}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md font-semibold"
                    >
                      {destinationModule === 'documents'
                        ? isFa
                          ? 'مشاهده مستندات فضا (Docs)'
                          : 'Open Space Docs'
                        : destinationModule === 'resources'
                        ? isFa
                          ? 'مشاهده تیم‌ها و منابع'
                          : 'Open Teams & Resources'
                        : destinationModule === 'risks' ||
                          destinationModule === 'budgets' ||
                          destinationModule === 'milestones'
                        ? isFa
                          ? 'مشاهده خلاصه و ریسک‌های فضا'
                          : 'Open Space Governance Summary'
                        : isFa
                        ? 'ورود به تخته فضای مقصد'
                        : 'Open Target Space Board'}
                    </button>
                    <button
                      onClick={() => setActiveTab('overview')}
                      className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md font-semibold text-slate-700 dark:text-slate-200"
                    >
                      {isFa ? 'بازگشت به نمای کلی' : 'Back to Overview'}
                    </button>
                  </div>
                </div>
              )}

              {/* Mapping Toolbar */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => {
                      setMappings(suggestAutoMappings(sourceFields, destinationModule, selectedSource));
                      showToast('info', isFa ? 'نگاشت خودکار مجدداً اعمال شد.' : 'Auto-mapping applied.');
                    }}
                    className="px-3 py-1.5 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-md font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{isFa ? 'نگاشت خودکار' : 'Auto-Map'}</span>
                  </button>

                  {compatibleTemplates.length > 0 && (
                    <select
                      defaultValue=""
                      onChange={e => e.target.value && handleApplyTemplate(e.target.value)}
                      className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-medium"
                    >
                      <option value="">
                        {isFa ? 'بارگذاری قالب نگاشت...' : 'Load template...'}
                      </option>
                      {compatibleTemplates.map(tpl => (
                        <option key={tpl.id} value={tpl.id}>
                          {tpl.name}
                        </option>
                      ))}
                    </select>
                  )}

                  <button
                    onClick={() => setShowPreview(prev => !prev)}
                    className={`px-3 py-1.5 rounded-md border font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                      showPreview
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>
                      {isFa
                        ? `پیش‌نمایش داده‌ها (${formatLocalizedNumber(rawRows.length, language)})`
                        : `Dry-Run Preview (${rawRows.length})`}
                    </span>
                  </button>
                </div>

                {/* Save Reusable Template */}
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={templateNameInput}
                    onChange={e => setTemplateNameInput(e.target.value)}
                    placeholder={isFa ? 'نام قالب نگاشت...' : 'Save mapping template as...'}
                    className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md w-44"
                  />
                  <button
                    onClick={() => void handleSaveTemplate()}
                    className="px-3 py-1.5 bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 text-white rounded-md font-semibold flex items-center gap-1 whitespace-nowrap shrink-0"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{isFa ? 'ذخیره قالب' : 'Save'}</span>
                  </button>
                </div>
              </div>

              {/* Validation & Circular Dependency Errors */}
              {(!validation.valid || builtPreview.cellIssues.length > 0) && (
                <div className="space-y-3">
                  {!validation.valid && (
                    <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 space-y-1.5">
                      <div className="font-bold flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-rose-600" />
                        <span>
                          {isFa
                            ? 'پیش از اجرا موارد نگاشت زیر را تکمیل کنید:'
                            : 'Mapping validation errors must be resolved before importing:'}
                        </span>
                      </div>
                      {validation.missingRequired.length > 0 && (
                        <div>
                          • {isFa ? 'فیلدهای اجباری نگاشت‌نشده:' : 'Missing required fields:'}{' '}
                          <strong>
                            {validation.missingRequired
                              .map(f => (isFa ? f.labelFa : f.label))
                              .join('، ')}
                          </strong>
                        </div>
                      )}
                      {validation.incompatibleRules.length > 0 && (
                        <div>
                          • {isFa ? 'ناسازگاری نوع داده:' : 'Incompatible field types:'}{' '}
                          <strong>{validation.incompatibleRules.map(r => r.sourceLabel).join(', ')}</strong>
                        </div>
                      )}
                      {validation.duplicateTargets.length > 0 && (
                        <div>
                          • {isFa ? 'فیلد مقصد تکراری:' : 'Duplicate target fields:'}{' '}
                          <strong>{validation.duplicateTargets.join(', ')}</strong>
                        </div>
                      )}
                    </div>
                  )}

                  {builtPreview.cellIssues.length > 0 && (
                    <div className="bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800 rounded-xl overflow-hidden">
                      <div className="px-4 py-2.5 bg-amber-50/80 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 flex items-center justify-between">
                        <span className="font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-amber-600" />
                          {isFa
                            ? `هشدارها و خطاهای ردیف/سلول و وابستگی (${formatLocalizedNumber(
                                builtPreview.cellIssues.length,
                                language
                              )})`
                            : `Row / Cell Validation & Dependency Issues (${builtPreview.cellIssues.length})`}
                        </span>
                        {cellErrorsCount > 0 && (
                          <span className="text-[11px] font-bold text-rose-600">
                            {isFa
                              ? `${formatLocalizedNumber(cellErrorsCount, language)} خطای مسدودکننده`
                              : `${cellErrorsCount} blocking error(s)`}
                          </span>
                        )}
                      </div>
                      <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                        {builtPreview.cellIssues.slice(0, 25).map((ci, idx) => (
                          <div key={idx} className="px-4 py-2 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold uppercase ${
                                  ci.severity === 'error'
                                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                }`}
                              >
                                {ci.severity}
                              </span>
                              <span className="font-mono text-slate-500 shrink-0">
                                {isFa ? `ردیف ${formatLocalizedNumber(ci.rowIndex, language)}` : `Row ${ci.rowIndex}`} · {ci.columnKey}
                              </span>
                              <span className="text-slate-700 dark:text-slate-200 truncate">
                                {isFa ? ci.messageFa : ci.messageEn}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Field Mapping Table */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-start border-collapse">
                    <thead className="bg-slate-100/80 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                      <tr>
                        <th className="p-3 text-start">{isFa ? 'فیلد مبدا و نمونه' : 'Source Field & Sample'}</th>
                        <th className="p-3 text-start">{isFa ? 'فیلد مقصد' : 'Destination Field'}</th>
                        <th className="p-3 text-start">{isFa ? 'تبدیل' : 'Transformation'}</th>
                        <th className="p-3 text-start">{isFa ? 'مقدار پیش‌فرض' : 'Default'}</th>
                        <th className="p-3 text-start">{isFa ? 'سازگاری' : 'Compatibility'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {mappings.map(rule => {
                        const sfMeta = sourceFields.find(f => f.key === rule.sourceKey);
                        const destDefs = DESTINATION_FIELDS_BY_MODULE[destinationModule];
                        const compat = checkFieldCompatibility(rule, destinationModule);

                        return (
                          <tr key={rule.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                            <td className="p-3 align-top">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900 dark:text-white">
                                  {rule.sourceLabel}
                                </span>
                                <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[10px] text-slate-600 dark:text-slate-300 uppercase">
                                  {rule.sourceType}
                                </span>
                              </div>
                              {sfMeta?.sampleValue && (
                                <div className="text-[11px] text-slate-400 truncate max-w-[220px] mt-0.5">
                                  {sfMeta.sampleValue}
                                </div>
                              )}
                            </td>

                            <td className="p-3 align-top">
                              <select
                                value={rule.destinationField}
                                onChange={e =>
                                  updateMappingRow(rule.id, { destinationField: e.target.value })
                                }
                                className={`w-full min-w-[190px] px-2.5 py-1.5 rounded-md border bg-white dark:bg-slate-900 ${
                                  rule.destinationField === '__ignore__'
                                    ? 'border-slate-200 dark:border-slate-700 text-slate-400'
                                    : 'border-blue-300 dark:border-blue-800 font-semibold text-slate-900 dark:text-white'
                                }`}
                              >
                                <option value="__ignore__">
                                  {isFa ? '— نادیده گرفتن —' : '— Ignore / Skip —'}
                                </option>
                                {destDefs.map(df => (
                                  <option key={df.id} value={df.id}>
                                    {isFa ? df.labelFa : df.label} {df.required ? '*' : ''}
                                  </option>
                                ))}
                                {(destinationModule === 'work_items' || destinationModule === 'wbs') && (
                                  <>
                                    <option value="__custom_field__">
                                      {isFa
                                        ? '+ ذخیره به عنوان فیلد سفارشی (Custom Field)'
                                        : '+ Store in Custom Field'}
                                    </option>
                                    <option value="__custom_label__">
                                      {isFa
                                        ? '+ افزودن به برچسب‌های کار (Label)'
                                        : '+ Map as Label Tag'}
                                    </option>
                                  </>
                                )}
                              </select>
                            </td>

                            <td className="p-3 align-top">
                              <select
                                value={rule.transformation}
                                disabled={rule.destinationField === '__ignore__'}
                                onChange={e =>
                                  updateMappingRow(rule.id, {
                                    transformation: e.target.value as TransformationType,
                                  })
                                }
                                className="w-full min-w-[165px] px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 disabled:opacity-40"
                              >
                                {(Object.keys(TRANSFORM_LABELS) as TransformationType[]).map(trKey => (
                                  <option key={trKey} value={trKey}>
                                    {isFa ? TRANSFORM_LABELS[trKey].fa : TRANSFORM_LABELS[trKey].en}
                                  </option>
                                ))}
                              </select>
                            </td>

                            <td className="p-3 align-top">
                              <input
                                type="text"
                                disabled={rule.destinationField === '__ignore__'}
                                value={rule.defaultValue}
                                onChange={e =>
                                  updateMappingRow(rule.id, { defaultValue: e.target.value })
                                }
                                placeholder={isFa ? 'اختیاری...' : 'Fallback...'}
                                className="w-28 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 disabled:opacity-40"
                              />
                            </td>

                            <td className="p-3 align-top">
                              {rule.destinationField === '__ignore__' ? (
                                <span className="text-slate-400">{isFa ? 'غیرفعال' : 'Skipped'}</span>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  {rule.required && (
                                    <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold text-[10px]">
                                      {isFa ? 'الزامی' : 'Req'}
                                    </span>
                                  )}
                                  {compat.level === 'compatible' && (
                                    <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      <span>{isFa ? compat.reasonFa : compat.reasonEn}</span>
                                    </span>
                                  )}
                                  {compat.level === 'coercible' && (
                                    <span className="inline-flex items-center gap-1 text-amber-600 font-semibold">
                                      <AlertTriangle className="w-3.5 h-3.5" />
                                      <span>{isFa ? compat.reasonFa : compat.reasonEn}</span>
                                    </span>
                                  )}
                                  {compat.level === 'incompatible' && (
                                    <span className="inline-flex items-center gap-1 text-rose-600 font-bold">
                                      <AlertCircle className="w-3.5 h-3.5" />
                                      <span>{isFa ? compat.reasonFa : compat.reasonEn}</span>
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Interactive Workflow Status Mapping Sub-Panel */}
              {discoveredStatuses.length > 0 &&
                mappings.some(m => m.destinationField === 'status') && (
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                          {isFa
                            ? 'نگاشت وضعیت‌های گردش‌کار (Workflow Status Mapping)'
                            : 'Workflow Status Mapping'}
                        </h3>
                        <p className="text-[11px] text-slate-500">
                          {isFa
                            ? 'تطبیق وضعیت‌های مبدا با وضعیت‌های محلی (مثلاً To Do → انجام‌نشده، In Progress → در حال انجام، In Review → در انتظار بررسی، Done → انجام‌شده).'
                            : 'Map source workflow states to local workflow states.'}
                        </p>
                      </div>
                      <label className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={autoCreateMissingStatuses}
                          onChange={e => setAutoCreateMissingStatuses(e.target.checked)}
                          className="rounded border-slate-300 text-blue-600"
                        />
                        <span>
                          {isFa
                            ? 'افزودن خودکار وضعیت‌های جدید به گردش‌کار فضا'
                            : 'Auto-add missing source statuses'}
                        </span>
                      </label>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {discoveredStatuses.map(srcSt => (
                        <div
                          key={srcSt}
                          className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40"
                        >
                          <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                            {srcSt}
                          </span>
                          <select
                            value={statusMap[srcSt] || targetStatuses[0]?.id || 'todo'}
                            onChange={e =>
                              setStatusMap(prev => ({ ...prev, [srcSt]: e.target.value }))
                            }
                            className="px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-xs font-semibold"
                          >
                            {targetStatuses.map(ts => (
                              <option key={ts.id} value={ts.id}>
                                {isFa ? ts.nameFa : ts.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* Dry-Run Preview Table */}
              {showPreview && (
                <div className="bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-900 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-indigo-50/70 dark:bg-indigo-950/30 border-b border-indigo-200 dark:border-indigo-900 font-bold text-indigo-800 dark:text-indigo-200">
                    {isFa
                      ? `پیش‌نمایش رکوردهای تبدیل‌شده (${formatLocalizedNumber(
                          builtPreview.previewRows.length,
                          language
                        )} نمونه اول از ${formatLocalizedNumber(rawRows.length, language)} رکورد)`
                      : `Dry-Run Transformed Preview (${builtPreview.previewRows.length} of ${rawRows.length} rows)`}
                  </div>
                  {builtPreview.previewRows.length === 0 ? (
                    <div className="p-6 text-center text-slate-400">
                      {isFa
                        ? 'با نگاشت فعلی رکوردی برای پیش‌نمایش تولید نشد.'
                        : 'No preview rows produced with the current mapping.'}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-start border-collapse">
                        <thead className="bg-slate-100/80 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800">
                          <tr>
                            {Object.keys(builtPreview.previewRows[0]).map(col => (
                              <th key={col} className="p-2.5 text-start font-mono uppercase text-[11px]">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {builtPreview.previewRows.map((row, idx) => (
                            <tr key={idx}>
                              {Object.values(row).map((v, cIdx) => (
                                <td
                                  key={cIdx}
                                  className="p-2.5 text-slate-700 dark:text-slate-300 max-w-[240px] truncate"
                                >
                                  {String(v ?? '')}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Footer Actions: Immediate Import OR Background Job */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  onClick={() => setWizardStep(3)}
                  className="px-3 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md font-semibold flex items-center gap-1 whitespace-nowrap shrink-0"
                >
                  {isFa ? <ArrowRight className="w-3.5 h-3.5" /> : <ArrowLeft className="w-3.5 h-3.5" />}
                  <span>{isFa ? 'بازگشت به گام ۳' : 'Back to Step 3'}</span>
                </button>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => void handleQueueBackgroundJob()}
                    disabled={!validation.valid || queueingJob || rawRows.length === 0}
                    className="px-4 py-2.5 bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 text-white rounded-md font-semibold flex items-center gap-2 whitespace-nowrap shrink-0 disabled:opacity-50"
                  >
                    {queueingJob ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Activity className="w-4 h-4" />
                    )}
                    <span>
                      {isFa ? 'ثبت در صف پردازش پس‌زمینه' : 'Queue Background Sync Job'}
                    </span>
                  </button>

                  <button
                    onClick={() => void handleExecuteImport()}
                    disabled={
                      !validation.valid ||
                      cellErrorsCount > 0 ||
                      executingImport ||
                      rawRows.length === 0
                    }
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md font-bold flex items-center gap-2 whitespace-nowrap shrink-0 disabled:opacity-50"
                  >
                    {executingImport ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    <span>
                      {executingImport
                        ? isFa
                          ? 'در حال ورود و همگام‌سازی...'
                          : 'Executing Import...'
                        : isFa
                        ? `اجرای فوری ورود (${formatLocalizedNumber(rawRows.length, language)} رکورد)`
                        : `Execute Immediate Import (${rawRows.length})`}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================== TAB 3: BACKGROUND SYNC JOBS QUEUE ======================== */}
      {activeTab === 'jobs' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden text-xs">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-600" />
                <span>{isFa ? 'صف عملیات پردازش و همگام‌سازی پس‌زمینه' : 'Background Sync Jobs Queue'}</span>
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {isFa
                  ? 'پایش پیشرفت لحظه‌ای، مکث/ادامه، توقف، تلاش مجدد و گزارش خطای ردیف به ردیف با بازیابی خودکار.'
                  : 'Real-time progress, pause/resume/cancel/retry controls, checkpoint recovery, and per-item diagnostics.'}
              </p>
            </div>
            <button
              onClick={() => void refreshServerState()}
              className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{isFa ? 'بروزرسانی' : 'Refresh'}</span>
            </button>
          </div>

          {jobs.length === 0 ? (
            <div className="p-10 text-center text-slate-500 space-y-2">
              <Activity className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700" />
              <div className="font-semibold text-slate-700 dark:text-slate-300">
                {isFa ? 'هنوز عملیات پس‌زمینه‌ای ثبت نشده است' : 'No background sync jobs queued yet'}
              </div>
              <p>
                {isFa
                  ? 'در گام ۴ ویزارد ورود یا بخش زمان‌بندی‌ها می‌توانید عملیات پس‌زمینه اجرا کنید.'
                  : 'Queue a sync job from Step 4 of the Import Wizard or trigger a scheduled profile.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {jobs.map(job => {
                const pct =
                  job.totalItems > 0
                    ? Math.min(100, Math.round((job.processedItems / job.totalItems) * 100))
                    : job.status === 'completed'
                    ? 100
                    : 0;
                const isExpanded = expandedJobId === job.id;

                return (
                  <div key={job.id} className="p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[10px]">
                            {job.provider}
                          </span>
                          <span className="font-bold text-slate-900 dark:text-white truncate">
                            {job.sourceLabel}
                          </span>
                          <span className="font-mono font-bold text-blue-600">
                            → {job.targetSpaceKey}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              job.status === 'completed'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : job.status === 'running' || job.status === 'queued'
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                                : job.status === 'paused' || job.status === 'partial'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                            }`}
                          >
                            {job.status}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono tabular-nums flex flex-wrap items-center gap-3">
                          <span>
                            {formatLocalizedNumber(job.processedItems, language)} /{' '}
                            {formatLocalizedNumber(job.totalItems, language)} ({formatLocalizedNumber(pct, language)}%)
                          </span>
                          <span className="text-emerald-600">
                            +{formatLocalizedNumber(job.createdCount, language)}
                          </span>
                          <span className="text-blue-600">
                            ~{formatLocalizedNumber(job.updatedCount, language)}
                          </span>
                          <span>
                            {isFa ? 'تکراری:' : 'skip:'} {formatLocalizedNumber(job.skippedCount, language)}
                          </span>
                          {job.conflictCount > 0 && (
                            <span className="text-amber-600 font-bold">
                              {isFa ? 'تعارض:' : 'conflicts:'}{' '}
                              {formatLocalizedNumber(job.conflictCount, language)}
                            </span>
                          )}
                          {job.failedCount > 0 && (
                            <span className="text-rose-600 font-bold">
                              {isFa ? 'خطا:' : 'failed:'}{' '}
                              {formatLocalizedNumber(job.failedCount, language)}
                            </span>
                          )}
                          <span>{formatLocalizedDateTime(job.createdAt, language)}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {(job.status === 'running' || job.status === 'queued') && (
                          <button
                            onClick={() => void handleJobAction(job.id, 'pause')}
                            className="px-2.5 py-1 bg-amber-100 text-amber-800 hover:bg-amber-200 rounded font-semibold flex items-center gap-1 whitespace-nowrap shrink-0"
                          >
                            <Pause className="w-3 h-3" />
                            <span>{isFa ? 'مکث' : 'Pause'}</span>
                          </button>
                        )}
                        {job.status === 'paused' && (
                          <button
                            onClick={() => void handleJobAction(job.id, 'resume')}
                            className="px-2.5 py-1 bg-blue-600 text-white hover:bg-blue-700 rounded font-semibold flex items-center gap-1 whitespace-nowrap shrink-0"
                          >
                            <Play className="w-3 h-3" />
                            <span>{isFa ? 'ادامه' : 'Resume'}</span>
                          </button>
                        )}
                        {(job.status === 'running' ||
                          job.status === 'queued' ||
                          job.status === 'paused') && (
                          <button
                            onClick={() => void handleJobAction(job.id, 'cancel')}
                            className="px-2.5 py-1 bg-rose-100 text-rose-700 hover:bg-rose-200 rounded font-semibold flex items-center gap-1 whitespace-nowrap shrink-0"
                          >
                            <Square className="w-3 h-3" />
                            <span>{isFa ? 'لغو' : 'Cancel'}</span>
                          </button>
                        )}
                        {(job.status === 'failed' ||
                          job.status === 'partial' ||
                          job.status === 'cancelled') && (
                          <button
                            onClick={() => void handleJobAction(job.id, 'retry')}
                            className="px-2.5 py-1 bg-slate-800 text-white hover:bg-slate-900 rounded font-semibold flex items-center gap-1 whitespace-nowrap shrink-0"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>{isFa ? 'تلاش مجدد' : 'Retry'}</span>
                          </button>
                        )}
                        <button
                          onClick={() => void toggleExpandJob(job.id)}
                          className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded font-semibold flex items-center gap-1 whitespace-nowrap shrink-0"
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                          <span>{isFa ? 'جزئیات ردیف‌ها' : 'Items'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          job.status === 'failed'
                            ? 'bg-rose-500'
                            : job.status === 'paused'
                            ? 'bg-amber-500'
                            : job.status === 'completed'
                            ? 'bg-emerald-500'
                            : 'bg-blue-600'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    {job.errorSummary && (
                      <div className="text-[11px] text-rose-600 dark:text-rose-400">
                        {job.errorSummary}
                      </div>
                    )}

                    {/* Expandable Job Items Table */}
                    {isExpanded && expandedJobDetails?.id === job.id && (
                      <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-slate-50/70 dark:bg-slate-800/30">
                        {(expandedJobDetails.items || []).length === 0 ? (
                          <div className="p-4 text-center text-slate-400">
                            {isFa ? 'جزئیات آیتمی ثبت نشده است.' : 'No item logs recorded.'}
                          </div>
                        ) : (
                          <div className="max-h-60 overflow-y-auto">
                            <table className="w-full text-[11px] text-start border-collapse">
                              <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-500">
                                <tr>
                                  <th className="p-2 text-start">{isFa ? 'کلید خارجی' : 'External Key'}</th>
                                  <th className="p-2 text-start">{isFa ? 'عملیات' : 'Action'}</th>
                                  <th className="p-2 text-start">{isFa ? 'وضعیت' : 'Status'}</th>
                                  <th className="p-2 text-start">{isFa ? 'پیام / خطا' : 'Details'}</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800">
                                {(expandedJobDetails.items || []).map(it => (
                                  <tr key={it.id}>
                                    <td className="p-2 font-mono font-bold text-blue-600">
                                      {it.externalKey}
                                    </td>
                                    <td className="p-2 font-mono uppercase">{it.action}</td>
                                    <td className="p-2 font-mono">{it.status}</td>
                                    <td className="p-2 text-slate-600 dark:text-slate-300">
                                      {it.errorMessage || '-'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ======================== TAB 4: CONFLICTS REVIEW UI ======================== */}
      {activeTab === 'conflicts' && (
        <div className="space-y-4 text-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <GitCompare className="w-4 h-4 text-amber-600" />
                <span>
                  {isFa ? 'بررسی و حل تعارض‌های همگام‌سازی' : 'Sync Conflict Review & Resolution'}
                </span>
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {isFa
                  ? 'مقایسه مقدار منبع خارجی با مقدار تغییریافته محلی و انتخاب نسخه برنده برای هر فیلد.'
                  : 'Compare incoming source fields against locally edited values and pick the winning value per field or record.'}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {(['pending', 'resolved', 'all'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setConflictFilter(f)}
                  className={`px-3 py-1.5 rounded-md font-semibold capitalize whitespace-nowrap shrink-0 ${
                    conflictFilter === f
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {f === 'pending'
                    ? isFa
                      ? 'در انتظار بررسی'
                      : 'Pending'
                    : f === 'resolved'
                    ? isFa
                      ? 'حل‌شده'
                      : 'Resolved'
                    : isFa
                    ? 'همه'
                    : 'All'}
                </button>
              ))}
            </div>
          </div>

          {filteredConflicts.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center text-slate-500 space-y-2">
              <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500" />
              <div className="font-semibold text-slate-700 dark:text-slate-300">
                {isFa ? 'هیچ تعارضی برای نمایش وجود ندارد' : 'No sync conflicts to review'}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredConflicts.map(conflict => {
                const choices = conflictMergeChoices[conflict.id] || {};
                const isPending = conflict.status === 'pending';

                return (
                  <div
                    key={conflict.id}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px]">
                          {conflict.provider}
                        </span>
                        <span className="font-mono font-bold text-blue-600 text-sm">
                          {conflict.externalKey}
                        </span>
                        <span className="text-slate-400">·</span>
                        <span className="font-mono text-slate-500">{conflict.entityType}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            isPending
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                          }`}
                        >
                          {conflict.status}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400 tabular-nums">
                        {formatLocalizedDateTime(conflict.createdAt, language)}
                      </span>
                    </div>

                    <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                      <table className="w-full text-xs text-start border-collapse">
                        <thead className="bg-slate-100/80 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                          <tr>
                            <th className="p-2.5 text-start">{isFa ? 'فیلد' : 'Field'}</th>
                            <th className="p-2.5 text-start">{isFa ? 'مقدار منبع (Source)' : 'Incoming Source Value'}</th>
                            <th className="p-2.5 text-start">{isFa ? 'مقدار فعلی محلی (Local)' : 'Current Local Value'}</th>
                            {isPending && (
                              <th className="p-2.5 text-start">{isFa ? 'انتخاب در ادغام' : 'Merge Choice'}</th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {conflict.fieldDiffs.map(diff => {
                            const selectedSide = choices[diff.field] || diff.chosen || 'source';
                            return (
                              <tr key={diff.field}>
                                <td className="p-2.5 font-mono font-bold text-slate-800 dark:text-slate-200">
                                  {diff.field}
                                </td>
                                <td className="p-2.5 text-blue-700 dark:text-blue-300 bg-blue-50/40 dark:bg-blue-950/20 max-w-[260px] break-words">
                                  {JSON.stringify(diff.sourceValue ?? '')}
                                </td>
                                <td className="p-2.5 text-amber-800 dark:text-amber-300 bg-amber-50/40 dark:bg-amber-950/20 max-w-[260px] break-words">
                                  {JSON.stringify(diff.localValue ?? '')}
                                </td>
                                {isPending && (
                                  <td className="p-2.5">
                                    <select
                                      value={selectedSide}
                                      onChange={e =>
                                        setConflictMergeChoices(prev => ({
                                          ...prev,
                                          [conflict.id]: {
                                            ...(prev[conflict.id] || {}),
                                            [diff.field]: e.target.value as 'source' | 'destination',
                                          },
                                        }))
                                      }
                                      className="px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-[11px]"
                                    >
                                      <option value="source">{isFa ? 'مقدار منبع' : 'Use Source'}</option>
                                      <option value="destination">{isFa ? 'مقدار محلی' : 'Keep Local'}</option>
                                    </select>
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {isPending && (
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          disabled={resolvingConflictId === conflict.id}
                          onClick={() => void handleResolveConflict(conflict, 'dismissed')}
                          className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded font-semibold"
                        >
                          {isFa ? 'نادیده گرفتن' : 'Dismiss'}
                        </button>
                        <button
                          disabled={resolvingConflictId === conflict.id}
                          onClick={() => void handleResolveConflict(conflict, 'resolved_destination')}
                          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded font-semibold"
                        >
                          {isFa ? 'حفظ نسخه محلی' : 'Keep All Local'}
                        </button>
                        <button
                          disabled={resolvingConflictId === conflict.id}
                          onClick={() => void handleResolveConflict(conflict, 'resolved_merged')}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-semibold"
                        >
                          {isFa ? 'اعمال ترکیب انتخابی' : 'Apply Selected Merge'}
                        </button>
                        <button
                          disabled={resolvingConflictId === conflict.id}
                          onClick={() => void handleResolveConflict(conflict, 'resolved_source')}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold"
                        >
                          {isFa ? 'پذیرش کامل از منبع' : 'Accept Source'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ======================== TAB 5: TEMPLATES & SCHEDULED SYNC PROFILES ======================== */}
      {activeTab === 'templates_schedules' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 text-xs">
          {/* Scheduled Sync Configuration Builder & List */}
          <div className="space-y-4">
            <form
              onSubmit={handleSaveConfig}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
            >
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <CalendarClock className="w-4 h-4 text-blue-600" />
                  <span>{isFa ? 'ایجاد پروفایل همگام‌سازی خودکار' : 'Create Scheduled Sync Profile'}</span>
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {isFa
                    ? 'اجرای دوره‌ای در پس‌زمینه با تشخیص تغییرات افزایشی و سیاست مدیریت تعارض.'
                    : 'Run periodic incremental syncs automatically on the server background worker.'}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">{isFa ? 'نام پروفایل *' : 'Profile Name *'}</label>
                  <input
                    type="text"
                    required
                    value={cfgName}
                    onChange={e => setCfgName(e.target.value)}
                    placeholder={isFa ? 'مثلاً همگام‌سازی ساعتی تسک‌ها' : 'e.g. Hourly Engineering Sync'}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">{isFa ? 'منبع' : 'Provider'}</label>
                  <select
                    value={cfgProvider}
                    onChange={e => setCfgProvider(e.target.value as 'jira' | 'confluence')}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
                  >
                    <option value="jira">Jira</option>
                    <option value="confluence">Confluence</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1">{isFa ? 'فضای مقصد' : 'Target Space'}</label>
                  <select
                    value={cfgTargetProjectId}
                    onChange={e => setCfgTargetProjectId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
                  >
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>
                        [{p.key}] {isFa ? p.nameFa : p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1">{isFa ? 'ماژول مقصد' : 'Destination Module'}</label>
                  <select
                    value={cfgDestinationModule}
                    onChange={e => setCfgDestinationModule(e.target.value as DestinationModule)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
                  >
                    {(['work_items', 'epics', 'documents', 'schedules', 'projects'] as DestinationModule[]).map(m => (
                      <option key={m} value={m}>
                        {isFa ? DESTINATION_MODULE_LABELS[m].fa : DESTINATION_MODULE_LABELS[m].en}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1">
                    {isFa ? 'کلیدهای محدوده (با کاما)' : 'Scope Keys (comma-separated)'}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={cfgScopesText}
                    onChange={e => setCfgScopesText(e.target.value)}
                    placeholder="ENG, OPS"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">{isFa ? 'حالت اجرا' : 'Sync Mode'}</label>
                  <div className="flex gap-2">
                    <select
                      value={cfgSyncMode}
                      onChange={e => setCfgSyncMode(e.target.value as 'manual' | 'scheduled')}
                      className="flex-1 px-2.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
                    >
                      <option value="scheduled">{isFa ? 'زمان‌بندی خودکار' : 'Scheduled'}</option>
                      <option value="manual">{isFa ? 'دستی' : 'Manual'}</option>
                    </select>
                    {cfgSyncMode === 'scheduled' && (
                      <input
                        type="number"
                        min={5}
                        max={10080}
                        dir="ltr"
                        value={cfgIntervalMinutes}
                        onChange={e => setCfgIntervalMinutes(Number(e.target.value))}
                        title={isFa ? 'دقیقه' : 'Interval Minutes'}
                        className="w-20 px-2 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono text-center"
                      />
                    )}
                  </div>
                </div>
                <div>
                  <label className="block font-semibold mb-1">{isFa ? 'سیاست تعارض' : 'Conflict Policy'}</label>
                  <select
                    value={cfgConflictPolicy}
                    onChange={e => setCfgConflictPolicy(e.target.value as ConflictPolicy)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
                  >
                    {(Object.keys(CONFLICT_POLICY_LABELS) as ConflictPolicy[]).map(cp => (
                      <option key={cp} value={cp}>
                        {isFa ? CONFLICT_POLICY_LABELS[cp].fa : CONFLICT_POLICY_LABELS[cp].en}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1">{isFa ? 'فیلتر JQL / CQL' : 'Optional JQL / CQL'}</label>
                  <input
                    type="text"
                    dir="ltr"
                    value={cfgJql}
                    onChange={e => setCfgJql(e.target.value)}
                    placeholder="updated >= -7d"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                <label className="flex items-center gap-2 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cfgEnabled}
                    onChange={e => setCfgEnabled(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600"
                  />
                  <span>{isFa ? 'پروفایل فعال باشد' : 'Enable profile immediately'}</span>
                </label>
                <button
                  type="submit"
                  disabled={savingConfig}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isFa ? 'ذخیره پروفایل' : 'Save Profile'}</span>
                </button>
              </div>
            </form>

            {/* Saved Sync Configs List */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 font-bold text-slate-900 dark:text-white">
                {isFa ? 'پروفایل‌های همگام‌سازی ذخیره‌شده' : 'Configured Sync Profiles'}
              </div>
              {configs.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  {isFa ? 'پروفایلی ثبت نشده است.' : 'No sync profiles configured yet.'}
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {configs.map(cfg => (
                    <div key={cfg.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px]">
                            {cfg.provider}
                          </span>
                          <span className="font-bold text-slate-900 dark:text-white truncate">
                            {cfg.name}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              cfg.enabled
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {cfg.syncMode === 'scheduled'
                              ? isFa
                                ? `هر ${formatLocalizedNumber(cfg.syncIntervalMinutes, language)} دقیقه`
                                : `Every ${cfg.syncIntervalMinutes}m`
                              : isFa
                              ? 'دستی'
                              : 'Manual'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {cfg.destinationModule} · {cfg.conflictPolicy} ·{' '}
                          {cfg.lastSuccessfulSyncAt
                            ? formatLocalizedDateTime(cfg.lastSuccessfulSyncAt, language)
                            : isFa
                            ? 'اجرا نشده'
                            : 'Never run'}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => void handleRunConfigNow(cfg)}
                          className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold flex items-center gap-1 whitespace-nowrap shrink-0"
                        >
                          <Play className="w-3 h-3" />
                          <span>{isFa ? 'اجرای فوری' : 'Run Now'}</span>
                        </button>
                        <button
                          onClick={() => void handleDeleteConfig(cfg.id)}
                          className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded"
                          title={isFa ? 'حذف پروفایل' : 'Delete profile'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Saved Mapping Templates */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden h-fit">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <BookmarkCheck className="w-4 h-4 text-emerald-600" />
                <span>{isFa ? 'قالب‌های نگاشت فیلدها' : 'Saved Field Mapping Templates'}</span>
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {isFa
                  ? 'قالب‌های نگاشت ستون‌ها و وضعیت‌ها در همگام‌سازی‌های بعدی و Quick Sync استفاده می‌شوند.'
                  : 'Reusable mapping profiles applied automatically during quick syncs or loaded inside Step 4.'}
              </p>
            </div>

            {mappingTemplates.length === 0 ? (
              <div className="p-10 text-center text-slate-500 space-y-2">
                <BookmarkCheck className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700" />
                <div className="font-semibold text-slate-700 dark:text-slate-300">
                  {isFa ? 'هنوز قالب نگاشتی ذخیره نشده است' : 'No mapping templates saved yet'}
                </div>
                <p>
                  {isFa
                    ? 'در گام ۴ ویزارد ورود، نگاشت دلخواه خود را تنظیم و به عنوان قالب ذخیره کنید.'
                    : 'Configure field mappings in Step 4 of the Import Wizard and click Save.'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {mappingTemplates.map(tpl => (
                  <div key={tpl.id} className="p-4 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white">{tpl.name}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {tpl.source.toUpperCase()} →{' '}
                        {isFa
                          ? DESTINATION_MODULE_LABELS[tpl.destinationModule]?.fa || tpl.destinationModule
                          : DESTINATION_MODULE_LABELS[tpl.destinationModule]?.en || tpl.destinationModule}{' '}
                        ·{' '}
                        {formatLocalizedNumber(
                          tpl.mappings.filter(m => m.destinationField !== '__ignore__').length,
                          language
                        )}{' '}
                        {isFa ? 'فیلد نگاشت‌شده' : 'mapped fields'} ·{' '}
                        {formatLocalizedDateTime(tpl.updatedAt, language)}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        deleteMappingTemplate(tpl.id);
                        void apiFetch(`/api/integrations/templates/${tpl.id}`, { method: 'DELETE' }).catch(() => null);
                      }}
                      className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded"
                      title={isFa ? 'حذف قالب' : 'Delete template'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================== TAB 6: SYNC HISTORY & SECURITY AUDIT LOG ======================== */}
      {activeTab === 'history' && (
        <div className="space-y-6 text-xs">
          {/* Client/Run Sync History */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                {isFa ? 'تاریخچه اجراهای همگام‌سازی' : 'Synchronization Run History'}
              </h2>
            </div>

            {syncHistory.length === 0 ? (
              <div className="p-8 text-center text-slate-500 space-y-2">
                <History className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700" />
                <div className="font-semibold text-slate-700 dark:text-slate-300">
                  {isFa ? 'تاریخچه‌ای ثبت نشده است' : 'No synchronization runs recorded yet'}
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-start border-collapse">
                  <thead className="bg-slate-100/80 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                    <tr>
                      <th className="p-3 text-start">{isFa ? 'منبع' : 'Source'}</th>
                      <th className="p-3 text-start">{isFa ? 'محدوده مبدا' : 'Source Scope'}</th>
                      <th className="p-3 text-start">{isFa ? 'فضای مقصد' : 'Target Space'}</th>
                      <th className="p-3 text-start">{isFa ? 'وضعیت' : 'Status'}</th>
                      <th className="p-3 text-end">{isFa ? 'ایجاد / بروزرسانی' : 'Created / Updated'}</th>
                      <th className="p-3 text-end">{isFa ? 'زمان اجرا' : 'Executed At'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {syncHistory.map(rec => (
                      <tr key={rec.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="p-3 font-mono font-bold uppercase text-slate-800 dark:text-slate-200">
                          {rec.provider}
                        </td>
                        <td className="p-3 text-slate-700 dark:text-slate-300">{rec.sourceLabel}</td>
                        <td className="p-3 font-mono font-bold text-blue-600">{rec.targetSpaceKey}</td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              rec.status === 'success'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                            }`}
                          >
                            {rec.status}
                          </span>
                        </td>
                        <td className="p-3 text-end font-mono tabular-nums">
                          +{formatLocalizedNumber(rec.createdCount, language)} / ~
                          {formatLocalizedNumber(rec.updatedCount, language)}
                        </td>
                        <td className="p-3 text-end tabular-nums text-slate-500">
                          {formatLocalizedDateTime(rec.timestamp, language)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Server Audit Log */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  <span>{isFa ? 'گزارش ممیزی امنیتی سرور (Audit Log)' : 'Server Integration Audit Trail'}</span>
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {isFa
                    ? 'تمامی اتصال‌ها، بررسی‌های سلامت، ثبت کارها و حل تعارض‌ها با حذف خودکار مقادیر حساس ثبت می‌شوند.'
                    : 'All connections, health checks, queued jobs, and conflict resolutions are logged with secrets scrubbed.'}
                </p>
              </div>
              <select
                value={auditProviderFilter}
                onChange={e => setAuditProviderFilter(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-semibold"
              >
                <option value="all">{isFa ? 'همه منابع' : 'All Providers'}</option>
                <option value="jira">Jira</option>
                <option value="confluence">Confluence</option>
                <option value="excel">Excel</option>
                <option value="system">System</option>
              </select>
            </div>

            {filteredAuditLogs.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                {isFa ? 'رویداد ممیزی‌ای برای این فیلتر وجود ندارد.' : 'No audit log entries match this filter.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-start border-collapse">
                  <thead className="bg-slate-100/80 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                    <tr>
                      <th className="p-3 text-start">{isFa ? 'منبع' : 'Provider'}</th>
                      <th className="p-3 text-start">{isFa ? 'عملیات' : 'Action'}</th>
                      <th className="p-3 text-start">{isFa ? 'کاربر / نقش' : 'Actor / Role'}</th>
                      <th className="p-3 text-start">{isFa ? 'وضعیت' : 'Status'}</th>
                      <th className="p-3 text-start">{isFa ? 'شرح' : 'Summary'}</th>
                      <th className="p-3 text-end">{isFa ? 'زمان' : 'Timestamp'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredAuditLogs.map(log => (
                      <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="p-3 font-mono font-bold uppercase">{log.provider}</td>
                        <td className="p-3 font-mono text-slate-700 dark:text-slate-300">{log.action}</td>
                        <td className="p-3 font-mono text-slate-500">
                          {log.actorUserId} ({log.actorRole})
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              log.status === 'success'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : log.status === 'warning'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                            }`}
                          >
                            {log.status}
                          </span>
                        </td>
                        <td className="p-3 text-slate-700 dark:text-slate-300 max-w-[360px]">
                          {log.summary}
                        </td>
                        <td className="p-3 text-end tabular-nums text-slate-500">
                          {formatLocalizedDateTime(log.createdAt, language)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
