import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PLANS = [
  {
    name: "Starter",
    price: "Free",
    period: "forever",
    description:
      "For individuals who want verifiable integrity on the documents that matter most.",
    features: [
      "Up to 10 documents · 100 MB storage",
      "Files up to 50 MB each",
      "Binary & text integrity verification",
      "50 AI materiality verdicts / month",
      "Encrypted vault & document preview",
      "Community support",
    ],
    cta: "Start free",
    href: "/register",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$29",
    period: "/month per workspace",
    description:
      "For teams that review documents together and cannot afford to miss a material change.",
    features: [
      "Unlimited documents · 5 GB storage",
      "Files up to 100 MB each",
      "500 AI materiality verdicts / month",
      "On-chain fingerprint anchoring",
      "Vault assistant with citations",
      "Secure sharing & public links",
      "Up to 5 team members with roles",
      "Priority support",
    ],
    cta: "Get started",
    href: "/register",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description:
      "For organizations with advanced security, scale, and compliance requirements.",
    features: [
      "Everything in Pro",
      "Unlimited storage, file size & AI verdicts",
      "Unlimited team members",
      "SSO / SAML integration",
      "Audit logs & compliance reports",
      "Custom data retention policies",
      "SLA & dedicated support",
    ],
    cta: "Contact sales",
    href: "mailto:sales@trustvault.app",
    highlighted: false,
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="relative bg-muted/30 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center max-w-2xl mx-auto">
          <span className="text-sm font-bold text-secondary uppercase tracking-widest">
            Pricing
          </span>
          <h2 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground text-balance">
            Start free. Upgrade when your team does.
          </h2>
          <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
            Every plan runs the same verification pipeline — hashing first, AI
            judgment second. No credit card required to start.
          </p>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={cn(
                "relative flex flex-col rounded-2xl border p-6 sm:p-8",
                "transition-all duration-300 hover:shadow-elevation-3",
                plan.highlighted
                  ? "border-secondary/50 bg-card shadow-elevation-2 lg:scale-[1.03] ring-1 ring-secondary/25"
                  : "border-border/60 bg-card",
              )}
            >
              {plan.highlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-secondary px-4 py-1 text-xs font-bold text-secondary-foreground shadow-sm">
                  Most popular
                </span>
              )}

              <div className="mb-6">
                <h3 className="text-lg font-bold text-foreground">{plan.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                  {plan.description}
                </p>
              </div>

              <div className="mb-6 flex items-baseline gap-1.5">
                <span className="text-4xl font-bold tracking-tight text-foreground">
                  {plan.price}
                </span>
                {plan.period && (
                  <span className="text-sm text-muted-foreground">{plan.period}</span>
                )}
              </div>

              <ul className="mb-8 flex-1 space-y-3">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <svg
                      className="mt-0.5 h-4 w-4 shrink-0 text-success"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
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
                    ? "bg-secondary text-secondary-foreground hover:bg-secondary/90 shadow-sm"
                    : buttonVariants({ variant: "outline" }),
                )}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Prices in USD. Cancel anytime — your documents and proofs remain
          exportable.
        </p>
      </div>
    </section>
  );
}
