import {
  Issue,
  User,
  Epic,
  WorkflowDefinition,
  WorkflowTransition,
  WorkflowRule,
  WorkflowRuleType,
  WorkflowRuleKind,
  HistoryEntry,
} from '../types/jira';

export interface RuleCatalogItem {
  type: WorkflowRuleType;
  kind: WorkflowRuleKind;
  name: string;
  nameFa: string;
  classicEquivalent: string;
  purpose: string;
  purposeFa: string;
  configSchema: {
    key: string;
    label: string;
    labelFa: string;
    options?: { value: string; label: string }[];
    defaultValue: string;
  }[];
}

export const WORKFLOW_RULE_CATALOG: RuleCatalogItem[] = [
  // 5 Restrict rules
  {
    type: 'restrict_subtasks_status',
    kind: 'restrict',
    name: 'Restrict based on the status of subtasks',
    nameFa: 'محدودسازی بر اساس وضعیت زیروظایف',
    classicEquivalent: 'Sub-task blocking condition',
    purpose: 'Only allow the move when all subtasks have a given status',
    purposeFa: 'انتقال فقط زمانی مجاز باشد که همه زیروظایف در وضعیت مشخصی باشند',
    configSchema: [
      {
        key: 'requiredStatus',
        label: 'Required Subtask Status',
        labelFa: 'وضعیت الزامی زیروظایف',
        options: [
          { value: 'done', label: 'Done' },
          { value: 'inprogress', label: 'In Progress' },
        ],
        defaultValue: 'done',
      },
    ],
  },
  {
    type: 'restrict_field_value',
    kind: 'restrict',
    name: 'Restrict to when a field is a specific value',
    nameFa: 'محدودسازی به مقدار مشخص یک فیلد',
    classicEquivalent: 'Value-field condition',
    purpose: 'Only allow the move when a field has a specific value',
    purposeFa: 'اجازه انتقال تنها در صورتی که فیلد انتخابی دارای مقدار تعیین‌شده باشد',
    configSchema: [
      {
        key: 'field',
        label: 'Field',
        labelFa: 'فیلد',
        options: [
          { value: 'priority', label: 'Priority' },
          { value: 'flagged', label: 'Flagged' },
          { value: 'type', label: 'Work Type' },
        ],
        defaultValue: 'flagged',
      },
      {
        key: 'value',
        label: 'Expected Value',
        labelFa: 'مقدار مورد انتظار',
        defaultValue: 'false',
      },
    ],
  },
  {
    type: 'restrict_previous_status',
    kind: 'restrict',
    name: 'Restrict to when an item has been through a specific status',
    nameFa: 'محدودسازی به عبور قبلی از یک وضعیت خاص',
    classicEquivalent: 'Previous-status condition',
    purpose: 'Only allow the move if the item once had a specific status',
    purposeFa: 'انتقال فقط وقتی نمایش داده شود که تسک قبلاً از وضعیت مشخصی عبور کرده باشد',
    configSchema: [
      {
        key: 'previousStatus',
        label: 'Required Previous Status',
        labelFa: 'وضعیت قبلی الزامی',
        options: [
          { value: 'inprogress', label: 'In Progress' },
          { value: 'review', label: 'In Review' },
          { value: 'todo', label: 'To Do' },
        ],
        defaultValue: 'review',
      },
    ],
  },
  {
    type: 'restrict_separation_of_duties',
    kind: 'restrict',
    name: 'Restrict users who previously updated the status',
    nameFa: 'محدودسازی کاربرانی که قبلاً وضعیت را تغییر داده‌اند',
    classicEquivalent: 'Separation-of-duties condition',
    purpose: 'Block people who already moved the item from a specific status',
    purposeFa: 'تفکیک وظایف: جلوگیری از اینکه یک نفر هم کار را انجام دهد و هم تایید نهایی کند',
    configSchema: [
      {
        key: 'priorStatus',
        label: 'Cannot be the user who moved to',
        labelFa: 'کاربر نباید انتقال‌دهنده قبلی به این وضعیت باشد',
        options: [
          { value: 'inprogress', label: 'In Progress' },
          { value: 'review', label: 'In Review' },
        ],
        defaultValue: 'review',
      },
    ],
  },
  {
    type: 'restrict_user_role',
    kind: 'restrict',
    name: 'Restrict who can move a work item',
    nameFa: 'محدودسازی نقش‌های مجاز برای انتقال',
    classicEquivalent: 'User / role condition',
    purpose: 'Only users with the selected role may use this transition',
    purposeFa: 'فقط کاربران دارای نقش انتخاب‌شده قادر به انجام این انتقال باشند',
    configSchema: [
      {
        key: 'role',
        label: 'Allowed Role',
        labelFa: 'نقش مجاز',
        options: [
          { value: 'admin', label: 'Admin' },
          { value: 'product_owner', label: 'Product Owner' },
          { value: 'qa', label: 'QA Engineer' },
          { value: 'developer', label: 'Developer' },
        ],
        defaultValue: 'qa',
      },
    ],
  },
  // 4 Validate rules
  {
    type: 'validate_field',
    kind: 'validate',
    name: 'Validate a field',
    nameFa: 'اعتبارسنجی پر بودن یا مقدار فیلد',
    classicEquivalent: 'Field-required validator',
    purpose: 'Fail the move with an error message unless the field is populated',
    purposeFa: 'در صورت خالی بودن فیلد الزامی، انتقال رد شده و پیام خطا نمایش داده شود',
    configSchema: [
      {
        key: 'field',
        label: 'Required Field',
        labelFa: 'فیلد الزامی',
        options: [
          { value: 'assigneeId', label: 'Assignee' },
          { value: 'storyPoints', label: 'Story Points' },
          { value: 'dueDate', label: 'Due Date' },
          { value: 'description', label: 'Description' },
        ],
        defaultValue: 'assigneeId',
      },
    ],
  },
  {
    type: 'validate_previous_status',
    kind: 'validate',
    name: 'Validate that an item has been through a specific status',
    nameFa: 'اعتبارسنجی عبور تسک از وضعیت قبلی (گیت کیفیت)',
    classicEquivalent: 'Previous-status validator',
    purpose: 'Ensure the item previously passed through a gate status (e.g. In Review)',
    purposeFa: 'اطمینان از عبور تسک از مرحله کنترل کیفیت یا بررسی کد پیش از تکمیل',
    configSchema: [
      {
        key: 'previousStatus',
        label: 'Must have passed status',
        labelFa: 'باید از وضعیت زیر عبور کرده باشد',
        options: [
          { value: 'review', label: 'In Review' },
          { value: 'inprogress', label: 'In Progress' },
        ],
        defaultValue: 'review',
      },
    ],
  },
  {
    type: 'validate_parent_status',
    kind: 'validate',
    name: 'Validate that parent items are in a specific status',
    nameFa: 'اعتبارسنجی وضعیت والد (اپیک)',
    classicEquivalent: 'Parent-status validator',
    purpose: 'Ensure the parent epic is in a specific status before transitioning',
    purposeFa: 'اطمینان از اینکه اپیک والد در وضعیت مجاز قرار دارد',
    configSchema: [
      {
        key: 'parentStatus',
        label: 'Required Parent Status',
        labelFa: 'وضعیت الزامی اپیک والد',
        options: [
          { value: 'inprogress', label: 'In Progress' },
          { value: 'todo', label: 'To Do' },
          { value: 'done', label: 'Done' },
        ],
        defaultValue: 'inprogress',
      },
    ],
  },
  {
    type: 'validate_permission',
    kind: 'validate',
    name: 'Validate that people have a specific permission',
    nameFa: 'اعتبارسنجی مجوز دسترسی کاربر',
    classicEquivalent: 'Permission validator',
    purpose: 'Ensure the user initiating the move holds admin/PO/QA permission',
    purposeFa: 'بررسی دارا بودن مجوز مدیریتی یا تایید کیفیت برای انجام انتقال',
    configSchema: [
      {
        key: 'permission',
        label: 'Required Permission Scope',
        labelFa: 'مجوز مورد نیاز',
        options: [
          { value: 'resolve_issues', label: 'Resolve / Close Issues (Admin, PO, QA)' },
          { value: 'manage_sprint', label: 'Manage Sprint (Admin, PO)' },
        ],
        defaultValue: 'resolve_issues',
      },
    ],
  },
  // 3 Perform action rules
  {
    type: 'perform_assign',
    kind: 'perform',
    name: 'Assign a work item',
    nameFa: 'تخصیص خودکار مسئول تسک',
    classicEquivalent: 'Assign post-function',
    purpose: 'Auto-assign the item to the current user or reporter after moving',
    purposeFa: 'تغییر خودکار مسئول انجام تسک پس از اتمام انتقال',
    configSchema: [
      {
        key: 'target',
        label: 'Assign To',
        labelFa: 'تخصیص به',
        options: [
          { value: 'current_user', label: 'Current User (Mover)' },
          { value: 'reporter', label: 'Reporter' },
          { value: 'unassigned', label: 'Unassigned' },
        ],
        defaultValue: 'current_user',
      },
    ],
  },
  {
    type: 'perform_copy_field',
    kind: 'perform',
    name: 'Copy the value of one field to another',
    nameFa: 'کپی مقدار یک فیلد به فیلد دیگر',
    classicEquivalent: 'Copy-field post-function',
    purpose: 'Copy a source field (e.g. Reporter) to a target field (e.g. Assignee)',
    purposeFa: 'کپی خودکار مقدار فیلد مبدأ به فیلد مقصد پس از انتقال',
    configSchema: [
      {
        key: 'fromField',
        label: 'Source Field',
        labelFa: 'فیلد مبدأ',
        options: [
          { value: 'reporterId', label: 'Reporter' },
          { value: 'startDate', label: 'Start Date' },
        ],
        defaultValue: 'reporterId',
      },
      {
        key: 'toField',
        label: 'Destination Field',
        labelFa: 'فیلد مقصد',
        options: [
          { value: 'assigneeId', label: 'Assignee' },
          { value: 'dueDate', label: 'Due Date' },
        ],
        defaultValue: 'assigneeId',
      },
    ],
  },
  {
    type: 'perform_update_field',
    kind: 'perform',
    name: 'Update a work item field',
    nameFa: 'به‌روزرسانی خودکار یک فیلد',
    classicEquivalent: 'Update-field post-function',
    purpose: 'Set a field value automatically after the status changes',
    purposeFa: 'تنظیم مقدار مشخص برای فیلد (مثلاً نتیجه یا پرچم) بعد از تغییر وضعیت',
    configSchema: [
      {
        key: 'field',
        label: 'Field to Update',
        labelFa: 'فیلد هدف',
        options: [
          { value: 'resolution', label: 'Resolution' },
          { value: 'flagged', label: 'Flagged' },
          { value: 'priority', label: 'Priority' },
        ],
        defaultValue: 'resolution',
      },
      {
        key: 'value',
        label: 'New Value',
        labelFa: 'مقدار جدید',
        defaultValue: 'Done',
      },
    ],
  },
];

