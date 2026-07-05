import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { CookieBanner } from "@/components/cookie-banner";

export const metadata: Metadata = {
  title: "InTrustVault — Know when a document change actually matters",
  description:
    "Document-integrity platform for audit, legal, and compliance teams: layered cryptographic verification, on-chain proofs, and AI that judges whether a change is material or cosmetic.",
  icons: {
    icon: "/favicon.svg",
  },
};

// Inline script that runs before React hydrates to prevent a flash of
// the wrong theme on load.
const themeScript = `
(function() {
  try {
    var stored = localStorage.getItem('theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (stored === 'dark' || (stored !== 'light' && prefersDark)) {
      document.documentElement.classList.add('dark');
    }
  } catch(e) {}
})();
`;

// Server-component root layout.
// Pages inside the (authenticated) route group receive the sidebar wrapper;
// auth pages (login, register) render without the sidebar.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-background antialiased">
        <ThemeProvider>{children}</ThemeProvider>
        <CookieBanner />
      </body>
    </html>
  );
}
