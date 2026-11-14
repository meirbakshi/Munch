---
name: munch-design
description: Apple Human Interface Guidelines for מאנץ׳ (munch-app/), the user's Hebrew calorie tracker that runs on their iPhone 17 Pro. Use it before ANY change to how the app looks or feels — layout, colors, type, components, icons, motion, copy, a new screen or control, or a design-polish pass — and to review the app's look against Apple's standards.
---

# מאנץ׳ design: Apple guidelines, applied

The app is used **only on the owner's iPhone 17 Pro** (402 × 874 pt, Dynamic Island, home indicator), from the Home Screen, in **Hebrew, right to left**, in light and dark mode. It should feel like an app Apple shipped: quiet, clear, consistent with iOS. When a choice is unclear, do what the iOS Settings, Health and Fitness apps do.

Everything visual lives in `munch-app/src/styles.css` (tokens at the top) and the components in `munch-app/src/ui.jsx`. Change tokens, not one-off values.

## The user's standing preferences (they override everything below)
- All UI text is Hebrew. Short, plain, friendly. Buttons say what happens ("שמירה ביומן", not "אישור").
- Charts run **left to right in time** (oldest left, newest right), even though the page is RTL.
- The food-log review opens as a **sheet (pop-up)**, with an adjustment text box inside it.
- Simple and elegant beats clever. No decoration that carries no information. No emoji in the UI.

