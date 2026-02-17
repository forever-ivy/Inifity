import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/stores/appStore";
import { useEffect, useState } from "react";
import * as tauri from "@/lib/tauri";
import {
  FileText,
  FileSpreadsheet,
  FileCheck,
  FolderOpen,
  Copy,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
} from "lucide-react";

export function Verify() {
  const { jobs, selectedJobId, selectedJobArtifacts, selectedJobQuality, fetchJobs, fetchJobArtifacts, isLoading } =
    useAppStore();
  const [expandedJob, setExpandedJob] = useState<string | null>(null);

  useEffect(() => {
    fetchJobs("review_ready");
  }, [fetchJobs]);

  const handleJobExpand = async (jobId: string) => {
    if (expandedJob === jobId) {
      setExpandedJob(null);
    } else {
      setExpandedJob(jobId);
      useAppStore.getState().setSelectedJobId(jobId);
      await fetchJobArtifacts(jobId);
    }
  };

  const handleOpenInFinder = async (jobId: string) => {
    try {
      const verifyPath = await tauri.getVerifyFolderPath();
      await tauri.openInFinder(`${verifyPath}/${jobId}`);
    } catch (err) {
      console.error("Failed to open folder:", err);
    }
  };

  const handleOpenArtifact = async (path: string) => {
    try {
      await tauri.openInFinder(path);
    } catch (err) {
      console.error("Failed to open artifact:", err);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const reviewReadyJobs = jobs.filter((j) => j.status === "review_ready");

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Verify</h2>
          <p className="text-muted-foreground">Review and approve translated artifacts</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchJobs("review_ready")} disabled={isLoading}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Jobs Awaiting Review */}
      <div className="space-y-4">
        {reviewReadyJobs.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileCheck className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No jobs awaiting review</p>
              <p className="text-sm text-muted-foreground/70 mt-2">Completed jobs will appear here for verification</p>
            </CardContent>
          </Card>
        ) : (
          reviewReadyJobs.map((job) => (
            <Card key={job.jobId} className={expandedJob === job.jobId ? "ring-2 ring-blue-500" : ""}>
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-base cursor-pointer" onClick={() => handleJobExpand(job.jobId)}>
                    {job.jobId}
                  </CardTitle>
                  <Badge variant="success">{job.status}</Badge>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleOpenInFinder(job.jobId)}>
                    <FolderOpen className="h-4 w-4 mr-2" />
                    Open in Finder
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleJobExpand(job.jobId)}>
                    {expandedJob === job.jobId ? "Collapse" : "Expand"}
                  </Button>
                </div>
              </CardHeader>

              {expandedJob === job.jobId && (
                <CardContent className="space-y-4">
                  {/* Artifacts */}
                  <div>
                    <h4 className="text-sm font-medium mb-2">Artifacts</h4>
                    {selectedJobArtifacts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Loading artifacts...</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {selectedJobArtifacts.map((artifact) => (
                          <div
                            key={artifact.name}
                            className="flex items-center justify-between p-3 rounded-lg border"
                          >
                            <div className="flex items-center gap-2">
                              {artifact.artifactType === "docx" ? (
                                <FileText className="h-4 w-4 text-blue-500" />
                              ) : artifact.artifactType === "xlsx" ? (
                                <FileSpreadsheet className="h-4 w-4 text-green-500" />
                              ) : (
                                <FileText className="h-4 w-4 text-gray-500" />
                              )}
                              <div>
                                <p className="text-sm font-medium">{artifact.name}</p>
                                <p className="text-xs text-muted-foreground">{formatSize(artifact.size)}</p>
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleOpenArtifact(artifact.path)}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Quality Report */}
                  {selectedJobQuality && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Quality Report</h4>
                      <div className="grid grid-cols-3 gap-4 p-4 rounded-lg bg-muted/50">
                        <div className="text-center">
                          <p
                            className={`text-2xl font-bold ${
                              selectedJobQuality.terminologyHit >= 80
                                ? "text-green-600"
                                : selectedJobQuality.terminologyHit >= 60
                                  ? "text-yellow-600"
                                  : "text-red-600"
                            }`}
                          >
                            {selectedJobQuality.terminologyHit}%
                          </p>
                          <p className="text-xs text-muted-foreground">Terminology Hit</p>
                        </div>
                        <div className="text-center">
                          <p
                            className={`text-2xl font-bold ${
                              selectedJobQuality.structureFidelity >= 90
                                ? "text-green-600"
                                : selectedJobQuality.structureFidelity >= 70
                                  ? "text-yellow-600"
                                  : "text-red-600"
                            }`}
                          >
                            {selectedJobQuality.structureFidelity}%
                          </p>
                          <p className="text-xs text-muted-foreground">Structure Fidelity</p>
                        </div>
                        <div className="text-center">
                          <p
                            className={`text-2xl font-bold ${
                              selectedJobQuality.purityScore >= 95
                                ? "text-green-600"
                                : selectedJobQuality.purityScore >= 90
                                  ? "text-yellow-600"
                                  : "text-red-600"
                            }`}
                          >
                            {selectedJobQuality.purityScore}%
                          </p>
                          <p className="text-xs text-muted-foreground">Purity Score</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" disabled>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Mark as Reviewed
                    </Button>
                    <Button variant="ghost" disabled>
                      <FileCheck className="h-4 w-4 mr-2" />
                      View Report Details
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
