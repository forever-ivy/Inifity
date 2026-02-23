import { useEffect } from "react";
import { useAppStore } from "@/stores/appStore";

const DASHBOARD_STATUS_INTERVAL_MS = 10_000;
const DASHBOARD_JOBS_INTERVAL_MS = 30_000;
const JOBS_INTERVAL_MS = 8_000;
const JOB_MILESTONES_INTERVAL_MS = 2_000;
const LOGS_INTERVAL_MS = 5_000;
const VERIFY_INTERVAL_MS = 15_000;
const API_USAGE_INTERVAL_MS = 60_000;
const API_AVAILABILITY_INTERVAL_MS = 30_000;

function isVisible() {
  return document.visibilityState === "visible";
}

export function usePollingOrchestrator() {
  const activeTab = useAppStore((s) => s.activeTab);
  const refreshDashboardData = useAppStore((s) => s.refreshDashboardData);
  const refreshJobsData = useAppStore((s) => s.refreshJobsData);
  const refreshSelectedJobMilestones = useAppStore((s) => s.refreshSelectedJobMilestones);
  const refreshLogsData = useAppStore((s) => s.refreshLogsData);
  const refreshVerifyData = useAppStore((s) => s.refreshVerifyData);
  const refreshApiConfigData = useAppStore((s) => s.refreshApiConfigData);
  const refreshApiConfigUsage = useAppStore((s) => s.refreshApiConfigUsage);
  const refreshApiConfigAvailability = useAppStore((s) => s.refreshApiConfigAvailability);

  useEffect(() => {
    if (activeTab !== "dashboard") return;
    void refreshDashboardData({ silent: true, includeJobs: true });
    const statusId = window.setInterval(() => {
      if (!isVisible()) return;
      void refreshDashboardData({ silent: true, includeJobs: false });
    }, DASHBOARD_STATUS_INTERVAL_MS);
    const jobsId = window.setInterval(() => {
      if (!isVisible()) return;
      void refreshDashboardData({ silent: true, includeJobs: true });
    }, DASHBOARD_JOBS_INTERVAL_MS);
    return () => {
      window.clearInterval(statusId);
      window.clearInterval(jobsId);
    };
  }, [activeTab, refreshDashboardData]);

  useEffect(() => {
    if (activeTab !== "jobs") return;
    void refreshJobsData({ silent: true });
    void refreshSelectedJobMilestones({ silent: true });
    const jobsId = window.setInterval(() => {
      if (!isVisible()) return;
      void refreshJobsData({ silent: true });
    }, JOBS_INTERVAL_MS);
    const milestonesId = window.setInterval(() => {
      if (!isVisible()) return;
      void refreshSelectedJobMilestones({ silent: true });
    }, JOB_MILESTONES_INTERVAL_MS);
    return () => {
      window.clearInterval(jobsId);
      window.clearInterval(milestonesId);
    };
  }, [activeTab, refreshJobsData, refreshSelectedJobMilestones]);

  useEffect(() => {
    if (activeTab !== "logs") return;
    void refreshLogsData({ silent: true, lines: 200 });
    const id = window.setInterval(() => {
      if (!isVisible()) return;
      void refreshLogsData({ silent: true, lines: 200 });
    }, LOGS_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [activeTab, refreshLogsData]);

  useEffect(() => {
    if (activeTab !== "verify") return;
    void refreshVerifyData({ silent: true });
    const id = window.setInterval(() => {
      if (!isVisible()) return;
      void refreshVerifyData({ silent: true });
    }, VERIFY_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [activeTab, refreshVerifyData]);

  useEffect(() => {
    if (activeTab !== "api-config") return;
    void refreshApiConfigData();
    const usageId = window.setInterval(() => {
      if (!isVisible()) return;
      void refreshApiConfigUsage();
    }, API_USAGE_INTERVAL_MS);
    const availabilityId = window.setInterval(() => {
      if (!isVisible()) return;
      void refreshApiConfigAvailability();
    }, API_AVAILABILITY_INTERVAL_MS);
    return () => {
      window.clearInterval(usageId);
      window.clearInterval(availabilityId);
    };
  }, [
    activeTab,
    refreshApiConfigData,
    refreshApiConfigUsage,
    refreshApiConfigAvailability,
  ]);

  useEffect(() => {
    const handleVisible = () => {
      if (!isVisible()) return;
      if (activeTab === "dashboard") {
        void refreshDashboardData({ silent: true, includeJobs: true });
      } else if (activeTab === "jobs") {
        void refreshJobsData({ silent: true });
        void refreshSelectedJobMilestones({ silent: true });
      } else if (activeTab === "logs") {
        void refreshLogsData({ silent: true, lines: 200 });
      } else if (activeTab === "verify") {
        void refreshVerifyData({ silent: true });
      } else if (activeTab === "api-config") {
        void refreshApiConfigData();
      }
    };
    document.addEventListener("visibilitychange", handleVisible);
    return () => document.removeEventListener("visibilitychange", handleVisible);
  }, [
    activeTab,
    refreshApiConfigData,
    refreshDashboardData,
    refreshJobsData,
    refreshLogsData,
    refreshSelectedJobMilestones,
    refreshVerifyData,
  ]);
}
