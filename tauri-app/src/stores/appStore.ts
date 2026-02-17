import { create } from "zustand";
import * as tauri from "@/lib/tauri";

export type ServiceStatusType = "running" | "stopped" | "degraded" | "unknown";

export interface Service {
  name: string;
  status: ServiceStatusType;
  pid?: number;
  uptime?: string;
  restarts: number;
}

export interface Job {
  jobId: string;
  status: string;
  taskType: string;
  sender: string;
  createdAt: string;
  updatedAt: string;
}

export interface Milestone {
  eventType: string;
  timestamp: string;
  payload?: string;
}

export interface PreflightCheck {
  name: string;
  key: string;
  status: "pass" | "warning" | "blocker";
  message: string;
}

export interface AppConfig {
  workRoot: string;
  kbRoot: string;
  strictRouter: boolean;
  requireNew: boolean;
  ragBackend: string;
}

export interface Artifact {
  name: string;
  path: string;
  size: number;
  artifactType: string;
}

export interface QualityReport {
  terminologyHit: number;
  structureFidelity: number;
  purityScore: number;
}

interface AppState {
  // Services
  services: Service[];
  setServices: (services: Service[]) => void;
  updateService: (name: string, data: Partial<Service>) => void;

  // Jobs
  jobs: Job[];
  setJobs: (jobs: Job[]) => void;
  selectedJobId: string | null;
  setSelectedJobId: (id: string | null) => void;
  selectedJobMilestones: Milestone[];
  selectedJobArtifacts: Artifact[];
  selectedJobQuality: QualityReport | null;

  // Preflight
  preflightChecks: PreflightCheck[];
  setPreflightChecks: (checks: PreflightCheck[]) => void;

  // Config
  config: AppConfig | null;
  setConfig: (config: AppConfig) => void;

  // Logs
  logs: { time: string; level: string; service: string; message: string }[];
  selectedLogService: string;
  setSelectedLogService: (service: string) => void;

  // UI State
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;

  // Async Actions
  fetchServices: () => Promise<void>;
  fetchPreflightChecks: () => Promise<void>;
  fetchConfig: () => Promise<void>;
  fetchJobs: (status?: string) => Promise<void>;
  fetchJobMilestones: (jobId: string) => Promise<void>;
  fetchJobArtifacts: (jobId: string) => Promise<void>;
  startServices: () => Promise<void>;
  stopServices: () => Promise<void>;
  restartServices: () => Promise<void>;
  saveConfig: (config: AppConfig) => Promise<void>;
  fetchLogs: (service: string, lines?: number) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Services
  services: [
    { name: "Telegram Bot", status: "unknown", restarts: 0 },
    { name: "Run Worker", status: "unknown", restarts: 0 },
  ],
  setServices: (services) => set({ services }),
  updateService: (name, data) =>
    set((state) => ({
      services: state.services.map((s) =>
        s.name === name ? { ...s, ...data } : s
      ),
    })),

  // Jobs
  jobs: [],
  setJobs: (jobs) => set({ jobs }),
  selectedJobId: null,
  setSelectedJobId: (id) => set({ selectedJobId: id }),
  selectedJobMilestones: [],
  selectedJobArtifacts: [],
  selectedJobQuality: null,

  // Preflight
  preflightChecks: [],
  setPreflightChecks: (preflightChecks) => set({ preflightChecks }),

  // Config
  config: null,
  setConfig: (config) => set({ config }),

  // Logs
  logs: [],
  selectedLogService: "telegram",
  setSelectedLogService: (service) => set({ selectedLogService: service }),

  // UI State
  isLoading: false,
  setIsLoading: (isLoading) => set({ isLoading }),
  error: null,
  setError: (error) => set({ error }),
  activeTab: "dashboard",
  setActiveTab: (activeTab) => set({ activeTab }),

  // Async Actions
  fetchServices: async () => {
    try {
      const services = await tauri.getServiceStatus();
      set({
        services: services.map((s) => ({
          name: s.name,
          status: s.status as ServiceStatusType,
          pid: s.pid,
          uptime: s.uptime,
          restarts: s.restarts,
        })),
        error: null,
      });
    } catch (err) {
      set({ error: `Failed to fetch services: ${err}` });
    }
  },

