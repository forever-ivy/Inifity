import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAppStore, type ServiceStatusType } from "@/stores/appStore";
import * as tauri from "@/lib/tauri";
import { useEffect } from "react";
import {
  Play,
  Square,
  RotateCcw,
  RefreshCw,
  FolderOpen,
  FileText,
  CheckCircle2,
  AlertCircle,
  Circle,
} from "lucide-react";

const statusColors: Record<ServiceStatusType, string> = {
  running: "bg-green-500",
  stopped: "bg-gray-400",
  degraded: "bg-yellow-500",
  unknown: "bg-gray-300",
};

const statusIcons: Record<ServiceStatusType, React.ReactNode> = {
  running: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  stopped: <Square className="h-4 w-4 text-gray-400" />,
  degraded: <AlertCircle className="h-4 w-4 text-yellow-500" />,
  unknown: <Circle className="h-4 w-4 text-gray-300" />,
};

export function Dashboard() {
  const { services, jobs, isLoading, error, fetchServices, fetchJobs, startServices, stopServices, restartServices } =
    useAppStore();

  useEffect(() => {
    fetchServices();
    fetchJobs();
    const interval = setInterval(fetchServices, 10000); // Poll every 10s
    return () => clearInterval(interval);
  }, [fetchServices, fetchJobs]);

  const allRunning = services.every((s) => s.status === "running");
  const anyRunning = services.some((s) => s.status === "running");

  const handleOpenVerifyFolder = async () => {
    try {
      const path = await tauri.getVerifyFolderPath();
      await tauri.openInFinder(path);
    } catch (err) {
      console.error("Failed to open verify folder:", err);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Error Banner */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-lg flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Dashboard</h2>
          <p className="text-muted-foreground">System overview and quick actions</p>
        </div>
        <div className="flex items-center gap-2">
          {allRunning ? (
            <Badge variant="success" className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              All Running
            </Badge>
          ) : anyRunning ? (
            <Badge variant="warning" className="flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Partial
            </Badge>
          ) : (
            <Badge variant="secondary" className="flex items-center gap-1">
              <Square className="h-3 w-3" />
              Stopped
            </Badge>
          )}
        </div>
      </div>

      {/* Service Status Cards */}
      <div className="grid grid-cols-3 gap-4">
        {services.map((service) => (
          <Card key={service.name}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                {service.name}
                {statusIcons[service.status]}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className={`h-2 w-2 rounded-full ${statusColors[service.status]}`} />
                {service.status === "running" ? (
                  <span>
                    Running • PID: {service.pid} • Uptime: {service.uptime || "0m"}
                  </span>
                ) : (
                  <span className="capitalize">{service.status}</span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button onClick={startServices} disabled={isLoading}>
            <Play className="h-4 w-4 mr-2" />
            Start All
          </Button>
          <Button variant="outline" onClick={stopServices} disabled={isLoading}>
            <Square className="h-4 w-4 mr-2" />
            Stop All
          </Button>
          <Button variant="outline" onClick={restartServices} disabled={isLoading}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Restart All
          </Button>
          <Button variant="secondary" onClick={() => fetchServices()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </CardContent>
      </Card>

      {/* Recent Jobs */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Recent Jobs</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => useAppStore.getState().setActiveTab("jobs")}>
            View All →
          </Button>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No recent jobs</p>
            </div>
          ) : (
            <div className="space-y-2">
              {jobs.slice(0, 5).map((job) => (
                <div
                  key={job.jobId}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 cursor-pointer"
                  onClick={() => {
                    useAppStore.getState().setSelectedJobId(job.jobId);
                    useAppStore.getState().setActiveTab("jobs");
                  }}
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{job.jobId}</p>
                      <p className="text-xs text-muted-foreground">{job.taskType}</p>
                    </div>
                  </div>
                  <Badge variant={job.status === "review_ready" ? "success" : "secondary"}>{job.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Utility Buttons */}
      <div className="flex gap-2">
        <Button variant="outline" onClick={handleOpenVerifyFolder}>
          <FolderOpen className="h-4 w-4 mr-2" />
          Open Verify Folder
        </Button>
        <Button variant="outline" disabled>
          <FileText className="h-4 w-4 mr-2" />
          Export Diagnostics
        </Button>
      </div>
    </div>
  );
}
