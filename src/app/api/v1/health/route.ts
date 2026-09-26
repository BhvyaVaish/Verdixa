import { NextResponse } from "next/server";

// Simple health endpoint for Docker healthcheck and load balancer probes.
// Returns 200 with version info. No auth required.
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "verdixa",
    version: process.env.npm_package_version ?? "0.1.0",
    timestamp: new Date().toISOString(),
  });
}
