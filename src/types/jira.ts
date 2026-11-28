export type IssueType = 'epic' | 'story' | 'task' | 'feature' | 'bug' | 'subtask';
export type Priority = 'lowest' | 'low' | 'medium' | 'high' | 'highest';
export type StatusCategory = 'todo' | 'inprogress' | 'done';
export type ResolutionType = 'Done' | "Won't Do" | 'Duplicate' | 'Cannot Reproduce';

export type SpaceTabId =
  | 'summary'
  | 'list'
  | 'board'
  | 'development'
  | 'forms'
  | 'roadmap'
  | 'docs'
  | 'reports'
  | 'backlog'
  | 'calendar'
  | 'goals'
  | 'releases'
  | 'archived'
  | 'attachments'
  | 'shortcuts';

export interface User {
  id: string;
  name: string;
  nameFa: string;
  email: string;
  avatar: string;
  avatarColor: string;
  role: 'admin' | 'developer' | 'qa' | 'product_owner' | 'designer';
  department?: string;
  status?: 'active' | 'inactive';
  joinedDate?: string;
}

export interface Status {
  id: string;
  numericId?: number;
  name: string;
  nameFa: string;
  category: StatusCategory;
  color: string;
}

export type WorkflowRuleKind = 'restrict' | 'validate' | 'perform';

export type WorkflowRuleType =
  | 'restrict_subtasks_status'
  | 'restrict_field_value'
  | 'restrict_previous_status'
  | 'restrict_separation_of_duties'
  | 'restrict_user_role'
  | 'validate_field'
  | 'validate_previous_status'
  | 'validate_parent_status'
  | 'validate_permission'
  | 'perform_assign'
  | 'perform_copy_field'
  | 'perform_set_security_level'
  | 'perform_trigger_webhook'
  | 'perform_update_field';

export interface WorkflowRule {
  id: string;
  kind: WorkflowRuleKind;
  type: WorkflowRuleType;
  label: string;
  labelFa: string;
  config: Record<string, string>;
}

export interface WorkflowTransition {
  id: string;
  numericId: number;
  name: string;
  nameFa: string;
  fromStatusId: 'start' | 'any' | string;
  fromStatusIds?: string[];
  toStatusId: string;
  rules: WorkflowRule[];
}

export interface WorkflowDefinition {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  isActive?: boolean;
  schemeName?: string;
  updatedAt?: string;
  statuses: Status[];
  transitions: WorkflowTransition[];
}

export interface Subtask {
  id: string;
  parentId: string;
  key: string;
  title: string;
  isCompleted: boolean;
  status: string;
}

export interface Comment {
  id: string;
  authorId: string;
  content: string;
  createdAt: string;
}

export interface Worklog {
  id: string;
  authorId: string;
  timeSpentMinutes: number;
  startedAt: string;
  comment?: string;
}

export interface IssueLink {
  id: string;
  type: 'blocks' | 'is_blocked_by' | 'cloners' | 'duplicates' | 'relates_to';
  targetIssueKey: string;
}

export interface HistoryEntry {
  id: string;
  authorId: string;
  field: string;
  fromValue: string;
  toValue: string;
  createdAt: string;
}

export interface AutomationExecution {
  id: string;
  ruleId: string;
  ruleName: string;
  status: 'success' | 'skipped';
  message: string;
  executedAt: string;
}

export interface IssueAttachment {
  id: string;
  name: string;
  size: string;
  mimeType: string;
  uploadedBy: string;
  uploadedAt: string;
  /** Present when a real file is stored on the server. */
  downloadUrl?: string;
  sizeBytes?: number;
}

export interface RepositoryConnection {
  id: string;
  name: string;
  provider: 'github' | 'gitlab' | 'bitbucket' | 'generic';
  baseUrl: string;
  defaultBranch?: string;
  description?: string;
  enabled: boolean;
  projectIds?: string[];
  connectedBy?: string;
  connectedAt?: string;
}

export interface DevLinkItem {
  id: string;
  type: 'pr' | 'branch' | 'commit';
  title: string;
  status: 'open' | 'merged' | 'deployed';
  repo: string;
  url: string;
  updatedAt: string;
}

