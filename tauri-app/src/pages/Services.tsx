import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAppStore, type ServiceStatusType } from "@/stores/appStore";
import { useEffect } from "react";
import {
  Play,
  Square,
  RotateCcw,
  FileText,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Circle,
  Settings,
  Terminal,
  RefreshCw,
} from "lucide-react";

const preflightItems = [
  { name: "Python", key: "python" },
  { name: "venv", key: "venv" },
  { name: "requirements", key: "requirements" },
  { name: ".env.v4.local", key: "env" },
  { name: "OpenClaw", key: "openclaw" },
  { name: "LibreOffice", key: "libreoffice", optional: true },
];

const statusIcons: Record<ServiceStatusType, React.ReactNode> = {
  running: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  stopped: <Square className="h-4 w-4 text-gray-400" />,
  degraded: <AlertCircle className="h-4 w-4 text-yellow-500" />,
  unknown: <Circle className="h-4 w-4 text-gray-300" />,
};

export function Services() {
  const {
    services,
    preflightChecks,
    isLoading,
    error,
    fetchServices,
    fetchPreflightChecks,
    startServices,
    stopServices,
    restartServices,
    setActiveTab,
  } = useAppStore();

  useEffect(() => {
    fetchServices();
    fetchPreflightChecks();
  }, [fetchServices, fetchPreflightChecks]);

  const getPreflightStatus = (key: string, optional?: boolean) => {
    const check = preflightChecks.find((c) => c.key === key);
    if (!check && optional) return "warning";
    if (!check) return "blocker";
    return check.status;
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
      <div>
        <h2 className="text-2xl font-bold">Services</h2>
        <p className="text-muted-foreground">Manage system services and pre-flight checks</p>
      </div>

      {/* Pre-flight Check */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            Pre-flight Check
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 mb-4">
            {preflightItems.map((item) => {
              const status = getPreflightStatus(item.key, item.optional);

              return (
                <div key={item.key} className="flex items-center gap-2 p-2 rounded-lg border">
                  {status === "pass" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                  {status === "warning" && <AlertCircle className="h-4 w-4 text-yellow-500" />}
                  {status === "blocker" && <XCircle className="h-4 w-4 text-red-500" />}
                  <span className="text-sm">{item.name}</span>
                  {item.optional && (
                    <Badge variant="outline" className="text-xs">
                      optional
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => fetchPreflightChecks()} disabled={isLoading}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Run Pre-flight Check
            </Button>
            <Button variant="secondary" size="sm" disabled>
              Auto Fix All
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Service Control */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Service Control
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {services.map((service) => (
            <div key={service.name} className="flex items-center justify-between p-4 rounded-lg border">
              <div className="flex items-center gap-4">
                {statusIcons[service.status]}
                <div>
                  <p className="font-medium">{service.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {service.status === "running" ? (
                      <>
                        Running • PID: {service.pid} • Uptime: {service.uptime || "0m"}
                      </>
                    ) : (
                      <span className="capitalize">{service.status}</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">Restarts: {service.restarts}</span>
                <div className="flex gap-2">
                  {service.status === "running" ? (
                    <Button variant="outline" size="sm" onClick={stopServices} disabled={isLoading}>
                      <Square className="h-4 w-4 mr-1" />
                      Stop
                    </Button>
                  ) : (
                    <Button size="sm" onClick={startServices} disabled={isLoading}>
                      <Play className="h-4 w-4 mr-1" />
                      Start
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      useAppStore.getState().setSelectedLogService(
                        service.name === "Telegram Bot" ? "telegram" : "worker"
                      );
                      setActiveTab("logs");
                    }}
                  >
                    <FileText className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Global Controls */}
      <div className="flex items-center gap-4">
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
        <Button variant="secondary" onClick={() => fetchServices()} disabled={isLoading}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Auto-restart Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Auto-restart Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2">
              <input type="checkbox" defaultChecked className="rounded" />
              <span className="text-sm">Enable auto-restart</span>
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Delay:</span>
              <input type="number" defaultValue={5} className="w-16 px-2 py-1 border rounded text-sm" />
              <span className="text-sm text-muted-foreground">seconds</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Max:</span>
              <input type="number" defaultValue={3} className="w-16 px-2 py-1 border rounded text-sm" />
              <span className="text-sm text-muted-foreground">times</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
