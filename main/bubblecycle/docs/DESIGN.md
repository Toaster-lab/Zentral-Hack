# Design system and accessibility

`css/styles.css` holds layout and component structure; `css/theme.css` owns the look. Tokens are at the top of `theme.css`.

## Design system

- **Palette:** a warm paper background (`--paper`), solid surfaces, warm ink, and one green accent (`--accent`). Amber (`--warn-tint`) is
  used only for warnings and demo labels; red (`--error`) only for errors.
- **Brand:** the logo is `icons/logo.png` (dark artwork on white, always shown on a white disc). The brand orange `#F2A33A`
  (`--brand-orange`) is the app bar and the icon background; the logo's dark green is `--brand-deep`. Contrast: the dark ink on the
  orange is 7.6:1, white on the orange only 2.1:1, so **white text is never used on the orange** (white text stays on the green buttons,
  6.7:1). The app icons are made by `python tools/make_icons.py` (needs `pip install pillow`; the generated PNGs are committed). The
  artwork itself reads "RECYCL IT" without the "!".
- **Type:** Fraunces (soft serif) for headings, Source Sans 3 for text.
- **Shapes (kept consistent):** cards and sheets 8px, buttons and inputs 6px, pills only for filter chips and status tags, circles only
  for avatars, map markers, progress rings and the switch knob.
- **Surfaces:** flat and bordered, no shadows. Glass (a light blur) is a small accent on the floating bottom navigation and the map's
  search field only, and falls back to a solid surface when blur is unsupported or reduced transparency / more contrast is requested.
- **Layout patterns:** screens use open sections (`.section`) and divided lists (`.list`, `.list-row`) rather than a card around
  everything: Home actions, station lists, product rows, rewards, leaderboard, friends, challenges and activity are all lists.
- **Images:** no decorative illustration. Product rows show a photo only if the product data has a `photo` URL; otherwise a plain "No
  photo" tile. Stations show a photo only if a contributor added one. A retailer feed would supply product photos; station photos should
  come from real contributors.
- **Avatars:** initials on one of six warm colours (no emoji).
- **Copy:** short and literal ("You logged 8 items this week"), no slogans, no emoji in labels, no environmental claims. Errors say what
  happened and what to do next.
- **Usability:** 44–48px tap targets, a dark 3px focus outline, selected/disabled/error states that don't rely on colour alone, and
  animations stop under `prefers-reduced-motion`.

## Accessibility

Large tap targets (44–48 px+), strong text contrast, visible focus rings, labelled controls, live-region toasts, and every animation
disabled under `prefers-reduced-motion`. Every dialog is one component (`Sheet` in `js/ui.js`) and is a real dialog: it has an accessible
name, moves focus into itself, keeps Tab inside, closes on Escape (topmost first; not while a submission is in progress), makes the page
behind it inert so nothing there can be reached or read, returns focus to the control that opened it, and follows the visual viewport so
the form stays above an on-screen keyboard. Tests cover the keyboard and focus behaviour; keyboards and screen readers on real phones are
on the manual checklist in [PHONE-TESTING.md](PHONE-TESTING.md).
