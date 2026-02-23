import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAppStore, type AlertRunbook } from "@/stores/appStore";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Clipboard,
  Clock3,
  EyeOff,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Siren,
} from "lucide-react";

type AlertStatusFilter = "all" | "open" | "acknowledged" | "ignored";
type AlertSeverityFilter = "all" | "critical" | "warning" | "info";

const statusFilters: Array<{ id: AlertStatusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "acknowledged", label: "Acknowledged" },
  { id: "ignored", label: "Ignored" },
];

const severityFilters: Array<{ id: AlertSeverityFilter; label: string }> = [
  { id: "all", label: "All Severity" },
  { id: "critical", label: "Critical" },
  { id: "warning", label: "Warning" },
  { id: "info", label: "Info" },
];

function formatTimeAgo(epochMs: number) {
  const deltaMs = Date.now() - epochMs;
  if (!Number.isFinite(deltaMs) || deltaMs < 0) return "just now";
  const deltaMin = Math.floor(deltaMs / 60_000);
  if (deltaMin < 1) return "just now";
  if (deltaMin < 60) return `${deltaMin}m ago`;
  const deltaHour = Math.floor(deltaMin / 60);
  if (deltaHour < 24) return `${deltaHour}h ago`;
  const deltaDay = Math.floor(deltaHour / 24);
  return `${deltaDay}d ago`;
}

function statusBadgeVariant(status: "open" | "acknowledged" | "ignored") {
  if (status === "open") return "outline" as const;
  if (status === "acknowledged") return "secondary" as const;
  return "warning" as const;
}

