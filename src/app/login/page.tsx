"use client";

import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Login failed");
      }

      // Automatically redirect to the organizer dashboard on success
      window.location.href = "/organizer/dashboard";
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md bg-white p-8 rounded-lg shadow-md border border-gray-200">
        <h1 className="text-2xl font-bold text-gray-900 mb-6 text-center">Login to VERDIXA</h1>
        
        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded mb-4 text-sm border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
            <input
              type="email"
              required
              className="w-full border border-gray-300 rounded p-2 text-gray-900 focus:ring-blue-500 focus:border-blue-500"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="organizer@verdixa.dev"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              required
              className="w-full border border-gray-300 rounded p-2 text-gray-900 focus:ring-blue-500 focus:border-blue-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="organizer2026"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white font-semibold py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Logging in..." : "Sign in"}
          </button>
        </form>

        <div className="mt-6 border-t pt-4">
          <p className="text-sm text-gray-600 mb-2 font-semibold">Demo Accounts:</p>
          <ul className="text-xs text-gray-500 space-y-1">
            <li><span className="font-mono bg-gray-100 p-1 rounded">organizer@verdixa.dev</span> / <span className="font-mono bg-gray-100 p-1 rounded">verdixa2026</span></li>
            <li><span className="font-mono bg-gray-100 p-1 rounded">judge.07@dogfood2026.dev</span> / <span className="font-mono bg-gray-100 p-1 rounded">verdixa2026</span></li>
            <li><span className="font-mono bg-gray-100 p-1 rounded">participant@dogfood2026.dev</span> / <span className="font-mono bg-gray-100 p-1 rounded">verdixa2026</span></li>
          </ul>
        </div>
      </div>
    </main>
  );
}
