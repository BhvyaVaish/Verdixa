import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-3xl text-center space-y-8">
        <div className="space-y-4">
          <h1 className="text-5xl font-extrabold tracking-tight text-gray-900 sm:text-6xl">
            VERDIXA
          </h1>
          <p className="text-xl leading-8 text-gray-600">
            Integrity-first hackathon operating system.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mt-10">
          <Link 
            href="/login" 
            className="rounded-lg bg-gray-900 px-6 py-4 text-base font-semibold text-white shadow-sm hover:bg-gray-800 transition-colors sm:col-span-2"
          >
            Login to Verdixa
            <p className="text-sm font-normal text-gray-400 mt-1">Access judge and organizer tools</p>
          </Link>
          <Link 
            href="/gallery" 
            className="rounded-lg bg-blue-600 px-6 py-4 text-base font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 transition-colors"
          >
            Public Gallery
            <p className="text-sm font-normal text-blue-100 mt-1">Browse submitted projects and vote</p>
          </Link>
          <Link 
            href="/organizer/dashboard" 
            className="rounded-lg bg-white px-6 py-4 text-base font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 transition-colors"
          >
            Organizer Dashboard
            <p className="text-sm font-normal text-gray-500 mt-1">Manage judging and normalization</p>
          </Link>
        </div>

        <div className="mt-16 text-sm text-gray-400">
          System is live and fully operational.
        </div>
      </div>
    </main>
  );
}
