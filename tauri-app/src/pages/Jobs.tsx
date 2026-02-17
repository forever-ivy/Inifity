import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/stores/appStore";
import { useEffect, useState } from "react";
import { Clock, CheckCircle2, Loader2, FileText, Filter, RefreshCw } from "lucide-react";

const statusColors: Record<string, "success" | "warning" | "secondary" | "default"> = {
  review_ready: "success",
  needs_attention: "warning",
  running: "default",
  verified: "secondary",
  failed: "warning",
  collecting: "secondary",
};

const milestoneOrder = [
  "job_created",
  "run_accepted",
  "kb_sync_done",
  "intent_classified",
  "round_1_done",
  "round_2_done",
  "round_3_done",
  "review_ready",
  "verified",
];

export function Jobs() {
  const { jobs, selectedJobId, selectedJobMilestones, fetchJobs, fetchJobMilestones, isLoading } = useAppStore();
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  useEffect(() => {
    fetchJobs(statusFilter ?? undefined);
  }, [fetchJobs, statusFilter]);

  const handleJobClick = async (jobId: string) => {
    useAppStore.getState().setSelectedJobId(jobId);
    await fetchJobMilestones(jobId);
  };

  const filteredJobs = statusFilter ? jobs.filter((j) => j.status === statusFilter) : jobs;

  const getMilestoneIcon = (eventType: string, isComplete: boolean, isCurrent: boolean) => {
    if (isComplete) {
      return <CheckCircle2 className="h-3 w-3 text-green-500" />;
    }
    if (isCurrent) {
      return <Loader2 className="h-3 w-3 text-blue-500 animate-spin" />;
    }
    return <Clock className="h-3 w-3 text-gray-300" />;
  };

  const getMilestoneTime = (eventType: string) => {
    const milestone = selectedJobMilestones.find((m) => m.eventType === eventType);
    return milestone?.timestamp ? milestone.timestamp.split(" ")[1]?.slice(0, 8) : null;
  };

  const isMilestoneComplete = (eventType: string) => {
    return selectedJobMilestones.some((m) => m.eventType === eventType);
  };

  const getCurrentMilestone = () => {
    for (const milestone of milestoneOrder) {
      if (!isMilestoneComplete(milestone)) {
        return milestone;
      }
    }
    return null;
  };

  const currentMilestone = getCurrentMilestone();

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Jobs</h2>
          <p className="text-muted-foreground">Task status and milestones</p>
        </div>
        <div className="flex gap-2">
          <select
            className="px-3 py-1.5 border rounded-lg text-sm"
            value={statusFilter ?? ""}
            onChange={(e) => setStatusFilter(e.target.value || null)}
          >
            <option value="">All Statuses</option>
            <option value="running">Running</option>
            <option value="review_ready">Review Ready</option>
            <option value="verified">Verified</option>
            <option value="failed">Failed</option>
          </select>
          <Button variant="outline" size="sm" onClick={() => fetchJobs(statusFilter ?? undefined)} disabled={isLoading}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Jobs List */}
      <div className="space-y-4">
        {filteredJobs.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No jobs found</p>
              <p className="text-sm text-muted-foreground/70">Jobs will appear here when tasks are created via Telegram</p>
            </CardContent>
          </Card>
        ) : (
          filteredJobs.map((job) => (
            <Card
              key={job.jobId}
              className={`cursor-pointer transition-colors ${selectedJobId === job.jobId ? "ring-2 ring-blue-500" : ""}`}
              onClick={() => handleJobClick(job.jobId)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{job.jobId}</p>
                      <p className="text-sm text-muted-foreground">From: {job.sender || "Unknown"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={statusColors[job.status] || "secondary"}>{job.status}</Badge>
                    <span className="text-xs text-muted-foreground">{job.taskType}</span>
                  </div>
                </div>

                {/* Milestone Timeline - only show for selected job */}
                {selectedJobId === job.jobId && selectedJobMilestones.length > 0 && (
                  <div className="mt-4 pl-2 border-l-2 border-muted">
                    <div className="space-y-2">
                      {milestoneOrder.map((milestone) => {
                        const isComplete = isMilestoneComplete(milestone);
                        const isCurrent = currentMilestone === milestone;
                        const time = getMilestoneTime(milestone);

                        if (!isComplete && !isCurrent) {
                          return (
                            <div key={milestone} className="flex items-center gap-2 text-sm text-muted-foreground/50">
                              <Clock className="h-3 w-3" />
                              <span>{milestone}</span>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={milestone}
                            className={`flex items-center gap-2 text-sm ${isCurrent ? "text-foreground font-medium" : ""}`}
                          >
                            {getMilestoneIcon(milestone, isComplete, isCurrent)}
                            <span className={isComplete ? "text-muted-foreground" : ""}>{milestone}</span>
                            {time && <span className="text-xs text-muted-foreground/70 ml-auto">{time}</span>}
                            {isCurrent && <span className="text-xs text-blue-500 ml-auto">running...</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Show hint if no milestones loaded */}
                {selectedJobId === job.jobId && selectedJobMilestones.length === 0 && (
                  <div className="mt-4 pl-2 text-sm text-muted-foreground">Loading milestones...</div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