function hasBeenThroughStatus(issue: Issue, statusId: string, workflow: WorkflowDefinition): boolean {
  if (issue.status === statusId) return true;
  const targetStatus = workflow.statuses.find(s => s.id === statusId);
  const targetName = targetStatus?.name.toLowerCase();
  return (issue.history || []).some(
    h =>
      h.field === 'status' &&
      (h.toValue.toLowerCase() === statusId.toLowerCase() ||
        h.fromValue.toLowerCase() === statusId.toLowerCase() ||
        (targetName && (h.toValue.toLowerCase() === targetName || h.fromValue.toLowerCase() === targetName)))
  );
}

/**
 * Stage 2 (Offer): Check restrict rules to see if transition is offered to the user for this issue.
 */
export function evaluateRestrictRules(
  transition: WorkflowTransition,
  issue: Issue,
  user: User | null,
  workflow: WorkflowDefinition,
  language: 'fa' | 'en'
): { allowed: boolean; reason?: string } {
  const restrictRules = transition.rules.filter(r => r.kind === 'restrict');
  for (const rule of restrictRules) {
    if (rule.type === 'restrict_subtasks_status') {
      const req = rule.config.requiredStatus || 'done';
      if (issue.subtasks.length > 0) {
        const allMatch = issue.subtasks.every(s => (req === 'done' ? s.isCompleted || s.status === 'done' : s.status === req));
        if (!allMatch) {
          return {
            allowed: false,
            reason:
              language === 'fa'
                ? `انتقال به دلیل تکمیل نشدن زیروظایف (${req}) محدود شده است.`
                : `Restricted: All subtasks must be "${req}" first.`,
          };
        }
      }
    } else if (rule.type === 'restrict_field_value') {
      const field = rule.config.field || 'flagged';
      const expected = rule.config.value ?? 'false';
      const actual = String((issue as unknown as Record<string, unknown>)[field] ?? 'false');
      if (actual !== expected) {
        return {
          allowed: false,
          reason:
            language === 'fa'
              ? `محدودیت شرط فیلد: ${field} باید برابر ${expected} باشد.`
              : `Restricted: Field "${field}" must equal "${expected}".`,
        };
      }
    } else if (rule.type === 'restrict_previous_status') {
      const prevStatus = rule.config.previousStatus || 'review';
      if (!hasBeenThroughStatus(issue, prevStatus, workflow)) {
        return {
          allowed: false,
          reason:
            language === 'fa'
              ? `این تسک ابتدا باید از وضعیت "${prevStatus}" عبور کرده باشد.`
              : `Restricted: Item must have passed through "${prevStatus}".`,
        };
      }
    } else if (rule.type === 'restrict_separation_of_duties') {
      const priorStatus = rule.config.priorStatus || 'review';
      const statusName = workflow.statuses.find(s => s.id === priorStatus)?.name.toLowerCase();
      const priorMover = (issue.history || []).find(
        h =>
          h.field === 'status' &&
          (h.toValue.toLowerCase() === priorStatus.toLowerCase() || (statusName && h.toValue.toLowerCase() === statusName))
      );
      if (priorMover && user && priorMover.authorId === user.id) {
        return {
          allowed: false,
          reason:
            language === 'fa'
              ? `قانون تفکیک وظایف: کاربری که تسک را به ${priorStatus} برده نمی‌تواند این انتقال را انجام دهد.`
              : `Restricted (Separation of Duties): You previously moved this item to ${priorStatus}.`,
        };
      }
    } else if (rule.type === 'restrict_user_role') {
      const requiredRole = rule.config.role || 'qa';
      if (!user || (user.role !== requiredRole && user.role !== 'admin')) {
        return {
          allowed: false,
          reason:
            language === 'fa'
              ? `فقط کاربران با نقش "${requiredRole}" مجاز به این انتقال هستند.`
              : `Restricted: Only users with role "${requiredRole}" can execute this transition.`,
        };
      }
    }
  }
  return { allowed: true };
}

