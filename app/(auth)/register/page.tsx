"use client";

import { AuthProvider } from "@/components/auth-provider";
import RegisterForm from "@/components/register-form";

export default function RegisterPage() {
  return (
    <main className="mx-auto min-h-screen flex items-center justify-center px-4 py-16">
      <AuthProvider>
        <RegisterForm />
      </AuthProvider>
    </main>
  );
}