## 1. Layout
- **8-pt grid.** Spacing is 4, 8, 12, 16, 20, 24, 32. Side margins are 16 pt (inset grouped lists use 16 pt outside and 16 pt inside).
- **Safe areas.** The content clears the Dynamic Island and the home indicator: the top uses `env(safe-area-inset-top)` and fixed bars add `env(safe-area-inset-bottom)`. Never put a control within 8 pt of the screen's corners.
- **Touch targets** are at least 44 × 44 pt, even when the visible glyph is smaller.
- **Navigation.** There's one tab bar with 3 tabs (49 pt plus the bottom inset) on a translucent material, with an icon above a 10-pt label. The selected tab uses the tint, and the others use secondary label color. Never hide the tab bar except in sheets.
- **Page header.** A large title (34 pt bold) scrolls with the content. Put controls in a 44-pt row above it (iOS puts nav-bar buttons there).
- **Grouped lists** are the default container. Cells are at least 44 pt tall with a 10–12 pt radius on the group. Separators are 0.5 pt and inset from the leading edge (the right edge in RTL). Section headers are 13 pt in secondary color, and footers are 13 pt in secondary color under the group.
- **Hierarchy comes from grouping and type, not boxes.** Don't put cards inside cards, and don't put shadows on list content. Use a shadow only on floating elements (a segmented control's thumb, a toast, a popover).

## 2. Typography (SF Pro / SF Hebrew through the system font)
Use the iOS text styles at their default Dynamic Type sizes. Don't invent sizes in between.

| Style | Size / line height | Weight | Use |
|---|---|---|---|
| Large Title | 34 / 41 | Bold | page title |
| Title 1 | 28 / 34 | Regular–Bold | hero numbers |
| Title 2 | 22 / 28 | Bold | big stats |
| Title 3 | 20 / 25 | Semibold | section titles |
| Headline | 17 / 22 | Semibold | emphasized row text |
| Body | 17 / 22 | Regular | rows, inputs |
| Callout | 16 / 21 | Regular | secondary blocks |
| Subheadline | 15 / 20 | Regular | secondary row text |
| Footnote | 13 / 18 | Regular | section headers and footers, metadata |
| Caption 1 / 2 | 12 / 16, 11 / 13 | Regular | chart labels, badges |

- **Numbers:** always `font-variant-numeric: tabular-nums`. Big hero numbers (the calories left) use the rounded face: `font-family: ui-rounded, -apple-system, ...`, as Health and Fitness do.
- **Weights:** use at most 3 in one view (Regular, Semibold, Bold). Never use Light for small text.
- **Color:** text uses label, secondaryLabel or tertiaryLabel, never the tint, except for links and controls.
- **Fallback:** keep `Heebo` (Google Fonts) as the fallback for non-Apple screens.

## 3. Color
Use the iOS system colors with their exact light/dark pairs. Everything comes from a token, and dark values are defined in both dark blocks (`prefers-color-scheme` and `[data-theme="dark"]`).

| Token | Light | Dark |
|---|---|---|
| groupedBackground | #F2F2F7 | #000000 |
| secondaryGroupedBackground (cells) | #FFFFFF | #1C1C1E |
| tertiary (fills in cells) | #F2F2F7 | #2C2C2E |
| label / secondary / tertiary | #000 / 3C3C43 @60% / 3C3C43 @30% | #FFF / EBEBF5 @60% / EBEBF5 @30% |
| separator | 3C3C43 @29% | 545458 @60% |
| systemGreen | #34C759 (text on light: #248A3D) | #30D158 |
| systemRed | #FF3B30 (text: #D70015) | #FF453A |
| systemOrange | #FF9500 (text: #C93400) | #FF9F0A |
| systemBlue | #007AFF | #0A84FF |

- **One tint** (green) for every interactive element: links, the selected tab, filled buttons, the ring.
- **Semantic color** is separate from the tint. Over target is systemRed, and on track is systemGreen. Never show state by color alone: pair it with a sign (+/−) or a word.
- **The macro colors** (carbs, protein, fat, fiber) are a fixed categorical set. Keep their order and their hues, and never reuse them for anything else.
- **Contrast:** at least 4.5:1 for text and at least 3:1 for chart marks against the cell color. Check both themes.

## 4. Components
- **Buttons.** Filled (tint background) is for the one primary action per screen. Tinted (tint at 12–16%) is for secondary actions, gray fill is for neutral ones, and plain text in the tint is for nav-row actions. Large buttons are 50 pt tall with a 12-pt radius, and small ones are 34 pt tall in capsule shape. A pressed state shows 0.7 opacity; disabled is 0.3–0.4.
- **Segmented control** (up to 4 segments): a 32-pt track on a fill, with a white or #636366 thumb and a soft shadow. Use 13-pt labels, Semibold when selected.
- **Sheets.** They rise from the bottom with a grabber (36 × 5) and a 10–14 pt top radius. The header row has Cancel (plain) at the start and the confirming action (Semibold) at the end, with the title centered at 17 pt Semibold. Behind the sheet is a 35% black scrim. Closing a sheet that holds unsaved work asks for confirmation in another sheet, never with `confirm()`.
- **List rows** that open something end with a chevron. In RTL the chevron points LEFT; it is tertiary label color at 14 pt. Destructive actions are red text or red tinted buttons at the bottom of a sheet, never the first thing.
- **Inputs.** Inline inputs in cells are end-aligned, in secondary color, with a unit label after them. Stand-alone fields are 44 pt tall with a 10-pt radius on the cell color and a tint focus ring.
- **Icons** are SF Symbols-style: 1.8–2 pt stroke, rounded caps and joins, a 24-pt canvas for tabs and 17–18 pt in rows. Directional icons mirror in RTL. Clocks, check marks and media icons don't.
- **Rings and progress** follow the Fitness ring style: a round cap, a track at 12–15% fill opacity, and overflow drawn in red over the track.
- **Empty states** are centered text in secondary color that says what will appear and how to add the first item.
- **Toasts** are short-lived, appear above the tab bar, use inverted label/background colors, and run one line.

## 5. Charts (Swift Charts look)
- Use a recessive grid (0.5 pt, separator color) with axis labels at 11–12 pt in secondary color. Y labels go on the trailing side.
- Bars are thin with a 4-pt rounded top and anchored to the baseline. Lines are 2 pt with rounded joins. Points are 7–8 pt with a 2-pt ring in the cell color.
- One highlight on touch: a vertical rule plus a small popover (cell color, 10-pt radius, soft shadow).
- Time runs left to right. Show 4–6 date labels at most.
- A legend whenever there are 2 or more series.

## 6. Motion and feedback
- Use spring-like easing (`cubic-bezier(0.2, 0.9, 0.3, 1)`), 200–350 ms. Sheets slide up, scrims fade, and the ring animates its fill.
- Respect `prefers-reduced-motion`: no slides, keep the fades short.
- Every action gives visible feedback: a pressed state, then a toast or an inline change. Long work shows a spinner, a line of what's happening, and a Stop button.

## 7. RTL details
- The page is `dir="rtl"`. Use logical properties (`inset-inline-start`, `margin-inline-end`, `padding-inline`) for anything that depends on side.
- Signed numbers and mixed Hebrew/number strings need `dir="ltr"` on the number span, or "−230" renders as "230−".
- "Back/earlier" points right and "forward/later" points left.

## Working method
1. Read this skill and the current `styles.css` tokens before changing anything.
2. Change tokens and shared components first, then screens. Keep the three screens consistent.
3. Build (`cd munch-app && npm run build`) and look at it ONCE in Playwright at 402 × 874, in light and dark, on the Daily, Progress and Settings pages plus one open sheet. Use a mock `window.claude` with a `db` (see the README) and real-looking data. Fix what you see, then publish to the same artifact URL.
4. Never change the data format in a design pass. The user's data lives in the artifact database.
5. Commit the source to the repo after publishing.

## Pre-publish checklist
- [ ] Every tap target is at least 44 pt, and nothing sits under the Dynamic Island or the home indicator
- [ ] Only the iOS type sizes from the table are used, numbers are tabular, and there are at most 3 weights per view
- [ ] Every color is a token, dark mode is checked, and contrast is OK
- [ ] One filled button per screen, and destructive actions are red and last
- [ ] Chevrons point left, signed numbers display correctly, and charts run left to right
- [ ] Hebrew copy is short, with verbs on buttons and no emoji