export interface Issue {
  id: string;
  key: string;
  projectId: string;
  sprintId?: string | null;
  epicId?: string | null;
  parentIssueId?: string | null;
  type: IssueType;
  summary: string;
  description: string;
  status: string;
  priority: Priority;
  resolution?: ResolutionType | null;
  assigneeId?: string | null;
  reporterId: string;
  storyPoints?: number;
  originalEstimateMinutes?: number;
  remainingEstimateMinutes?: number;
  securityLevel?: string;
  flagged?: boolean;
  archived?: boolean;
  issueColor?: string;
  rank?: string;
  startDate?: string;
  dueDate?: string;
  team?: string;
  watchers?: string[];
  labels: string[];
  components: string[];
  fixVersionIds: string[];
  subtasks: Subtask[];
  comments: Comment[];
  worklogs: Worklog[];
  links: IssueLink[];
  attachments?: IssueAttachment[];
  devLinks?: DevLinkItem[];
  history?: HistoryEntry[];
  automationExecutions?: AutomationExecution[];
  wbsCode?: string;
  estimatedCost?: number;
  actualCost?: number;
  isMilestone?: boolean;
  externalKey?: string;
  externalUrl?: string;
  customFields?: Record<string, string | number | boolean>;
  createdAt: string;
  updatedAt: string;
}

export interface Epic {
  id: string;
  key: string;
  projectId: string;
  name: string;
  nameFa: string;
  summary: string;
  color: string;
  status: 'todo' | 'inprogress' | 'done';
  startDate: string;
  dueDate: string;
}

export interface Sprint {
  id: string;
  projectId: string;
  name: string;
  goal: string;
  startDate?: string;
  endDate?: string;
  status: 'planned' | 'active' | 'completed';
  completedAt?: string;
}

export interface Version {
  id: string;
  projectId: string;
  name: string;
  description: string;
  releaseDate?: string;
  startDate?: string;
  isReleased: boolean;
}

export interface ProjectFeatures {
  sprints: boolean;
  estimation: boolean;
  standups: boolean;
  forms: boolean;
  releases: boolean;
}

export interface NotificationSettings {
  onCreated: boolean;
  onTransitioned: boolean;
  onCommented: boolean;
  onAssigned: boolean;
  senderName: string;
}

export interface SpaceShortcut {
  id: string;
  title: string;
  url: string;
}

export type DocStructuredBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'code'; language?: string; code: string }
  | { type: 'quote'; text: string }
  | { type: 'image'; alt: string; url: string }
  | { type: 'macro_warning'; macroName: string; fallbackText: string };

export interface DocAttachmentMeta {
  id: string;
  name: string;
  size: string;
  mimeType: string;
  downloadUrl?: string;
}

export interface DocCommentMeta {
  id: string;
  author: string;
  authorName?: string;
  text: string;
  content?: string;
  createdAt: string;
}

export interface SpaceDocPage {
  id: string;
  title: string;
  content: string;
  authorId: string;
  authorName?: string;
  createdAt?: string;
  updatedAt: string;
  parentId?: string | null;
  ancestors?: Array<{ id: string; title: string }>;
  version?: number;
  sourceUrl?: string;
  sourceProvider?: 'confluence' | 'excel' | 'local';
  externalId?: string;
  labels?: string[];
  attachments?: DocAttachmentMeta[];
  comments?: DocCommentMeta[];
  conversionWarnings?: string[];
  structuredBlocks?: DocStructuredBlock[];
}

export interface SpacePolicy {
  id: string;
  title: string;
  titleFa: string;
  description: string;
  enabled: boolean;
}

