# Specification Quality Checklist: A view chooses how its pages open

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

- FR-011 names "agents" and "reading a database": that is the parity principle
  (constitution II), stated as behaviour, not a tool choice.
- FR-016 keeps agents from storing "center peek" before anything honours it.
- Five defaults were chosen without asking. They are listed in Assumptions, so
  the owner can overturn them in `/speckit-clarify`:
  - a view's peek beats the account's "Open rows in new tab";
  - anyone who may change the view may change the setting (no per-person override);
  - only the view's own rows peek (no peek inside a peek);
  - on a phone the side peek fills the screen;
  - the address carries the peeked row, so Back closes it.
- New concept for the registry (added at `/speckit-plan`): a page now renders
  in more than one container (full page, side peek, later centre peek). A later
  feature that adds page-level UI must work in each, or say why not.
