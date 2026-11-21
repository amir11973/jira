export type IssueType = 'epic' | 'story' | 'task' | 'feature' | 'bug' | 'subtask';
export type Priority = 'lowest' | 'low' | 'medium' | 'high' | 'highest';
export type StatusCategory = 'todo' | 'inprogress' | 'done';
export type ResolutionType = 'Done' | "Won't Do" | 'Duplicate' | 'Cannot Reproduce';

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
  toStatusId: string;
  rules: WorkflowRule[];
}

export interface WorkflowDefinition {
  id: string;
  projectId: string;
  name: string;
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

export interface Issue {
  id: string;
  key: string;
  projectId: string;
  sprintId?: string | null;
  epicId?: string | null;
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
  flagged?: boolean;
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
  history?: HistoryEntry[];
  automationExecutions?: AutomationExecution[];
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

export interface Project {
  id: string;
  key: string;
  name: string;
  nameFa: string;
  description: string;
  leadId: string;
  avatarColor: string;
  category: string;
  template?: 'scrum' | 'kanban' | 'business' | 'work_requests';
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
  action: 'close_parent' | 'auto_assign_mover' | 'set_resolution_done' | 'unflag_issue' | 'add_watcher_lead';
  enabled: boolean;
  executionsCount: number;
}

export interface AutomationAuditLog {
  id: string;
  projectId: string;
  ruleId: string;
  ruleName: string;
  issueKey: string;
  status: 'success' | 'skipped';
  details: string;
  timestamp: string;
}

export interface SavedFilter {
  id: string;
  name: string;
  jql: string;
  ownerId: string;
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

export type ViewType =
  | 'summary'
  | 'board'
  | 'list'
  | 'backlog'
  | 'roadmap'
  | 'forms'
  | 'issues'
  | 'releases'
  | 'reports'
  | 'automation'
  | 'workflow'
  | 'users'
  | 'settings';
