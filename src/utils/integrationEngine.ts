import {
  AssetEntity,
  CellValidationIssue,
  ConflictPolicy,
  DestinationFieldDef,
  DestinationModule,
  DocStructuredBlock,
  Epic,
  FieldMappingRule,
  IntegrationImportPayload,
  IntegrationSource,
  Issue,
  IssueType,
  MilestoneItem,
  Priority,
  Project,
  RiskItem,
  SourceFieldMeta,
  Sprint,
  Status,
  TeamEntity,
  TransformationType,
  User,
} from '../types/jira';
import { latinizeDigits, parseAndNormalizeDate } from './jalaliDate';

export const DESTINATION_FIELDS_BY_MODULE: Record<DestinationModule, DestinationFieldDef[]> = {
  work_items: [
    { id: 'summary', label: 'Task Title (Summary)', labelFa: 'عنوان تسک (Summary)', required: true, expectedType: 'text', allowedTransforms: ['direct', 'rich_text', 'constant'] },
    { id: 'key', label: 'Work Item Key', labelFa: 'کلید یکتا (Key)', required: false, expectedType: 'text', allowedTransforms: ['direct', 'constant'] },
    { id: 'type', label: 'Work Item Type', labelFa: 'نوع کار (Epic/Story/Task/Bug/Subtask)', required: false, expectedType: 'text', allowedTransforms: ['direct', 'constant'] },
    { id: 'description', label: 'Description', labelFa: 'توضیحات (Description)', required: false, expectedType: 'text', allowedTransforms: ['direct', 'rich_text', 'constant'] },
    { id: 'status', label: 'Workflow Status', labelFa: 'وضعیت گردش‌کار (Status)', required: false, expectedType: 'status', allowedTransforms: ['status_map', 'direct', 'constant'] },
    { id: 'priority', label: 'Priority', labelFa: 'اولویت (Priority)', required: false, expectedType: 'text', allowedTransforms: ['priority_normalize', 'direct', 'constant'] },
    { id: 'assigneeId', label: 'Assigned User', labelFa: 'مسئول انجام (Assignee)', required: false, expectedType: 'email', allowedTransforms: ['user_lookup', 'direct', 'constant'] },
    { id: 'reporterId', label: 'Reporter', labelFa: 'گزارش‌دهنده (Reporter)', required: false, expectedType: 'email', allowedTransforms: ['user_lookup', 'direct', 'constant'] },
    { id: 'storyPoints', label: 'Story Points', labelFa: 'امتیاز تخمین (Story Points)', required: false, expectedType: 'number', allowedTransforms: ['number_parse', 'direct', 'constant'] },
    { id: 'originalEstimateMinutes', label: 'Original Estimate (min)', labelFa: 'تخمین اولیه (دقیقه)', required: false, expectedType: 'number', allowedTransforms: ['number_parse', 'direct', 'constant'] },
    { id: 'remainingEstimateMinutes', label: 'Remaining Estimate (min)', labelFa: 'تخمین باقی‌مانده (دقیقه)', required: false, expectedType: 'number', allowedTransforms: ['number_parse', 'direct', 'constant'] },
    { id: 'startDate', label: 'Start Date', labelFa: 'تاریخ شروع', required: false, expectedType: 'date', allowedTransforms: ['date_normalize', 'direct', 'constant'] },
    { id: 'dueDate', label: 'Due Date', labelFa: 'تاریخ سررسید', required: false, expectedType: 'date', allowedTransforms: ['date_normalize', 'direct', 'constant'] },
    { id: 'epicKeyOrName', label: 'Parent Epic', labelFa: 'اپیک والد (Parent Epic)', required: false, expectedType: 'text', allowedTransforms: ['direct', 'constant'] },
    { id: 'parentKey', label: 'Parent Work Item Key', labelFa: 'کلید کار والد (Parent Key)', required: false, expectedType: 'text', allowedTransforms: ['direct', 'constant'] },
    { id: 'dependencyKey', label: 'Depends On / Blocked By Key', labelFa: 'کلید وابستگی (Dependency)', required: false, expectedType: 'text', allowedTransforms: ['direct', 'constant'] },
    { id: 'wbsCode', label: 'WBS Code', labelFa: 'کد ساختار شکست (WBS)', required: false, expectedType: 'text', allowedTransforms: ['direct', 'constant'] },
    { id: 'sprintName', label: 'Sprint Name', labelFa: 'نام اسپرینت', required: false, expectedType: 'text', allowedTransforms: ['direct', 'constant'] },
    { id: 'fixVersions', label: 'Fix Versions', labelFa: 'نسخه‌های انتشار (Versions)', required: false, expectedType: 'list', allowedTransforms: ['list_split', 'direct'] },
    { id: 'team', label: 'Team', labelFa: 'تیم مرتبط', required: false, expectedType: 'text', allowedTransforms: ['direct', 'constant'] },
    { id: 'labels', label: 'Labels', labelFa: 'برچسب‌ها (Labels)', required: false, expectedType: 'list', allowedTransforms: ['list_split', 'direct', 'constant'] },
    { id: 'components', label: 'Components', labelFa: 'کامپوننت‌ها', required: false, expectedType: 'list', allowedTransforms: ['list_split', 'direct', 'constant'] },
    { id: 'estimatedCost', label: 'Estimated Cost', labelFa: 'هزینه برآوردی', required: false, expectedType: 'number', allowedTransforms: ['number_parse', 'direct', 'constant'] },
    { id: 'actualCost', label: 'Actual Cost', labelFa: 'هزینه واقعی', required: false, expectedType: 'number', allowedTransforms: ['number_parse', 'direct', 'constant'] },
  ],
  wbs: [
    { id: 'wbsCode', label: 'WBS Code (e.g. 1.1.2)', labelFa: 'کد ساختار شکست (WBS)', required: true, expectedType: 'text', allowedTransforms: ['direct', 'constant'] },
    { id: 'summary', label: 'Deliverable / Task Name', labelFa: 'عنوان بسته کاری', required: true, expectedType: 'text', allowedTransforms: ['direct', 'rich_text', 'constant'] },
    { id: 'key', label: 'Work Item Key', labelFa: 'کلید یکتا (Key)', required: false, expectedType: 'text', allowedTransforms: ['direct', 'constant'] },
    { id: 'type', label: 'Hierarchy Type', labelFa: 'سطح (Epic/Story/Task/Subtask)', required: false, expectedType: 'text', allowedTransforms: ['direct', 'constant'] },
    { id: 'parentKey', label: 'Parent Key / Parent WBS', labelFa: 'کلید والد', required: false, expectedType: 'text', allowedTransforms: ['direct', 'constant'] },
    { id: 'dependencyKey', label: 'Predecessor / Dependency Key', labelFa: 'کلید پیش‌نیاز', required: false, expectedType: 'text', allowedTransforms: ['direct', 'constant'] },
    { id: 'assigneeId', label: 'Responsible Owner', labelFa: 'مسئول', required: false, expectedType: 'email', allowedTransforms: ['user_lookup', 'direct', 'constant'] },
    { id: 'startDate', label: 'Start Date', labelFa: 'تاریخ شروع', required: false, expectedType: 'date', allowedTransforms: ['date_normalize', 'direct', 'constant'] },
    { id: 'dueDate', label: 'Due Date', labelFa: 'تاریخ پایان', required: false, expectedType: 'date', allowedTransforms: ['date_normalize', 'direct', 'constant'] },
    { id: 'estimatedCost', label: 'Estimated Cost', labelFa: 'برآورد هزینه', required: false, expectedType: 'number', allowedTransforms: ['number_parse', 'direct', 'constant'] },
    { id: 'isMilestone', label: 'Is Milestone (true/false)', labelFa: 'نقطه عطف است؟', required: false, expectedType: 'text', allowedTransforms: ['direct', 'constant'] },
    { id: 'status', label: 'Status', labelFa: 'وضعیت', required: false, expectedType: 'status', allowedTransforms: ['status_map', 'direct', 'constant'] },
  ],
  epics: [
    { id: 'name', label: 'Epic Name', labelFa: 'نام اپیک', required: true, expectedType: 'text', allowedTransforms: ['direct', 'rich_text', 'constant'] },
    { id: 'key', label: 'Epic Key', labelFa: 'کلید اپیک', required: false, expectedType: 'text', allowedTransforms: ['direct', 'constant'] },
    { id: 'summary', label: 'Epic Summary', labelFa: 'شرح اپیک', required: false, expectedType: 'text', allowedTransforms: ['direct', 'rich_text', 'constant'] },
    { id: 'status', label: 'Status', labelFa: 'وضعیت', required: false, expectedType: 'status', allowedTransforms: ['status_map', 'direct', 'constant'] },
    { id: 'startDate', label: 'Start Date', labelFa: 'تاریخ شروع', required: false, expectedType: 'date', allowedTransforms: ['date_normalize', 'direct', 'constant'] },
    { id: 'dueDate', label: 'Due Date', labelFa: 'تاریخ پایان', required: false, expectedType: 'date', allowedTransforms: ['date_normalize', 'direct', 'constant'] },
  ],
  projects: [
    { id: 'key', label: 'Space / Project Key', labelFa: 'کلید پروژه / فضا', required: true, expectedType: 'text', allowedTransforms: ['direct', 'constant'] },
    { id: 'name', label: 'Project Name (EN)', labelFa: 'نام پروژه (انگلیسی)', required: true, expectedType: 'text', allowedTransforms: ['direct', 'constant'] },
    { id: 'nameFa', label: 'Project Name (FA)', labelFa: 'نام فارسی پروژه', required: false, expectedType: 'text', allowedTransforms: ['direct', 'constant'] },
    { id: 'category', label: 'Category', labelFa: 'دسته‌بندی', required: false, expectedType: 'text', allowedTransforms: ['direct', 'constant'] },
    { id: 'template', label: 'Template (scrum/kanban)', labelFa: 'الگوی فضا', required: false, expectedType: 'text', allowedTransforms: ['direct', 'constant'] },
    { id: 'leadId', label: 'Space Lead', labelFa: 'مدیر فضا', required: false, expectedType: 'email', allowedTransforms: ['user_lookup', 'direct', 'constant'] },
    { id: 'budgetAllocated', label: 'Allocated Budget', labelFa: 'بودجه مصوب', required: false, expectedType: 'number', allowedTransforms: ['number_parse', 'direct', 'constant'] },
    { id: 'budgetSpent', label: 'Spent Budget', labelFa: 'هزینه‌کرد فعلی', required: false, expectedType: 'number', allowedTransforms: ['number_parse', 'direct', 'constant'] },
    { id: 'currency', label: 'Currency (USD/IRR)', labelFa: 'واحد پول', required: false, expectedType: 'text', allowedTransforms: ['direct', 'constant'] },
    { id: 'description', label: 'Description', labelFa: 'توضیحات', required: false, expectedType: 'text', allowedTransforms: ['direct', 'rich_text', 'constant'] },
  ],
  documents: [
    { id: 'title', label: 'Document Title', labelFa: 'عنوان مستند', required: true, expectedType: 'text', allowedTransforms: ['direct', 'constant'] },
    { id: 'content', label: 'Document Content', labelFa: 'محتوای مستند', required: false, expectedType: 'text', allowedTransforms: ['rich_text', 'direct', 'constant'] },
    { id: 'authorId', label: 'Author', labelFa: 'نویسنده', required: false, expectedType: 'email', allowedTransforms: ['user_lookup', 'direct', 'constant'] },
    { id: 'parentId', label: 'Parent Page ID', labelFa: 'شناسه صفحه والد', required: false, expectedType: 'text', allowedTransforms: ['direct', 'constant'] },
    { id: 'version', label: 'Page Version', labelFa: 'نسخه صفحه', required: false, expectedType: 'number', allowedTransforms: ['number_parse', 'direct', 'constant'] },
    { id: 'sourceUrl', label: 'Source URL', labelFa: 'نشانی منبع اصلی', required: false, expectedType: 'text', allowedTransforms: ['direct', 'constant'] },
    { id: 'createdAt', label: 'Created Date', labelFa: 'تاریخ ایجاد', required: false, expectedType: 'date', allowedTransforms: ['date_normalize', 'direct', 'constant'] },
    { id: 'updatedAt', label: 'Updated Date', labelFa: 'تاریخ بروزرسانی', required: false, expectedType: 'date', allowedTransforms: ['date_normalize', 'direct', 'constant'] },
    { id: 'labels', label: 'Tags / Labels', labelFa: 'برچسب‌ها', required: false, expectedType: 'list', allowedTransforms: ['list_split', 'direct'] },
  ],
  resources: [
    { id: 'name', label: 'Resource / Member Name', labelFa: 'نام منبع یا عضو', required: true, expectedType: 'text', allowedTransforms: ['direct', 'constant'] },
    { id: 'nameFa', label: 'Persian Name', labelFa: 'نام فارسی', required: false, expectedType: 'text', allowedTransforms: ['direct', 'constant'] },
    { id: 'email', label: 'Email Address', labelFa: 'ایمیل', required: false, expectedType: 'email', allowedTransforms: ['direct', 'constant'] },
    { id: 'role', label: 'Role (admin/developer/qa)', labelFa: 'نقش سازمانی', required: false, expectedType: 'text', allowedTransforms: ['direct', 'constant'] },
    { id: 'department', label: 'Department / Team', labelFa: 'دپارتمان / واحد', required: false, expectedType: 'text', allowedTransforms: ['direct', 'constant'] },
    { id: 'kind', label: 'Resource Kind (User/Team/Asset)', labelFa: 'نوع منبع (User / Team / Asset)', required: false, expectedType: 'text', allowedTransforms: ['direct', 'constant'] },
    { id: 'environment', label: 'Asset Environment', labelFa: 'محیط زیرساخت', required: false, expectedType: 'text', allowedTransforms: ['direct', 'constant'] },
  ],
  schedules: [
    { id: 'name', label: 'Sprint / Schedule Name', labelFa: 'نام اسپرینت یا برنامه زمانی', required: true, expectedType: 'text', allowedTransforms: ['direct', 'constant'] },
    { id: 'goal', label: 'Goal / Scope', labelFa: 'هدف زمان‌بندی', required: false, expectedType: 'text', allowedTransforms: ['direct', 'rich_text', 'constant'] },
    { id: 'status', label: 'Schedule Status', labelFa: 'وضعیت اسپرینت', required: false, expectedType: 'status', allowedTransforms: ['status_map', 'direct', 'constant'] },
    { id: 'startDate', label: 'Start Date', labelFa: 'تاریخ شروع', required: false, expectedType: 'date', allowedTransforms: ['date_normalize', 'direct', 'constant'] },
    { id: 'endDate', label: 'End Date', labelFa: 'تاریخ پایان', required: false, expectedType: 'date', allowedTransforms: ['date_normalize', 'direct', 'constant'] },
  ],
  risks: [
    { id: 'title', label: 'Risk Title', labelFa: 'عنوان ریسک', required: true, expectedType: 'text', allowedTransforms: ['direct', 'constant'] },
    { id: 'key', label: 'Risk Code', labelFa: 'کد ریسک', required: false, expectedType: 'text', allowedTransforms: ['direct', 'constant'] },
    { id: 'description', label: 'Description', labelFa: 'شرح ریسک', required: false, expectedType: 'text', allowedTransforms: ['direct', 'rich_text', 'constant'] },
    { id: 'category', label: 'Risk Category', labelFa: 'دسته‌بندی ریسک', required: false, expectedType: 'text', allowedTransforms: ['direct', 'constant'] },
    { id: 'probability', label: 'Probability (low/medium/high)', labelFa: 'احتمال وقوع', required: false, expectedType: 'text', allowedTransforms: ['direct', 'constant'] },
    { id: 'impact', label: 'Impact (low/medium/high/critical)', labelFa: 'شدت اثر', required: false, expectedType: 'text', allowedTransforms: ['direct', 'constant'] },
    { id: 'status', label: 'Risk Status (open/mitigating/closed)', labelFa: 'وضعیت ریسک', required: false, expectedType: 'text', allowedTransforms: ['direct', 'constant'] },
    { id: 'ownerId', label: 'Risk Owner', labelFa: 'مسئول ریسک', required: false, expectedType: 'email', allowedTransforms: ['user_lookup', 'direct', 'constant'] },
    { id: 'mitigationPlan', label: 'Mitigation Plan', labelFa: 'برنامه کاهش اثر', required: false, expectedType: 'text', allowedTransforms: ['direct', 'rich_text', 'constant'] },
    { id: 'dueDate', label: 'Target Date', labelFa: 'تاریخ هدف', required: false, expectedType: 'date', allowedTransforms: ['date_normalize', 'direct', 'constant'] },
  ],
  budgets: [
    { id: 'projectKey', label: 'Project Key', labelFa: 'کلید پروژه', required: true, expectedType: 'text', allowedTransforms: ['direct', 'constant'] },
    { id: 'projectName', label: 'Project Name', labelFa: 'نام پروژه', required: false, expectedType: 'text', allowedTransforms: ['direct', 'constant'] },
    { id: 'allocated', label: 'Allocated Budget', labelFa: 'بودجه مصوب', required: true, expectedType: 'number', allowedTransforms: ['number_parse', 'direct', 'constant'] },
    { id: 'spent', label: 'Spent Budget', labelFa: 'مبلغ مصرف‌شده', required: false, expectedType: 'number', allowedTransforms: ['number_parse', 'direct', 'constant'] },
    { id: 'currency', label: 'Currency', labelFa: 'واحد پول', required: false, expectedType: 'text', allowedTransforms: ['direct', 'constant'] },
  ],
  milestones: [
    { id: 'title', label: 'Milestone Title', labelFa: 'عنوان نقطه عطف', required: true, expectedType: 'text', allowedTransforms: ['direct', 'constant'] },
    { id: 'description', label: 'Description', labelFa: 'توضیحات', required: false, expectedType: 'text', allowedTransforms: ['direct', 'rich_text', 'constant'] },
    { id: 'dueDate', label: 'Target Date', labelFa: 'تاریخ سررسید', required: true, expectedType: 'date', allowedTransforms: ['date_normalize', 'direct', 'constant'] },
    { id: 'status', label: 'Status (upcoming/completed/at_risk)', labelFa: 'وضعیت', required: false, expectedType: 'text', allowedTransforms: ['direct', 'constant'] },
    { id: 'ownerId', label: 'Owner', labelFa: 'مسئول', required: false, expectedType: 'email', allowedTransforms: ['user_lookup', 'direct', 'constant'] },
  ],
};