  fetchPreflightChecks: async () => {
    try {
      const checks = await tauri.runPreflightCheck();
      set({
        preflightChecks: checks.map((c) => ({
          name: c.name,
          key: c.key,
          status: c.status as "pass" | "warning" | "blocker",
          message: c.message,
        })),
        error: null,
      });
    } catch (err) {
      set({ error: `Failed to run preflight checks: ${err}` });
    }
  },

  fetchConfig: async () => {
    try {
      const config = await tauri.getConfig();
      set({
        config: {
          workRoot: config.work_root,
          kbRoot: config.kb_root,
          strictRouter: config.strict_router,
          requireNew: config.require_new,
          ragBackend: config.rag_backend,
        },
        error: null,
      });
    } catch (err) {
      set({ error: `Failed to fetch config: ${err}` });
    }
  },

  fetchJobs: async (status?: string) => {
    try {
      const jobs = await tauri.getJobs(status);
      set({
        jobs: jobs.map((j) => ({
          jobId: j.job_id,
          status: j.status,
          taskType: j.task_type,
          sender: j.sender,
          createdAt: j.created_at,
          updatedAt: j.updated_at,
        })),
        error: null,
      });
    } catch (err) {
      set({ error: `Failed to fetch jobs: ${err}` });
    }
  },

  fetchJobMilestones: async (jobId: string) => {
    try {
      const milestones = await tauri.getJobMilestones(jobId);
      set({
        selectedJobMilestones: milestones.map((m) => ({
          eventType: m.event_type,
          timestamp: m.timestamp,
          payload: m.payload,
        })),
        error: null,
      });
    } catch (err) {
      set({ error: `Failed to fetch milestones: ${err}` });
    }
  },

  fetchJobArtifacts: async (jobId: string) => {
    try {
      const [artifacts, quality] = await Promise.all([
        tauri.listVerifyArtifacts(jobId),
        tauri.getQualityReport(jobId).catch(() => null),
      ]);
      set({
        selectedJobArtifacts: artifacts.map((a) => ({
          name: a.name,
          path: a.path,
          size: a.size,
          artifactType: a.artifact_type,
        })),
        selectedJobQuality: quality
          ? {
              terminologyHit: quality.terminology_hit,
              structureFidelity: quality.structure_fidelity,
              purityScore: quality.purity_score,
            }
          : null,
        error: null,
      });
    } catch (err) {
      set({ error: `Failed to fetch artifacts: ${err}` });
    }
  },

  startServices: async () => {
    set({ isLoading: true, error: null });
    try {
      await tauri.startAllServices();
      // Wait a moment then refresh
      setTimeout(() => get().fetchServices(), 2000);
    } catch (err) {
      set({ error: `Failed to start services: ${err}` });
    } finally {
      set({ isLoading: false });
    }
  },

  stopServices: async () => {
    set({ isLoading: true, error: null });
    try {
      await tauri.stopAllServices();
      await get().fetchServices();
    } catch (err) {
      set({ error: `Failed to stop services: ${err}` });
    } finally {
      set({ isLoading: false });
    }
  },

  restartServices: async () => {
    set({ isLoading: true, error: null });
    try {
      await tauri.restartAllServices();
      // Wait a moment then refresh
      setTimeout(() => get().fetchServices(), 3000);
    } catch (err) {
      set({ error: `Failed to restart services: ${err}` });
    } finally {
      set({ isLoading: false });
    }
  },

  saveConfig: async (config: AppConfig) => {
    set({ isLoading: true, error: null });
    try {
      await tauri.saveConfig({
        work_root: config.workRoot,
        kb_root: config.kbRoot,
        strict_router: config.strictRouter,
        require_new: config.requireNew,
        rag_backend: config.ragBackend,
      });
      set({ config, error: null });
    } catch (err) {
      set({ error: `Failed to save config: ${err}` });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchLogs: async (service: string, lines = 100) => {
    try {
      const logLines = await tauri.readLogFile(service, lines);
      const logs = logLines.map((line) => {
        // Parse log format: "2026-02-17 10:32:15 [INFO] message"
        const match = line.match(/^(\d{4}-\d{2}-\d{2} )?(\d{2}:\d{2}:\d{2})\s*\[(\w+)\]\s*(.*)$/);
        if (match) {
          return {
            time: match[2],
            level: match[3],
            service,
            message: match[4],
          };
        }
        return { time: "", level: "INFO", service, message: line };
      });
      set({ logs, selectedLogService: service, error: null });
    } catch (err) {
      set({ error: `Failed to fetch logs: ${err}` });
    }
  },
}));
