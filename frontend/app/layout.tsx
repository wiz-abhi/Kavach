import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kavach — Fraud Ring Detection",
  description: "Real-time fraud ring detection using graph analysis on Neo4j AuraDB",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
