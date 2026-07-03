import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "inTrustVault — Intelligent Trusted Vault",
  description:
    "AI-powered document integrity platform — upload, hash, compare, and blockchain-verify every change.",
  icons: {
    icon: [
      {
        url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:%231e3a5f'/%3E%3Cstop offset='100%25' style='stop-color:%230f172a'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='100' height='100' rx='20' fill='url(%23g)'/%3E%3Cpath d='M50 15L15 40v25c0 25 20 35 35 45 15-10 35-20 35-45V40L50 15z' fill='%23c9a44b' opacity='.9'/%3E%3Cpath d='M50 28L28 42v18c0 17 14 25 22 31 8-6 22-14 22-31V42L50 28z' fill='%23f0d57a' opacity='.85'/%3E%3Ctext x='50' y='68' text-anchor='middle' font-family='sans-serif' font-weight='bold' font-size='20' fill='%231e3a5f'%3Ein%3C/text%3E%3C/svg%3E",
        type: "image/svg+xml",
      },
    ],
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
      </body>
    </html>
  );
}
