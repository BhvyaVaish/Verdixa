"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function EvaluateForm({ 
  assignmentId, 
  criteria 
}: { 
  assignmentId: string, 
  criteria: any[] 
}) {
  const router = useRouter();
  const [scores, setScores] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleScoreChange = (critId: string, val: number) => {
    setScores(prev => ({ ...prev, [critId]: val }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/v1/scores/${assignmentId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scores })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit scores");
      }

      // Success, route back to dashboard
      router.push("/judge/dashboard");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  // Check if all criteria are scored
  const isComplete = criteria.every(c => scores[c.id] !== undefined);

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg text-sm">
          {error}
        </div>
      )}

      {criteria.map((crit, idx) => (
        <div key={crit.id} className="bg-gray-50 border border-gray-100 p-6 rounded-lg">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h4 className="text-lg font-bold text-gray-900">
                <span className="text-indigo-500 mr-2">{idx + 1}.</span> 
                {crit.name}
              </h4>
              <p className="text-sm text-gray-600 mt-1">{crit.description}</p>
            </div>
            <div className="bg-white border border-gray-200 px-3 py-1 rounded text-sm font-bold text-gray-700 shadow-sm">
              Max: {crit.maxScore}
            </div>
          </div>
          
          <div className="mt-4">
            <div className="flex justify-between text-xs font-medium text-gray-400 mb-2 px-1">
              <span>1 (Poor)</span>
              <span>{crit.maxScore} (Excellent)</span>
            </div>
            <input 
              type="range" 
              min="1" 
              max={crit.maxScore} 
              step="1"
              value={scores[crit.id] || ""}
              onChange={(e) => handleScoreChange(crit.id, parseInt(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
            <div className="mt-4 flex justify-center">
              {scores[crit.id] ? (
                <span className="inline-flex items-center justify-center bg-indigo-100 text-indigo-800 text-xl font-bold px-4 py-2 rounded-lg border border-indigo-200 shadow-sm min-w-[60px]">
                  {scores[crit.id]}
                </span>
              ) : (
                <span className="inline-flex items-center justify-center bg-gray-100 text-gray-400 text-xl font-bold px-4 py-2 rounded-lg border border-gray-200 border-dashed min-w-[60px]">
                  -
                </span>
              )}
            </div>
          </div>
        </div>
      ))}

      <div className="pt-6 border-t border-gray-200 flex justify-end">
        <button
          type="submit"
          disabled={!isComplete || loading}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-8 rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Submitting..." : "Submit Final Evaluation"}
        </button>
      </div>
    </form>
  );
}
