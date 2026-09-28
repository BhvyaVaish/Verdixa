import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import EvaluateForm from "./EvaluateForm";

export const dynamic = "force-dynamic";

export default async function EvaluatePage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = await getSession(sessionCookie);

  if (!session || session.role !== "judge") {
    redirect("/login");
  }

  const assignment = await db.judgeAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      project: { include: { track: true, team: true } },
      scorecard: { include: { rubric: { include: { criteria: true } }, scores: true } }
    }
  });

  if (!assignment) {
    return <div className="p-8 text-center text-red-600">Assignment not found.</div>;
  }

  if (assignment.judgeId !== session.userId) {
    return <div className="p-8 text-center text-red-600">Forbidden: This is not your assignment.</div>;
  }

  if (!assignment.scorecard) {
    return <div className="p-8 text-center text-red-600">Scorecard not initialized.</div>;
  }

  const isAlreadySubmitted = assignment.scorecard.submittedAt !== null;

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-gray-900 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex-shrink-0 flex items-center gap-2">
              <a href="/judge/dashboard" className="text-gray-300 hover:text-white mr-4">&larr; Back to Dashboard</a>
              <span className="font-bold text-xl tracking-tight text-white border-l border-gray-700 pl-4">Evaluating</span>
            </div>
            <div>
              <span className="text-sm font-medium text-gray-400">Judge Session Active</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
          <div className="p-6 border-b border-gray-200 bg-indigo-50">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{assignment.project.title}</h1>
                <p className="mt-2 text-sm text-indigo-700 font-medium">Team: {assignment.project.team?.name || "Unknown"} &middot; Track: {assignment.project.track?.name || "General"}</p>
              </div>
              {assignment.project.repoUrl && (
                <a href={assignment.project.repoUrl} target="_blank" rel="noopener noreferrer" className="bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm transition">
                  View Source Repository &rarr;
                </a>
              )}
            </div>
          </div>
          <div className="p-6">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-2">Project Description</h3>
            <p className="text-gray-700 whitespace-pre-wrap">{assignment.project.description || "No description provided by the team."}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900">Evaluation Rubric</h2>
            <p className="text-sm text-gray-500 mt-1">Please score the project based on the following criteria. Be as objective as possible.</p>
          </div>
          
          <div className="p-6">
            {isAlreadySubmitted ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
                <svg className="mx-auto h-12 w-12 text-green-500 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className="text-lg font-bold text-green-900">Evaluation Complete</h3>
                <p className="text-green-700 mt-1">You have already submitted your scores for this project. They are now locked for normalization.</p>
                <div className="mt-6 flex flex-col gap-3 items-center max-w-sm mx-auto">
                  {assignment.scorecard.scores.map(s => {
                    const critName = assignment.scorecard?.rubric.criteria.find(c => c.id === s.criterionId)?.name;
                    return (
                      <div key={s.criterionId} className="w-full flex justify-between bg-white px-4 py-2 rounded border border-green-100 shadow-sm">
                        <span className="font-medium text-gray-700">{critName}</span>
                        <span className="font-bold text-indigo-600">{s.score} pts</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <EvaluateForm 
                assignmentId={assignmentId} 
                criteria={assignment.scorecard.rubric.criteria} 
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
