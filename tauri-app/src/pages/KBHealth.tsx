import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/stores/appStore";
import { useEffect, useMemo, useState } from "react";
import * as tauri from "@/lib/tauri";
import {
  Database,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Activity,
  FolderOpen,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

export function KBHealth() {
  const kbSyncReport = useAppStore((s) => s.kbSyncReport);
  const kbStats = useAppStore((s) => s.kbStats);
  const config = useAppStore((s) => s.config);
  const fetchConfig = useAppStore((s) => s.fetchConfig);
  const fetchKbSyncReport = useAppStore((s) => s.fetchKbSyncReport);
  const fetchKbStats = useAppStore((s) => s.fetchKbStats);
  const syncKbNow = useAppStore((s) => s.syncKbNow);
  const isLoading = useAppStore((s) => s.isLoading);
  const [isSyncing, setIsSyncing] = useState(false);

  const [kbFiles, setKbFiles] = useState<tauri.KbFileRow[]>([]);
  const [kbFilesTotal, setKbFilesTotal] = useState(0);
  const [kbFilesQuery, setKbFilesQuery] = useState("");
  const [kbFilesSourceGroup, setKbFilesSourceGroup] = useState("");
  const [kbFilesPage, setKbFilesPage] = useState(0);
  const [kbFilesLoading, setKbFilesLoading] = useState(false);
  const [kbFilesError, setKbFilesError] = useState<string | null>(null);
  const [kbFilesRefreshKey, setKbFilesRefreshKey] = useState(0);
  const pageSize = 50;

  useEffect(() => {
    fetchConfig();
    fetchKbSyncReport();
    fetchKbStats();
  }, [fetchConfig, fetchKbSyncReport, fetchKbStats]);

  const kbRoot = config?.kbRoot || kbSyncReport?.kbRoot || "";

  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(async () => {
      setKbFilesLoading(true);
      setKbFilesError(null);
      try {
        const res = await tauri.listKbFiles({
          query: kbFilesQuery.trim() || undefined,
          sourceGroup: kbFilesSourceGroup.trim() || undefined,
          limit: pageSize,
          offset: kbFilesPage * pageSize,
        });
        if (cancelled) return;
        setKbFiles(res.items || []);
        setKbFilesTotal(res.total || 0);
      } catch (err) {
        if (cancelled) return;
        setKbFiles([]);
        setKbFilesTotal(0);
        setKbFilesError(String(err));
      } finally {
        if (!cancelled) setKbFilesLoading(false);
      }
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [
    kbFilesQuery,
    kbFilesSourceGroup,
    kbFilesPage,
    kbFilesRefreshKey,
    kbSyncReport?.indexedAt,
  ]);

  const totalDocs = kbStats?.totalFiles ?? 0;
  const lastSync = kbSyncReport?.indexedAt || kbStats?.lastIndexedAt || "—";
  const errorCount = kbSyncReport?.errors?.length ?? 0;

  const byGroup = useMemo(() => {
    return kbStats?.bySourceGroup ?? [];
  }, [kbStats?.bySourceGroup]);

  const handleSyncNow = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await syncKbNow();
      await Promise.all([fetchKbSyncReport(), fetchKbStats()]);
      setKbFilesRefreshKey((k) => k + 1);
    } finally {
      setIsSyncing(false);
    }
  };

  const formatBytes = (bytes: number) => {
    const b = Number(bytes || 0);
    if (!Number.isFinite(b) || b <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const idx = Math.min(units.length - 1, Math.floor(Math.log(b) / Math.log(1024)));
    const value = b / Math.pow(1024, idx);
    const digits = value >= 10 || idx === 0 ? 0 : 1;
    return `${value.toFixed(digits)} ${units[idx]}`;
  };

  const fileName = (p: string) => {
    const norm = String(p || "").replace(/\\/g, "/");
    const parts = norm.split("/").filter(Boolean);
    return parts.length ? parts[parts.length - 1] : norm || "—";
  };

  const relPath = (p: string) => {
    const path = String(p || "");
    if (!kbRoot) return path;
    const rootNorm = kbRoot.replace(/\\/g, "/").replace(/\/+$/, "");
    const pathNorm = path.replace(/\\/g, "/");
    if (pathNorm.startsWith(rootNorm + "/")) {
      return pathNorm.slice(rootNorm.length + 1);
    }
    return pathNorm;
  };

  const totalPages = Math.max(1, Math.ceil(kbFilesTotal / pageSize));
  const canPrev = kbFilesPage > 0;
  const canNext = kbFilesPage + 1 < totalPages;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">KB Health</h2>
          <p className="text-muted-foreground">Knowledge base and RAG status</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={async () => {
              if (kbRoot) await tauri.openInFinder(kbRoot);
            }}
            disabled={!kbRoot}
          >
            <FolderOpen className="h-4 w-4 mr-2" />
            Open KB Root
          </Button>
          <Button variant="outline" onClick={() => setKbFilesRefreshKey((k) => k + 1)} disabled={kbFilesLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${kbFilesLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" onClick={handleSyncNow} disabled={isLoading || isSyncing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading || isSyncing ? "animate-spin" : ""}`} />
            Sync Now
          </Button>
        </div>
      </div>

      {/* Latest Sync Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Database className="h-4 w-4" />
            Latest KB Sync
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            {kbSyncReport ? (
              <>
                {kbSyncReport.ok ? (
                  <CheckCircle2 className="h-8 w-8 text-green-500" />
                ) : (
                  <AlertCircle className="h-8 w-8 text-yellow-500" />
                )}
                <div>
                  <p className="font-medium text-lg">{kbSyncReport.ok ? "OK" : "Completed with warnings"}</p>
                  <p className="text-sm text-muted-foreground">Indexed at: {kbSyncReport.indexedAt || "—"}</p>
                </div>
              </>
            ) : (
              <>
                <AlertCircle className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="font-medium text-lg">No sync report</p>
                  <p className="text-sm text-muted-foreground">
                    Run <span className="font-mono">Sync Now</span> to generate <span className="font-mono">kb_sync_latest.json</span>.
                  </p>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <Clock className="h-8 w-8 text-blue-500" />
            <div>
              <p className="text-sm text-muted-foreground">Last Sync</p>
              <p className="font-medium">{lastSync}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <Database className="h-8 w-8 text-purple-500" />
            <div>
              <p className="text-sm text-muted-foreground">Total Documents</p>
              <p className="font-medium">{totalDocs}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <Activity className="h-8 w-8 text-green-500" />
            <div>
              <p className="text-sm text-muted-foreground">Errors (last sync)</p>
              <p className="font-medium">{errorCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sync Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Sync Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!kbSyncReport ? (
            <p className="text-sm text-muted-foreground">No sync report available.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg border">
                <p className="text-xs text-muted-foreground">Created</p>
                <p className="text-lg font-medium">{kbSyncReport.created}</p>
              </div>
              <div className="p-3 rounded-lg border">
                <p className="text-xs text-muted-foreground">Updated</p>
                <p className="text-lg font-medium">{kbSyncReport.updated}</p>
              </div>
              <div className="p-3 rounded-lg border">
                <p className="text-xs text-muted-foreground">Skipped</p>
                <p className="text-lg font-medium">{kbSyncReport.skipped}</p>
              </div>
              <div className="p-3 rounded-lg border">
                <p className="text-xs text-muted-foreground">Scanned</p>
                <p className="text-lg font-medium">{kbSyncReport.scannedCount}</p>
              </div>

              <div className="p-3 rounded-lg border">
                <p className="text-xs text-muted-foreground">Unscoped Skipped</p>
                <p className="text-lg font-medium">{kbSyncReport.unscopedSkipped}</p>
              </div>
              <div className="p-3 rounded-lg border">
                <p className="text-xs text-muted-foreground">Metadata Only</p>
                <p className="text-lg font-medium">{kbSyncReport.metadataOnly}</p>
              </div>
              <div className="p-3 rounded-lg border">
                <p className="text-xs text-muted-foreground">Removed</p>
                <p className="text-lg font-medium">{kbSyncReport.removed}</p>
              </div>
              <div className="p-3 rounded-lg border">
                <p className="text-xs text-muted-foreground">Errors</p>
                <p className="text-lg font-medium">{errorCount}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* KB Files Manager */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Database className="h-4 w-4" />
            Knowledge Base Documents
            <Badge variant="outline" className="text-xs">
              {kbFilesTotal} total
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 flex-wrap items-center">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={kbFilesQuery}
                onChange={(e) => {
                  setKbFilesQuery(e.target.value);
                  setKbFilesPage(0);
                }}
                placeholder="Search by path..."
                className="w-full pl-9 pr-3 py-2 border rounded-xl text-sm bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              />
            </div>

            <select
              value={kbFilesSourceGroup}
              onChange={(e) => {
                setKbFilesSourceGroup(e.target.value);
                setKbFilesPage(0);
              }}
              className="px-3 py-2 border rounded-xl text-sm bg-background text-foreground"
            >
              <option value="">All source groups</option>
              {(kbStats?.bySourceGroup || []).map((g) => (
                <option key={g.sourceGroup} value={g.sourceGroup}>
                  {g.sourceGroup}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setKbFilesPage((p) => Math.max(0, p - 1))}
                disabled={!canPrev}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {kbFilesPage + 1} / {totalPages}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setKbFilesPage((p) => (canNext ? p + 1 : p))}
                disabled={!canNext}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {kbFilesError && (
            <div className="text-sm text-red-400">
              Failed to load KB files: <span className="font-mono">{kbFilesError}</span>
            </div>
          )}

          <div className="rounded-xl border overflow-x-auto">
            <div className="min-w-[900px]">
              <div className="grid grid-cols-12 gap-0 bg-muted/40 text-xs text-muted-foreground">
                <div className="col-span-4 p-3">File</div>
                <div className="col-span-2 p-3">Source Group</div>
                <div className="col-span-1 p-3">Parser</div>
                <div className="col-span-1 p-3 text-right">Chunks</div>
                <div className="col-span-2 p-3">Indexed</div>
                <div className="col-span-1 p-3 text-right">Size</div>
                <div className="col-span-1 p-3 text-right">Open</div>
              </div>
              {kbFilesLoading ? (
                <div className="p-4 text-sm text-muted-foreground">Loading…</div>
              ) : kbFiles.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">
                  No documents found. {totalDocs === 0 ? "Run Sync Now to index the knowledge base." : ""}
                </div>
              ) : (
                <div className="divide-y">
                  {kbFiles.map((f) => (
                    <div key={f.path} className="grid grid-cols-12 gap-0 text-sm hover:bg-muted/20">
                      <div className="col-span-4 p-3 min-w-0">
                        <div className="font-medium truncate">{fileName(f.path)}</div>
                        <div className="text-xs text-muted-foreground truncate font-mono">{relPath(f.path)}</div>
                      </div>
                      <div className="col-span-2 p-3">
                        <Badge variant="secondary" className="text-xs">
                          {f.source_group || "general"}
                        </Badge>
                      </div>
                      <div className="col-span-1 p-3 text-xs text-muted-foreground">
                        {f.parser || "—"}
                      </div>
                      <div className="col-span-1 p-3 text-right font-mono text-xs">
                        {f.chunk_count ?? 0}
                      </div>
                      <div className="col-span-2 p-3 text-xs text-muted-foreground">
                        {f.indexed_at ? new Date(f.indexed_at).toLocaleString() : "—"}
                      </div>
                      <div className="col-span-1 p-3 text-right font-mono text-xs">
                        {formatBytes(f.size_bytes)}
                      </div>
                      <div className="col-span-1 p-3 flex justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={async () => {
                            await tauri.openInFinder(f.path);
                          }}
                        >
                          <FolderOpen className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sync Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Sync Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!kbSyncReport ? (
            <p className="text-sm text-muted-foreground">No sync report available.</p>
          ) : (
            <>
              <details className="rounded-xl border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Errors ({kbSyncReport.errors?.length ?? 0})
                </summary>
                <div className="mt-2 space-y-2">
                  {(kbSyncReport.errors || []).length === 0 ? (
                    <div className="text-xs text-muted-foreground">No errors.</div>
                  ) : (
                    (kbSyncReport.errors || []).map((e, idx) => (
                      <div key={idx} className="text-xs font-mono whitespace-pre-wrap break-words">
                        {typeof e === "string" ? e : JSON.stringify(e, null, 2)}
                      </div>
                    ))
                  )}
                </div>
              </details>

              <details className="rounded-xl border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Unscoped Skipped ({kbSyncReport.unscopedSkippedPaths?.length ?? 0})
                </summary>
                <div className="mt-2 space-y-1">
                  {(kbSyncReport.unscopedSkippedPaths || []).length === 0 ? (
                    <div className="text-xs text-muted-foreground">None.</div>
                  ) : (
                    (kbSyncReport.unscopedSkippedPaths || []).slice(0, 200).map((p) => (
                      <div key={p} className="text-xs font-mono truncate">
                        {p}
                      </div>
                    ))
                  )}
                  {(kbSyncReport.unscopedSkippedPaths || []).length > 200 && (
                    <div className="text-xs text-muted-foreground">
                      Showing first 200 paths.
                    </div>
                  )}
                </div>
              </details>

              <details className="rounded-xl border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Metadata Only ({kbSyncReport.metadataOnlyPaths?.length ?? 0})
                </summary>
                <div className="mt-2 space-y-1">
                  {(kbSyncReport.metadataOnlyPaths || []).length === 0 ? (
                    <div className="text-xs text-muted-foreground">None.</div>
                  ) : (
                    (kbSyncReport.metadataOnlyPaths || []).slice(0, 200).map((p) => (
                      <div key={p} className="text-xs font-mono truncate">
                        {p}
                      </div>
                    ))
                  )}
                  {(kbSyncReport.metadataOnlyPaths || []).length > 200 && (
                    <div className="text-xs text-muted-foreground">
                      Showing first 200 paths.
                    </div>
                  )}
                </div>
              </details>
            </>
          )}
        </CardContent>
      </Card>

      {/* KB by Source Group */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Documents by Source Group</CardTitle>
        </CardHeader>
        <CardContent>
          {!kbStats ? (
            <p className="text-sm text-muted-foreground">KB stats unavailable.</p>
          ) : byGroup.length === 0 ? (
            <p className="text-sm text-muted-foreground">No documents indexed yet.</p>
          ) : (
            <div className="space-y-3">
              {byGroup.map((item) => {
                const pct = totalDocs > 0 ? (item.count / totalDocs) * 100 : 0;
                const color =
                  item.sourceGroup === "glossary"
                    ? "bg-purple-500"
                    : item.sourceGroup === "previously_translated"
                      ? "bg-blue-500"
                      : item.sourceGroup === "source_text"
                        ? "bg-green-500"
                        : "bg-gray-400";
                return (
                  <div key={item.sourceGroup} className="flex items-center gap-3">
                    <div className={`h-3 w-3 rounded-full ${color}`} />
                    <span className="text-sm capitalize flex-1">
                      {item.sourceGroup.replace(/_/g, " ")}
                    </span>
                    <span className="text-sm font-medium">{item.count}</span>
                    <div className="w-32 bg-muted rounded-full h-2">
                      <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {item.chunkCount} chunks
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
