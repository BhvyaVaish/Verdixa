import { Suspense } from "react";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

async function JudgeAssignments() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = await getSession(sessionCookie);

  if (!session || session.role !== "judge") {
    redirect("/login");
  }

  const assignments = await db.judgeAssignment.findMany({
    where: { judgeId: session.userId },
    include: {
      project: { include: { track: true } },
      scorecard: true
    }
  });

  if (assignments.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
        <h3 className="text-lg font-medium text-gray-900">No Assignments Yet</h3>
        <p className="mt-2 text-gray-500">The organizer has not assigned any projects to you for evaluation.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Project</th>
            <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Track</th>
            <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {assignments.map((assignment) => {
            const isScored = assignment.scorecard !== null;
            return (
              <tr key={assignment.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="font-semibold text-gray-900">{assignment.project.title}</div>
                  <div className="text-sm text-gray-500 line-clamp-1 w-64">{assignment.project.description || "No description"}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                    {assignment.project.track?.name || "General"}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {isScored ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                      </svg>
                      Evaluated
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-yellow-50 px-2 py-1 text-xs font-medium text-yellow-800 ring-1 ring-inset ring-yellow-600/20">
                      Pending
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  {isScored ? (
                    <span className="text-gray-400">Locked</span>
                  ) : (
                    <button className="text-indigo-600 hover:text-indigo-900 font-semibold bg-indigo-50 px-3 py-1.5 rounded hover:bg-indigo-100 transition-colors">
                      Evaluate &rarr;
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function JudgeDashboard() {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-gray-900 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex-shrink-0 flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-500 rounded flex items-center justify-center text-white font-bold">V</div>
              <span className="font-bold text-xl tracking-tight text-white">VERDIXA Judging</span>
            </div>
            <div>
              <a href="/login" className="text-sm font-medium text-gray-300 hover:text-white">Logout</a>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-8 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Your Assignments</h1>
            <p className="mt-2 text-sm text-gray-600">Please evaluate all projects carefully according to the rubric.</p>
          </div>
        </div>

        <Suspense fallback={<div className="animate-pulse flex space-x-4"><div className="flex-1 space-y-6 py-1"><div className="h-32 bg-gray-200 rounded"></div></div></div>}>
          <ProjectList />
        </Suspense>
      </main>
    </div>
  );
}

// Rename component variable
const ProjectList = JudgeAssignments;
