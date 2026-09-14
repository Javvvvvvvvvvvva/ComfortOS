# ADR-030 — Public Brand And Accessible Product Voice

Date: September 13, 2026
Status: Accepted

## Context

ComfortOS accurately describes the platform architecture but sounds like a technical or
academic product to a person who simply wants a better walk. The consumer experience needs
a memorable name, plain language, and accessible interaction states without weakening the
serious treatment of weather alerts, uncertainty, or data limitations.

## Decision

The consumer product is named **Ahhway**, pronounced "ah-way" and read as the reaction
"Ahh, this way." Its promise is **Take the nicer walk.**

ComfortOS remains the name of the deterministic environmental and routing engine. Existing
module names, operational identifiers, provider contracts, datasets, and architecture
documents do not need a cosmetic rename.

Public UI copy uses familiar action language. Route-role contracts remain unchanged:
`fastest`, `comfort`, and contextual roles continue to drive behavior even when the balanced
consumer label is `Comfiest`. Official alerts, safety notices, confidence, completeness,
and limited-data states remain literal rather than humorous.

Selected and active states must not rely on color alone. The product follows operating-system
reduced-motion, increased-contrast, and forced-color preferences.

Ahhway's public brand colors are Signal Yellow (`#F7C843`) and Deep Ink (`#17262B`).
The production icon uses a white symbol on a Deep Ink field for strong recognition at
28-30 px. Yellow is limited to small brand accents around the lockup. Comfort teal
(`#16766A`) remains a semantic route color rather than the product identity, so a green
route still means "more comfortable" instead of merely "Ahhway." Origin amber,
destination coral, and focus blue retain their existing meanings.

The public mark is a continuous route crossing layered weather bands. The earlier
lowercase `a` and wink direction is superseded because its smile-shaped underline created
an avoidable resemblance to Amazon branding at small sizes.

The name search performed for this design decision is preliminary product research, not a
legal trademark clearance. Formal clearance remains a release requirement.

## Consequences

- Product metadata, visible navigation, policy pages, screenshots, and support language use Ahhway.
- Technical diagnostics and architecture continue to use ComfortOS Engine.
- Brand naming is centralized in `lib/brand.ts`.
- Brand and route colors remain visually related but semantically independent.
- New UI language should be friendly but never minimize alerts, uncertainty, or user safety.

## Alternatives Considered

- **ComfortOS** as the public name: accurate but too institutional.
- **Mellow Miles**: friendly, but already used by another mobility product.
- **NiceWay**: clear, but already used by multiple services.
- **A fully comedic name**: memorable, but less trustworthy when presenting weather alerts.
