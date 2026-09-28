import { Suspense } from "react";
import { db } from "@/lib/db";

// Force dynamic rendering so it always fetches fresh data
export const dynamic = "force-dynamic";

async function ProjectList() {
  const projects = await db.project.findMany({
    where: { status: "FINALIZED" },
    include: {
      team: { include: { members: { include: { user: true } } } },
      track: true,
    },
    orderBy: { createdAt: "desc" }
  });

  if (projects.length === 0) {
    return (
      <div className="col-span-full py-20 text-center bg-white rounded-xl shadow-sm border border-gray-100">
        <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        </svg>
        <h3 className="mt-2 text-sm font-semibold text-gray-900">No projects found</h3>
        <p className="mt-1 text-sm text-gray-500">No teams have finalized their submissions yet.</p>
      </div>
    );
  }

  return (
    <>
      {projects.map(project => (
        <div key={project.id} className="flex flex-col bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow duration-200">
          <div className="h-48 bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center p-6 text-center">
             <h2 className="text-2xl font-bold text-white line-clamp-2">{project.title}</h2>
          </div>
          <div className="p-6 flex-1 flex flex-col">
            <div className="flex justify-between items-start mb-4">
              <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                {project.track?.name || "General"}
              </span>
            </div>
            <p className="text-gray-600 text-sm flex-1 mb-4 line-clamp-3">
              {project.description || "No description provided."}
            </p>
            <div className="mt-auto pt-4 border-t border-gray-100 flex justify-between items-center">
              <div className="text-xs text-gray-500">
                Team: <span className="font-semibold text-gray-900">{project.team.name}</span>
              </div>
              <a href={project.repoUrl || "#"} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-800 text-sm font-medium">
                View Source &rarr;
              </a>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

export default function GalleryPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex-shrink-0 flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center text-white font-bold">V</div>
              <span className="font-bold text-xl tracking-tight text-gray-900">VERDIXA</span>
            </div>
            <div>
              <a href="/" className="text-sm font-medium text-gray-600 hover:text-gray-900 mr-4">Home</a>
              <a href="/login" className="text-sm font-medium text-blue-600 hover:text-blue-800">Switch Role</a>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <header className="mb-10 text-center max-w-3xl mx-auto">
          <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight sm:text-5xl mb-4">Project Gallery</h1>
          <p className="text-lg text-gray-600">Discover and explore all finalized submissions for the hackathon. These projects are currently undergoing evaluation.</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <Suspense fallback={
            <div className="col-span-full flex justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
          }>
            <ProjectList />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
