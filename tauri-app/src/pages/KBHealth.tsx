import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Database,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Search,
  Activity,
} from "lucide-react";

export function KBHealth() {
  const ragStatus = "healthy"; // mock
  const lastSync = "2026-02-17 10:30:00";
  const totalDocs = 156;
  const recentHits = 23;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">KB Health</h2>
          <p className="text-muted-foreground">Knowledge base and RAG status</p>
        </div>
        <Button variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Sync Now
        </Button>
      </div>

      {/* RAG Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Database className="h-4 w-4" />
            ClawRAG Connection
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            {ragStatus === "healthy" ? (
              <>
                <CheckCircle2 className="h-8 w-8 text-green-500" />
                <div>
                  <p className="font-medium text-lg">Healthy</p>
                  <p className="text-sm text-muted-foreground">RAG backend is operational</p>
                </div>
              </>
            ) : (
              <>
                <AlertCircle className="h-8 w-8 text-red-500" />
                <div>
                  <p className="font-medium text-lg">Unavailable</p>
                  <p className="text-sm text-muted-foreground">Falling back to local search</p>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-4">
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
            <Search className="h-8 w-8 text-green-500" />
            <div>
              <p className="text-sm text-muted-foreground">Recent Hits (24h)</p>
              <p className="font-medium">{recentHits}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sync History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Sync History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[
              { time: "10:30:00", status: "success", docs: 5, duration: "2.3s" },
              { time: "09:15:00", status: "success", docs: 2, duration: "1.1s" },
              { time: "08:00:00", status: "success", docs: 12, duration: "4.5s" },
            ].map((sync, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded-lg border">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-sm">{sync.time}</span>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{sync.docs} docs</span>
                  <span>{sync.duration}</span>
                  <Badge variant="outline" className="text-xs">success</Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* KB by Source Group */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Documents by Source Group</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { group: "glossary", count: 45, color: "bg-purple-500" },
              { group: "previously_translated", count: 67, color: "bg-blue-500" },
              { group: "source_text", count: 23, color: "bg-green-500" },
              { group: "general", count: 21, color: "bg-gray-400" },
            ].map((item) => (
              <div key={item.group} className="flex items-center gap-3">
                <div className={`h-3 w-3 rounded-full ${item.color}`} />
                <span className="text-sm capitalize flex-1">{item.group.replace("_", " ")}</span>
                <span className="text-sm font-medium">{item.count}</span>
                <div className="w-32 bg-muted rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${item.color}`}
                    style={{ width: `${(item.count / totalDocs) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
