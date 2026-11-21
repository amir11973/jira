import React from 'react';
import { 
  Bookmark, CheckSquare, Bug, Layers, CornerDownRight, Compass,
  ChevronUp, ChevronsUp, ChevronDown, ChevronsDown, Minus
} from 'lucide-react';
import { IssueType, Priority } from '../../types/jira';

export const IssueTypeIcon: React.FC<{ type: IssueType; className?: string }> = ({ type, className = 'w-4 h-4' }) => {
  switch (type) {
    case 'epic':
      return (
        <span title="Epic" className="inline-flex items-center justify-center text-purple-600 dark:text-purple-400">
          <Layers className={className} />
        </span>
      );
    case 'feature':
      return (
        <span title="Feature" className="inline-flex items-center justify-center text-amber-600 dark:text-amber-400">
          <Compass className={className} />
        </span>
      );
    case 'story':
      return (
        <span title="Story" className="inline-flex items-center justify-center text-emerald-600 dark:text-emerald-400">
          <Bookmark className={`${className} fill-emerald-600 dark:fill-emerald-400`} />
        </span>
      );
    case 'task':
      return (
        <span title="Task" className="inline-flex items-center justify-center text-blue-600 dark:text-blue-400">
          <CheckSquare className={className} />
        </span>
      );
    case 'bug':
      return (
        <span title="Bug" className="inline-flex items-center justify-center text-rose-600 dark:text-rose-400">
          <Bug className={className} />
        </span>
      );
    case 'subtask':
      return (
        <span title="Sub-task" className="inline-flex items-center justify-center text-sky-600 dark:text-sky-400">
          <CornerDownRight className={className} />
        </span>
      );
    default:
      return <CheckSquare className={className} />;
  }
};

export const PriorityIcon: React.FC<{ priority: Priority; className?: string }> = ({ priority, className = 'w-4 h-4' }) => {
  switch (priority) {
    case 'highest':
      return (
        <span title="Highest Priority" className="text-rose-600 dark:text-rose-500 inline-flex items-center">
          <ChevronsUp className={className} />
        </span>
      );
    case 'high':
      return (
        <span title="High Priority" className="text-orange-500 dark:text-orange-400 inline-flex items-center">
          <ChevronUp className={className} />
        </span>
      );
    case 'medium':
      return (
        <span title="Medium Priority" className="text-amber-500 dark:text-amber-400 inline-flex items-center">
          <Minus className={className} />
        </span>
      );
    case 'low':
      return (
        <span title="Low Priority" className="text-emerald-600 dark:text-emerald-400 inline-flex items-center">
          <ChevronDown className={className} />
        </span>
      );
    case 'lowest':
      return (
        <span title="Lowest Priority" className="text-blue-500 dark:text-blue-400 inline-flex items-center">
          <ChevronsDown className={className} />
        </span>
      );
    default:
      return <Minus className={className} />;
  }
};

export const UserAvatar: React.FC<{ 
  user?: { name: string; avatar: string; avatarColor?: string } | null; 
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}> = ({ user, size = 'sm', className = '' }) => {
  if (!user) {
    return (
      <div 
        title="Unassigned" 
        className={`rounded-full border border-dashed border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center text-[10px] font-medium shrink-0 ${
          size === 'sm' ? 'w-6 h-6' : size === 'md' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'
        } ${className}`}
      >
        ?
      </div>
    );
  }

  const sizeClass = size === 'sm' ? 'w-6 h-6 text-[10px]' : size === 'md' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm';
  const colorClass = user.avatarColor || 'bg-blue-600 text-white';

  return (
    <div 
      title={user.name} 
      className={`rounded-full flex items-center justify-center font-bold tracking-tight shrink-0 select-none shadow-xs ${colorClass} ${sizeClass} ${className}`}
    >
      {user.avatar}
    </div>
  );
};
