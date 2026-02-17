import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/appStore";
import { useEffect, useState, useRef } from "react";
import { Search, Download, AlertTriangle, AlertCircle, RefreshCw, FileText } from "lucide-react";

const levelColors: Record<string, string> = {
  INFO: "text-blue-500",
  WARN: "text-yellow-500",
  ERROR: "text-red-500",
  DEBUG: "text-gray-400",
};

export function Logs() {
  const { logs, selectedLogService, fetchLogs, isLoading, error } = useAppStore();
  const [filter, setFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchLogs(selectedLogService, 200);
  }, [fetchLogs, selectedLogService]);

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // Auto-refresh logs every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchLogs(selectedLogService, 200);
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchLogs, selectedLogService]);

  const filteredLogs = logs.filter((log) => {
    if (levelFilter && log.level !== levelFilter) return false;
    if (filter && !log.message.toLowerCase().includes(filter.toLowerCase())) return false;
    return true;
  });

  const errorCount = logs.filter((l) => l.level === "ERROR").length;
  const warnCount = logs.filter((l) => l.level === "WARN").length;

  const handleExport = () => {
    const content = logs.map((l) => `${l.time} [${l.level}] [${l.service}] ${l.message}`).join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedLogService}-logs-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
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
          <h2 className="text-2xl font-bold">Logs</h2>
          <p className="text-muted-foreground">Real-time system logs and diagnostics</p>
        </div>
        <div className="flex gap-2">
          <select
            className="px-3 py-1.5 border rounded-lg text-sm"
            value={selectedLogService}
            onChange={(e) => useAppStore.getState().setSelectedLogService(e.target.value)}
          >
            <option value="telegram">Telegram Bot</option>
            <option value="worker">Run Worker</option>
          </select>
          <Button variant="outline" onClick={handleExport} disabled={logs.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Error Summary */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <div>
              <p className="text-2xl font-bold">{errorCount}</p>
              <p className="text-sm text-muted-foreground">Errors (current view)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <AlertTriangle className="h-8 w-8 text-yellow-500" />
            <div>
              <p className="text-2xl font-bold">{warnCount}</p>
              <p className="text-sm text-muted-foreground">Warnings (current view)</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex items-center gap-4 p-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search logs..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm"
            />
          </div>
          <div className="flex gap-1">
            {["INFO", "WARN", "ERROR"].map((level) => (
              <Button
                key={level}
                variant={levelFilter === level ? "default" : "outline"}
                size="sm"
                onClick={() => setLevelFilter(levelFilter === level ? null : level)}
              >
                {level}
              </Button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => fetchLogs(selectedLogService, 200)}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} />
            Auto-scroll
          </label>
        </CardContent>
      </Card>

      {/* Log Stream */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Log Stream
            <span className="text-xs text-muted-foreground font-normal">
              {filteredLogs.length} entries
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No logs available</p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Logs will appear here when the service is running
              </p>
            </div>
          ) : (
            <div
              ref={logContainerRef}
              className="font-mono text-xs space-y-1 max-h-96 overflow-auto bg-muted/30 rounded-lg p-4"
            >
              {filteredLogs.map((log, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-muted-foreground whitespace-nowrap">{log.time}</span>
                  <span className={`font-medium whitespace-nowrap ${levelColors[log.level] || "text-gray-400"}`}>
                    [{log.level}]
                  </span>
                  <span className="text-blue-500 whitespace-nowrap">[{log.service}]</span>
                  <span className="text-foreground">{log.message}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Troubleshooting Guide */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Common Issues
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
            <p className="font-medium text-sm">RAG backend not available</p>
            <p className="text-xs text-muted-foreground">Check if ClawRAG is running: openclaw health --json</p>
          </div>
          <div className="p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
            <p className="font-medium text-sm">Gemini API rate limit</p>
            <p className="text-xs text-muted-foreground">System will auto-retry with fallback model</p>
          </div>
          <div className="p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
            <p className="font-medium text-sm">Telegram connection lost</p>
            <p className="text-xs text-muted-foreground">Check TELEGRAM_BOT_TOKEN in .env.v4.local</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
