"use client";

import { AuthProvider } from "@/components/auth-provider";
import LoginForm from "@/components/login-form";

export default function LoginPage() {
  return (
    <main className="mx-auto min-h-screen flex items-center justify-center px-4 py-16">
      <AuthProvider>
        <LoginForm />
      </AuthProvider>
    </main>
  );
}
