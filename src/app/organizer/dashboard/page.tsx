"use client";

import { useState, useEffect } from "react";

interface JudgeProgress {
  judgeId: string;
  email: string;
  assigned: number;
  completed: number;
  outstanding: number;
  completionPct: number;
  outstandingProjects: { projectId: string; projectTitle: string }[];
}

interface ProjectCoverage {
  projectId: string;
  title: string;
  assigned: number;
  reviewed: number;
  coveragePct: number;
  isMissingReviews: boolean;
}

interface NormalizationFlag {
  code: string;
  judgeId?: string;
  message: string;
}

interface ProjectRanking {
  projectId: string;
  projectTitle: string;
  teamId: string;
  rawScore: number;
  normalizedScore: number;
  rankRaw: number;
  rankNormalized: number;
  rankMovement: number;
  judgeCount: number;
}

export default function OrganizerDashboardPage() {
  const [eventId, setEventId] = useState<string>("");
  const [events, setEvents] = useState<{ id: string; name: string }[]>([]);
  const [judgeProgress, setJudgeProgress] = useState<JudgeProgress[]>([]);
  const [projectCoverage, setProjectCoverage] = useState<ProjectCoverage[]>([]);
  const [summary, setSummary] = useState<{
    totalJudges: number;
    totalProjects: number;
    totalAssignments: number;
    completedAssignments: number;
    outstandingAssignments: number;
    overallCompletionPct: number;
  } | null>(null);
  const [rankings, setRankings] = useState<ProjectRanking[]>([]);
  const [flags, setFlags] = useState<NormalizationFlag[]>([]);
  const [normRunning, setNormRunning] = useState(false);
  const [normError, setNormError] = useState<string | null>(null);
  const [hasNormalization, setHasNormalization] = useState(false);
  const [activeTab, setActiveTab] = useState<"progress" | "rankings" | "flags">("progress");

  useEffect(() => {
    fetch("/api/v1/events")
      .then((r) => r.json())
      .then((data) => {
        if (data.events?.length > 0) {
          setEvents(data.events);
          setEventId(data.events[0].id);
        }
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!eventId) return;
    loadDashboard();
    loadRankings();
  }, [eventId]);

  async function loadDashboard() {
    const res = await fetch(`/api/v1/organizer/dashboard?eventId=${eventId}`);
    if (res.ok) {
      const data = await res.json();
      setSummary(data.summary);
      setJudgeProgress(data.judgeProgress);
      setProjectCoverage(data.projectCoverage);
    }
  }

  async function loadRankings() {
    const res = await fetch(`/api/v1/organizer/rankings?eventId=${eventId}`);
    if (res.ok) {
      const data = await res.json();
      setRankings(data.rankings);
      setFlags(data.flags ?? []);
      setHasNormalization(data.hasNormalization);
    }
  }

  async function handleRunNormalization() {
    setNormRunning(true);
    setNormError(null);
    try {
      const res = await fetch("/api/v1/organizer/normalization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Run failed");
      }
      const data = await res.json();
      setFlags(data.flags ?? []);
      setHasNormalization(true);
      await loadRankings();
      await loadDashboard();
    } catch (e) {
      setNormError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setNormRunning(false);
    }
  }

  const movementColor = (m: number) => {
    if (m > 0) return "text-green-400";
    if (m < 0) return "text-red-400";
    return "text-gray-400";
  };

  const movementArrow = (m: number) => {
    if (m > 0) return `▲ +${m}`;
    if (m < 0) return `▼ ${m}`;
    return "─ 0";
  };

  const flagColor = (code: string) => {
    if (code === "FLAT_RATER") return "bg-red-800 text-red-200";
    if (code === "EXTREME_RATER") return "bg-orange-800 text-orange-200";
    return "bg-gray-700 text-gray-300";
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">Organizer Dashboard</h1>
            <p className="text-gray-400 mt-1">Judging progress, normalization, and rankings</p>
          </div>
          <div className="flex gap-3">
            <select
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
              className="bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm"
            >
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>{ev.name}</option>
              ))}
            </select>
            <a
              href={`/api/v1/export/scores.csv?eventId=${eventId}`}
              className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm font-medium"
            >
              ↓ Export CSV
            </a>
            <button
              onClick={handleRunNormalization}
              disabled={normRunning}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 rounded text-sm font-medium"
            >
              {normRunning ? "Running…" : "⚡ Run Normalization"}
            </button>
          </div>
        </div>

        {normError && (
          <div className="bg-red-900 border border-red-700 rounded p-3 mb-6 text-sm text-red-200">
            ❌ {normError}
          </div>
        )}

        {/* Summary stats */}
        {summary && (
          <div className="grid grid-cols-3 md:grid-cols-6 gap-4 mb-8">
            {[
              { label: "Judges", value: summary.totalJudges },
              { label: "Projects", value: summary.totalProjects },
              { label: "Assignments", value: summary.totalAssignments },
              { label: "Completed", value: summary.completedAssignments },
              { label: "Outstanding", value: summary.outstandingAssignments },
              { label: "Overall %", value: `${summary.overallCompletionPct}%` },
            ].map((stat) => (
              <div key={stat.label} className="bg-gray-800 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-white">{stat.value}</div>
                <div className="text-xs text-gray-400 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-gray-700">
          {(["progress", "rankings", "flags"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium rounded-t ${
                activeTab === tab
                  ? "bg-gray-800 text-white border-b-2 border-indigo-500"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {tab === "progress" && "Judge Progress"}
              {tab === "rankings" && `Rankings ${hasNormalization ? "(Normalized)" : "(Raw)"}`}
              {tab === "flags" && `Anomaly Flags ${flags.length > 0 ? `(${flags.length})` : ""}`}
            </button>
          ))}
        </div>

        {/* Tab: Judge Progress */}
        {activeTab === "progress" && (
          <div className="space-y-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-700">
                    <th className="pb-3 pr-4">Judge</th>
                    <th className="pb-3 pr-4">Assigned</th>
                    <th className="pb-3 pr-4">Completed</th>
                    <th className="pb-3 pr-4">Outstanding</th>
                    <th className="pb-3">Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {judgeProgress.map((j) => (
                    <tr key={j.judgeId} className="border-b border-gray-800">
                      <td className="py-3 pr-4 font-mono text-xs text-gray-300">{j.email}</td>
                      <td className="py-3 pr-4">{j.assigned}</td>
                      <td className="py-3 pr-4 text-green-400">{j.completed}</td>
                      <td className="py-3 pr-4 text-yellow-400">{j.outstanding}</td>
                      <td className="py-3 w-48">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-700 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${j.completionPct === 100 ? "bg-green-500" : j.completionPct > 50 ? "bg-yellow-500" : "bg-red-500"}`}
                              style={{ width: `${j.completionPct}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-400 w-8">{j.completionPct}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Project coverage */}
            <h3 className="text-lg font-semibold mt-6 mb-3">Project Coverage</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {projectCoverage.filter((p) => p.isMissingReviews).map((p) => (
                <div key={p.projectId} className="bg-gray-800 rounded p-3 border border-yellow-700">
                  <div className="font-medium text-sm">{p.title}</div>
                  <div className="text-xs text-yellow-400 mt-1">
                    {p.reviewed}/{p.assigned} reviewed ({p.coveragePct}%)
                  </div>
                </div>
              ))}
              {projectCoverage.filter((p) => p.isMissingReviews).length === 0 && (
                <div className="text-green-400 text-sm col-span-2">✓ All projects have complete coverage</div>
              )}
            </div>
          </div>
        )}

        {/* Tab: Rankings */}
        {activeTab === "rankings" && (
          <div>
            {!hasNormalization && (
              <div className="bg-yellow-900 border border-yellow-700 rounded p-3 mb-4 text-sm text-yellow-200">
                ⚠ No normalization run yet — showing raw scores only. Click &quot;Run Normalization&quot; to compute rank movement.
              </div>
            )}
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-700">
                  <th className="pb-3 pr-3">Norm Rank</th>
                  <th className="pb-3 pr-3">Project</th>
                  <th className="pb-3 pr-3">Judges</th>
                  <th className="pb-3 pr-3">Raw Score</th>
                  <th className="pb-3 pr-3">Norm Score</th>
                  <th className="pb-3">Movement</th>
                </tr>
              </thead>
              <tbody>
                {rankings.map((r) => (
                  <tr key={r.projectId} className="border-b border-gray-800">
                    <td className="py-3 pr-3 font-bold text-lg">{r.rankNormalized}</td>
                    <td className="py-3 pr-3">
                      <div className="font-medium">{r.projectTitle}</div>
                      <div className="text-xs text-gray-400">Raw rank: #{r.rankRaw}</div>
                    </td>
                    <td className="py-3 pr-3 text-gray-400">{r.judgeCount}</td>
                    <td className="py-3 pr-3 text-gray-300">{r.rawScore.toFixed(2)}</td>
                    <td className="py-3 pr-3 text-white font-medium">{r.normalizedScore.toFixed(2)}</td>
                    <td className={`py-3 font-mono font-bold ${movementColor(r.rankMovement)}`}>
                      {movementArrow(r.rankMovement)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab: Flags */}
        {activeTab === "flags" && (
          <div>
            {flags.length === 0 ? (
              <div className="text-green-400 text-sm">
                ✓ No anomaly flags detected
                {!hasNormalization && " — run normalization to detect anomalies"}
              </div>
            ) : (
              <div className="space-y-3">
                {flags.map((f, i) => (
                  <div key={i} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                    <div className="flex items-start gap-3">
                      <span className={`text-xs px-2 py-1 rounded font-mono ${flagColor(f.code)}`}>
                        {f.code}
                      </span>
                      {f.judgeId && (
                        <span className="text-xs text-gray-400 py-1">Judge: {f.judgeId}</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-300 mt-2">{f.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
