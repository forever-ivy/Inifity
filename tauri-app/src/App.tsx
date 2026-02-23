import { useEffect, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sidebar } from "@/components/layout/Sidebar";
import { useAppStore } from "@/stores/appStore";
import { ToastContainer } from "@/components/ui/toast";
import { usePollingOrchestrator } from "@/hooks/usePollingOrchestrator";

const Dashboard = lazy(() => import("@/pages/Dashboard").then(m => ({ default: m.Dashboard })));
const AlertCenter = lazy(() => import("@/pages/AlertCenter").then(m => ({ default: m.AlertCenter })));
const Services = lazy(() => import("@/pages/Services").then(m => ({ default: m.Services })));
const Jobs = lazy(() => import("@/pages/Jobs").then(m => ({ default: m.Jobs })));
const Verify = lazy(() => import("@/pages/Verify").then(m => ({ default: m.Verify })));
const Logs = lazy(() => import("@/pages/Logs").then(m => ({ default: m.Logs })));
const Settings = lazy(() => import("@/pages/Settings").then(m => ({ default: m.Settings })));
const KBHealth = lazy(() => import("@/pages/KBHealth").then(m => ({ default: m.KBHealth })));
const ApiConfig = lazy(() => import("@/pages/ApiConfig").then(m => ({ default: m.ApiConfig })));
const Glossary = lazy(() => import("@/pages/Glossary").then(m => ({ default: m.Glossary })));

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  enter: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 }
};

const pageTransition = {
  type: "tween" as const,
  duration: 0.2,
  ease: [0.4, 0, 0.2, 1] as const
};

function App() {
  const activeTab = useAppStore((s) => s.activeTab);
  const theme = useAppStore((s) => s.theme);
  const toasts = useAppStore((s) => s.toasts);
  const dismissToast = useAppStore((s) => s.dismissToast);

  usePollingOrchestrator();

  useEffect(() => {
    // Apply theme class to document
    const applyTheme = () => {
      const isDark =
        theme === "dark" ||
        (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

      document.documentElement.classList.toggle("dark", isDark);
    };

    applyTheme();

    // Listen for system theme changes
    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = () => applyTheme();
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
  }, [theme]);

  const renderPage = () => {
    switch (activeTab) {
      case "dashboard": return <Dashboard />;
      case "alerts": return <AlertCenter />;
      case "services": return <Services />;
      case "jobs": return <Jobs />;
      case "verify": return <Verify />;
      case "logs": return <Logs />;
      case "settings": return <Settings />;
      case "kb-health": return <KBHealth />;
      case "glossary": return <Glossary />;
      case "api-config": return <ApiConfig />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto overflow-x-hidden overscroll-none bg-gradient-to-br from-background via-background to-accent/5">
        <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Loading…</div>}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              variants={pageVariants}
              initial="initial"
              animate="enter"
              exit="exit"
              transition={pageTransition}
            >
              {renderPage()}
            </motion.div>
          </AnimatePresence>
        </Suspense>
      </main>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default App;
