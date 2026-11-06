import React from 'react';
import { JiraProvider, useJira } from './context/JiraContext';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { BoardView } from './components/board/BoardView';
import { BacklogView } from './components/backlog/BacklogView';
import { RoadmapView } from './components/roadmap/RoadmapView';
import { IssuesListView } from './components/issues/IssuesListView';
import { ReleasesView } from './components/releases/ReleasesView';
import { ReportsView } from './components/reports/ReportsView';
import { SettingsView } from './components/settings/SettingsView';
import { CreateIssueModal } from './components/modals/CreateIssueModal';
import { IssueDetailModal } from './components/modals/IssueDetailModal';

const MainLayout: React.FC = () => {
  const { activeView } = useJira();

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col h-full overflow-hidden">
          {activeView === 'board' && <BoardView />}
          {activeView === 'backlog' && <BacklogView />}
          {activeView === 'roadmap' && <RoadmapView />}
          {activeView === 'issues' && <IssuesListView />}
          {activeView === 'releases' && <ReleasesView />}
          {activeView === 'reports' && <ReportsView />}
          {activeView === 'settings' && <SettingsView />}
        </main>
      </div>

      <CreateIssueModal />
      <IssueDetailModal />
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