export function stripHtmlToText(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  const str = String(raw);
  if (!/<[a-z][\s\S]*>/i.test(str)) return str.trim();
  return str
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function normalizeDateValue(raw: unknown): string | undefined {
  return parseAndNormalizeDate(raw);
}

export function normalizePriority(raw: unknown): Priority {
  const s = String(raw || '').toLowerCase().trim();
  if (/highest|blocker|critical|urgent|p0|p1|بسیار بالا|بحرانی|فوری/.test(s)) return 'highest';
  if (/high|major|بالا|مهم/.test(s)) return 'high';
  if (/lowest|trivial|بسیار پایین/.test(s)) return 'lowest';
  if (/low|minor|پایین|کم/.test(s)) return 'low';
  return 'medium';
}

export function normalizeIssueType(raw: unknown): IssueType {
  const s = String(raw || '').toLowerCase().trim();
  if (/epic|اپیک/.test(s)) return 'epic';
  if (/bug|defect|incident|باگ|خطا/.test(s)) return 'bug';
  if (/sub|زیروظیفه/.test(s)) return 'subtask';
  if (/feature|قابلیت|ویژگی/.test(s)) return 'feature';
  if (/task|وظیفه|کار/.test(s)) return 'task';
  return 'story';
}

export function lookupUserId(raw: unknown, users: User[], fallbackId: string): string | null {
  if (raw === null || raw === undefined) return null;
  const q = String(raw).trim().toLowerCase();
  if (!q || q === 'unassigned' || q === 'تخصیص نیافته') return null;

  const exactEmail = users.find(u => u.email.toLowerCase() === q);
  if (exactEmail) return exactEmail.id;

  const exactName = users.find(
    u => u.name.toLowerCase() === q || u.nameFa.toLowerCase() === q
  );
  if (exactName) return exactName.id;

  const partial = users.find(
    u =>
      u.name.toLowerCase().includes(q) ||
      u.nameFa.toLowerCase().includes(q) ||
      u.email.toLowerCase().split('@')[0] === q
  );
  return partial ? partial.id : fallbackId;
}

export function mapStatusValue(
  raw: unknown,
  statusMap: Record<string, string>,
  workflowStatuses: Status[]
): string {
  const str = String(raw || '').trim();
  if (!str) return workflowStatuses[0]?.id || 'todo';

  if (statusMap[str]) return statusMap[str];
  const lower = str.toLowerCase();
  for (const [k, v] of Object.entries(statusMap)) {
    if (k.toLowerCase() === lower) return v;
  }

  const direct = workflowStatuses.find(
    s =>
      s.id.toLowerCase() === lower ||
      s.name.toLowerCase() === lower ||
      s.nameFa.toLowerCase() === lower
  );
  if (direct) return direct.id;

  if (/done|closed|resolved|complete|تکمیل|انجام\s*شده|انجام شد|بسته/.test(lower)) {
    return workflowStatuses.find(s => s.category === 'done')?.id || 'done';
  }
  if (/review|qa|test|verify|بررسی|انتظار بررسی|تست/.test(lower)) {
    return workflowStatuses.find(s => s.id === 'review')?.id || 'inprogress';
  }
  if (/progress|doing|active|working|در حال انجام|جاری/.test(lower)) {
    return workflowStatuses.find(s => s.category === 'inprogress')?.id || 'inprogress';
  }
  return workflowStatuses.find(s => s.category === 'todo')?.id || workflowStatuses[0]?.id || 'todo';
}

export function suggestAutoMappings(
  sourceFields: SourceFieldMeta[],
  destinationModule: DestinationModule,
  source: IntegrationSource
): FieldMappingRule[] {
  const destDefs = DESTINATION_FIELDS_BY_MODULE[destinationModule];
  const usedTargets = new Set<string>();

  const matchRuleForField = (
    sf: SourceFieldMeta
  ): { dest: string; transform: TransformationType } => {
    const key = sf.key.toLowerCase().trim();
    const lbl = sf.label.toLowerCase().trim();
    const combined = `${key} ${lbl}`;

    const tryPick = (id: string, transform: TransformationType) => {
      if (
        destDefs.some(d => d.id === id) &&
        (!usedTargets.has(id) || id === 'labels' || id === 'components' || id === 'fixVersions')
      ) {
        usedTargets.add(id);
        return { dest: id, transform };
      }
      return null;
    };

    if (destinationModule === 'work_items' || destinationModule === 'wbs') {
      if (/wbs|ساختار شکست/.test(combined)) {
        return tryPick('wbsCode', 'direct') || { dest: '__ignore__', transform: 'direct' };
      }
      if (/^(summary|title|task title|subject|نام تسک|عنوان|خلاصه)$/.test(key) || /summary|عنوان|task title|deliverable/.test(combined)) {
        return tryPick('summary', 'direct') || { dest: '__ignore__', transform: 'direct' };
      }
      if (/^(key|issue key|issuekey|شناسه|کلید)$/.test(key) || /issue key|کلید/.test(combined)) {
        return tryPick('key', 'direct') || { dest: '__ignore__', transform: 'direct' };
      }
      if (/^(type|issuetype|issue type|work type|نوع)$/.test(key) || /issue type|نوع کار|hierarchy/.test(combined)) {
        return tryPick('type', 'direct') || { dest: '__ignore__', transform: 'direct' };
      }
      if (/description|body|details|توضیحات|شرح/.test(combined)) {
        return tryPick('description', source === 'jira' || source === 'confluence' ? 'rich_text' : 'direct') || { dest: '__ignore__', transform: 'direct' };
      }
      if (/status|state|وضعیت/.test(combined)) {
        return tryPick('status', 'status_map') || { dest: '__ignore__', transform: 'direct' };
      }
      if (/priority|اولویت/.test(combined)) {
        return tryPick('priority', 'priority_normalize') || { dest: '__ignore__', transform: 'direct' };
      }
      if (/assignee|owner|مسئول/.test(combined)) {
        return tryPick('assigneeId', 'user_lookup') || { dest: '__ignore__', transform: 'direct' };
      }
      if (/reporter|author|گزارش/.test(combined)) {
        return tryPick('reporterId', 'user_lookup') || { dest: '__ignore__', transform: 'direct' };
      }
      if (/story point|points|امتیاز/.test(combined)) {
        return tryPick('storyPoints', 'number_parse') || { dest: '__ignore__', transform: 'direct' };
      }
      if (/remaining.*estimate|تخمین باقی/.test(combined)) {
        return tryPick('remainingEstimateMinutes', 'number_parse') || { dest: '__ignore__', transform: 'direct' };
      }
      if (/estimate|تخمین/.test(combined)) {
        return tryPick('originalEstimateMinutes', 'number_parse') || { dest: '__ignore__', transform: 'direct' };
      }
      if (/estimated.?cost|برآورد هزینه/.test(combined)) {
        return tryPick('estimatedCost', 'number_parse') || { dest: '__ignore__', transform: 'direct' };
      }
      if (/actual.?cost|هزینه واقعی/.test(combined)) {
        return tryPick('actualCost', 'number_parse') || { dest: '__ignore__', transform: 'direct' };
      }
      if (/milestone|نقطه عطف/.test(combined)) {
        return tryPick('isMilestone', 'direct') || { dest: '__ignore__', transform: 'direct' };
      }
      if (/start.?date|تاریخ شروع/.test(combined)) {
        return tryPick('startDate', 'date_normalize') || { dest: '__ignore__', transform: 'direct' };
      }
      if (/due.?date|deadline|سررسید|مهلت/.test(combined)) {
        return tryPick('dueDate', 'date_normalize') || { dest: '__ignore__', transform: 'direct' };
      }
      if (/depend|predecessor|blocked|وابستگی|پیش.?نیاز/.test(combined)) {
        return tryPick('dependencyKey', 'direct') || { dest: '__ignore__', transform: 'direct' };
      }
      if (/parent.?key|parent|والد/.test(combined)) {
        return tryPick('parentKey', 'direct') || tryPick('epicKeyOrName', 'direct') || { dest: '__ignore__', transform: 'direct' };
      }
      if (/epic|اپیک/.test(combined)) {
        return tryPick('epicKeyOrName', 'direct') || { dest: '__ignore__', transform: 'direct' };
      }
      if (/fix.?version|version|نسخه/.test(combined)) {
        return tryPick('fixVersions', 'list_split') || { dest: '__ignore__', transform: 'direct' };
      }
      if (/sprint|اسپرینت/.test(combined)) {
        return tryPick('sprintName', 'direct') || { dest: '__ignore__', transform: 'direct' };
      }
      if (/^team$|تیم/.test(combined)) {
        return tryPick('team', 'direct') || { dest: '__ignore__', transform: 'direct' };
      }
      if (/label|tag|برچسب/.test(combined)) {
        return tryPick('labels', 'list_split') || { dest: '__ignore__', transform: 'direct' };
      }
      if (/component|ماژول/.test(combined)) {
        return tryPick('components', 'list_split') || { dest: '__ignore__', transform: 'direct' };
      }
      if (key.startsWith('customfield_')) {
        return { dest: '__custom_field__', transform: 'direct' };
      }
    }

    if (destinationModule === 'epics') {
      if (/summary|title|name|نام|عنوان/.test(combined) && !usedTargets.has('name')) return tryPick('name', 'direct') || { dest: '__ignore__', transform: 'direct' };
      if (/key|کلید/.test(combined)) return tryPick('key', 'direct') || { dest: '__ignore__', transform: 'direct' };
      if (/description|شرح|توضیح/.test(combined)) return tryPick('summary', 'rich_text') || { dest: '__ignore__', transform: 'direct' };
      if (/status|وضعیت/.test(combined)) return tryPick('status', 'status_map') || { dest: '__ignore__', transform: 'direct' };
      if (/start|شروع/.test(combined)) return tryPick('startDate', 'date_normalize') || { dest: '__ignore__', transform: 'direct' };
      if (/due|end|پایان|سررسید/.test(combined)) return tryPick('dueDate', 'date_normalize') || { dest: '__ignore__', transform: 'direct' };
    }

    if (destinationModule === 'projects') {
      if (/key|کلید/.test(combined)) return tryPick('key', 'direct') || { dest: '__ignore__', transform: 'direct' };
      if (/persian|namefa|فارسی/.test(combined)) return tryPick('nameFa', 'direct') || { dest: '__ignore__', transform: 'direct' };
      if (/name|title|نام/.test(combined)) return tryPick('name', 'direct') || { dest: '__ignore__', transform: 'direct' };
      if (/category|دسته/.test(combined)) return tryPick('category', 'direct') || { dest: '__ignore__', transform: 'direct' };
      if (/template|الگو/.test(combined)) return tryPick('template', 'direct') || { dest: '__ignore__', transform: 'direct' };
      if (/lead|مدیر/.test(combined)) return tryPick('leadId', 'user_lookup') || { dest: '__ignore__', transform: 'direct' };
      if (/allocated|بودجه مصوب/.test(combined)) return tryPick('budgetAllocated', 'number_parse') || { dest: '__ignore__', transform: 'direct' };
      if (/spent|هزینه/.test(combined)) return tryPick('budgetSpent', 'number_parse') || { dest: '__ignore__', transform: 'direct' };
      if (/currency|ارز|واحد/.test(combined)) return tryPick('currency', 'direct') || { dest: '__ignore__', transform: 'direct' };
      if (/desc|توضیح/.test(combined)) return tryPick('description', 'rich_text') || { dest: '__ignore__', transform: 'direct' };
    }

    if (destinationModule === 'documents') {
      if (/title|summary|name|عنوان/.test(combined)) return tryPick('title', 'direct') || { dest: '__ignore__', transform: 'direct' };
      if (/content|body|description|محتوا|متن|توضیح/.test(combined)) return tryPick('content', source === 'confluence' || source === 'jira' ? 'rich_text' : 'direct') || { dest: '__ignore__', transform: 'direct' };
      if (/author|reporter|نویسنده/.test(combined)) return tryPick('authorId', 'user_lookup') || { dest: '__ignore__', transform: 'direct' };
      if (/parentid|parent|والد/.test(combined)) return tryPick('parentId', 'direct') || { dest: '__ignore__', transform: 'direct' };
      if (/version|نسخه/.test(combined)) return tryPick('version', 'number_parse') || { dest: '__ignore__', transform: 'direct' };
      if (/sourceurl|url|لینک/.test(combined)) return tryPick('sourceUrl', 'direct') || { dest: '__ignore__', transform: 'direct' };
      if (/created|ایجاد/.test(combined)) return tryPick('createdAt', 'date_normalize') || { dest: '__ignore__', transform: 'direct' };
      if (/update|date|تاریخ/.test(combined)) return tryPick('updatedAt', 'date_normalize') || { dest: '__ignore__', transform: 'direct' };
      if (/label|tag|برچسب/.test(combined)) return tryPick('labels', 'list_split') || { dest: '__ignore__', transform: 'direct' };
    }

    if (destinationModule === 'resources') {
      if (/persian|namefa|فارسی/.test(combined)) return tryPick('nameFa', 'direct') || { dest: '__ignore__', transform: 'direct' };
      if (/name|resource|نام/.test(combined)) return tryPick('name', 'direct') || { dest: '__ignore__', transform: 'direct' };
      if (/email|ایمیل/.test(combined)) return tryPick('email', 'direct') || { dest: '__ignore__', transform: 'direct' };
      if (/role|نقش/.test(combined)) return tryPick('role', 'direct') || { dest: '__ignore__', transform: 'direct' };
      if (/depart|team|واحد|تیم/.test(combined)) return tryPick('department', 'direct') || { dest: '__ignore__', transform: 'direct' };
      if (/kind|type|نوع/.test(combined)) return tryPick('kind', 'direct') || { dest: '__ignore__', transform: 'direct' };
      if (/env|محیط/.test(combined)) return tryPick('environment', 'direct') || { dest: '__ignore__', transform: 'direct' };
    }

    if (destinationModule === 'schedules') {
      if (/name|sprint|milestone|نام/.test(combined)) return tryPick('name', 'direct') || { dest: '__ignore__', transform: 'direct' };
      if (/goal|هدف|desc/.test(combined)) return tryPick('goal', 'direct') || { dest: '__ignore__', transform: 'direct' };
      if (/status|وضعیت/.test(combined)) return tryPick('status', 'status_map') || { dest: '__ignore__', transform: 'direct' };
      if (/start|شروع/.test(combined)) return tryPick('startDate', 'date_normalize') || { dest: '__ignore__', transform: 'direct' };
      if (/end|due|پایان/.test(combined)) return tryPick('endDate', 'date_normalize') || { dest: '__ignore__', transform: 'direct' };
    }

    if (destinationModule === 'risks') {
      if (/title|name|عنوان/.test(combined)) return tryPick('title', 'direct') || { dest: '__ignore__', transform: 'direct' };
      if (/key|code|کد/.test(combined)) return tryPick('key', 'direct') || { dest: '__ignore__', transform: 'direct' };
      if (/desc|شرح/.test(combined)) return tryPick('description', 'rich_text') || { dest: '__ignore__', transform: 'direct' };
      if (/cat|دسته/.test(combined)) return tryPick('category', 'direct') || { dest: '__ignore__', transform: 'direct' };
      if (/prob|احتمال/.test(combined)) return tryPick('probability', 'direct') || { dest: '__ignore__', transform: 'direct' };
      if (/impact|اثر/.test(combined)) return tryPick('impact', 'direct') || { dest: '__ignore__', transform: 'direct' };
      if (/status|وضعیت/.test(combined)) return tryPick('status', 'direct') || { dest: '__ignore__', transform: 'direct' };
      if (/owner|مسئول/.test(combined)) return tryPick('ownerId', 'user_lookup') || { dest: '__ignore__', transform: 'direct' };
      if (/mitigat|کاهش|اقدام/.test(combined)) return tryPick('mitigationPlan', 'direct') || { dest: '__ignore__', transform: 'direct' };
      if (/due|date|تاریخ/.test(combined)) return tryPick('dueDate', 'date_normalize') || { dest: '__ignore__', transform: 'direct' };
    }

    if (destinationModule === 'budgets') {
      if (/key|کلید/.test(combined)) return tryPick('projectKey', 'direct') || { dest: '__ignore__', transform: 'direct' };
      if (/name|پروژه/.test(combined)) return tryPick('projectName', 'direct') || { dest: '__ignore__', transform: 'direct' };
      if (/alloc|مصوب|بودجه/.test(combined)) return tryPick('allocated', 'number_parse') || { dest: '__ignore__', transform: 'direct' };
      if (/spent|مصرف|هزینه/.test(combined)) return tryPick('spent', 'number_parse') || { dest: '__ignore__', transform: 'direct' };
      if (/currency|ارز/.test(combined)) return tryPick('currency', 'direct') || { dest: '__ignore__', transform: 'direct' };
    }

    if (destinationModule === 'milestones') {
      if (/title|name|عنوان/.test(combined)) return tryPick('title', 'direct') || { dest: '__ignore__', transform: 'direct' };
      if (/desc|توضیح/.test(combined)) return tryPick('description', 'rich_text') || { dest: '__ignore__', transform: 'direct' };
      if (/due|date|تاریخ/.test(combined)) return tryPick('dueDate', 'date_normalize') || { dest: '__ignore__', transform: 'direct' };
      if (/status|وضعیت/.test(combined)) return tryPick('status', 'direct') || { dest: '__ignore__', transform: 'direct' };
      if (/owner|مسئول/.test(combined)) return tryPick('ownerId', 'user_lookup') || { dest: '__ignore__', transform: 'direct' };
    }

    return { dest: '__ignore__', transform: 'direct' };
  };

  return sourceFields.map((sf, idx) => {
    const matched = matchRuleForField(sf);
    const destDef = destDefs.find(d => d.id === matched.dest);
    return {
      id: `map-${idx}-${sf.key}`,
      sourceKey: sf.key,
      sourceLabel: sf.label,
      sourceType: sf.type,
      destinationField: matched.dest,
      transformation: matched.transform,
      defaultValue: '',
      required: Boolean(destDef?.required),
    };
  });
}

export interface MappingCompatibility {
  level: 'compatible' | 'coercible' | 'incompatible';
  reasonEn: string;
  reasonFa: string;
}

export function checkFieldCompatibility(
  rule: FieldMappingRule,
  destinationModule: DestinationModule
): MappingCompatibility {
  if (
    rule.destinationField === '__ignore__' ||
    rule.destinationField === '__custom_label__' ||
    rule.destinationField === '__custom_field__'
  ) {
    return { level: 'compatible', reasonEn: 'OK', reasonFa: 'معتبر' };
  }

  const destDef = DESTINATION_FIELDS_BY_MODULE[destinationModule].find(
    d => d.id === rule.destinationField
  );
  if (!destDef) {
    return { level: 'compatible', reasonEn: 'OK', reasonFa: 'معتبر' };
  }

  const src = rule.sourceType;
  const expected = destDef.expectedType;
  const tr = rule.transformation;

  if (tr === 'constant') {
    return { level: 'compatible', reasonEn: 'Constant fallback value', reasonFa: 'مقدار ثابت پیش‌فرض' };
  }

  if (expected === 'number') {
    if (src === 'number') return { level: 'compatible', reasonEn: 'Exact numeric match', reasonFa: 'تطابق دقیق عددی' };
    if (src === 'date' || src === 'boolean') {
      return { level: 'incompatible', reasonEn: `Cannot map ${src} column into numeric field`, reasonFa: `نوع ${src} قابل تبدیل به عدد نیست` };
    }
    return tr === 'number_parse'
      ? { level: 'compatible', reasonEn: 'Parsed as number', reasonFa: 'تبدیل خودکار به عدد' }
      : { level: 'coercible', reasonEn: 'Select "Number parse" transformation', reasonFa: 'توصیه: تبدیل به عدد را انتخاب کنید' };
  }

  if (expected === 'date') {
    if (src === 'date') return { level: 'compatible', reasonEn: 'Exact date match', reasonFa: 'تطابق دقیق تاریخ' };
    if (src === 'boolean' || src === 'email' || src === 'list') {
      return { level: 'incompatible', reasonEn: `Incompatible ${src} source for Date field`, reasonFa: `نوع ${src} با فیلد تاریخ سازگار نیست` };
    }
    return tr === 'date_normalize'
      ? { level: 'compatible', reasonEn: 'Normalized to ISO date', reasonFa: 'نرمال‌سازی به تاریخ استاندارد' }
      : { level: 'coercible', reasonEn: 'Recommended: Date normalization', reasonFa: 'توصیه: نرمال‌سازی تاریخ را انتخاب کنید' };
  }

  if (expected === 'status') {
    if (src === 'number' || src === 'date') {
      return { level: 'incompatible', reasonEn: `Incompatible ${src} source for Status`, reasonFa: `فیلد ${src} نمی‌تواند وضعیت گردش‌کار باشد` };
    }
    return { level: 'compatible', reasonEn: 'Mapped to workflow status', reasonFa: 'نگاشت به وضعیت گردش‌کار' };
  }

  if (expected === 'email') {
    if (src === 'number' || src === 'date' || src === 'boolean') {
      return { level: 'incompatible', reasonEn: `Cannot lookup user from ${src}`, reasonFa: `جستجوی کاربر از روی ${src} ممکن نیست` };
    }
    return { level: 'compatible', reasonEn: 'User lookup / email match', reasonFa: 'تطبیق کاربر / ایمیل' };
  }

  return { level: 'compatible', reasonEn: 'Compatible', reasonFa: 'سازگار' };
}

export interface MappingValidationResult {
  valid: boolean;
  missingRequired: DestinationFieldDef[];
  incompatibleRules: FieldMappingRule[];
  duplicateTargets: string[];
}

export function validateMappingRules(
  rules: FieldMappingRule[],
  destinationModule: DestinationModule
): MappingValidationResult {
  const destDefs = DESTINATION_FIELDS_BY_MODULE[destinationModule];
  const requiredDefs = destDefs.filter(d => d.required);
  const mappedTargets = new Set<string>();
  const duplicateTargets: string[] = [];
  const incompatibleRules: FieldMappingRule[] = [];

  for (const r of rules) {
    if (
      r.destinationField === '__ignore__' ||
      r.destinationField === '__custom_label__' ||
      r.destinationField === '__custom_field__'
    ) {
      continue;
    }

    if (
      r.destinationField !== 'labels' &&
      r.destinationField !== 'components' &&
      r.destinationField !== 'fixVersions' &&
      mappedTargets.has(r.destinationField)
    ) {
      duplicateTargets.push(r.destinationField);
    }
    mappedTargets.add(r.destinationField);

    const compat = checkFieldCompatibility(r, destinationModule);
    if (compat.level === 'incompatible') {
      incompatibleRules.push(r);
    }
  }

  const missingRequired = requiredDefs.filter(req => !mappedTargets.has(req.id));
  return {
    valid: missingRequired.length === 0 && incompatibleRules.length === 0 && duplicateTargets.length === 0,
    missingRequired,
    incompatibleRules,
    duplicateTargets,
  };
}

function readTransformedValue(row: Record<string, unknown>, rule: FieldMappingRule): unknown {
  if (rule.transformation === 'constant') return rule.defaultValue;
  const raw = row[rule.sourceKey];
  const isEmpty =
    raw === null ||
    raw === undefined ||
    (typeof raw === 'string' && raw.trim() === '') ||
    (Array.isArray(raw) && raw.length === 0);
  const val = isEmpty ? rule.defaultValue : raw;
  if (val === null || val === undefined || val === '') return undefined;

  switch (rule.transformation) {
    case 'rich_text':
      return stripHtmlToText(val);
    case 'date_normalize':
      return normalizeDateValue(val);
    case 'number_parse': {
      const n = Number(latinizeDigits(String(val)).replace(/[^0-9.-]/g, ''));
      return Number.isNaN(n) ? undefined : n;
    }
    case 'list_split':
      if (Array.isArray(val)) return val.map(v => String(v).trim()).filter(Boolean);
      return String(val)
        .split(/[,;،|]+/)
        .map(s => s.trim())
        .filter(Boolean);
    default:
      return val;
  }
}

export function validatePreviewRows(params: {
  rawRows: Array<Record<string, unknown>>;
  mappings: FieldMappingRule[];
  destinationModule: DestinationModule;
}): CellValidationIssue[] {
  const { rawRows, mappings, destinationModule } = params;
  const destDefs = DESTINATION_FIELDS_BY_MODULE[destinationModule];
  const issues: CellValidationIssue[] = [];
  const activeRules = mappings.filter(
    m =>
      m.destinationField !== '__ignore__' &&
      m.destinationField !== '__custom_label__' &&
      m.destinationField !== '__custom_field__'
  );

  // Track keys/parents/dependencies for cycle and missing parent checks
  const allKeys = new Set<string>();
  const keyRule = activeRules.find(r => r.destinationField === 'key');
  const wbsRule = activeRules.find(r => r.destinationField === 'wbsCode');
  const parentRule = activeRules.find(r => r.destinationField === 'parentKey');
  const depRule = activeRules.find(r => r.destinationField === 'dependencyKey');

  const rowKeyByIdx = new Map<number, string>();
  const graph = new Map<string, string[]>();

  rawRows.forEach((row, rIdx) => {
    const k = keyRule ? String(row[keyRule.sourceKey] ?? '').trim() : '';
    const w = wbsRule ? String(row[wbsRule.sourceKey] ?? '').trim() : '';
    const nodeId = k || w;
    if (nodeId) {
      allKeys.add(nodeId.toUpperCase());
      rowKeyByIdx.set(rIdx, nodeId.toUpperCase());
    }
  });

  rawRows.forEach((row, rIdx) => {
    for (const rule of activeRules) {
      const def = destDefs.find(d => d.id === rule.destinationField);
      if (!def) continue;
      const rawVal = row[rule.sourceKey];
      const strVal = rawVal === null || rawVal === undefined ? '' : String(rawVal).trim();

      if (def.required && !strVal && !rule.defaultValue) {
        issues.push({
          rowIndex: rIdx,
          columnKey: def.id,
          severity: 'error',
          messageEn: `Missing required "${def.label}"`,
          messageFa: `مقدار اجباری «${def.labelFa}» خالی است`,
        });
        continue;
      }

      if (!strVal) continue;

      if (def.expectedType === 'date') {
        const parsed = parseAndNormalizeDate(rawVal);
        if (!parsed) {
          issues.push({
            rowIndex: rIdx,
            columnKey: def.id,
            severity: 'error',
            messageEn: `Invalid date "${strVal}"`,
            messageFa: `فرمت تاریخ نامعتبر: «${strVal}»`,
          });
        }
      } else if (def.expectedType === 'number') {
        const cleaned = latinizeDigits(strVal).replace(/,/g, '');
        const num = Number(cleaned);
        if (Number.isNaN(num) || num < 0) {
          issues.push({
            rowIndex: rIdx,
            columnKey: def.id,
            severity: 'error',
            messageEn: `Invalid non-negative number "${strVal}"`,
            messageFa: `مقدار عددی نامعتبر: «${strVal}»`,
          });
        }
      }
    }

    const nodeKey = rowKeyByIdx.get(rIdx);
    if (nodeKey) {
      const edges: string[] = [];
      if (parentRule) {
        const p = String(row[parentRule.sourceKey] ?? '').trim().toUpperCase();
        if (p) {
          edges.push(p);
          if (!allKeys.has(p)) {
            issues.push({
              rowIndex: rIdx,
              columnKey: 'parentKey',
              severity: 'warning',
              messageEn: `Parent "${p}" not found in batch (will attempt space lookup)`,
              messageFa: `والد «${p}» در فایل یافت نشد (در فضا جستجو می‌شود)`,
            });
          }
        }
      }
      if (depRule) {
        const d = String(row[depRule.sourceKey] ?? '').trim().toUpperCase();
        if (d) edges.push(d);
      }
      if (edges.length > 0) graph.set(nodeKey, edges);
    }
  });

  // DFS Circular dependency check
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cyclicNodes = new Set<string>();

  const dfs = (node: string) => {
    if (visiting.has(node)) {
      cyclicNodes.add(node);
      return;
    }
    if (visited.has(node)) return;
    visiting.add(node);
    for (const next of graph.get(node) || []) {
      dfs(next);
    }
    visiting.delete(node);
    visited.add(node);
  };

  for (const node of graph.keys()) dfs(node);

  if (cyclicNodes.size > 0) {
    rawRows.forEach((_row, rIdx) => {
      const k = rowKeyByIdx.get(rIdx);
      if (k && cyclicNodes.has(k)) {
        issues.push({
          rowIndex: rIdx,
          columnKey: depRule ? 'dependencyKey' : 'parentKey',
          severity: 'error',
          messageEn: `Circular dependency / parent cycle detected involving "${k}"`,
          messageFa: `حلقه وابستگی یا والد تکراری در «${k}» شناسایی شد`,
        });
      }
    });
  }

  return issues;
}

export function buildIntegrationPayload(params: {
  source: IntegrationSource;
  destinationModule: DestinationModule;
  rawRows: Array<Record<string, unknown>>;
  mappings: FieldMappingRule[];
  statusMap: Record<string, string>;
  workflowStatuses: Status[];
  users: User[];
  currentUserId: string;
  targetProjectId?: string;
  conflictPolicy?: ConflictPolicy;
  createNewSpace?: IntegrationImportPayload['createNewSpace'];
  extraSprints?: Array<{
    id: string;
    name: string;
    goal: string;
    state: string;
    startDate?: string;
    endDate?: string;
  }>;
  extraVersions?: Array<{
    id?: string;
    name: string;
    description?: string;
    releaseDate?: string;
    isReleased?: boolean;
  }>;
  sourceProjects?: Array<{ key: string; name: string; type?: string; description?: string }>;
}): {
  payload: IntegrationImportPayload;
  previewRows: Array<Record<string, unknown>>;
  cellIssues: CellValidationIssue[];
} {
  const {
    source,
    destinationModule,
    rawRows,
    mappings,
    statusMap,
    workflowStatuses,
    users,
    currentUserId,
    targetProjectId,
    conflictPolicy = 'manual_review',
    createNewSpace,
    extraSprints,
    extraVersions,
    sourceProjects,
  } = params;

  const activeRules = mappings.filter(m => m.destinationField !== '__ignore__');
  const cellIssues = validatePreviewRows({ rawRows, mappings, destinationModule });
  const previewRows: Array<Record<string, unknown>> = [];

  const issuesOut: NonNullable<IntegrationImportPayload['issues']> = [];
  const epicsOut: NonNullable<IntegrationImportPayload['epics']> = [];
  const projectsOut: NonNullable<IntegrationImportPayload['projects']> = [];
  const docsOut: NonNullable<IntegrationImportPayload['docs']> = [];
  const usersOut: NonNullable<IntegrationImportPayload['users']> = [];
  const teamsOut: NonNullable<IntegrationImportPayload['teams']> = [];
  const assetsOut: NonNullable<IntegrationImportPayload['assets']> = [];
  const sprintsOut: NonNullable<IntegrationImportPayload['sprints']> = [];
  const versionsOut: NonNullable<IntegrationImportPayload['versions']> =
    extraVersions?.map(v => ({
      name: v.name,
      description: v.description,
      releaseDate: v.releaseDate,
      isReleased: v.isReleased,
    })) || [];
  const risksOut: NonNullable<IntegrationImportPayload['risks']> = [];
  const milestonesOut: NonNullable<IntegrationImportPayload['milestones']> = [];
  const budgetsOut: NonNullable<IntegrationImportPayload['budgets']> = [];

  if (extraSprints && extraSprints.length > 0 && (destinationModule === 'work_items' || destinationModule === 'wbs')) {
    for (const sp of extraSprints) {
      sprintsOut.push({
        name: sp.name,
        goal: sp.goal || '',
        status: sp.state === 'active' ? 'active' : sp.state === 'closed' ? 'completed' : 'planned',
        startDate: sp.startDate,
        endDate: sp.endDate,
      });
    }
  }

  for (const row of rawRows) {
    const mapped: Record<string, unknown> = {};
    const customLabels: string[] = [];
    const customFields: Record<string, string | number | boolean> = {};

    for (const rule of activeRules) {
      const val = readTransformedValue(row, rule);
      if (val === undefined) continue;

      if (rule.destinationField === '__custom_label__') {
        customLabels.push(`${rule.sourceLabel.split(' (')[0]}:${String(val).slice(0, 28)}`);
        continue;
      }

      if (rule.destinationField === '__custom_field__') {
        const cfName = rule.sourceLabel.split(' (')[0];
        if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
          customFields[cfName] = val;
        } else {
          customFields[cfName] = String(val);
        }
        continue;
      }

      if (
        rule.destinationField === 'labels' ||
        rule.destinationField === 'components' ||
        rule.destinationField === 'fixVersions'
      ) {
        const arr = Array.isArray(val) ? val.map(String) : [String(val)];
        const existing = Array.isArray(mapped[rule.destinationField])
          ? (mapped[rule.destinationField] as string[])
          : [];
        mapped[rule.destinationField] = [...existing, ...arr];
        continue;
      }

      mapped[rule.destinationField] = val;
    }

    if (destinationModule === 'work_items' || destinationModule === 'wbs') {
      const summary = String(mapped.summary || '').trim();
      if (!summary) continue;
      const issueType = normalizeIssueType(mapped.type || row.type);
      const priority = normalizePriority(mapped.priority);
      const statusId = mapStatusValue(mapped.status, statusMap, workflowStatuses);
      const assigneeId = lookupUserId(mapped.assigneeId, users, '');
      const reporterId = lookupUserId(mapped.reporterId, users, currentUserId) || currentUserId;
      const labels = [
        ...(Array.isArray(mapped.labels) ? (mapped.labels as string[]) : []),
        ...customLabels,
      ];

      const sprintHint = mapped.sprintName ? String(mapped.sprintName).trim() : '';
      const epicHint = mapped.epicKeyOrName ? String(mapped.epicKeyOrName).trim() : '';
      const parentKeyHint = mapped.parentKey
        ? String(mapped.parentKey).trim()
        : typeof row.parentKey === 'string'
        ? row.parentKey.trim()
        : '';
      const depHint = mapped.dependencyKey
        ? String(mapped.dependencyKey).trim()
        : Array.isArray(row.issueLinks) && row.issueLinks.length > 0
        ? String((row.issueLinks[0] as { targetKey?: string }).targetKey || '')
        : '';
      const fixVersionNames = Array.isArray(mapped.fixVersions)
        ? (mapped.fixVersions as string[])
        : Array.isArray(row.fixVersions)
        ? (row.fixVersions as string[])
        : [];

      const isMilestone =
        String(mapped.isMilestone || '').toLowerCase() === 'true' ||
        String(mapped.isMilestone || '').trim() === 'بله';

      const built: NonNullable<IntegrationImportPayload['issues']>[number] = {
        key: mapped.key ? String(mapped.key).trim() : undefined,
        type: issueType,
        summary,
        description: String(mapped.description || ''),
        status: statusId,
        priority,
        assigneeId: assigneeId || null,
        reporterId,
        storyPoints: typeof mapped.storyPoints === 'number' ? mapped.storyPoints : undefined,
        originalEstimateMinutes:
          typeof mapped.originalEstimateMinutes === 'number'
            ? mapped.originalEstimateMinutes
            : undefined,
        remainingEstimateMinutes:
          typeof mapped.remainingEstimateMinutes === 'number'
            ? mapped.remainingEstimateMinutes
            : undefined,
        startDate: mapped.startDate ? String(mapped.startDate) : undefined,
        dueDate: mapped.dueDate ? String(mapped.dueDate) : undefined,
        wbsCode: mapped.wbsCode ? String(mapped.wbsCode).trim() : undefined,
        estimatedCost: typeof mapped.estimatedCost === 'number' ? mapped.estimatedCost : undefined,
        actualCost: typeof mapped.actualCost === 'number' ? mapped.actualCost : undefined,
        isMilestone,
        externalKey: mapped.key ? String(mapped.key).trim() : undefined,
        externalUrl: typeof row.externalUrl === 'string' ? row.externalUrl : undefined,
        customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
        team: mapped.team ? String(mapped.team) : undefined,
        labels,
        components: Array.isArray(mapped.components) ? (mapped.components as string[]) : [],
        attachments: Array.isArray(row.attachments) ? (row.attachments as Issue['attachments']) : undefined,
        comments: Array.isArray(row.comments)
          ? (
              row.comments as Array<{
                id?: string;
                authorName?: string;
                author?: string;
                authorEmail?: string;
                content?: string;
                text?: string;
                createdAt?: string;
              }>
            ).map((c, cIdx) => ({
              id: c.id || `imp-c-${Date.now()}-${cIdx}`,
              authorId:
                lookupUserId(c.authorEmail || c.authorName || c.author, users, currentUserId) ||
                currentUserId,
              content: c.content || c.text || '',
              createdAt: c.createdAt || new Date().toISOString(),
            }))
          : undefined,
        _sprintHint: sprintHint || undefined,
        _epicHint: epicHint || undefined,
        _parentKeyHint: parentKeyHint || undefined,
        _versionNamesHint: fixVersionNames.length > 0 ? fixVersionNames : undefined,
        _dependencyHint: depHint || undefined,
        _externalId: row.id ? String(row.id) : mapped.key ? String(mapped.key) : undefined,
      };

      if (issueType === 'epic') {
        epicsOut.push({
          key: built.key,
          name: summary,
          nameFa: summary,
          summary: built.description || summary,
          status: statusId === 'done' ? 'done' : statusId === 'inprogress' || statusId === 'review' ? 'inprogress' : 'todo',
          startDate: built.startDate || new Date().toISOString().split('T')[0],
          dueDate: built.dueDate || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        });
      }

      if (isMilestone && built.dueDate) {
        milestonesOut.push({
          title: summary,
          titleFa: summary,
          description: built.description,
          dueDate: built.dueDate,
          status: statusId === 'done' ? 'completed' : 'upcoming',
          ownerId: assigneeId || currentUserId,
        });
      }

      issuesOut.push(built);
      previewRows.push({
        ...(built.wbsCode ? { wbsCode: built.wbsCode } : {}),
        key: built.key || '(auto)',
        type: built.type,
        summary: built.summary,
        status: built.status,
        priority: built.priority,
        parentKey: parentKeyHint || epicHint || '-',
        dueDate: built.dueDate || '-',
      });
    } else if (destinationModule === 'epics') {
      const name = String(mapped.name || '').trim();
      if (!name) continue;
      const st = mapStatusValue(mapped.status, statusMap, workflowStatuses);
      const epicObj: Partial<Epic> & { name: string } = {
        key: mapped.key ? String(mapped.key).trim() : undefined,
        name,
        nameFa: name,
        summary: String(mapped.summary || name),
        status: st === 'done' ? 'done' : st === 'inprogress' || st === 'review' ? 'inprogress' : 'todo',
        startDate: mapped.startDate ? String(mapped.startDate) : new Date().toISOString().split('T')[0],
        dueDate: mapped.dueDate ? String(mapped.dueDate) : new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      };
      epicsOut.push(epicObj);
      previewRows.push({ key: epicObj.key || '(auto)', name: epicObj.name, status: epicObj.status, startDate: epicObj.startDate, dueDate: epicObj.dueDate });
    } else if (destinationModule === 'projects') {
      const key = String(mapped.key || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
      const name = String(mapped.name || '').trim();
      if (!key || !name) continue;
      const leadId = lookupUserId(mapped.leadId, users, currentUserId) || currentUserId;
      const tplRaw = String(mapped.template || '').toLowerCase();
      const template: Project['template'] = tplRaw === 'kanban' ? 'kanban' : tplRaw === 'business' ? 'business' : 'scrum';
      const projObj: Partial<Project> & { key: string; name: string } = {
        key,
        name,
        nameFa: String(mapped.nameFa || name),
        category: String(mapped.category || 'Software'),
        template,
        leadId,
        budgetAllocated: typeof mapped.budgetAllocated === 'number' ? mapped.budgetAllocated : undefined,
        budgetSpent: typeof mapped.budgetSpent === 'number' ? mapped.budgetSpent : undefined,
        currency: mapped.currency ? String(mapped.currency) : 'USD',
        description: String(mapped.description || ''),
      };
      projectsOut.push(projObj);
      previewRows.push({
        key: projObj.key,
        name: projObj.name,
        template: projObj.template,
        budgetAllocated: projObj.budgetAllocated ?? '-',
      });
    } else if (destinationModule === 'documents') {
      const title = String(mapped.title || '').trim();
      if (!title) continue;
      const labelsArr = Array.isArray(mapped.labels)
        ? (mapped.labels as string[])
        : Array.isArray(row.labels)
        ? (row.labels as string[])
        : [];
      const docObj: NonNullable<IntegrationImportPayload['docs']>[number] = {
        id: row.id ? `doc-imp-${String(row.id)}` : undefined,
        externalId: row.id ? String(row.id) : undefined,
        title,
        content: String(mapped.content || '').trim(),
        authorEmailOrName: mapped.authorId ? String(mapped.authorId) : undefined,
        createdAt: mapped.createdAt ? String(mapped.createdAt) : typeof row.createdAt === 'string' ? row.createdAt : undefined,
        updatedAt: mapped.updatedAt ? String(mapped.updatedAt) : undefined,
        parentId: mapped.parentId ? `doc-imp-${String(mapped.parentId)}` : typeof row.parentId === 'string' ? `doc-imp-${row.parentId}` : undefined,
        _parentExternalId: typeof row.parentId === 'string' ? row.parentId : undefined,
        ancestors: Array.isArray(row.ancestors) ? (row.ancestors as Array<{ id: string; title: string }>) : undefined,
        version: typeof mapped.version === 'number' ? mapped.version : typeof row.version === 'number' ? row.version : 1,
        sourceUrl: mapped.sourceUrl ? String(mapped.sourceUrl) : typeof row.sourceUrl === 'string' ? row.sourceUrl : undefined,
        sourceProvider: source === 'confluence' ? 'confluence' : 'excel',
        labels: labelsArr,
        attachments: Array.isArray(row.attachments)
          ? (row.attachments as Array<{ id: string; name: string; size: string; mimeType: string }>)
          : undefined,
        comments: Array.isArray(row.comments)
          ? (row.comments as Array<{ id: string; author: string; text: string; createdAt: string }>)
          : undefined,
        conversionWarnings: Array.isArray(row.conversionWarnings)
          ? (row.conversionWarnings as string[])
          : undefined,
        structuredBlocks: Array.isArray(row.structuredBlocks)
          ? (row.structuredBlocks as DocStructuredBlock[])
          : undefined,
      };
      docsOut.push(docObj);
      previewRows.push({
        title: docObj.title,
        version: `v${docObj.version || 1}`,
        parentId: docObj._parentExternalId || '-',
        updatedAt: docObj.updatedAt || '-',
      });
    } else if (destinationModule === 'resources') {
      const name = String(mapped.name || '').trim();
      if (!name) continue;
      const kind = String(mapped.kind || '').toLowerCase();
      if (kind.includes('team') || kind.includes('تیم')) {
        const tm = { name, nameFa: String(mapped.nameFa || name), description: String(mapped.department || 'Imported team'), leadId: currentUserId, memberIds: [currentUserId] };
        teamsOut.push(tm);
        previewRows.push({ kind: 'Team', name: tm.name, department: tm.description });
      } else if (kind.includes('asset') || kind.includes('دارایی') || kind.includes('server')) {
        const ast: Partial<AssetEntity> & { name: string } = {
          name,
          schema: 'Services',
          status: 'Active',
          environment: String(mapped.environment || '').toLowerCase().includes('staging') ? 'Staging' : String(mapped.environment || '').toLowerCase().includes('dev') ? 'Dev' : 'Production',
          ownerId: currentUserId,
          linkedIssueKeys: [],
        };
        assetsOut.push(ast);
        previewRows.push({ kind: 'Asset', name: ast.name, environment: ast.environment });
      } else {
        const email = String(mapped.email || '').trim() || `${name.toLowerCase().replace(/[^a-z0-9]/g, '.')}@jiraflow.local`;
        const roleRaw = String(mapped.role || '').toLowerCase();
        const role: User['role'] = roleRaw === 'admin' || roleRaw === 'qa' || roleRaw === 'product_owner' || roleRaw === 'designer' ? (roleRaw as User['role']) : 'developer';
        const usr: Partial<User> & { name: string; email: string } = {
          name,
          nameFa: String(mapped.nameFa || name),
          email,
          role,
          department: String(mapped.department || 'Engineering'),
          status: 'active',
        };
        usersOut.push(usr);
        previewRows.push({ kind: 'User', name: usr.name, email: usr.email, role: usr.role });
      }
    } else if (destinationModule === 'schedules') {
      const name = String(mapped.name || '').trim();
      if (!name) continue;
      const stRaw = String(mapped.status || '').toLowerCase();
      const status: Sprint['status'] = stRaw.includes('active') || stRaw.includes('جاری') ? 'active' : stRaw.includes('complete') || stRaw.includes('done') || stRaw.includes('پایان') ? 'completed' : 'planned';
      const sp: Partial<Sprint> & { name: string } = {
        name,
        goal: String(mapped.goal || ''),
        status,
        startDate: mapped.startDate ? String(mapped.startDate) : undefined,
        endDate: mapped.endDate ? String(mapped.endDate) : undefined,
      };
      sprintsOut.push(sp);
      previewRows.push({ name: sp.name, status: sp.status, startDate: sp.startDate || '-', endDate: sp.endDate || '-' });
    } else if (destinationModule === 'risks') {
      const title = String(mapped.title || '').trim();
      if (!title) continue;
      const probRaw = String(mapped.probability || '').toLowerCase();
      const impRaw = String(mapped.impact || '').toLowerCase();
      const stRaw = String(mapped.status || '').toLowerCase();
      const probability: RiskItem['probability'] = probRaw.includes('high') || probRaw.includes('بالا') ? 'high' : probRaw.includes('low') || probRaw.includes('کم') ? 'low' : 'medium';
      const impact: RiskItem['impact'] = impRaw.includes('crit') || impRaw.includes('بحرانی') ? 'critical' : impRaw.includes('high') || impRaw.includes('بالا') ? 'high' : impRaw.includes('low') || impRaw.includes('کم') ? 'low' : 'medium';
      const status: RiskItem['status'] = stRaw.includes('close') || stRaw.includes('بسته') ? 'closed' : stRaw.includes('mitig') || stRaw.includes('در حال') ? 'mitigating' : 'open';
      const rObj: Partial<RiskItem> & { title: string } = {
        key: mapped.key ? String(mapped.key) : undefined,
        title,
        titleFa: title,
        description: String(mapped.description || ''),
        category: String(mapped.category || 'Technical'),
        probability,
        impact,
        status,
        ownerId: lookupUserId(mapped.ownerId, users, currentUserId) || currentUserId,
        mitigationPlan: mapped.mitigationPlan ? String(mapped.mitigationPlan) : undefined,
        dueDate: mapped.dueDate ? String(mapped.dueDate) : undefined,
      };
      risksOut.push(rObj);
      previewRows.push({ key: rObj.key || 'RSK', title: rObj.title, probability, impact, status });
    } else if (destinationModule === 'budgets') {
      const projectKey = String(mapped.projectKey || '').toUpperCase().trim();
      if (!projectKey) continue;
      const bObj = {
        projectKey,
        projectName: mapped.projectName ? String(mapped.projectName) : undefined,
        allocated: typeof mapped.allocated === 'number' ? mapped.allocated : 0,
        spent: typeof mapped.spent === 'number' ? mapped.spent : 0,
        currency: mapped.currency ? String(mapped.currency) : 'USD',
      };
      budgetsOut.push(bObj);
      previewRows.push(bObj);
    } else if (destinationModule === 'milestones') {
      const title = String(mapped.title || '').trim();
      if (!title) continue;
      const stRaw = String(mapped.status || '').toLowerCase();
      const status: MilestoneItem['status'] = stRaw.includes('comp') || stRaw.includes('done') || stRaw.includes('تکمیل') ? 'completed' : stRaw.includes('risk') || stRaw.includes('خطر') ? 'at_risk' : 'upcoming';
      const mObj: Partial<MilestoneItem> & { title: string } = {
        title,
        titleFa: title,
        description: mapped.description ? String(mapped.description) : undefined,
        dueDate: mapped.dueDate ? String(mapped.dueDate) : new Date().toISOString().split('T')[0],
        status,
        ownerId: lookupUserId(mapped.ownerId, users, currentUserId) || currentUserId,
      };
      milestonesOut.push(mObj);
      previewRows.push({ title: mObj.title, dueDate: mObj.dueDate, status });
    }
  }

  if (source === 'jira' && sourceProjects && sourceProjects.length > 0 && destinationModule === 'projects' && projectsOut.length === 0) {
    for (const sp of sourceProjects) {
      projectsOut.push({
        key: sp.key,
        name: sp.name,
        nameFa: sp.name,
        description: sp.description || '',
        template: 'scrum',
      });
    }
  }

  return {
    payload: {
      source,
      destinationModule,
      targetProjectId,
      conflictPolicy,
      createNewSpace,
      projects: projectsOut.length > 0 ? projectsOut : undefined,
      epics: epicsOut.length > 0 ? epicsOut : undefined,
      sprints: sprintsOut.length > 0 ? sprintsOut : undefined,
      versions: versionsOut.length > 0 ? versionsOut : undefined,
      issues: issuesOut.length > 0 ? issuesOut : undefined,
      docs: docsOut.length > 0 ? docsOut : undefined,
      users: usersOut.length > 0 ? usersOut : undefined,
      teams: teamsOut.length > 0 ? teamsOut : undefined,
      assets: assetsOut.length > 0 ? assetsOut : undefined,
      risks: risksOut.length > 0 ? risksOut : undefined,
      milestones: milestonesOut.length > 0 ? milestonesOut : undefined,
      budgets: budgetsOut.length > 0 ? budgetsOut : undefined,
    },
    previewRows,
    cellIssues,
  };
}
