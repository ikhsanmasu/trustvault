import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PLANS = [
  {
    name: "Starter",
    price: "Free",
    period: "forever",
    description: "Perfect for individuals getting started with secure document storage.",
    features: [
      "Up to 10 documents",
      "Secure encrypted vault storage",
      "Essential integrity verification",
      "AI change analysis (10/month)",
      "Basic document preview",
      "Community support",
    ],
    cta: "Get Started",
    href: "/register",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$65",
    period: "/month",
    description: "For growing teams that need full integrity, intelligence, and collaboration.",
    features: [
      "Unlimited documents",
      "Full blockchain anchoring",
      "AI analysis & assistant (unlimited)",
      "Smart document sharing & public links",
      "Version tracking & comparison",
      "Team collaboration (5 members)",
      "Role-based access control",
      "Priority support",
    ],
    cta: "Start Free Trial",
    href: "/register",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For organizations with advanced security, scale, and compliance needs.",
    features: [
      "Everything in Pro",
      "Unlimited team members",
      "SSO / SAML integration",
      "Audit logs & compliance reports",
      "Dedicated infrastructure",
      "Custom data retention policies",
      "SLA & dedicated support",
      "On-premise deployment option",
    ],
    cta: "Contact Sales",
    href: "mailto:sales@trustvault.app",
    highlighted: false,
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="relative bg-muted/30 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center max-w-2xl mx-auto">
          <span className="text-base font-bold text-secondary uppercase tracking-widest">
            Pricing
          </span>
          <h2 className="mt-3 text-4xl sm:text-5xl font-bold tracking-tight text-foreground">
            Start free, scale with confidence
          </h2>
          <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
            Every plan includes secure storage and essential integrity features.
            Upgrade when your team needs more.
          </p>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={cn(
                "relative flex flex-col rounded-2xl border p-6 sm:p-8",
                "transition-all duration-300 hover:shadow-lg",
                plan.highlighted
                  ? "border-primary/40 bg-card shadow-md scale-[1.02] ring-1 ring-primary/20"
                  : "border-border/60 bg-card",
              )}
            >
              {plan.highlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-4 py-1 text-xs font-semibold text-primary-foreground">
                  Most Popular
                </span>
              )}

              <div className="mb-6">
                <h3 className="text-lg font-bold text-foreground">{plan.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
              </div>

              <div className="mb-6">
                <span className="text-4xl font-bold text-foreground">{plan.price}</span>
                {plan.period && (
                  <span className="text-sm text-muted-foreground">{plan.period}</span>
                )}
              </div>

              <ul className="mb-8 flex-1 space-y-3">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <svg className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                href={plan.href}
                className={cn(
                  "w-full text-center rounded-xl px-4 py-2.5 text-sm font-semibold transition-all",
                  plan.highlighted
                    ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                    : buttonVariants({ variant: "outline" }),
                )}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
