import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VERDIXA — Hackathon Operating System",
  description: "Integrity-first, self-hostable hackathon submission and judging platform.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        {children}
      </body>
    </html>
  );
}
