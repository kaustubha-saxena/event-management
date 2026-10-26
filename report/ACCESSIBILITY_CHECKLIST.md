# Accessibility checklist

Browser recheck (27 October 2026): Playwright confirmed the skip link, 320/390/768/1280px layouts without horizontal overflow, and zero axe findings on the tested homepage. Keyboard operation of every authenticated dialog, screen-reader behavior, text zoom, and reduced-motion behavior remain manual checks for a configured session.

Stage 1 source inspection checklist. Items requiring an actual browser or assistive-technology run remain unverified until those checks are performed.

## Structure and content

- [x] Document declares English, UTF-8, viewport, and a meaningful title.
- [x] Skip link targets the main landmark.
- [x] Header, labeled navigation, main, sections, and footer are present.
- [x] One page-level `h1`; section headings follow a logical hierarchy.
- [x] Search, category, and sort controls have visible labels.
- [x] Decorative artwork and icons are hidden from assistive technology.

## Keyboard and interaction

- [ ] Verify all interactive controls are reachable and operable by keyboard.
- [ ] Verify visible focus indicators at desktop and mobile widths.
- [ ] Verify dialog focus entry, containment, close behavior, and return focus.
- [ ] Verify navigation and filter state are announced correctly.

## Visual and responsive

- [ ] Measure text and control contrast against WCAG 2.1 AA targets.
- [ ] Verify 320px, 768px, and desktop layouts without horizontal scrolling.
- [ ] Verify text zoom/reflow and reduced-motion preferences.
- [ ] Run an axe accessibility scan and review every finding.

## Forms and states

- [x] Search has a programmatic label; result and page status regions are present.
- [ ] Verify errors and empty states are announced and understandable.
- [ ] Verify forms in dialogs have associated labels and accessible validation.
- [ ] Recheck labels and states after backend functionality is implemented.
