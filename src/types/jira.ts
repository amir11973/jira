export type IssueType = 'epic' | 'story' | 'task' | 'bug' | 'subtask';
export type Priority = 'lowest' | 'low' | 'medium' | 'high' | 'highest';
export type StatusCategory = 'todo' | 'inprogress' | 'done';

export interface User {
  id: string;
  name: string;
  nameFa: string;
  email: string;
  avatar: string;
  avatarColor: string;
  role: 'admin' | 'developer' | 'qa' | 'product_owner' | 'designer';
}

export interface Status {
  id: string;
  name: string;
  nameFa: string;
  category: StatusCategory;
  color: string;
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
  type: 'blocks' | 'is_blocked_by' | 'relates_to' | 'duplicates';
  targetIssueKey: string;
}

export interface Issue {
  id: string;
  key: string;
  projectId: string;
  sprintId?: string | null; // null represents Backlog
  epicId?: string | null;
  type: IssueType;
  summary: string;
  description: string;
  status: string; // 'backlog' | 'todo' | 'inprogress' | 'review' | 'done'
  priority: Priority;
  assigneeId?: string | null;
  reporterId: string;
  storyPoints?: number;
  originalEstimateMinutes?: number;
  remainingEstimateMinutes?: number;
  labels: string[];
  components: string[];
  fixVersionIds: string[];
  subtasks: Subtask[];
  comments: Comment[];
  worklogs: Worklog[];
  links: IssueLink[];
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

export interface Project {
  id: string;
  key: string;
  name: string;
  nameFa: string;
  description: string;
  leadId: string;
  avatarColor: string;
  category: string;
}

export type ViewType = 
  | 'board' 
  | 'backlog' 
  | 'roadmap' 
  | 'issues' 
  | 'releases' 
  | 'reports' 
  | 'settings';
