import { Suspense } from "react";

// In a real app we'd fetch from the DB directly here or hit the API.
// For the prototype shell, this is a placeholder demonstrating the server component structure.
export default function GalleryPage() {
  return (
    <div className="container mx-auto p-8">
      <header className="mb-8">
        <h1 className="text-4xl font-bold">VERDIXA Project Gallery</h1>
        <p className="text-gray-600 mt-2">Explore submitted hackathon projects.</p>
      </header>

      <div className="flex gap-4 mb-8">
        <input 
          type="text" 
          placeholder="Search projects..." 
          className="border p-2 rounded w-full max-w-md"
        />
        <select className="border p-2 rounded">
          <option>All Tracks</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Suspense fallback={<div>Loading projects...</div>}>
          <div className="col-span-full py-12 text-center text-gray-500">
            Gallery UI implementation placeholder.
            API available at <code>/api/v1/gallery</code>.
          </div>
        </Suspense>
      </div>
    </div>
  );
}