/**
 * Stage 3 (Validate): Evaluate validate rules before committing status change.
 */
export function evaluateValidateRules(
  transition: WorkflowTransition,
  issue: Issue,
  user: User | null,
  epics: Epic[],
  workflow: WorkflowDefinition,
  language: 'fa' | 'en'
): { valid: boolean; reason?: string } {
  const validateRules = transition.rules.filter(r => r.kind === 'validate');
  for (const rule of validateRules) {
    if (rule.type === 'validate_field') {
      const field = rule.config.field || 'assigneeId';
      const val = (issue as unknown as Record<string, unknown>)[field];
      const isEmpty = val === null || val === undefined || val === '' || (typeof val === 'number' && val <= 0 && field === 'storyPoints');
      if (isEmpty) {
        return {
          valid: false,
          reason:
            language === 'fa'
              ? `اعتبارسنجی ناموفق: مقداردهی فیلد "${field}" پیش از این انتقال الزامی است.`
              : `Validation failed: Field "${field}" is required before transitioning to ${transition.name}.`,
        };
      }
    } else if (rule.type === 'validate_previous_status') {
      const prevStatus = rule.config.previousStatus || 'review';
      if (!hasBeenThroughStatus(issue, prevStatus, workflow)) {
        return {
          valid: false,
          reason:
            language === 'fa'
              ? `اعتبارسنجی گیت کیفیت: این تسک باید ابتدا از وضعیت "${prevStatus}" عبور کند.`
              : `Validation failed: Item must pass through "${prevStatus}" before moving to ${transition.name}.`,
        };
      }
    } else if (rule.type === 'validate_parent_status') {
      const requiredParentStatus = rule.config.parentStatus || 'inprogress';
      if (issue.epicId) {
        const parentEpic = epics.find(e => e.id === issue.epicId);
        if (parentEpic && parentEpic.status !== requiredParentStatus) {
          return {
            valid: false,
            reason:
              language === 'fa'
                ? `اعتبارسنجی والد: اپیک والد (${parentEpic.key}) باید در وضعیت "${requiredParentStatus}" باشد.`
                : `Validation failed: Parent Epic (${parentEpic.key}) must be in "${requiredParentStatus}" status.`,
          };
        }
      }
    } else if (rule.type === 'validate_permission') {
      const perm = rule.config.permission || 'resolve_issues';
      const allowedRoles = perm === 'manage_sprint' ? ['admin', 'product_owner'] : ['admin', 'product_owner', 'qa'];
      if (!user || !allowedRoles.includes(user.role)) {
        return {
          valid: false,
          reason:
            language === 'fa'
              ? `خطای مجوز: شما مجوز "${perm}" برای انجام این انتقال را ندارید.`
              : `Permission error: You do not hold "${perm}" permission for this transition.`,
        };
      }
    }
  }
  return { valid: true };
}

