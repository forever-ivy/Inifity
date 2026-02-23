import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAppStore, ApiProvider, ApiUsage, ModelAvailabilityReport, UsageSample } from "@/stores/appStore";
import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Key,
  RefreshCw,
  Eye,
  EyeOff,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Zap,
  Activity,
  ShieldAlert,
  TrendingDown,
  Copy,
} from "lucide-react";

type ProviderRiskLevel = "healthy" | "warning" | "critical";

type ProviderRisk = {
  level: ProviderRiskLevel;
  reasons: string[];
};

function normalizeEpochMs(ts: number | undefined): number | undefined {
  if (!ts || !Number.isFinite(ts) || ts <= 0) return undefined;
  return ts < 1_000_000_000_000 ? ts * 1000 : ts;
}

function formatRelativeTime(epochMs: number | undefined): string {
  const ms = normalizeEpochMs(epochMs);
  if (!ms) return "";
  const diff = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatAbsoluteTime(epochMs: number | undefined): string {
  const ms = normalizeEpochMs(epochMs);
  if (!ms) return "";
  return new Date(ms).toLocaleString();
}

function formatEta(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "depleted";
  if (hours > 24 * 30) return ">30d";
  if (hours >= 24) return `${Math.round(hours / 24)}d`;
  if (hours >= 1) return `${Math.round(hours)}h`;
  return `${Math.max(1, Math.round(hours * 60))}m`;
}

function useNowTicker(intervalMs = 30000) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((v) => v + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
}

function LivePulse() {
  return (
    <span className="relative flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
    </span>
  );
}

const stateColor: Record<string, string> = {
  ok: "bg-green-500",
  cooldown: "bg-yellow-500",
  unavailable: "bg-red-500",
  expired: "bg-yellow-500",
  unknown: "bg-gray-400",
};

const stateRing: Record<string, string> = {
  ok: "ring-green-500/40",
  cooldown: "ring-yellow-500/40",
  unavailable: "ring-red-500/40",
  expired: "ring-yellow-500/40",
  unknown: "ring-gray-400/40",
};

function getStatusBadge(status: ApiProvider["status"]) {
  switch (status) {
    case "configured":
      return <Badge variant="success">Configured</Badge>;
    case "missing":
      return <Badge variant="secondary">Not Configured</Badge>;
    case "expired":
      return <Badge variant="warning">Expired</Badge>;
    default:
      return <Badge variant="outline">Unknown</Badge>;
  }
}

function getAuthTypeLabel(authType: ApiProvider["authType"]) {
  switch (authType) {
    case "oauth":
      return "OAuth";
    case "api_key":
      return "API Key";
    case "none":
      return "None";
    default:
      return authType;
  }
}

function getOAuthLoginCommand(providerId: string) {
  return `openclaw models auth login --provider ${providerId}`;
}

function getProviderRouteStates(
  providerId: string,
  report: ModelAvailabilityReport | null
): string[] {
  if (!report) return [];
  const states: string[] = [];
  for (const agent of Object.values(report.agents || {})) {
    for (const route of agent.route || []) {
      const routeProvider = (route.provider || "").toLowerCase();
      const pid = providerId.toLowerCase();
      const matched = routeProvider === pid || routeProvider.includes(pid) || pid.includes(routeProvider);
      if (matched) {
        states.push(route.state || "unknown");
      }
    }
  }
  return states;
}

function evaluateProviderRisk(
  provider: ApiProvider,
  usage: ApiUsage | undefined,
  report: ModelAvailabilityReport | null
): ProviderRisk {
  const reasons: string[] = [];

  if (provider.status === "missing") {
    reasons.push("credential missing");
  }
  if (provider.status === "expired") {
    reasons.push("credential expired");
  }

  const routeStates = getProviderRouteStates(provider.id, report);
  if (routeStates.length > 0) {
    const hasUnavailable = routeStates.some((s) => s === "unavailable");
    const hasExpired = routeStates.some((s) => s === "expired");
    const hasCooldown = routeStates.some((s) => s === "cooldown");
    const hasOk = routeStates.some((s) => s === "ok");

    if (hasUnavailable || hasExpired) {
      reasons.push(hasOk ? "partial route unavailable" : "route unavailable");
    } else if (hasCooldown) {
      reasons.push("in cooldown");
    }
  }

  // Check real API quota (source: real_api)
  if (usage && usage.source === "real_api" && usage.limit > 0) {
    const remainingPct = (usage.remaining / usage.limit) * 100;
    if (remainingPct < 10) {
      reasons.push("quota critically low");
    } else if (remainingPct < 25) {
      reasons.push("quota low");
    }
  }

  // Check estimated activity for error patterns (source: estimated_activity)
  if (usage && usage.source === "estimated_activity") {
    const successRate = usage.activitySuccessRate;
    const errors = usage.activityErrors24h || 0;

    if (successRate !== undefined && successRate < 0.5) {
      reasons.push("high error rate (estimated)");
    } else if (successRate !== undefined && successRate < 0.8) {
      reasons.push("elevated error rate (estimated)");
    }

    if (errors > 10) {
      reasons.push(`many recent errors (${errors} in 24h)`);
    }
  }

  // Check unsupported providers that have credentials but no visibility
  if (usage && usage.source === "unsupported" && provider.hasKey) {
    reasons.push("usage visibility limited");
  }

  let level: ProviderRiskLevel = "healthy";
  if (
    reasons.some((r) =>
      r.includes("missing") ||
      r.includes("expired") ||
      r.includes("unavailable") ||
      r.includes("critically") ||
      r.includes("high error rate")
    )
  ) {
    level = "critical";
  } else if (reasons.length > 0) {
    level = "warning";
  }

  return { level, reasons };
}

function RiskBadge({ risk }: { risk: ProviderRiskLevel }) {
  if (risk === "critical") return <Badge variant="destructive">Critical</Badge>;
  if (risk === "warning") return <Badge variant="warning">Warning</Badge>;
  return <Badge variant="success">Healthy</Badge>;
}

function TrendSparkline({ samples }: { samples: UsageSample[] }) {
  if (samples.length < 2) {
    return <p className="text-[11px] text-muted-foreground">Need more samples for trend (auto-builds over refreshes).</p>;
  }

  const width = 180;
  const height = 44;
  const values = samples.map((s) => s.remaining);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);

  const points = values
    .map((v, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-11">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-primary/80"
        points={points}
      />
    </svg>
  );
}

function ConfidenceBadge({ confidence }: { confidence: "high" | "medium" | "low" }) {
  const colors = {
    high: "bg-green-500/15 text-green-600 dark:text-green-400",
    medium: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
    low: "bg-gray-500/15 text-gray-600 dark:text-gray-400",
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${colors[confidence]}`}>
      {confidence === "high" ? "High confidence" : confidence === "medium" ? "Medium confidence" : "Low confidence"}
    </span>
  );
}

function UsagePanel({ usage, history }: { usage: ApiUsage | undefined; history: UsageSample[] }) {
  // No usage data at all
  if (!usage) {
    return (
      <div className="text-xs text-muted-foreground space-y-2">
        <p>Usage data unavailable</p>
        <p className="text-[10px]">Configure API key to see usage information.</p>
      </div>
    );
  }

  const source = usage.source || "unsupported";
  const confidence = usage.confidence || "low";

  // REAL API: Show traditional usage bar with quota info
  if (source === "real_api" && usage.limit > 0) {
    const remainingPct = usage.limit > 0 ? (usage.remaining / usage.limit) * 100 : 0;
    const usedPct = 100 - remainingPct;

    let barColor = "bg-green-500";
    if (remainingPct < 20) {
      barColor = "bg-red-500";
    } else if (remainingPct < 50) {
      barColor = "bg-yellow-500";
    }

    let deltaUsed24h: number | null = null;
    let etaText = "insufficient data";

    if (history.length >= 2) {
      const first = history[0];
      const last = history[history.length - 1];
      deltaUsed24h = last.used - first.used;
      const deltaHours = Math.max(0, (last.ts - first.ts) / 3_600_000);
      const burnPerHour = deltaHours > 0 ? deltaUsed24h / deltaHours : 0;

      if (burnPerHour > 0 && usage.remaining > 0) {
        etaText = formatEta(usage.remaining / burnPerHour);
      } else if (burnPerHour <= 0) {
        etaText = "stable";
      }
    }

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Badge variant="success" className="text-[10px]">Live API</Badge>
          <ConfidenceBadge confidence={confidence} />
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            {usage.used.toLocaleString()} / {usage.limit.toLocaleString()} {usage.unit}
          </span>
          <span className="font-medium">
            {usage.remaining.toLocaleString()} remaining
          </span>
        </div>

        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <motion.div
            className={`h-full ${barColor}`}
            initial={{ width: 0 }}
            animate={{ width: `${usedPct}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>

        <TrendSparkline samples={history} />

        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            24h used: {deltaUsed24h === null ? "--" : `${deltaUsed24h > 0 ? "+" : ""}${deltaUsed24h.toLocaleString()} ${usage.unit}`}
          </span>
          <span className="flex items-center gap-1">
            <TrendingDown className="h-3.5 w-3.5" />
            ETA: {etaText}
          </span>
        </div>

        {usage.fetchedAt > 0 && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            Updated: {formatRelativeTime(usage.fetchedAt)} ({formatAbsoluteTime(usage.fetchedAt)})
          </div>
        )}
      </div>
    );
  }

  // ESTIMATED ACTIVITY: Show activity metrics from logs
  if (source === "estimated_activity") {
    const calls = usage.activityCalls24h || 0;
    const errors = usage.activityErrors24h || 0;
    const successRate = usage.activitySuccessRate;
    const lastSeen = usage.activityLastSeenAt;

    // Determine health based on success rate
    let healthColor = "text-green-500";
    let healthBg = "bg-green-500/10";
    if (successRate !== undefined && successRate < 0.8) {
      healthColor = "text-red-500";
      healthBg = "bg-red-500/10";
    } else if (successRate !== undefined && successRate < 0.95) {
      healthColor = "text-yellow-500";
      healthBg = "bg-yellow-500/10";
    }

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-[10px]">Estimated Activity</Badge>
          <ConfidenceBadge confidence={confidence} />
        </div>

        {usage.reason && (
          <p className="text-[10px] text-muted-foreground">{usage.reason}</p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className={`rounded-lg p-2.5 ${healthBg}`}>
            <div className="text-[10px] text-muted-foreground">Calls (24h)</div>
            <div className={`text-lg font-semibold ${healthColor}`}>{calls}</div>
          </div>
          <div className={`rounded-lg p-2.5 ${errors > 0 ? "bg-red-500/10" : "bg-muted/50"}`}>
            <div className="text-[10px] text-muted-foreground">Errors (24h)</div>
            <div className={`text-lg font-semibold ${errors > 0 ? "text-red-500" : ""}`}>{errors}</div>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Success rate</span>
          <span className={`font-medium ${healthColor}`}>
            {successRate !== undefined ? `${(successRate * 100).toFixed(1)}%` : "N/A"}
          </span>
        </div>

        {successRate !== undefined && (
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <motion.div
              className={`h-full ${healthColor.replace("text-", "bg-")}`}
              initial={{ width: 0 }}
              animate={{ width: `${successRate * 100}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>
        )}

        {lastSeen && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Activity className="h-3 w-3" />
            Last seen: {formatRelativeTime(lastSeen)} ({formatAbsoluteTime(lastSeen)})
          </div>
        )}

        {usage.fetchedAt > 0 && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            Updated: {formatRelativeTime(usage.fetchedAt)}
          </div>
        )}
      </div>
    );
  }

  // UNSUPPORTED: Show reason and guidance
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-[10px]">No Usage API</Badge>
        <ConfidenceBadge confidence={confidence} />
      </div>

      {usage.reason && (
        <p className="text-xs text-muted-foreground">{usage.reason}</p>
      )}

      <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
        <p className="text-xs font-medium">What you can do:</p>
        <ul className="text-[11px] text-muted-foreground space-y-1 list-disc pl-4">
          <li>Check <strong>Logs</strong> tab for raw provider activity</li>
          <li>Visit provider dashboard for quota information</li>
          <li>Set up alerts for usage monitoring</li>
        </ul>
      </div>

      {usage.fetchedAt > 0 && (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          Checked: {formatRelativeTime(usage.fetchedAt)}
        </div>
      )}
    </div>
  );
}

function ApiKeyInput({
  provider,
  onSave,
  onDelete,
  hasKey,
}: {
  provider: ApiProvider;
  onSave: (key: string) => void;
  onDelete: () => void;
  hasKey: boolean;
}) {
  const [key, setKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [isEditing, setIsEditing] = useState(!hasKey);

  const handleSave = () => {
    if (key.trim()) {
      onSave(key.trim());
      setKey("");
      setIsEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setKey("");
      setIsEditing(false);
    }
  };

  if (!isEditing && hasKey) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 text-green-600 dark:text-green-400 rounded-lg text-sm">
          <CheckCircle2 className="h-4 w-4" />
          <span>API Key configured</span>
        </div>
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
            Update
          </Button>
        </motion.div>
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Button
            variant="outline"
            size="sm"
            onClick={onDelete}
            className="text-red-500 hover:text-red-600"
            aria-label={`Delete ${provider.name} API key`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={showKey ? "text" : "password"}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Enter ${provider.name} API key`}
            className="w-full px-3 py-2 pr-10 border rounded-lg text-sm bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-transparent"
            autoFocus
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label={showKey ? "Hide API key" : "Show API key"}
          >
            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Button onClick={handleSave} disabled={!key.trim()}>
            Save
          </Button>
        </motion.div>
        {hasKey && (
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button variant="outline" onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
          </motion.div>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">Save triggers immediate runtime availability refresh.</p>
    </div>
  );
}

function OAuthStatus({
  provider,
  onCopyCommand,
}: {
  provider: ApiProvider;
  onCopyCommand: () => void;
}) {
  const expiresText = provider.expiresAt
    ? formatAbsoluteTime(provider.expiresAt)
    : null;

  const oauthCommand = getOAuthLoginCommand(provider.id);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        {provider.status === "configured" ? (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 text-green-600 dark:text-green-400 rounded-lg text-sm">
            <CheckCircle2 className="h-4 w-4" />
            <span>Connected</span>
          </div>
        ) : provider.status === "expired" ? (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 rounded-lg text-sm">
            <AlertCircle className="h-4 w-4" />
            <span>Token expired</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-muted text-muted-foreground rounded-lg text-sm">
            <Key className="h-4 w-4" />
            <span>Not connected</span>
          </div>
        )}
      </div>
      {provider.email && (
        <p className="text-sm text-muted-foreground">Account: {provider.email}</p>
      )}
      {expiresText && (
        <p className="text-xs text-muted-foreground">
          Expires: {expiresText}
        </p>
      )}
      <div className="rounded-lg border bg-background/40 p-2.5">
        <p className="text-[11px] text-muted-foreground">OAuth login command</p>
        <code className="text-[11px] block mt-1 break-all">{oauthCommand}</code>
      </div>
      <Button variant="outline" size="sm" onClick={onCopyCommand}>
        <Copy className="h-4 w-4 mr-2" />
        Copy Login Command
      </Button>
    </div>
  );
}

function AgentAvailabilityCard({
  title,
  agent,
}: {
  title: string;
  agent: ModelAvailabilityReport["agents"][string] | undefined;
}) {
  if (!agent) {
    return (
      <Card variant="glass">
        <CardContent className="flex flex-col items-center justify-center py-8">
          <div className="h-14 w-14 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center mb-3">
            <Zap className="h-5 w-5 text-muted-foreground/40" />
          </div>
          <div className="text-sm font-medium text-muted-foreground">{title}</div>
          <div className="text-xs text-muted-foreground/60 mt-1">No data</div>
        </CardContent>
      </Card>
    );
  }

  const isRunnable = agent.runnable_now;

  return (
    <Card variant="glass">
      <CardContent className="pt-5 pb-4 px-4 space-y-4">
        <div className="flex items-center gap-3">
          <div
            className={`h-10 w-10 rounded-full border-[3px] flex items-center justify-center shrink-0 ${
              isRunnable
                ? "border-green-500 bg-green-500/10"
                : "border-red-500 bg-red-500/10"
            }`}
          >
            <Zap
              className={`h-4 w-4 ${isRunnable ? "text-green-500" : "text-red-500"}`}
            />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{title}</div>
            <div className="text-[10px] text-muted-foreground">
              {isRunnable ? "Runnable" : "Blocked"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-0 overflow-x-auto py-1">
          {agent.route.map((r, i) => {
            const isFirst = r.model === agent.first_runnable_model;
            const dotColor = stateColor[r.state] || stateColor.unknown;
            const ringColor = stateRing[r.state] || stateRing.unknown;
            const shortName = r.model.split("/").pop() || r.model;
            return (
              <div key={r.model} className="flex items-center">
                {i > 0 && (
                  <div className="w-4 h-px bg-muted-foreground/25 shrink-0" />
                )}
                <div className="flex flex-col items-center gap-1 min-w-0" title={`${r.model} (${r.provider}) — ${r.state}${r.note ? `: ${r.note}` : ""}`}>
                  <div
                    className={`h-4 w-4 rounded-full ${dotColor} shrink-0 ${
                      isFirst ? `ring-[3px] ${ringColor}` : ""
                    }`}
                  />
                  <span className="text-[9px] text-muted-foreground truncate max-w-[72px] leading-tight text-center">
                    {shortName}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="text-[10px] text-muted-foreground/70">
          default: <code className="text-[10px] bg-muted px-1 rounded">{agent.default_model.split("/").pop()}</code>
        </div>

        {!isRunnable && agent.blocked_reasons.length > 0 && (
          <div className="rounded-xl border bg-red-500/5 border-red-500/20 p-3">
            <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
              {agent.blocked_reasons.map((reason, idx) => (
                <li key={idx}>{reason}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ApiConfig() {
  const apiProviders = useAppStore((s) => s.apiProviders);
  const apiUsage = useAppStore((s) => s.apiUsage);
  const apiUsageHistory = useAppStore((s) => s.apiUsageHistory);
  const modelAvailabilityReport = useAppStore((s) => s.modelAvailabilityReport);
  const refreshApiConfigData = useAppStore((s) => s.refreshApiConfigData);
  const fetchApiUsage = useAppStore((s) => s.fetchApiUsage);
  const setApiKey = useAppStore((s) => s.setApiKey);
  const deleteApiKey = useAppStore((s) => s.deleteApiKey);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const addToast = useAppStore((s) => s.addToast);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshingProviderIds, setRefreshingProviderIds] = useState<Record<string, boolean>>({});

  useNowTicker();

  const runtimeFetchedAtMs = normalizeEpochMs(modelAvailabilityReport?.fetched_at);

  const riskByProvider = useMemo(() => {
    const out: Record<string, ProviderRisk> = {};
    for (const provider of apiProviders) {
      out[provider.id] = evaluateProviderRisk(provider, apiUsage[provider.id], modelAvailabilityReport);
    }
    return out;
  }, [apiProviders, apiUsage, modelAvailabilityReport]);

  const riskStats = useMemo(() => {
    const providers = Object.values(riskByProvider);
    const critical = providers.filter((r) => r.level === "critical").length;
    const warning = providers.filter((r) => r.level === "warning").length;
    const healthy = providers.filter((r) => r.level === "healthy").length;
    return { critical, warning, healthy, total: providers.length };
  }, [riskByProvider]);

  const blockedAgents = useMemo(
    () => Object.values(modelAvailabilityReport?.agents || {}).filter((agent) => !agent.runnable_now),
    [modelAvailabilityReport]
  );

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    await refreshApiConfigData();
    setIsRefreshing(false);
  };

  const handleRefreshProvider = async (providerId: string) => {
    setRefreshingProviderIds((state) => ({ ...state, [providerId]: true }));
    try {
      await fetchApiUsage(providerId);
    } finally {
      setRefreshingProviderIds((state) => ({ ...state, [providerId]: false }));
    }
  };

  const handleCopyText = async (text: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(text);
      addToast("success", successMessage);
    } catch {
      addToast("error", "Failed to copy");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">API Access</h2>
          <p className="text-muted-foreground">
            Credential status, runtime readiness, quota trends, and escalation actions.
          </p>
        </div>
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card variant="glass">
          <CardContent className="pt-5">
            <div className="text-xs text-muted-foreground">Critical Providers</div>
            <div className="text-2xl font-semibold mt-1">{riskStats.critical}</div>
          </CardContent>
        </Card>
        <Card variant="glass">
          <CardContent className="pt-5">
            <div className="text-xs text-muted-foreground">Warning Providers</div>
            <div className="text-2xl font-semibold mt-1">{riskStats.warning}</div>
          </CardContent>
        </Card>
        <Card variant="glass">
          <CardContent className="pt-5">
            <div className="text-xs text-muted-foreground">Healthy Providers</div>
            <div className="text-2xl font-semibold mt-1">{riskStats.healthy}</div>
          </CardContent>
        </Card>
        <Card variant="glass">
          <CardContent className="pt-5">
            <div className="text-xs text-muted-foreground">Blocked Agents</div>
            <div className="text-2xl font-semibold mt-1">{blockedAgents.length}</div>
          </CardContent>
        </Card>
      </div>

      {(riskStats.critical > 0 || blockedAgents.length > 0) && (
        <Card className="border-yellow-500/40 bg-yellow-500/5">
          <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2">
              <ShieldAlert className="h-5 w-5 text-yellow-500 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Immediate Follow-up Recommended</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Resolve credentials and runtime blockers before starting new batches.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setActiveTab("services")}>Service Control</Button>
              <Button variant="outline" size="sm" onClick={() => setActiveTab("logs")}>Technical Logs</Button>
              <Button variant="outline" size="sm" onClick={() => setActiveTab("alerts")}>Alert Center</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card variant="glass">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Runtime Availability
            </CardTitle>
            {runtimeFetchedAtMs ? (
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground" title={formatAbsoluteTime(runtimeFetchedAtMs)}>
                <LivePulse />
                {formatRelativeTime(runtimeFetchedAtMs)} ({formatAbsoluteTime(runtimeFetchedAtMs)})
              </div>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <AgentAvailabilityCard
              title="translator-core"
              agent={modelAvailabilityReport?.agents?.["translator-core"]}
            />
            <AgentAvailabilityCard
              title="review-core"
              agent={modelAvailabilityReport?.agents?.["review-core"]}
            />
            <Card variant="glass">
              <CardContent className="pt-5 pb-4 px-4 space-y-4">
                <div className="text-sm font-semibold">Vision / GLM</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {([
                    ["Google", modelAvailabilityReport?.vision?.has_google_api_key],
                    ["Gemini", modelAvailabilityReport?.vision?.has_gemini_api_key],
                    ["Moonshot", modelAvailabilityReport?.vision?.has_moonshot_api_key],
                    ["OpenAI", modelAvailabilityReport?.vision?.has_openai_api_key],
                  ] as [string, boolean | undefined][]).map(([name, hasKey]) => (
                    <div
                      key={name}
                      className="flex items-center gap-2 rounded-lg border bg-background/40 px-2.5 py-2"
                    >
                      <Key className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="text-xs truncate">{name}</span>
                      <span
                        className={`ml-auto h-2 w-2 rounded-full shrink-0 ${
                          hasKey ? "bg-green-500" : "bg-red-500"
                        }`}
                      />
                    </div>
                  ))}
                </div>
                {modelAvailabilityReport?.vision?.vision_backend && (
                  <div className="text-[10px] text-muted-foreground/70">
                    backend: <code className="text-[10px] bg-muted px-1 rounded">{modelAvailabilityReport.vision.vision_backend}</code>
                    {modelAvailabilityReport.vision.vision_model && (
                      <> · model: <code className="text-[10px] bg-muted px-1 rounded">{modelAvailabilityReport.vision.vision_model}</code></>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-2 rounded-lg border bg-background/40 px-2.5 py-2">
                  <span className="text-xs font-medium">GLM</span>
                  <div
                    className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      modelAvailabilityReport?.glm?.glm_enabled
                        ? "bg-green-500/15 text-green-600 dark:text-green-400"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {modelAvailabilityReport?.glm?.glm_enabled ? "ON" : "OFF"}
                  </div>
                  {modelAvailabilityReport?.glm?.glm_enabled && (
                    <span
                      className={`ml-auto h-2 w-2 rounded-full shrink-0 ${
                        modelAvailabilityReport.glm.has_glm_api_key || modelAvailabilityReport.glm.has_zai_profile
                          ? "bg-green-500"
                          : "bg-red-500"
                      }`}
                      title={`API key: ${modelAvailabilityReport.glm.has_glm_api_key ? "set" : "missing"} · zai: ${modelAvailabilityReport.glm.has_zai_profile ? "present" : "missing"}`}
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="text-xs text-muted-foreground">
            Fast status view (no live probe). Deep check: <code className="text-xs bg-muted px-1 rounded">openclaw models status --agent translator-core --json</code>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        <AnimatePresence>
          {apiProviders.map((provider, index) => {
            const providerUsage = apiUsage[provider.id];
            const history = apiUsageHistory[provider.id] || [];
            const risk = riskByProvider[provider.id] || { level: "healthy", reasons: [] };

            return (
              <motion.div
                key={provider.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ delay: index * 0.06 }}
              >
                <Card variant="glass">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Zap className="h-4 w-4 text-primary" />
                        {provider.name}
                      </CardTitle>
                      <div className="flex items-center gap-2 flex-wrap">
                        <RiskBadge risk={risk.level} />
                        {getStatusBadge(provider.status)}
                        <Badge variant="outline">
                          {getAuthTypeLabel(provider.authType)}
                        </Badge>
                      </div>
                    </div>
                    {risk.reasons.length > 0 && (
                      <p className="text-xs text-muted-foreground">Risk: {risk.reasons.join("; ")}</p>
                    )}
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {provider.authType === "api_key" ? (
                      <ApiKeyInput
                        provider={provider}
                        onSave={(key) => setApiKey(provider.id, key)}
                        onDelete={() => deleteApiKey(provider.id)}
                        hasKey={provider.hasKey}
                      />
                    ) : provider.authType === "oauth" ? (
                      <OAuthStatus
                        provider={provider}
                        onCopyCommand={() =>
                          handleCopyText(
                            getOAuthLoginCommand(provider.id),
                            `Copied login command for ${provider.name}`
                          )
                        }
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No configuration required
                      </p>
                    )}

                    {provider.authType === "api_key" && provider.hasKey && (
                      <div className="pt-3 border-t space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Usage & Activity</span>
                          <motion.button
                            type="button"
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => handleRefreshProvider(provider.id)}
                            className="text-muted-foreground hover:text-foreground"
                            aria-label={`Refresh ${provider.name} usage`}
                          >
                            <RefreshCw className={`h-3.5 w-3.5 ${refreshingProviderIds[provider.id] ? "animate-spin" : ""}`} />
                          </motion.button>
                        </div>
                        <UsagePanel usage={providerUsage} history={history} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <Card className="border-blue-500/50 bg-blue-500/5">
        <CardContent className="flex items-start gap-3 p-4">
          <AlertCircle className="h-5 w-5 text-blue-500 mt-0.5" />
          <div>
            <p className="font-medium text-sm">About Credentials</p>
            <p className="text-xs text-muted-foreground mt-1">
              Keys are stored locally in <code className="text-xs bg-muted px-1 rounded">~/.openclaw/agents/main/agent/auth-profiles.json</code>. Keep regular checks on runtime status and quota ETA before large translation batches.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
