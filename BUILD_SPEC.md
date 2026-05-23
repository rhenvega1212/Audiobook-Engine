# Audiobook Character Voice Manager — Build Spec

> Web application for managing character-to-voice assignments across Michele Scott's audiobook catalog. Detects characters in manuscripts, casts ElevenLabs voices, and exports ElevenLabs-ready scripts.

---

## Quick start for Claude Code

You're building a Next.js web app deployed to Vercel with a Supabase backend. The team is 3-5 people. The product replaces a painful manual workflow where the user (Rhen) currently assigns every dialogue line in every audiobook by hand inside ElevenLabs Studio.

Two Python files in this directory contain a working prototype of the **character detection engine** — the algorithmic core of the app. These need to be ported to TypeScript for the Next.js app, but the algorithm is proven. Don't rewrite from scratch.

- `character_engine.py` — Rules-based first-pass attribution
- `ai_attribution.py` — Claude API second-pass for ambiguous lines

---

## Product overview

### What it does

1. User uploads a manuscript (.docx)
2. App auto-detects all characters with dialogue (line counts, sample lines, gender guess)
3. User casts each character — picks an ElevenLabs voice + style descriptor, hears voice previews in-browser
4. App remembers character→voice assignments across books (Nikki Sands appears in 5 books; cast her voice once, used everywhere)
5. App exports an ElevenLabs Studio-ready CSV with every line attributed to a voice

### Who uses it

- **Rhen** (primary user) — sets up books, casts characters, manages voice library
- **Team members (3-5)** — can upload manuscripts, review attributions, export
- All access gated behind email/password auth

### Series and characters in the system

Initial seed data:
- **Wine Lover's Mysteries** (Michele Scott) — Nikki Sands, Derek Malveaux, Isabel, Susan, Andres, Pamela, Jennifer, Blake, Marty
- **Ella McBane Mysteries** (Michele Scott) — Ella McBane + cast TBD
- **A.K. Alexander thrillers** — separate pen name, characters TBD

The app must support multiple series, multiple pen names, and character overlap within series.

---

## Architecture

### Stack

| Layer | Tech | Why |
|---|---|---|
| Frontend | Next.js 14+ (App Router) | Same as existing Murder Uncorked landing page |
| Hosting | Vercel | Already in use, team familiar |
| Database | Supabase Postgres | Free tier covers us, has built-in auth |
| Auth | Supabase Auth (email/password) | Simplest path to gated access |
| File storage | Supabase Storage | For manuscripts and exported CSVs |
| AI | Anthropic SDK (`@anthropic-ai/sdk`) | For ambiguous-line attribution |
| Voice API | ElevenLabs REST API | For voice library + voice previews |
| Styling | Tailwind CSS | Convention, fast iteration |
| Components | shadcn/ui | Drop-in component library |

### Environment variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=  # server-side only

# Anthropic (server-side only — NEVER expose)
ANTHROPIC_API_KEY=

# ElevenLabs (server-side only — NEVER expose)
ELEVENLABS_API_KEY=
```

All AI and ElevenLabs calls happen in Next.js API routes. The browser never sees these keys.

---

## Database schema

```sql
-- Pen names (Michele Scott, A.K. Alexander, etc.)
create table pen_names (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz default now()
);

