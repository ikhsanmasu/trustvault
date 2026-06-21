import * as React from "react";
import { cn } from "@/lib/utils";

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "md" | "lg";
}

function Avatar({ className, size = "md", children, ...props }: AvatarProps) {
  const sizeClasses = {
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-12 w-12 text-base",
  };

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted font-medium text-muted-foreground",
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
Avatar.displayName = "Avatar";

interface AvatarFallbackProps extends React.HTMLAttributes<HTMLSpanElement> {
  initials: string;
}

function AvatarFallback({
  initials,
  className,
  ...props
}: AvatarFallbackProps) {
  const display = initials.slice(0, 2).toUpperCase();
  return (
    <span className={cn("leading-none", className)} {...props}>
      {display}
    </span>
  );
}
AvatarFallback.displayName = "AvatarFallback";

export { Avatar, AvatarFallback };
