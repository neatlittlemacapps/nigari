# Specification Quality Checklist: Every block an agent can see in Markdown, it can also write

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-10-27
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable objectives defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- The spellings themselves (FR-001) are the feature: they are the interface an
  agent writes to, so naming them is a requirement, not an implementation
  detail.
- Defaults chosen without asking, listed in Assumptions and Edge Cases, which
  the owner can overturn:
  - GitHub alerts for callouts, pandoc fenced divs for columns;
  - a bare URL alone on a line stays a link;
  - old `> 💡 text` exports are read as callouts;
  - toggle headings and the embedded collection stay out of scope.
