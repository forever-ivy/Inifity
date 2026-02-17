import { Sidebar } from "@/components/layout/Sidebar";
import { useAppStore } from "@/stores/appStore";
import { Dashboard } from "@/pages/Dashboard";
import { Services } from "@/pages/Services";
import { Jobs } from "@/pages/Jobs";
import { Verify } from "@/pages/Verify";
import { Logs } from "@/pages/Logs";
import { Settings } from "@/pages/Settings";
import { KBHealth } from "@/pages/KBHealth";

const pages: Record<string, React.ReactNode> = {
  dashboard: <Dashboard />,
  services: <Services />,
  jobs: <Jobs />,
  verify: <Verify />,
  logs: <Logs />,
  settings: <Settings />,
  "kb-health": <KBHealth />,
};

function App() {
  const { activeTab } = useAppStore();

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        {pages[activeTab] || <Dashboard />}
      </main>
    </div>
  );
}

export default App;
