import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TrustVault",
  description:
    "Document-integrity platform — upload, hash, compare, and assess materiality of changes.",
};

// Server-component root layout.
// Pages inside the (authenticated) route group receive the sidebar wrapper;
// auth pages (login, register) render without the sidebar.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background antialiased">
        {children}
      </body>
    </html>
  );
}
