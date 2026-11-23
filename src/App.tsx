import React from 'react';
import { JiraProvider, useJira } from './context/JiraContext';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { SpaceHeader } from './components/layout/SpaceHeader';
import { ForYouView } from './components/home/ForYouView';
import { SpacesDirectoryView } from './components/spaces/SpacesDirectoryView';
import { PlansView } from './components/plans/PlansView';
import { FiltersDirectoryView } from './components/filters/FiltersDirectoryView';
import { DashboardsView } from './components/dashboards/DashboardsView';
import { TeamsView, AssetsView } from './components/org/TeamsAndAssetsViews';
import {
  DevelopmentView,
  DocsView,
  CalendarView,
  GoalsView,
  ArchivedWorkView,
  AttachmentsView,
  ShortcutsView,
} from './components/spaceExtras/SpaceExtraViews';
import { JiraAdminView } from './components/admin/JiraAdminView';
import { SummaryView } from './components/summary/SummaryView';
import { BoardView } from './components/board/BoardView';
import { SpaceListView } from './components/list/SpaceListView';
import { BacklogView } from './components/backlog/BacklogView';
import { RoadmapView } from './components/roadmap/RoadmapView';
import { FormsView } from './components/forms/FormsView';
import { IssuesListView } from './components/issues/IssuesListView';
import { ReleasesView } from './components/releases/ReleasesView';
import { ReportsView } from './components/reports/ReportsView';
import { AutomationView } from './components/automation/AutomationView';
import { WorkflowEditorView } from './components/workflow/WorkflowEditorView';
import { WorkflowViewerModal } from './components/workflow/WorkflowViewerModal';
import { UsersView } from './components/users/UsersView';
import { SettingsView } from './components/settings/SettingsView';
import { LoginView } from './components/auth/LoginView';
import { CreateIssueModal } from './components/modals/CreateIssueModal';
import { IssueDetailModal } from './components/modals/IssueDetailModal';
import { QuickCreateModals } from './components/modals/QuickCreateModals';
import { IntegrationCenterView } from './components/integrations/IntegrationCenterView';
import { ViewType } from './types/jira';

const SPACE_SCOPED_VIEWS: ViewType[] = [
  'summary',
  'board',
  'list',
  'backlog',
  'roadmap',
  'development',
  'forms',
  'docs',
  'calendar',
  'goals',
  'releases',
  'reports',
  'archived',
  'attachments',
  'shortcuts',
  'automation',
  'workflow',
  'settings',
];

const MainLayout: React.FC = () => {
  const { activeView, currentUser } = useJira();

  if (!currentUser) {
    return <LoginView />;
  }

  const isSpaceView = SPACE_SCOPED_VIEWS.includes(activeView);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col h-full overflow-hidden">
          {isSpaceView && <SpaceHeader />}
          {activeView === 'for_you' && <ForYouView />}
          {activeView === 'spaces' && <SpacesDirectoryView />}
          {activeView === 'plans' && <PlansView />}
          {activeView === 'filters' && <FiltersDirectoryView />}
          {activeView === 'dashboards' && <DashboardsView />}
          {activeView === 'assets' && <AssetsView />}
          {activeView === 'teams' && <TeamsView />}
          {activeView === 'integrations' && <IntegrationCenterView />}
          {activeView === 'summary' && <SummaryView />}
          {activeView === 'board' && <BoardView />}
          {activeView === 'list' && <SpaceListView />}
          {activeView === 'backlog' && <BacklogView />}
          {activeView === 'roadmap' && <RoadmapView />}
          {activeView === 'development' && <DevelopmentView />}
          {activeView === 'forms' && <FormsView />}
          {activeView === 'docs' && <DocsView />}
          {activeView === 'calendar' && <CalendarView />}
          {activeView === 'goals' && <GoalsView />}
          {activeView === 'issues' && <IssuesListView />}
          {activeView === 'releases' && <ReleasesView />}
          {activeView === 'reports' && <ReportsView />}
          {activeView === 'archived' && <ArchivedWorkView />}
          {activeView === 'attachments' && <AttachmentsView />}
          {activeView === 'shortcuts' && <ShortcutsView />}
          {activeView === 'automation' && <AutomationView />}
          {activeView === 'workflow' && <WorkflowEditorView />}
          {activeView === 'users' && <UsersView />}
          {activeView === 'settings' && <SettingsView />}
          {activeView === 'jira_admin' && <JiraAdminView />}
        </main>
      </div>

      <CreateIssueModal />
      <IssueDetailModal />
      <WorkflowViewerModal />
      <QuickCreateModals />
    </div>
  );
};

export default function App() {
  return (
    <JiraProvider>
      <MainLayout />
    </JiraProvider>
  );
}
