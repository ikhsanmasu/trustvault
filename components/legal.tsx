import type { ReactNode } from "react";

/** Page header for legal / policy pages. */
export function LegalHeader({
  eyebrow,
  title,
  updated,
  intro,
}: {
  eyebrow: string;
  title: string;
  updated?: string;
  intro: string;
}) {
  return (
    <header className="border-b border-border pb-10">
      <span className="text-sm font-bold text-secondary uppercase tracking-widest">
        {eyebrow}
      </span>
      <h1 className="font-display mt-3 text-3xl sm:text-[2.6rem] font-semibold leading-[1.15] text-foreground text-balance">
        {title}
      </h1>
      {updated && (
        <p className="mt-3 text-sm text-muted-foreground">
          Effective date: {updated}
        </p>
      )}
      <p className="mt-5 text-base leading-relaxed text-muted-foreground max-w-2xl">
        {intro}
      </p>
    </header>
  );
}

/** Numbered section within a legal article. */
export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

/** Bulleted list styled for legal prose. */
export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-2 pl-1">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-secondary" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