/**
 * Get reachable transitions for an item from its current status (omitting current status, matching Figure 1).
 */
export function getAvailableTransitions(
  issue: Issue,
  user: User | null,
  workflow: WorkflowDefinition,
  language: 'fa' | 'en'
): { transition: WorkflowTransition; statusObj: WorkflowDefinition['statuses'][0]; restrictResult: { allowed: boolean; reason?: string } }[] {
  const candidates = workflow.transitions.filter(
    tr =>
      tr.fromStatusId !== 'start' &&
      tr.toStatusId !== issue.status &&
      (tr.fromStatusId === 'any' || tr.fromStatusId === issue.status)
  );

  const results: {
    transition: WorkflowTransition;
    statusObj: WorkflowDefinition['statuses'][0];
    restrictResult: { allowed: boolean; reason?: string };
  }[] = [];

  for (const tr of candidates) {
    const statusObj = workflow.statuses.find(s => s.id === tr.toStatusId);
    if (!statusObj) continue;
    const restrictResult = evaluateRestrictRules(tr, issue, user, workflow, language);
    results.push({ transition: tr, statusObj, restrictResult });
  }

  return results;
}

/**
 * Execute Stages 2-5 of the transition pipeline (Offer -> Validate -> Change -> Post Actions).
 */
export function runTransitionPipeline(params: {
  issue: Issue;
  targetStatusId: string;
  user: User | null;
  workflow: WorkflowDefinition;
  epics: Epic[];
  language: 'fa' | 'en';
}): { ok: boolean; error?: string; updates?: Partial<Issue>; historyEntry?: HistoryEntry } {
  const { issue, targetStatusId, user, workflow, epics, language } = params;

  if (issue.status === targetStatusId) {
    return { ok: true, updates: {} };
  }

  const transition = workflow.transitions.find(
    tr =>
      tr.toStatusId === targetStatusId &&
      tr.fromStatusId !== 'start' &&
      (tr.fromStatusId === issue.status || tr.fromStatusId === 'any')
  );

  if (!transition) {
    return {
      ok: false,
      error:
        language === 'fa'
          ? `انتقالی از وضعیت فعلی به "${targetStatusId}" در گردش‌کار تعریف نشده است.`
          : `No workflow transition exists from "${issue.status}" to "${targetStatusId}".`,
    };
  }

  // Stage 2: Offer (Restrict rules)
  const restrictCheck = evaluateRestrictRules(transition, issue, user, workflow, language);
  if (!restrictCheck.allowed) {
    return { ok: false, error: restrictCheck.reason };
  }

  // Stage 3: Validate (Validate rules)
  const validateCheck = evaluateValidateRules(transition, issue, user, epics, workflow, language);
  if (!validateCheck.valid) {
    return { ok: false, error: validateCheck.reason };
  }

  // Stage 4: Change status + History entry
  const fromStatusObj = workflow.statuses.find(s => s.id === issue.status);
  const toStatusObj = workflow.statuses.find(s => s.id === targetStatusId);

  const historyEntry: HistoryEntry = {
    id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    authorId: user?.id || 'user-1',
    field: 'status',
    fromValue: fromStatusObj?.name || issue.status,
    toValue: toStatusObj?.name || targetStatusId,
    createdAt: new Date().toISOString(),
  };

  const updates: Partial<Issue> = {
    status: targetStatusId,
    updatedAt: new Date().toISOString(),
  };

  // If moving out of done, clear resolution unless set by post-function
  if (toStatusObj?.category !== 'done' && issue.resolution) {
    updates.resolution = null;
  }

  // Stage 5: Perform Actions (Post-functions)
  const performRules = transition.rules.filter(r => r.kind === 'perform');
  for (const rule of performRules) {
    if (rule.type === 'perform_assign') {
      const target = rule.config.target || 'current_user';
      if (target === 'current_user' && user) {
        updates.assigneeId = user.id;
      } else if (target === 'reporter') {
        updates.assigneeId = issue.reporterId;
      } else if (target === 'unassigned') {
        updates.assigneeId = null;
      }
    } else if (rule.type === 'perform_copy_field') {
      const fromField = rule.config.fromField || 'reporterId';
      const toField = rule.config.toField || 'assigneeId';
      const val = (issue as unknown as Record<string, unknown>)[fromField];
      if (val !== undefined) {
        (updates as Record<string, unknown>)[toField] = val;
      }
    } else if (rule.type === 'perform_update_field') {
      const field = rule.config.field || 'resolution';
      const val = rule.config.value;
      if (field === 'flagged') {
        updates.flagged = val === 'true';
      } else if (field === 'resolution') {
        updates.resolution = (val as Issue['resolution']) || 'Done';
      } else if (field === 'priority') {
        updates.priority = (val as Issue['priority']) || 'medium';
      }
    }
  }

  return { ok: true, updates, historyEntry };
}