export function AlertCenter() {
  const overviewAlerts = useAppStore((s) => s.overviewAlerts);
  const overviewMetrics = useAppStore((s) => s.overviewMetrics);
  const queueSnapshot = useAppStore((s) => s.queueSnapshot);
  const refreshAlertCenterData = useAppStore((s) => s.refreshAlertCenterData);
  const ackOverviewAlert = useAppStore((s) => s.ackOverviewAlert);
  const ackOverviewAlerts = useAppStore((s) => s.ackOverviewAlerts);
  const ignoreOverviewAlert = useAppStore((s) => s.ignoreOverviewAlert);
  const ignoreOverviewAlerts = useAppStore((s) => s.ignoreOverviewAlerts);
  const reopenOverviewAlert = useAppStore((s) => s.reopenOverviewAlert);
  const fetchAlertRunbook = useAppStore((s) => s.fetchAlertRunbook);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const isRefreshing = useAppStore((s) => s.isRefreshing);
  const addToast = useAppStore((s) => s.addToast);

  const [statusFilter, setStatusFilter] = useState<AlertStatusFilter>("open");
  const [severityFilter, setSeverityFilter] = useState<AlertSeverityFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [selectedAlertIds, setSelectedAlertIds] = useState<string[]>([]);
  const [runbook, setRunbook] = useState<AlertRunbook | null>(null);
  const [isRunbookLoading, setIsRunbookLoading] = useState(false);

  const alerts = useMemo(() => overviewAlerts.filter((alert) => alert.id !== "system_nominal"), [overviewAlerts]);

  const sourceOptions = useMemo(() => {
    const set = new Set<string>();
    for (const alert of alerts) {
      set.add(alert.source);
    }
    return ["all", ...Array.from(set).sort()];
  }, [alerts]);

  const filteredAlerts = useMemo(() => {
    return alerts.filter((alert) => {
      if (statusFilter !== "all" && alert.status !== statusFilter) return false;
      if (severityFilter !== "all" && alert.severity !== severityFilter) return false;
      if (sourceFilter !== "all" && alert.source !== sourceFilter) return false;
      return true;
    });
  }, [alerts, statusFilter, severityFilter, sourceFilter]);

  useEffect(() => {
    if (filteredAlerts.length === 0) {
      setSelectedAlertId(null);
      return;
    }
    const hasSelected = filteredAlerts.some((alert) => alert.id === selectedAlertId);
    if (!hasSelected) {
      setSelectedAlertId(filteredAlerts[0].id);
    }
  }, [filteredAlerts, selectedAlertId]);

  useEffect(() => {
    const allowed = new Set(filteredAlerts.map((alert) => alert.id));
    setSelectedAlertIds((prev) => prev.filter((id) => allowed.has(id)));
  }, [filteredAlerts]);

  const selectedAlert = filteredAlerts.find((alert) => alert.id === selectedAlertId) ?? null;

  useEffect(() => {
    if (!selectedAlert) {
      setRunbook(null);
      return;
    }

    let cancelled = false;
    setIsRunbookLoading(true);
    fetchAlertRunbook(selectedAlert.source, selectedAlert.severity)
      .then((result) => {
        if (!cancelled) {
          setRunbook(result);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setRunbook(null);
          addToast("error", `Failed to load runbook: ${err}`);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsRunbookLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedAlert, fetchAlertRunbook, addToast]);

  const priorityAlert = useMemo(() => {
    const openCritical = alerts.find((alert) => alert.status === "open" && alert.severity === "critical");
    if (openCritical) return openCritical;
    const openWarning = alerts.find((alert) => alert.status === "open" && alert.severity === "warning");
    if (openWarning) return openWarning;
    const openInfo = alerts.find((alert) => alert.status === "open");
    if (openInfo) return openInfo;
    return alerts[0] ?? null;
  }, [alerts]);

  const openCount = alerts.filter((alert) => alert.status === "open").length;
  const criticalCount = alerts.filter((alert) => alert.status === "open" && alert.severity === "critical").length;
  const ackCount = alerts.filter((alert) => alert.status === "acknowledged").length;
  const ignoredCount = alerts.filter((alert) => alert.status === "ignored").length;

  const allFilteredSelected = filteredAlerts.length > 0 && selectedAlertIds.length === filteredAlerts.length;

  const toggleSelect = (alertId: string) => {
    setSelectedAlertIds((prev) =>
      prev.includes(alertId) ? prev.filter((id) => id !== alertId) : [...prev, alertId]
    );
  };

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      setSelectedAlertIds([]);
    } else {
      setSelectedAlertIds(filteredAlerts.map((alert) => alert.id));
    }
  };

  const copyRunbook = async () => {
    if (!selectedAlert || !runbook) return;
    const text = [
      `Alert: ${selectedAlert.title}`,
      `Severity: ${selectedAlert.severity}`,
      `Status: ${selectedAlert.status}`,
      `Source: ${selectedAlert.source}`,
      "",
      `Runbook: ${runbook.headline}`,
      ...runbook.steps.map((step, index) => `${index + 1}. ${step}`),
    ].join("\n");

    try {
      await navigator.clipboard.writeText(text);
      addToast("success", "Runbook copied");
    } catch {
      addToast("error", "Failed to copy runbook");
    }
  };

  const handleBulkAcknowledge = async () => {
    if (selectedAlertIds.length === 0) return;
    await ackOverviewAlerts(selectedAlertIds);
    setSelectedAlertIds([]);
  };

  const handleBulkIgnore = async () => {
    if (selectedAlertIds.length === 0) return;
    await ignoreOverviewAlerts(selectedAlertIds);
    setSelectedAlertIds([]);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Alert Center</h2>
          <p className="text-muted-foreground">Prioritize incidents, follow runbooks, and track recovery progress.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setActiveTab("dashboard")}>Overview</Button>
          <Button variant="outline" size="sm" onClick={refreshAlertCenterData} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <Card variant="glass">
          <CardContent className="pt-5">
            <div className="text-xs text-muted-foreground">Open Alerts</div>
            <div className="text-2xl font-semibold mt-1">{openCount}</div>
          </CardContent>
        </Card>
        <Card variant="glass">
          <CardContent className="pt-5">
            <div className="text-xs text-muted-foreground">Critical Open</div>
            <div className="text-2xl font-semibold mt-1">{criticalCount}</div>
          </CardContent>
        </Card>
        <Card variant="glass">
          <CardContent className="pt-5">
            <div className="text-xs text-muted-foreground">Acknowledged</div>
            <div className="text-2xl font-semibold mt-1">{ackCount}</div>
          </CardContent>
        </Card>
        <Card variant="glass">
          <CardContent className="pt-5">
            <div className="text-xs text-muted-foreground">Ignored</div>
            <div className="text-2xl font-semibold mt-1">{ignoredCount}</div>
          </CardContent>
        </Card>
        <Card variant="glass">
          <CardContent className="pt-5">
            <div className="text-xs text-muted-foreground">Backlog</div>
            <div className="text-2xl font-semibold mt-1">{overviewMetrics?.backlogJobs ?? queueSnapshot?.total ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      {priorityAlert ? (
        <Card variant="glass" className="border-yellow-500/30">
          <CardContent className="pt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 text-yellow-400 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Next recommended focus</p>
                <p className="text-sm text-muted-foreground mt-1">{priorityAlert.title}</p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setSelectedAlertId(priorityAlert.id)}>
              Open Runbook
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card variant="glass">
          <CardContent className="pt-5 flex items-center gap-2 text-sm text-muted-foreground">
            <Check className="h-4 w-4 text-green-400" />
            No active alerts right now.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card variant="glass">
          <CardHeader className="space-y-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Siren className="h-4 w-4" />
              Alert Queue
            </CardTitle>

            <div className="flex flex-wrap gap-2">
              {statusFilters.map((filter) => (
                <Button
                  key={filter.id}
                  variant={statusFilter === filter.id ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setStatusFilter(filter.id)}
                >
                  {filter.label}
                </Button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {severityFilters.map((filter) => (
                <Button
                  key={filter.id}
                  variant={severityFilter === filter.id ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setSeverityFilter(filter.id)}
                >
                  {filter.label}
                </Button>
              ))}
            </div>

            <select
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              value={sourceFilter}
              onChange={(event) => setSourceFilter(event.target.value)}
            >
              {sourceOptions.map((source) => (
                <option key={source} value={source}>
                  {source === "all" ? "All Sources" : source.toUpperCase()}
                </option>
              ))}
            </select>
          </CardHeader>

          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button variant="ghost" size="sm" onClick={toggleSelectAllFiltered}>
                {allFilteredSelected ? "Clear Filtered" : "Select Filtered"}
              </Button>
              {selectedAlertIds.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={handleBulkAcknowledge}>
                    <Check className="h-4 w-4 mr-2" />
                    Acknowledge ({selectedAlertIds.length})
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleBulkIgnore}>
                    <EyeOff className="h-4 w-4 mr-2" />
                    Ignore ({selectedAlertIds.length})
                  </Button>
                </div>
              )}
            </div>

            {filteredAlerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No alerts matched the current filters.</p>
            ) : (
              filteredAlerts.map((alert) => {
                const isSelected = alert.id === selectedAlertId;
                const isChecked = selectedAlertIds.includes(alert.id);
                return (
                  <div
                    key={alert.id}
                    className={`rounded-xl border p-3 space-y-2 transition-colors ${
                      isSelected ? "border-primary/60 bg-primary/5" : "border-border/50 bg-background/40 hover:bg-background/60"
                    }`}
                    onClick={() => setSelectedAlertId(alert.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedAlertId(alert.id);
                      }
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 rounded border-border"
                          checked={isChecked}
                          onChange={(event) => {
                            event.stopPropagation();
                            toggleSelect(alert.id);
                          }}
                        />
                        <div>
                          <p className="text-sm font-medium">{alert.title}</p>
                          <p className="text-xs text-muted-foreground mt-1">{alert.message}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={alert.severity === "critical" ? "destructive" : alert.severity === "warning" ? "warning" : "secondary"}
                          className="capitalize"
                        >
                          {alert.severity}
                        </Badge>
                        <Badge variant={statusBadgeVariant(alert.status)} className="capitalize">
                          {alert.status}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground uppercase">
                        <span>{alert.source}</span>
                        <span className="flex items-center gap-1 normal-case">
                          <Clock3 className="h-3 w-3" />
                          {formatTimeAgo(alert.createdAt)}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        {alert.status === "open" ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(event) => {
                                event.stopPropagation();
                                void ackOverviewAlert(alert.id);
                              }}
                            >
                              Acknowledge
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(event) => {
                                event.stopPropagation();
                                void ignoreOverviewAlert(alert.id);
                              }}
                            >
                              Ignore
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              void reopenOverviewAlert(alert.id);
                            }}
                          >
                            <RotateCcw className="h-4 w-4 mr-2" />
                            Reopen
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card variant="glass">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Guided Runbook
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={copyRunbook} disabled={!selectedAlert || !runbook}>
              <Clipboard className="h-4 w-4 mr-2" />
              Copy
            </Button>
          </CardHeader>

          <CardContent>
            {!selectedAlert ? (
              <p className="text-sm text-muted-foreground">Select an alert to see recommended actions.</p>
            ) : isRunbookLoading ? (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading runbook...
              </div>
            ) : !runbook ? (
              <p className="text-sm text-muted-foreground">No runbook available for this alert.</p>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border border-border/50 bg-background/40 p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{selectedAlert.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">{selectedAlert.message}</p>
                    </div>
                    <Badge
                      variant={selectedAlert.severity === "critical" ? "destructive" : selectedAlert.severity === "warning" ? "warning" : "secondary"}
                      className="capitalize"
                    >
                      {selectedAlert.severity}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Source: <span className="uppercase">{selectedAlert.source}</span>
                    {typeof selectedAlert.metricValue === "number" ? ` | Metric: ${selectedAlert.metricValue}` : ""}
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium">{runbook.headline}</p>
                  <ol className="mt-2 space-y-2 text-sm text-muted-foreground list-decimal pl-5">
                    {runbook.steps.map((step, index) => (
                      <li key={`${selectedAlert.id}-step-${index}`}>{step}</li>
                    ))}
                  </ol>
                </div>

                <div className="flex flex-wrap gap-2">
                  {runbook.actions.map((action) => (
                    <Button key={`${selectedAlert.id}-${action.tab}-${action.label}`} variant="outline" size="sm" onClick={() => setActiveTab(action.tab)}>
                      {action.label}
                    </Button>
                  ))}
                </div>

                {selectedAlert.status === "open" ? (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" onClick={() => ackOverviewAlert(selectedAlert.id)}>
                      <Check className="h-4 w-4 mr-2" />
                      Mark as Acknowledged
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => ignoreOverviewAlert(selectedAlert.id)}>
                      <EyeOff className="h-4 w-4 mr-2" />
                      Ignore Alert
                    </Button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => reopenOverviewAlert(selectedAlert.id)}>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reopen Alert
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
