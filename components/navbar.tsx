"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthContext } from "@/components/auth-provider";
import { buttonVariants } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

function getInitials(email: string | undefined): string {
  if (!email) return "U";
  const parts = email.split("@")[0].split(/[._-]/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

export function Navbar() {
  const router = useRouter();
  const { user, signOut } = useAuthContext();

  async function handleSignOut() {
    await signOut();
    router.push("/");
  }

  return (
    <nav className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto max-w-7xl flex h-14 items-center justify-between px-4">
        {/* Left side: logo + nav links */}
        <div className="flex items-center gap-8">
          <Link
            href="/projects"
            className="text-lg font-bold tracking-tight hover:opacity-80 transition-opacity"
          >
            TrustVault
          </Link>
          <div className="hidden sm:flex items-center gap-4">
            <Link
              href="/projects"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Projects
            </Link>
          </div>
        </div>

        {/* Right side: user menu */}
        <div className="flex items-center gap-3">
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="flex items-center gap-2 rounded-full hover:ring-2 hover:ring-ring transition-all">
                  <Avatar size="sm">
                    <AvatarFallback initials={getInitials(user.email)} />
                  </Avatar>
                  <span className="hidden md:inline text-sm font-medium truncate max-w-[160px]">
                    {user.email}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <span className="text-sm">{user.email}</span>
                    <span className="text-xs text-muted-foreground font-normal">
                      ID: {user.id.slice(0, 8)}…
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push("/projects")}>
                  Projects
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/compare")}>
                  Compare
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="text-destructive"
                >
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className={buttonVariants({ variant: "default", size: "sm" })}
              >
                Sign Up
              </Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
