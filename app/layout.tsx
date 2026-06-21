import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TrustVault",
  description: "Document-integrity platform — upload, hash, compare, and assess materiality of changes.",
};

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
