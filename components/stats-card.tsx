import { cn } from "@/lib/utils";
import { IconTrendUp, IconTrendDown, IconTrendNeutral } from "@/components/icons";

export interface TrendIndicator {
  direction: "up" | "down" | "neutral";
  value: string;
  label?: string;
}

interface StatsCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  description?: string;
  trend?: TrendIndicator;
  accentColor?: string;
  iconBg?: string;
  className?: string;
}

const trendStyles: Record<string, { text: string; bg: string }> = {
  up: {
    text: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-950/60",
  },
  down: {
    text: "text-red-600 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-950/60",
  },
  neutral: {
    text: "text-muted-foreground",
    bg: "bg-muted dark:bg-muted/50",
  },
};

function TrendArrow({ direction }: { direction: TrendIndicator["direction"] }) {
  if (direction === "up") {
    return <IconTrendUp className="h-3 w-3" />;
  }
  if (direction === "down") {
    return <IconTrendDown className="h-3 w-3" />;
  }
  return <IconTrendNeutral className="h-3 w-3" />;
}

export function StatsCard({
  label,
  value,
  icon,
  description,
  trend,
  accentColor = "border-l-primary",
  iconBg,
  className,
}: StatsCardProps) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border bg-card text-card-foreground",
        "border-l-4 border-l-primary",
        "shadow-elevation-1",
        "transition-all duration-300 ease-out",
        "hover:shadow-elevation-3 hover:-translate-y-1 hover:border-l-primary/80 hover:border-secondary/25",
        "dark:border-l-primary dark:hover:border-l-primary/80",
        accentColor,
        className,
      )}
    >
      {/* Gold accent line on hover */}
      <div className="absolute top-0 left-6 right-6 h-0.5 rounded-full bg-gradient-to-r from-transparent via-secondary/0 to-transparent transition-all duration-300 group-hover:via-secondary/60" />

      {/* Subtle gradient overlay on hover */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.03] via-transparent to-secondary/[0.02] opacity-0 transition-opacity duration-300 group-hover:opacity-100 dark:from-primary/[0.06] dark:to-secondary/[0.04]" />

      <div className="relative p-5 sm:p-6">
        {/* Top row: icon + trend */}
        <div className="mb-4 flex items-start justify-between">
          <div
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-2xl",
              "bg-gradient-to-br from-primary/15 via-primary/10 to-primary/5",
              "text-primary ring-1 ring-inset ring-primary/10",
              "transition-all duration-300",
              "group-hover:from-primary/20 group-hover:ring-primary/20",
              "dark:from-primary/20 dark:via-primary/15 dark:to-primary/8 dark:ring-primary/20",
              iconBg,
            )}
          >
            {icon}
          </div>

          {trend && (
            <div
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
                trendStyles[trend.direction].text,
                trendStyles[trend.direction].bg,
              )}
            >
              <TrendArrow direction={trend.direction} />
              <span>{trend.value}</span>
            </div>
          )}
        </div>

        {/* Value */}
        <p className="text-3xl font-bold tracking-tight tabular-nums text-foreground sm:text-4xl">
          {value}
        </p>

        {/* Label */}
        <p className="mt-1 text-sm font-medium text-muted-foreground">
          {label}
        </p>

        {/* Optional description */}
        {description && (
          <p className="mt-1 text-xs text-muted-foreground/70">
            {description}
          </p>
        )}

        {/* Optional trend label below */}
        {trend?.label && (
          <p
            className={cn(
              "mt-2 text-xs",
              trendStyles[trend.direction].text,
            )}
          >
            {trend.label}
          </p>
        )}
      </div>
    </div>
  );
}