export interface RiskItem {
  id: string;
  projectId: string;
  key: string;
  title: string;
  titleFa?: string;
  description: string;
  category?: string;
  probability: 'low' | 'medium' | 'high' | 'critical';
  impact: 'low' | 'medium' | 'high' | 'critical';
  score?: number;
  status: 'open' | 'mitigating' | 'closed';
  ownerId: string;
  mitigationPlan?: string;
  dueDate?: string;
  costImpact?: number;
  linkedIssueKey?: string;
  externalId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MilestoneItem {
  id: string;
  projectId: string;
  title: string;
  titleFa?: string;
  description?: string;
  startDate?: string;
  dueDate: string;
  status: 'planned' | 'on_track' | 'at_risk' | 'achieved' | 'upcoming' | 'completed';
  ownerId: string;
  epicId?: string;
  wbsCode?: string;
  externalId?: string;
  linkedIssueIds?: string[];
  dependsOnMilestoneIds?: string[];
  /** Set by the server when the milestone is achieved / completed. */
  completedAt?: string;
}

export interface Project {
  id: string;
  key: string;
  name: string;
  nameFa: string;
  description: string;
  leadId: string;
  avatarColor: string;
  category: string;
  template?: 'scrum' | 'kanban' | 'business' | 'work_requests' | 'it_service' | 'personal';
  starred?: boolean;
  budgetAllocated?: number;
  budgetSpent?: number;
  currency?: string;
  enabledTabs?: SpaceTabId[];
  shortcuts?: SpaceShortcut[];
  docs?: SpaceDocPage[];
  policies?: SpacePolicy[];
  features?: ProjectFeatures;
  notifications?: NotificationSettings;
}

export interface AutomationRule {
  id: string;
  projectId: string;
  name: string;
  nameFa: string;
  description: string;
  descriptionFa: string;
  trigger: 'issue_transitioned' | 'issue_created' | 'subtasks_all_done';
  triggerTargetStatus?: string;
  action:
    | 'close_parent'
    | 'auto_assign_mover'
    | 'set_resolution_done'
    | 'unflag_issue'
    | 'add_watcher_lead'
    | 'notify_assignee'
    | 'send_webhook';
  actionConfig?: Record<string, string>;
  enabled: boolean;
  executionsCount: number;
}

export interface AutomationAuditLog {
  id: string;
  projectId: string;
  ruleId: string;
  ruleName: string;
  issueKey: string;
  status: 'success' | 'skipped' | 'failed' | 'retrying';
  details: string;
  timestamp: string;
  jobId?: number;
  attempts?: number;
}

export interface SavedFilter {
  id: string;
  name: string;
  jql: string;
  ownerId: string;
  shareScope?: 'private' | 'team' | 'organization';
  createdAt: string;
}

export interface FormSubmissionTemplate {
  id: string;
  name: string;
  nameFa: string;
  description: string;
  descriptionFa: string;
  defaultType: IssueType;
  defaultPriority: Priority;
  fields: {
    id: string;
    label: string;
    labelFa: string;
    required: boolean;
    placeholder: string;
    type: 'text' | 'textarea' | 'select' | 'date';
    options?: string[];
  }[];
}

export interface DashboardGadget {
  id: string;
  type: 'assigned_to_me' | 'issue_stats' | 'priority_breakdown' | 'created_vs_resolved' | 'activity_stream';
  title: string;
  titleFa: string;
}

export interface DashboardConfig {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  projectId?: string;
  viewers: string;
  editors: string;
  viewScope?: 'private' | 'team' | 'organization';
  editScope?: 'private' | 'team' | 'organization';
  sharedWithUserIds?: string[];
  editorUserIds?: string[];
  starred?: boolean;
  gadgets: DashboardGadget[];
}

export interface GoalItem {
  id: string;
  projectId: string;
  title: string;
  titleFa: string;
  ownerId: string;
  description?: string;
  startDate?: string;
  targetDate: string;
  status: 'on_track' | 'at_risk' | 'completed';
  linkedEpicIds: string[];
  linkedIssueIds?: string[];
  linkedMilestoneIds?: string[];
  /** Goals that must be finished before this one can be completed. */
  dependsOnGoalIds?: string[];
  progressMode?: 'auto' | 'manual';
  manualProgress?: number;
  /** Set by the server when the goal is completed. */
  completedAt?: string;
}

export interface TeamEntity {
  id: string;
  name: string;
  nameFa: string;
  description: string;
  leadId: string;
  memberIds: string[];
}

export interface AssetEntity {
  id: string;
  key: string;
  name: string;
  schema: 'Services' | 'Servers' | 'Databases' | 'Cloud Clusters';
  status: 'Active' | 'Maintenance' | 'Deprecated';
  ownerId: string;
  environment: 'Production' | 'Staging' | 'Dev';
  linkedIssueKeys: string[];
}

export interface AppNotification {
  id: string;
  userId?: string;
  kind?: 'created' | 'assigned' | 'transitioned' | 'commented' | 'automation' | 'system';
  issueId?: string;
  actorId?: string;
  title: string;
  titleFa: string;
  message: string;
  issueKey?: string;
  createdAt: string;
  read: boolean;
}

export interface GlobalFieldDef {
  id: string;
  name: string;
  type: string;
  locked?: boolean;
  scope: 'System' | 'Jira Software' | 'Team-Managed' | 'Custom';
  description: string;
}

export interface LegacyWorkflowInfo {
  id: string;
  name: string;
  description: string;
  statusesCount: number;
  transitionsCount: number;
  schemeType: 'Company-managed' | 'System default';
}

export interface SiteConfig {
  siteTitle: string;
  timezone: string;
  defaultLanguage: 'fa' | 'en';
  announcementBanner: string;
  announcementEnabled: boolean;
  emailDigestEnabled: boolean;
  desktopAlertsEnabled: boolean;
}

export type GlobalSidebarItemKey =
  | 'for_you'
  | 'recent'
  | 'starred'
  | 'plans'
  | 'spaces'
  | 'filters'
  | 'dashboards'
  | 'assets'
  | 'teams'
  | 'integrations';

export type ViewType =
  | 'for_you'
  | 'spaces'
  | 'plans'
  | 'filters'
  | 'dashboards'
  | 'assets'
  | 'teams'
  | 'integrations'
  | 'summary'
  | 'board'
  | 'list'
  | 'backlog'
  | 'roadmap'
  | 'development'
  | 'forms'
  | 'docs'
  | 'calendar'
  | 'goals'
  | 'issues'
  | 'releases'
  | 'reports'
  | 'archived'
  | 'attachments'
  | 'shortcuts'
  | 'automation'
  | 'workflow'
  | 'users'
  | 'settings'
  | 'jira_admin';

export interface PlanItem {
  id: string;
  name: string;
  description: string;
  spaceIds: string[];
  ownerId: string;
  isDemo?: boolean;
  createdAt: string;
}

export type QuickCreateModalType =
  | 'none'
  | 'create_space'
  | 'create_plan'
  | 'create_dashboard'
  | 'create_team';

// ======================== INTEGRATION CENTER TYPES ========================

export type IntegrationSource = 'jira' | 'confluence' | 'excel';

export type IntegrationAuthMethod = 'api_token' | 'pat' | 'basic' | 'oauth_bearer';

export type DestinationModule =
  | 'work_items'
  | 'epics'
  | 'projects'
  | 'documents'
  | 'resources'
  | 'schedules'
  | 'wbs'
  | 'risks'
  | 'budgets'
  | 'milestones';

export type ConflictPolicy = 'source_wins' | 'destination_wins' | 'manual_review';
export type ExcelTemplateType = 'project' | 'task' | 'wbs' | 'resource' | 'risk' | 'all';

export type DetectedFieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'email'
  | 'boolean'
  | 'status'
  | 'list';

export type TransformationType =
  | 'direct'
  | 'rich_text'
  | 'user_lookup'
  | 'date_normalize'
  | 'status_map'
  | 'priority_normalize'
  | 'number_parse'
  | 'list_split'
  | 'constant';

export interface SourceFieldMeta {
  key: string;
  label: string;
  type: DetectedFieldType;
  sampleValue?: string;
}

export interface DestinationFieldDef {
  id: string;
  label: string;
  labelFa: string;
  required: boolean;
  expectedType: DetectedFieldType;
  allowedTransforms: TransformationType[];
}

export interface FieldMappingRule {
  id: string;
  sourceKey: string;
  sourceLabel: string;
  sourceType: DetectedFieldType;
  destinationField: string; // '__ignore__' | '__custom_label__' | '__custom_field__' | field id
  transformation: TransformationType;
  defaultValue: string;
  required: boolean;
}

export interface MappingTemplate {
  id: string;
  name: string;
  source: IntegrationSource;
  destinationModule: DestinationModule;
  mappings: FieldMappingRule[];
  statusMap: Record<string, string>;
  updatedAt: string;
}

export interface RemoteProjectOrSpace {
  id: string;
  key: string;
  name: string;
  type?: string;
  description?: string;
}

export interface IntegrationConnectionSummary {
  id: string;
  organizationId?: string;
  provider: 'jira' | 'confluence';
  serverUrl: string;
  authMethod: IntegrationAuthMethod;
  email?: string;
  username?: string;
  maskedIdentity: string;
  connected: boolean;
  healthStatus?: 'healthy' | 'degraded' | 'unreachable' | 'needs_reauth';
  healthMessage?: string;
  lastHealthCheckAt?: string | null;
  account: {
    accountId: string;
    displayName: string;
    email: string;
    avatarUrl?: string;
  };
  projectsOrSpaces: RemoteProjectOrSpace[];
  connectedAt: string;
  lastSyncedAt: string | null;
}

export interface CellValidationIssue {
  rowIndex: number;
  columnKey: string;
  severity: 'error' | 'warning';
  messageEn: string;
  messageFa: string;
}

export interface ExcelParsedSheet {
  name: string;
  headerRowUsed: number;
  detectedHeaderRow: number;
  rowCount: number;
  duplicateKeys: string[];
  columns: SourceFieldMeta[];
  rows: Array<Record<string, unknown>>;
  rawPreviewMatrix: string[][];
}

export interface ExcelParsedWorkbook {
  fileName: string;
  detectedFormat: 'XLSX' | 'CSV';
  detectedEncoding?: string;
  sheetCount: number;
  sheets: ExcelParsedSheet[];
}

export interface RecentExcelImport {
  id: string;
  fileName: string;
  format: string;
  sheetName: string;
  destinationModule: DestinationModule;
  targetSpaceKey: string;
  createdCount: number;
  updatedCount: number;
  timestamp: string;
}

export interface IntegrationSyncRecord {
  id: string;
  provider: IntegrationSource;
  status: 'success' | 'partial' | 'failed';
  sourceLabel: string;
  targetSpaceKey: string;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errorMessage?: string;
  timestamp: string;
}

export interface IntegrationConfigRecord {
  id: string;
  organizationId: string;
  connectionId: string;
  provider: IntegrationSource;
  name: string;
  targetProjectId: string;
  destinationModule: DestinationModule;
  sourceScopes: string[];
  jqlOrCqlFilter?: string;
  syncMode: 'manual' | 'scheduled';
  syncIntervalMinutes: number;
  conflictPolicy: ConflictPolicy;
  lastCheckpointCursor?: string;
  lastSuccessfulSyncAt?: string | null;
  enabled: boolean;
  updatedAt: string;
}

export interface IntegrationJobItemRecord {
  id: string;
  jobId: string;
  externalEntityType: string;
  externalEntityId: string;
  externalKey: string;
  localEntityType?: string;
  localEntityId?: string;
  action: 'create' | 'update' | 'skip' | 'conflict' | 'fail' | 'missing_in_source';
  status: 'pending' | 'succeeded' | 'failed' | 'conflict';
  rowNumber?: number;
  cellErrors?: CellValidationIssue[];
  errorMessage?: string;
  payloadSnapshot?: Record<string, unknown>;
  syncHash?: string;
  sourceUpdatedAt?: string;
}

export interface IntegrationJobRecord {
  id: string;
  organizationId: string;
  configId?: string;
  connectionId?: string;
  provider: IntegrationSource;
  mode: 'full' | 'incremental';
  status: 'queued' | 'running' | 'paused' | 'completed' | 'partial' | 'failed' | 'cancelled';
  sourceLabel: string;
  targetSpaceKey: string;
  destinationModule: DestinationModule;
  totalItems: number;
  processedItems: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  conflictCount: number;
  checkpointCursor?: string;
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  errorSummary?: string;
  createdAt: string;
  items?: IntegrationJobItemRecord[];
}

export interface IntegrationExternalLinkRecord {
  id: string;
  organizationId: string;
  provider: IntegrationSource;
  connectionId: string;
  externalEntityType: string;
  externalEntityId: string;
  externalKey: string;
  externalUrl?: string;
  localEntityType: string;
  localEntityId: string;
  localProjectId?: string;
  syncHash: string;
  sourceRevision?: string;
  sourceUpdatedAt?: string;
  localUpdatedAt?: string;
  missingInSource?: boolean;
  lastSyncedAt: string;
}

export interface IntegrationConflictDiff {
  field: string;
  sourceValue: unknown;
  localValue: unknown;
  chosen?: 'source' | 'destination';
}

export interface IntegrationConflictRecord {
  id: string;
  organizationId: string;
  jobId: string;
  configId?: string;
  externalLinkId?: string;
  provider: IntegrationSource;
  entityType: string;
  externalKey: string;
  localEntityId: string;
  fieldDiffs: IntegrationConflictDiff[];
  sourceSnapshot: Record<string, unknown>;
  localSnapshot: Record<string, unknown>;
  status: 'pending' | 'resolved_source' | 'resolved_destination' | 'resolved_merged' | 'dismissed';
  resolvedBy?: string;
  resolvedAt?: string;
  createdAt: string;
}

export interface IntegrationAuditLogRecord {
  id: string;
  organizationId: string;
  actorUserId: string;
  actorRole: string;
  provider: IntegrationSource | 'system';
  action: string;
  resourceType: string;
  resourceId?: string;
  status: 'success' | 'warning' | 'failed';
  summary: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface IntegrationImportPayload {
  source: IntegrationSource;
  destinationModule: DestinationModule;
  targetProjectId?: string;
  conflictPolicy?: ConflictPolicy;
  createNewSpace?: {
    key: string;
    name: string;
    nameFa?: string;
    description?: string;
    template?: 'scrum' | 'kanban' | 'business';
  };
  missingStatusesToAdd?: Array<{
    id: string;
    name: string;
    nameFa: string;
    category: StatusCategory;
  }>;
  projects?: Array<Partial<Project> & { key: string; name: string }>;
  epics?: Array<Partial<Epic> & { name: string }>;
  sprints?: Array<Partial<Sprint> & { name: string }>;
  versions?: Array<{ name: string; description?: string; releaseDate?: string; isReleased?: boolean }>;
  issues?: Array<
    Partial<Issue> & {
      summary: string;
      _sprintHint?: string;
      _epicHint?: string;
      _parentKeyHint?: string;
      _versionNamesHint?: string[];
      _dependencyHint?: string;
      _externalId?: string;
    }
  >;
  docs?: Array<
    Partial<SpaceDocPage> & {
      title: string;
      content: string;
      authorEmailOrName?: string;
      _parentExternalId?: string;
      _parentTitle?: string;
    }
  >;
  users?: Array<Partial<User> & { name: string; email: string }>;
  teams?: Array<Partial<TeamEntity> & { name: string }>;
  assets?: Array<Partial<AssetEntity> & { name: string }>;
  risks?: Array<Partial<RiskItem> & { title: string }>;
  milestones?: Array<Partial<MilestoneItem> & { title: string }>;
  budgets?: Array<{
    projectKey?: string;
    projectName?: string;
    allocated?: number;
    spent?: number;
    currency?: string;
  }>;
}

export interface IntegrationImportResult {
  targetProjectId: string;
  targetProjectKey: string;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  conflictCount?: number;
  warnings: string[];
  importedLinks?: Array<{
    externalEntityType: string;
    externalEntityId: string;
    externalKey: string;
    externalUrl?: string;
    localEntityType: string;
    localEntityId: string;
    syncHash: string;
    sourceUpdatedAt?: string;
  }>;
}



