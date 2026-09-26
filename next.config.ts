import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Next.js automatically detects src/app as appDir when it exists
  // argon2 is a native Node addon — must not be bundled by webpack/swc
  serverExternalPackages: ["argon2", "@prisma/client", "prisma"],
  experimental: {
    // Ensure no accidental caching on auth/role-scoped paths.
    // Reminder: never add "use cache" to authenticated or role-scoped paths.
  },
};

export default nextConfig;
