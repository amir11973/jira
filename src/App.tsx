import React from 'react';
import { JiraProvider, useJira } from './context/JiraContext';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
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

const MainLayout: React.FC = () => {
  const { activeView, currentUser } = useJira();

  if (!currentUser) {
    return <LoginView />;
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col h-full overflow-hidden">
          {activeView === 'summary' && <SummaryView />}
          {activeView === 'board' && <BoardView />}
          {activeView === 'list' && <SpaceListView />}
          {activeView === 'backlog' && <BacklogView />}
          {activeView === 'roadmap' && <RoadmapView />}
          {activeView === 'forms' && <FormsView />}
          {activeView === 'issues' && <IssuesListView />}
          {activeView === 'releases' && <ReleasesView />}
          {activeView === 'reports' && <ReportsView />}
          {activeView === 'automation' && <AutomationView />}
          {activeView === 'workflow' && <WorkflowEditorView />}
          {activeView === 'users' && <UsersView />}
          {activeView === 'settings' && <SettingsView />}
        </main>
      </div>

      <CreateIssueModal />
      <IssueDetailModal />
      <WorkflowViewerModal />
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
