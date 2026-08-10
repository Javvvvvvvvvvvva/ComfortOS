# ComfortOS Agent Instructions

Before substantial work, read the relevant canonical documents:

1. `docs/architecture/ARCHITECTURE_SPEC_V1.md`
2. `docs/design/DESIGN_GUIDELINES.md`
3. `docs/design/baseline/README.md`
4. Relevant specs in `docs/design/baseline/`
5. ADRs in `docs/decisions/`

Rules for future Codex and Claude Code sessions:

- Preserve engine/UI separation.
- Never place environmental calculations inside React/UI components.
- Never treat prototype mock values as real data.
- Keep provider-specific API responses behind normalized interfaces.
- Preserve support for time-dependent routing.
- Avoid hard-coding city names into core algorithms.
- Treat Minneapolis, Seattle, and Phoenix as prototype validation scenarios, not architecture limits.
- Add tests for deterministic environmental and routing logic.
- Update documentation when major architectural decisions change.
- Do not directly convert Claude Design HTML into one large production component.

Source-of-truth hierarchy:

1. Architecture specification
2. Product/design guidelines
3. Current approved design baseline
4. Architecture Decision Records
5. Implementation code

If implementation reveals a conflict, document it and surface the issue. Do not silently change product behavior because implementation is easier.
