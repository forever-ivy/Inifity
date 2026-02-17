import { invoke } from "@tauri-apps/api/core";

// ============================================================================
// Types matching Rust structs
// ============================================================================

export interface ServiceStatus {
  name: string;
  status: string;
  pid?: number;
  uptime?: string;
  restarts: number;
}

export interface PreflightCheck {
  name: string;
  key: string;
  status: string; // "pass" | "warning" | "blocker"
  message: string;
}

export interface Job {
  job_id: string;
  status: string;
  task_type: string;
  sender: string;
  created_at: string;
  updated_at: string;
}

export interface Milestone {
  job_id: string;
  event_type: string;
  timestamp: string;
  payload?: string;
}

export interface AppConfig {
  work_root: string;
  kb_root: string;
  strict_router: boolean;
  require_new: boolean;
  rag_backend: string;
}

export interface Artifact {
  name: string;
  path: string;
  size: number;
  artifact_type: string; // "docx" | "md" | "json" | "xlsx"
}

export interface QualityReport {
  terminology_hit: number;
  structure_fidelity: number;
  purity_score: number;
}

// ============================================================================
// Service Commands
// ============================================================================

export const getServiceStatus = (): Promise<ServiceStatus[]> =>
  invoke<ServiceStatus[]>("get_service_status");

export const startAllServices = (): Promise<ServiceStatus[]> =>
  invoke<ServiceStatus[]>("start_all_services");

export const stopAllServices = (): Promise<void> =>
  invoke<void>("stop_all_services");

export const restartAllServices = (): Promise<ServiceStatus[]> =>
  invoke<ServiceStatus[]>("restart_all_services");

// ============================================================================
// Preflight Commands
// ============================================================================

export const runPreflightCheck = (): Promise<PreflightCheck[]> =>
  invoke<PreflightCheck[]>("run_preflight_check");

// ============================================================================
// Config Commands
// ============================================================================

export const getConfig = (): Promise<AppConfig> =>
  invoke<AppConfig>("get_config");

export const saveConfig = (config: AppConfig): Promise<void> =>
  invoke<void>("save_config", { config });

export const validateConfig = (config: AppConfig): Promise<{ valid: boolean; errors: string[] }> =>
  invoke<{ valid: boolean; errors: string[] }>("validate_config", { config });

// ============================================================================
// Job Commands
// ============================================================================

export const getJobs = (status?: string, limit?: number): Promise<Job[]> =>
  invoke<Job[]>("get_jobs", { status, limit: limit ?? 50 });

export const getJobMilestones = (jobId: string): Promise<Milestone[]> =>
  invoke<Milestone[]>("get_job_milestones", { jobId });

// ============================================================================
// Artifact Commands
// ============================================================================

export const listVerifyArtifacts = (jobId: string): Promise<Artifact[]> =>
  invoke<Artifact[]>("list_verify_artifacts", { jobId });

export const readArtifact = (path: string): Promise<string> =>
  invoke<string>("read_artifact", { path });

export const getQualityReport = (jobId: string): Promise<QualityReport | null> =>
  invoke<QualityReport | null>("get_quality_report", { jobId });

// ============================================================================
// Log Commands
// ============================================================================

export const readLogFile = (service: string, lines: number): Promise<string[]> =>
  invoke<string[]>("read_log_file", { service, lines });

// ============================================================================
// Utility Commands
// ============================================================================

export const openInFinder = (path: string): Promise<void> =>
  invoke<void>("open_in_finder", { path });

export const getVerifyFolderPath = (): Promise<string> =>
  invoke<string>("get_verify_folder_path");
