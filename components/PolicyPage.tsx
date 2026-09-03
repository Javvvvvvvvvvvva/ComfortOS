import Link from "next/link";
import type { ReactNode } from "react";

export function PolicyPage({
  eyebrow,
  title,
  summary,
  children,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <main className="policy-page">
      <header className="policy-header">
        <Link className="policy-brand" href="/">
          ComfortOS
        </Link>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="policy-summary">{summary}</p>
        <p className="policy-updated">Last updated September 2, 2026</p>
      </header>
      <article className="policy-content">{children}</article>
      <nav className="policy-nav" aria-label="Legal and support">
        <Link href="/coverage">Coverage</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/data-sources">Data sources</Link>
        <Link href="/support">Support</Link>
      </nav>
    </main>
  );
}

export function PolicySection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
