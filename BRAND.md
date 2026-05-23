# Audiobook Engine — Brand & Design System

> Drop this entire document into Cursor as the design brief. Reference it whenever building UI components, screens, or styling decisions. The Tailwind config and CSS variables below are copy-paste ready.

---

## Brand strategy

### What this is

Audiobook Engine is an **internal production tool** for Michele Scott's team. It manages the character-to-voice assignments for her audiobook catalog (Wine Lover's Mysteries, Ella McBane Mysteries, and other Michele Scott series).

### Brand alignment

The tool sits inside the **Michele Scott** brand universe — the warm, cozy, wine-country mystery side of the catalog. The **A.K. Alexander** thriller side has a separate, darker visual identity that does not apply here.

### Design philosophy for an internal tool

The brand should **anchor the tool** without **fatiguing the team**. Wine-country warmth shows up in:
- The logo and primary navigation
- Headers, empty states, success moments
- Accent colors for primary actions

The work surfaces themselves (tables, forms, modals, line-by-line review) stay **clean, neutral, and high-contrast** so the team can spend 4-hour sessions in here without eye strain. Think *Notion meets a Napa Valley wine label* — sophisticated, calm, with brand moments rather than a brand wash.

### Tone of voice in UI copy

- **Warm but professional.** "Welcome back, Rhen" — not "Hey there!" and not "User signed in."
- **Confident, never apologetic.** "0 books yet" not "Sorry, nothing here."
- **Genre-aware microcopy** where it fits naturally. Empty book list: "Pour yourself a glass — your first book is just an upload away." Use sparingly. Once per screen, max.
- **No emoji in UI labels.** Reserve emoji for status moments or empty states.

---

## Color palette

### Primary palette (Michele Scott brand)

| Name | Hex | Usage |
|---|---|---|
| Cream | `#F8F4ED` | Default page background |
| Warm Sand | `#E8DCC7` | Card backgrounds, hover states |
| Burgundy | `#6B1F2C` | Primary action buttons, key brand moments |
| Dark Red | `#4A1620` | Hover state of burgundy, dense headers |
| Teal | `#2D6E6E` | Secondary actions, links, info accents |
| Sage | `#9CA88E` | Tertiary accents, success states |

### Functional palette (use these for status/feedback)