-- Series within a pen name
create table series (
  id uuid primary key default gen_random_uuid(),
  pen_name_id uuid references pen_names(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz default now()
);

-- Characters scoped to a series
create table characters (
  id uuid primary key default gen_random_uuid(),
  series_id uuid references series(id) on delete cascade,
  canonical_name text not null,
  aliases text[] default '{}',
  gender text check (gender in ('male', 'female', 'unknown')) default 'unknown',
  description text,
  -- Voice assignment
  elevenlabs_voice_id text,
  elevenlabs_voice_name text,
  voice_style text,  -- "Elegant & Lovely", "Dark and Tough", etc.
  voice_notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Books in a series
create table books (
  id uuid primary key default gen_random_uuid(),
  series_id uuid references series(id) on delete cascade,
  title text not null,
  manuscript_path text,  -- Supabase Storage path
  status text check (status in (
    'uploaded', 'analyzing', 'needs_casting', 'ready_for_review',
    'reviewing', 'ready_for_export', 'exported'
  )) default 'uploaded',
  uploaded_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Tagged lines from manuscript processing
create table tagged_lines (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references books(id) on delete cascade,
  line_order int not null,
  paragraph_num int not null,
  speaker_character_id uuid references characters(id),  -- null = Narrator
  speaker_label text not null,  -- denormalized: "Narrator" or canonical name
  line_text text not null,
  confidence text check (confidence in ('high', 'medium', 'low', 'none')),
  flag_reason text,  -- null if not flagged
  ai_reviewed boolean default false,
  human_reviewed boolean default false,
  created_at timestamptz default now()
);

create index on tagged_lines (book_id, line_order);

-- Character appearances per book (so we know which characters are IN which book)
create table book_characters (
  book_id uuid references books(id) on delete cascade,
  character_id uuid references characters(id) on delete cascade,
  line_count int default 0,
  primary key (book_id, character_id)
);

-- Audit log for character casting changes
create table casting_history (
  id uuid primary key default gen_random_uuid(),
  character_id uuid references characters(id) on delete cascade,
  changed_by uuid references auth.users(id),
  old_voice_id text,
  new_voice_id text,
  old_voice_name text,
  new_voice_name text,
  changed_at timestamptz default now()
);
```

### RLS (Row Level Security)

All tables: authenticated users have full read/write access. We're not multi-tenant — every team member can see everything. Don't over-engineer this.

---

## Screens (v1 — build all 8)

### 1. Login

- Supabase Auth UI, email/password only
- Redirect to `/dashboard` on success
- No signup form — Rhen creates accounts manually via Supabase dashboard

### 2. Dashboard (`/dashboard`)

- Header: app title, current user, logout
- Top section: "Books" table
  - Columns: Title | Series | Status | Last updated
  - Status badges colored: gray (uploaded), yellow (needs_casting / reviewing), green (ready_for_export / exported)
  - Click row → book detail view
- Primary button: "+ New Book"
- Secondary nav links: "Character Library" | "Voice Library"

### 3. New Book / Upload (`/books/new`)

- Pen name dropdown (or "+ new pen name" inline)
- Series dropdown (filtered by pen name, or "+ new series" inline)
- Title input
- File drop zone: accepts `.docx`
- Submit → uploads to Supabase Storage, creates `books` row with status `uploaded`, kicks off analysis (see API routes below), redirects to `/books/[id]`

### 4. Book Detail / Character Discovery (`/books/[id]`)

This is where the magic happens. After upload, the analysis runs (showing a progress state). When complete:

- Top section: book metadata + status
- "Detected Characters" table:
  - Character name | Line count | Sample dialogue (first 3 lines, truncated) | Match status | Action
  - Match status badge:
    - ✅ "Cast" (matches existing character in series with voice assigned)
    - ⚠️ "Needs voice" (matches existing character, no voice yet)
    - 🆕 "New character" (no match in series)
    - ❓ "Possible alias" (fuzzy match against existing — e.g. "Mr. Malveaux" → suggests Derek Malveaux)
  - Action button: "Cast voice" / "Confirm as [X]" / "Add as alias of [X]"
- Below: "Flagged lines" count with link to review screen
- Right sidebar: "Export" button (disabled until status = `ready_for_export`)

### 5. Voice Picker Modal

Opens when user clicks "Cast voice" for a character.

- Top: character name + 3 sample lines from the manuscript
- Voice library list (fetched from ElevenLabs API):
  - Voice name | Gender | Accent | Age | Description
  - "Play sample" button → calls ElevenLabs to generate ~20 sec of THIS character's actual dialogue in that voice (cached after first generation per voice+character)
  - Filters: gender, accent, age
- Selected voice → "Style descriptor" input (free text, e.g. "Elegant & Lovely")
- "Save" button → updates character record, closes modal

### 6. Line Review (`/books/[id]/review`)

For reviewing flagged lines.

- Top: progress indicator (e.g. "23 of 47 reviewed")
- Card view, one flagged line at a time:
  - Show 3 lines of context above and below
  - Highlight the line being reviewed
  - Current attribution (with reason it was flagged)
  - Dropdown to select speaker (defaults to current guess)
  - Buttons: "Confirm" (keyboard shortcut Enter) / "Skip" (S) / "Use AI suggestion" (A)
- "AI suggestion" button calls Claude API on that line with full scene context and updates the dropdown with the result
- Auto-advances to next flagged line after confirm
- "Mark all unreviewed as confirmed" button at bottom (for power users)

### 7. Export (`/books/[id]/export`)

- Preview table of final attributed lines (speaker | voice | line)
- "Generate CSV" button → produces ElevenLabs Studio-compatible CSV
- Download link + "Copy import instructions" tooltip
- "Mark as exported" button → updates book status

### 8. Character Library (`/characters`)

Master list across all books/series.

- Filters: pen name | series
- Table: Character | Series | Voice | Style | Line count (across all books) | Books appearing in
- Click row → character detail / edit view
- Editing voice here updates the character globally (changing Nikki's voice updates her in every book)
- Casting history log at the bottom of the detail view

---

## API routes (Next.js App Router)

```
POST   /api/books                          Create book, queue analysis
GET    /api/books                          List all books
GET    /api/books/[id]                     Get book + tagged lines + detected characters
POST   /api/books/[id]/analyze             Run rules engine on manuscript
POST   /api/books/[id]/ai-review           Run Claude API pass on flagged lines
GET    /api/books/[id]/export              Generate CSV download
POST   /api/books/[id]/lines/[lineId]      Update a single line's attribution

GET    /api/characters                     List all characters
POST   /api/characters                     Create character
PATCH  /api/characters/[id]                Update character (incl. voice assignment)
GET    /api/characters/[id]/history        Casting history

GET    /api/voices                         List ElevenLabs voices (proxied)
POST   /api/voices/preview                 Generate voice preview (text + voice_id → audio)

GET    /api/series                         List series
POST   /api/series                         Create series

GET    /api/pen-names                      List pen names
POST   /api/pen-names                      Create pen name
```

### Critical: analysis pipeline

`POST /api/books/[id]/analyze` is the most important endpoint. It:

1. Downloads the manuscript .docx from Supabase Storage
2. Extracts text (use `mammoth` npm package — it handles .docx → text well)
3. Loads the character roster for the book's series (from `characters` table)
4. Runs the **rules engine** (TypeScript port of `character_engine.py`)
5. Inserts tagged lines into `tagged_lines` table
6. Updates `book_characters` table with line counts
7. Detects new (unknown) characters and creates placeholder entries with `needs_casting` flag
8. Updates book status to `needs_casting` or `ready_for_review` if all characters are cast
9. Returns analysis summary to the client

`POST /api/books/[id]/ai-review` runs the second-pass attribution:

1. Loads all flagged lines for the book
2. Groups them into scenes (see `ai_attribution.py`)
3. For each scene with flagged lines, builds the prompt and calls Claude
4. Updates each flagged line with the AI-resolved speaker + sets `ai_reviewed = true`
5. Returns count of lines updated

---

## ElevenLabs CSV format

The export needs to match ElevenLabs Studio's "Import Script" format:

```csv
Speaker,Line
Narrator,"The morning sun filtered through the vineyard mist..."
Derek Malveaux,"You're up early."
Narrator,"Not looking up from his task."
Nikki Sands,"Couldn't sleep."
```

Speaker column = character's canonical name (must match a Speaker name configured in the ElevenLabs project). The user's workflow:

1. In ElevenLabs Studio, create speakers manually with the canonical names matching our characters
2. Assign voices to each speaker (using the voice IDs we've stored)
3. Import our CSV — ElevenLabs auto-routes lines to the correct speaker

**Optional future enhancement:** Use the ElevenLabs API to programmatically create the project + speakers + import the script, eliminating the manual step. Out of scope for v1.

---

## Porting the Python engine to TypeScript

The algorithm in `character_engine.py` should port cleanly. Key things to preserve:

1. **The regex patterns** (`DIALOGUE_RE`, `NAME_RE`, `DIALOGUE_TAG_START_RE`) — these are tuned, don't change them
2. **The dialogue verbs and pronoun sets** — port as-is
3. **The `last_named_speakers` and `conversation_participants` tracking** — these are how scene context is maintained
4. **The `strip_dialogue_tag` and `clean_dialogue_line` helpers** — these clean output for ElevenLabs

Suggested file structure:

```
/lib/engine/
  types.ts           // Character, TaggedLine interfaces
  rules-engine.ts    // Port of character_engine.py
  ai-attribution.ts  // Port of ai_attribution.py
  vocabulary.ts      // DIALOGUE_VERBS, PRONOUNS, etc.
  regex.ts           // Shared regex constants
```

Then `app/api/books/[id]/analyze/route.ts` imports from `lib/engine/`.

---

## Known limitations of the v1 engine (document these for the team)

1. **Internal thoughts in italics** are currently treated as narrator. If Michele wants character-voice internal monologue, that's a future enhancement.
2. **Scene-break detection** is heuristic (3+ consecutive narrator lines or chapter heading). Some scene transitions inside chapters won't trigger a reset; the AI pass should handle these.
3. **First-time pronoun-only attribution** with no prior named speaker defaults to "UNKNOWN" and gets flagged.
4. **Crowd scenes** (5+ active speakers) will have more flagged lines than 2-person scenes. Expected.
5. **Character name collisions across series** are not handled — if a "Sarah" exists in two different series, they're separate character records. Voice assignments don't bleed across series.

---

## Build order (suggested)

If you're using Claude Code to build this, here's the order that minimizes blockers:

1. **Auth + database setup** — Supabase project, schema, RLS, login page
2. **Pen names + series CRUD** — simplest screens, builds confidence
3. **Character Library** — read-only view first, then add edit capability
4. **Manuscript upload** — get files into storage
5. **Port the rules engine to TypeScript** — biggest single task, but isolated
6. **Book Detail / Character Discovery screen** — wire everything together
7. **Voice Picker modal + ElevenLabs API integration** — needs API key
8. **Line Review screen** — depends on rules engine working
9. **AI attribution endpoint** — needs Anthropic API key
10. **Export screen** — last, since it depends on everything else

---

## Getting the ElevenLabs API key

1. Log into the ElevenLabs account Michele uses
2. Click profile icon (top right) → "Profile + API Key"
3. Copy the API key from the API Key field
4. Add it to your local `.env.local` and to Vercel environment variables (Settings → Environment Variables)

Required ElevenLabs subscription tier: any paid plan that includes API access (Creator tier is sufficient for development; Pro or higher recommended for production audiobook generation due to character allowance).

---

## Getting the Anthropic API key

1. Go to https://console.anthropic.com
2. Settings → API Keys → "Create Key"
3. Add to `.env.local` and Vercel env vars as `ANTHROPIC_API_KEY`
4. Set a usage budget in console to avoid surprises (the AI attribution pass is cheap — likely under $1 per book — but set a monthly cap anyway)

Use the model string `claude-opus-4-5` or `claude-sonnet-4-6` for attribution calls. Sonnet is fine for this task and is cheaper.

---

## Notes from Rhen / business context

- Michele has 40+ books; this tool's lifetime value is high
- *Murder by the Glass* is the first book to process (already partially voice-cast)
- Voice assignments already locked in for Wine Lover's Mysteries — seed the database with these on first run:

| Character | Voice | Style |
|---|---|---|
| Narrator | Bella | Professional, Bright, Warm |
| Nikki Sands | Eliza | Elegant & Lovely |
| Derek Malveaux | Adam | Dark and Tough |
| Isabel | Vega | Warm English Female |
| Susan | Janet | (default) |
| Andres | Andres | (default) |
| Pamela | Cameo | (default) |
| Jennifer | Brittany | (default) |
| Blake | Kel | (default) |
| Marty | Adam | Dominant, Firm |

Note that Derek and Marty both use Adam with different style descriptors — the system must allow the same `elevenlabs_voice_id` on multiple characters with different `voice_style` values.

---

## Future enhancements (NOT in v1)

- Programmatic ElevenLabs project creation (skip the manual import step)
- Audio generation directly from the app (currently the user generates audio in ElevenLabs after import)
- Multi-language support (Michele's books are English-only currently)
- Pronunciation dictionary management per series
- Character relationship graphs (visualize who talks to whom)
- Bulk re-attribution when a character's voice changes mid-series

---

## Definition of done for v1

- [ ] Auth works; only invited team members can log in
- [ ] Rhen can upload a .docx and see detected characters within 30 seconds
- [ ] Voice picker plays previews using the character's actual dialogue
- [ ] Casting a character once persists across all books in that series
- [ ] Flagged lines are reviewable with keyboard shortcuts
- [ ] AI attribution endpoint reduces flagged lines by 70%+ on test manuscripts
- [ ] Export produces a CSV that imports cleanly into ElevenLabs Studio
- [ ] Character Library shows all characters across all books with global edit
- [ ] Deployed to Vercel with all env vars configured

---

*End of spec. Engine prototypes in `character_engine.py` and `ai_attribution.py`.*
