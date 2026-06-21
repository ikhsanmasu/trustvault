import { AuthProvider } from "@/components/auth-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { Navbar } from "@/components/navbar";

// NOTE: This layout wraps all protected pages with the AuthProvider context
// and the shared navigation bar. The root app/layout.tsx (owned by scaffold)
// renders this layout as a child, so AuthProvider wraps the entire subtree.
export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Navbar />
        {children}
      </AuthProvider>
    </ThemeProvider>
  );
}