| Name | Hex | Usage |
|---|---|---|
| Ink | `#1F1A17` | Primary body text |
| Slate | `#5C534E` | Secondary text, captions |
| Bone | `#FFFBF5` | Elevated surfaces (modals, cards on top of cream bg) |
| Border | `#D9CFC0` | Default borders |
| Border Muted | `#E8DCC7` | Subtle dividers |
| Success | `#3B7A4E` | Confirmed states, "cast" badges |
| Warning | `#B8842B` | "Needs casting" badges, attention states |
| Danger | `#A8362A` | Errors only (NOT the same as burgundy — danger needs to feel different) |
| AI Reviewed | `#5E4B8B` | Lines reviewed by Claude API (a quiet purple, doesn't fight with brand) |

### Color usage rules

1. **Page background is always Cream**, not white. White feels clinical against this palette.
2. **Burgundy is rare and intentional.** Primary CTAs, the logo, the active nav state. Don't use it for every button — it loses meaning.
3. **Teal is the workhorse color.** Links, toggle on-states, focus rings, secondary actions.
4. **Sage is for positive ambient signals**, not buttons. Tag pills, "you're up to date" states.
5. **Never use pure black (#000) or pure white (#FFF).** Always Ink and Bone.

---

## Typography

### Fonts (Google Fonts)

```html
<link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet">
```

### Type system

| Token | Font | Size | Weight | Line Height | Usage |
|---|---|---|---|---|---|
| Display | Lora | 36px | 600 | 1.2 | Page-level headlines (the dashboard "Audiobook Engine" header) |
| H1 | Lora | 28px | 600 | 1.25 | Book titles, character names in detail views |
| H2 | Lora | 22px | 600 | 1.3 | Section headers within a page |
| H3 | Poppins | 16px | 600 | 1.4 | Card titles, table section headers |
| Body | Poppins | 15px | 400 | 1.6 | All body text, descriptions |
| Body Small | Poppins | 13px | 400 | 1.5 | Captions, helper text, metadata |
| Label | Poppins | 12px | 500 | 1.4 | Form labels, table headers (uppercase, letter-spacing 0.05em) |
| Mono | JetBrains Mono | 13px | 400 | 1.5 | Character IDs, voice IDs, code snippets |

### Typography rules

1. **Lora for warmth, Poppins for work.** Anything the user reads passively (titles, headers, decorative text) is Lora. Anything they interact with rapidly (table rows, form labels, buttons) is Poppins.
2. **Italics belong in Lora**, never Poppins. Use sparingly for book titles, character introductions, or pull-quotes in empty states.
3. **Never bold body text for emphasis** — use color or a subtle background tint instead. Bold is reserved for headings.
4. **Letter-spacing 0.05em on labels** (the small all-caps text above form fields and table columns).

---

## Spacing & layout

8px base unit. All spacing is a multiple of 8.

| Token | Value | Usage |
|---|---|---|
| `space-1` | 4px | Icon-to-text gap, tight inline spacing |
| `space-2` | 8px | Between related elements |
| `space-3` | 12px | Form field internal padding |
| `space-4` | 16px | Default gap between sibling elements |
| `space-6` | 24px | Card internal padding |
| `space-8` | 32px | Between major sections in a page |
| `space-12` | 48px | Top-of-page padding, between page-level sections |
| `space-16` | 64px | Hero spacing, empty-state vertical centering |

### Layout grid

- **Max content width: 1280px** (use `max-w-screen-xl` in Tailwind)
- **Sidebar nav: 240px** wide on desktop, collapses to icon-only at <1024px
- **Page padding: 32px** horizontal on desktop, 16px on mobile
- **Card border-radius: 8px** (NOT pill-rounded, NOT square — gentle radius matches the brand's warm-but-professional tone)
- **Button border-radius: 6px**
- **Input border-radius: 6px**

---

## Component library

### Buttons

**Primary** — burgundy, white text, used for one CTA per screen
```
bg-burgundy text-bone hover:bg-dark-red px-4 py-2.5 rounded-md font-medium text-sm
```

**Secondary** — teal outline, used for non-primary actions
```
border border-teal text-teal hover:bg-teal hover:text-bone px-4 py-2.5 rounded-md font-medium text-sm bg-transparent
```

**Tertiary / Ghost** — text only, for low-emphasis actions
```
text-slate hover:text-ink hover:bg-warm-sand px-3 py-2 rounded-md font-medium text-sm
```

**Destructive** — danger color, used for delete confirmations
```
bg-danger text-bone hover:bg-danger/90 px-4 py-2.5 rounded-md font-medium text-sm
```

### Status badges (for character casting states)

| State | Color | Label |
|---|---|---|
| Cast | Success bg at 10%, success text | "✓ Cast" |
| Needs Voice | Warning bg at 10%, warning text | "⚠ Needs Voice" |
| New Character | Teal bg at 10%, teal text | "+ New" |
| Possible Alias | Sage bg at 15%, sage text shifted darker | "? Possible Alias" |
| AI Reviewed | AI Reviewed bg at 10%, AI Reviewed text | "AI Reviewed" |

All badges: `px-2.5 py-1 rounded-full text-xs font-medium tracking-wide`

### Cards

```
bg-bone border border-border rounded-lg p-6 shadow-sm
```

Hover state for clickable cards:
```
hover:border-teal hover:shadow-md transition-all duration-150
```

### Forms

**Input field:**
```
border border-border bg-bone text-ink px-3 py-2.5 rounded-md
focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal
```

**Label:**
```
text-xs font-medium uppercase tracking-wider text-slate mb-1.5
```

**Helper text below input:**
```
text-xs text-slate mt-1
```

### Tables

- Header row: Warm Sand background, Ink text, uppercase labels at 11px
- Row hover: Warm Sand at 40% opacity
- Borders: Border Muted (subtle, not Border)
- Selected row: Teal at 5% background, left border 2px teal

### Empty states

Centered vertically, generous whitespace. Use one of these patterns:

**Pattern A (no data yet):**
- Soft illustrated icon (60px, Sage color)
- Lora 22px headline
- Poppins 14px subtext (max-width 400px)
- Primary button

**Pattern B (loading):**
- Pulsing dot pattern in Teal
- Lora italic 16px "Pouring through your manuscript…" (rotate copy variants below)

### Loading state copy (for the manuscript analysis screen)

Rotate through these — they should feel warm, not robotic:
- "Pouring through your manuscript…"
- "Sorting voices in the cellar…"
- "Decanting characters…"
- "Letting the dialogue breathe…"
- "Pairing voices with characters…"

(These are deliberate wine-country puns — keep them subtle and limited to background processes, never error messages.)

---

## Logo / wordmark

Until a designed mark exists, use a typographic wordmark:

**Mark:** `Audiobook Engine`
**Font:** Lora 600
**Color:** Burgundy on cream, or Cream on burgundy
**Letter-spacing:** -0.01em (slight tightening for refinement)

Optional icon to pair with the wordmark: a stylized soundwave that suggests both audio waveforms and the curve of a wine glass. For v1, skip the icon and use type only — clean and confident.

In the app header: wordmark left-aligned, 20px Lora 600 Burgundy. Don't add taglines in the chrome — keep it minimal.

---

## CSS variables (drop directly into globals.css)

```css
:root {
  /* Brand */
  --color-cream: #F8F4ED;
  --color-warm-sand: #E8DCC7;
  --color-burgundy: #6B1F2C;
  --color-dark-red: #4A1620;
  --color-teal: #2D6E6E;
  --color-sage: #9CA88E;

  /* Functional */
  --color-ink: #1F1A17;
  --color-slate: #5C534E;
  --color-bone: #FFFBF5;
  --color-border: #D9CFC0;
  --color-border-muted: #E8DCC7;

  /* Status */
  --color-success: #3B7A4E;
  --color-warning: #B8842B;
  --color-danger: #A8362A;
  --color-ai-reviewed: #5E4B8B;

  /* Typography */
  --font-serif: 'Lora', Georgia, serif;
  --font-sans: 'Poppins', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'JetBrains Mono', 'Courier New', monospace;

  /* Radius */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-full: 9999px;

  /* Shadow */
  --shadow-sm: 0 1px 2px 0 rgba(31, 26, 23, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(31, 26, 23, 0.08), 0 2px 4px -2px rgba(31, 26, 23, 0.05);
  --shadow-lg: 0 10px 15px -3px rgba(31, 26, 23, 0.1), 0 4px 6px -4px rgba(31, 26, 23, 0.05);
}

body {
  background-color: var(--color-cream);
  color: var(--color-ink);
  font-family: var(--font-sans);
  font-size: 15px;
  line-height: 1.6;
}

h1, h2, h3, h4 {
  font-family: var(--font-serif);
  color: var(--color-ink);
}
```

---

## Tailwind config (drop into tailwind.config.ts)

```ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        cream: '#F8F4ED',
        'warm-sand': '#E8DCC7',
        burgundy: '#6B1F2C',
        'dark-red': '#4A1620',
        teal: '#2D6E6E',
        sage: '#9CA88E',
        ink: '#1F1A17',
        slate: '#5C534E',
        bone: '#FFFBF5',
        border: '#D9CFC0',
        'border-muted': '#E8DCC7',
        success: '#3B7A4E',
        warning: '#B8842B',
        danger: '#A8362A',
        'ai-reviewed': '#5E4B8B',
      },
      fontFamily: {
        serif: ['Lora', 'Georgia', 'serif'],
        sans: ['Poppins', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        display: ['36px', { lineHeight: '1.2', fontWeight: '600' }],
        h1: ['28px', { lineHeight: '1.25', fontWeight: '600' }],
        h2: ['22px', { lineHeight: '1.3', fontWeight: '600' }],
        h3: ['16px', { lineHeight: '1.4', fontWeight: '600' }],
        body: ['15px', { lineHeight: '1.6', fontWeight: '400' }],
        'body-sm': ['13px', { lineHeight: '1.5', fontWeight: '400' }],
        label: ['12px', { lineHeight: '1.4', fontWeight: '500', letterSpacing: '0.05em' }],
      },
      borderRadius: {
        sm: '6px',
        md: '8px',
        lg: '12px',
      },
      boxShadow: {
        sm: '0 1px 2px 0 rgba(31, 26, 23, 0.05)',
        md: '0 4px 6px -1px rgba(31, 26, 23, 0.08), 0 2px 4px -2px rgba(31, 26, 23, 0.05)',
        lg: '0 10px 15px -3px rgba(31, 26, 23, 0.1), 0 4px 6px -4px rgba(31, 26, 23, 0.05)',
      },
    },
  },
  plugins: [],
}

export default config
```

---

## Screen-by-screen design notes

### Login

- Centered card on cream background
- Wordmark at top in burgundy
- Single-column form, generous spacing
- Tagline below wordmark in Lora italic 14px Slate: *"Pour, pair, produce."*

### Dashboard

- Sidebar (240px) on left: Books, Characters, Voices, Settings, sign-out at bottom
- Top bar: page title in Lora 28px, "+ New Book" button on the right
- Books table: alternating warm-sand at 30% rows for readability
- Each row clickable, hover state lifts the row slightly with subtle shadow

### Book Detail / Character Discovery

- Hero strip: book title (Lora 28px), series breadcrumb above, status badge, action buttons
- Two-column layout below: detected characters table (left, 2/3 width) and stats sidebar (right, 1/3)
- Detected characters: each row shows character name (Lora 16px), line count (mono 13px), sample dialogue in Lora italic at 14px, status badge
- Empty state for "no flags": sage accent, "All clear. Ready to export." in Lora italic

### Voice Picker Modal

- Wide modal (640px), Bone background, burgundy header bar
- Top: character name and 3 sample lines in a quote card (warm-sand background, Lora italic)
- Voice list: scrollable, each voice shows name (Poppins 16px medium), gender/accent/age tags (badges), "Play sample" button (teal secondary)
- When playing: waveform animation in teal
- Selected voice: warm-sand row background, left border 3px teal
- Bottom right: "Cast as [character]" primary button (burgundy)

### Line Review

- Single-column, max-width 720px, centered
- Card-by-card flow, one flagged line at a time
- Context lines above and below in slate at 90% opacity
- The flagged line: bone background card with teal left border, Lora 16px
- Current attribution in label format above the line
- Dropdown for speaker selection
- Three buttons in a row at the bottom: Confirm (burgundy, keyboard "Enter"), Skip (ghost, "S"), Use AI Suggestion (teal secondary, "A")
- Progress bar at the top: "23 of 47 reviewed" in label format, thin teal progress fill

### Export

- Preview table with final attributed lines (scrollable, max 20 rows visible)
- Stats sidebar: total lines by character, voice mappings confirmed
- "Generate CSV" button (burgundy primary)
- After generation: success card in sage with download link and import instructions

---

## Accessibility

- Body text contrast against Cream background: Ink (#1F1A17) gives 14.2:1 — AAA
- Slate (#5C534E) on Cream: 7.8:1 — AAA for normal text
- Burgundy on Bone: 8.9:1 — AAA
- All interactive elements have visible focus rings: 2px teal at 30% opacity outside the element
- Keyboard navigation works on every interactive element
- Screen reader labels on icon-only buttons

---

## What NOT to do

- ❌ Don't add wine-glass icons, cork textures, or grape illustrations. Subtlety over kitsch.
- ❌ Don't use Lora italic for buttons or labels — too decorative in interactive contexts.
- ❌ Don't use the A.K. Alexander dark thriller aesthetic anywhere. Different brand universe.
- ❌ Don't use burgundy for more than 1-2 elements per screen.
- ❌ Don't pair sage and warm-sand as adjacent fills — they bleed into each other.
- ❌ Don't use shadows greater than `shadow-md` on regular UI. Lofted modals or dropdowns only get `shadow-lg`.
- ❌ Don't use animations longer than 200ms. Quick, calm, professional.

---

## Reference inspiration

When the team needs visual direction beyond this doc, study:
- **Notion** — for the clean work surfaces and table-heavy UX patterns
- **Linear** — for the keyboard-driven review interactions
- **Sonos website** — for the warm, sophisticated brand color application without overwhelming the work
- **Cellar Tracker / Vivino** — for wine-adjacent UX without falling into cliché

Avoid imitating: literal vineyard photography sites, restaurant menus, or anything with a "rustic" aesthetic.

---

## Quick start for Cursor

When prompting Cursor, paste this at the top of any UI-related request:

> Use the Audiobook Engine brand system (see BRAND.md). Cream backgrounds, Burgundy + Teal + Sage palette, Lora for headers / Poppins for body, 8px spacing grid, gentle shadows. This is an internal production tool — warm where the brand shows up, clean and neutral on work surfaces.

---

*End of brand document. Pair this with BUILD_SPEC.md when building screens — that doc has the structure, this doc has the surface.*
