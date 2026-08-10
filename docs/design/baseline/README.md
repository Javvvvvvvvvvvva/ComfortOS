# ComfortOS — Design Baseline

This folder is the implementation handoff for the approved ComfortOS design baseline. It translates the Claude Design prototype into stable product, screen, component, interaction, and mock-data documentation without altering the original design artifacts.

## Current Baseline

Baseline version: Round 2

Canonical source artifact:

```text
docs/design/baseline/source/latest/ComfortOS-Prototype-Round2.dc.html
```

Original supplied filename:

```text
ComfortOS - Prototype.dc.html
```

Revision date available from zip metadata: August 7, 2026, 9:56 PM.

Why this is current: the bundled design-baseline README identifies `ComfortOS-Prototype.dc.html` as the current Round 2 baseline and explicitly marks `ComfortOS-Prototype-v1-round1.dc.html` as superseded. Inspection confirms Round 2 contains the current interaction model, compact Home treatment, tradeoff-strip Route Cards, city-specific time labels, Comfort Map layers, and Active Navigation microclimate guidance.

Also preserved in latest:

```text
docs/design/baseline/source/latest/ComfortOS-Prototype-Round2-exported-viewer.html
```

This is the large exported HTML viewer, byte-identical to the Desktop `ComfortOS Prototype.html` file.

## Archived Sources

```text
docs/design/baseline/source/archive/ComfortOS-Prototype-Round1.dc.html
docs/design/baseline/source/archive/ComfortOS-Direction-Round1.dc.html
docs/design/baseline/source/archive/ComfortOS-Prototype-Round2-with-thumbnail.dc.html
```

The `with-thumbnail` file differs from the canonical Round 2 `.dc.html` by adding a bundler thumbnail template. It is retained as a supplied artifact, but the clean Round 2 `.dc.html` is the implementation baseline.

## Source-Of-Truth Hierarchy

1. `docs/architecture/ARCHITECTURE_SPEC_V1.md`
2. `docs/design/DESIGN_GUIDELINES.md`
3. Current approved design baseline in `docs/design/baseline/`
4. Architecture Decision Records in `docs/decisions/`
5. Implementation code

Architecture controls technical boundaries. Product/design guidelines control UX principles. This design baseline controls current visual and interaction intent. If implementation reveals a conflict, document it and surface it rather than silently changing product behavior because the implementation is easier.

## Extracted Specs

- `DESIGN_SYSTEM.md`: typography, color, surfaces, spacing, route hierarchy, map treatment, light/dark concepts
- `SCREEN_SPEC.md`: screen-by-screen behavior and gaps
- `COMPONENT_SPEC.md`: reusable UI component contracts
- `INTERACTION_SPEC.md`: consumer interactions vs. developer-preview controls
- `MOCK_DATA.md`: design fixtures and future engine ownership

## Important Product Rules

- The Minneapolis / Seattle / Phoenix switcher is a developer-preview mechanism, not a production city selector.
- Prototype values are design fixtures. They must not become production constants.
- Do not directly convert the Claude Design HTML into one huge production component.
- Future implementation should extract normalized state, domain models, reusable UI components, and deterministic engine boundaries.
