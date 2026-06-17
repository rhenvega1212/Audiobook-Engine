"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { IssueReportRow } from "@/lib/issues/types";

type ReportWithUrl = IssueReportRow & { screenshot_url: string | null };

export function IssuesInboxClient({
  initialReports,
  initialOpenCount,
}: {
  initialReports: ReportWithUrl[];
  initialOpenCount: number;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [busyId, setBusyId] = useState<string | null>(null);

  const reports =
    filter === "open"
      ? initialReports.filter((r) => r.status === "open")
      : initialReports;

  async function setStatus(id: string, status: "open" | "resolved") {
    setBusyId(id);
    try {
      const res = await fetch(`/api/issues/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? "Update failed");
      }
      toast.success(status === "resolved" ? "Marked resolved" : "Reopened");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={filter === "open" ? "default" : "outline"}
          onClick={() => setFilter("open")}
        >
          Open ({initialOpenCount})
        </Button>
        <Button
          type="button"
          size="sm"
          variant={filter === "all" ? "default" : "outline"}
          onClick={() => setFilter("all")}
        >
          All ({initialReports.length})
        </Button>
      </div>

      {reports.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-body-sm text-slate">
            {filter === "open"
              ? "No open reports — you're all caught up."
              : "No reports yet."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => (
            <Card
              key={report.id}
              className={
                report.status === "open"
                  ? "border-burgundy/30"
                  : "opacity-80"
              }
            >
              <CardContent className="pt-5 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-ink">
                      {report.page_label ?? "App"}
                      {report.status === "open" && (
                        <span className="ml-2 text-xs font-normal uppercase text-burgundy">
                          Open
                        </span>
                      )}
                    </p>
                    <p className="text-body-sm text-slate">
                      {report.reporter_email} ·{" "}
                      {new Date(report.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {report.status === "open" ? (
                      <Button
                        type="button"
                        size="sm"
                        disabled={busyId === report.id}
                        onClick={() => void setStatus(report.id, "resolved")}
                      >
                        {busyId === report.id ? "Saving…" : "Resolve"}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busyId === report.id}
                        onClick={() => void setStatus(report.id, "open")}
                      >
                        Reopen
                      </Button>
                    )}
                  </div>
                </div>

                <p className="text-body-sm text-ink whitespace-pre-wrap">
                  {report.description}
                </p>

                <div className="text-body-sm text-slate space-y-1">
                  <p className="truncate">
                    <a
                      href={report.page_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-teal hover:underline inline-flex items-center gap-1"
                    >
                      {report.page_url}
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  </p>
                  {report.context_json &&
                    typeof report.context_json === "object" && (
                      <p className="text-xs">
                        {(report.context_json as { viewport?: string }).viewport &&
                          `Viewport ${(report.context_json as { viewport: string }).viewport}`}
                        {(report.context_json as { line_id?: string }).line_id &&
                          ` · line ${(report.context_json as { line_id: string }).line_id}`}
                      </p>
                    )}
                </div>

                {report.screenshot_url && (
                  <a
                    href={report.screenshot_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-md border border-border overflow-hidden max-w-md"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={report.screenshot_url}
                      alt="Report screenshot"
                      className="w-full object-contain max-h-64 bg-warm-sand/20"
                    />
                  </a>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
