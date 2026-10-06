# Specs house style

This file defines the visual system, document topology, and editorial rules for static HTML specs, PRDs, review sites, and technical walkthroughs. If your environment provides a `references/deploy.md` file with a live reference URL, inspect that reference when network access is available; otherwise treat this document as the complete specification. Adapt patterns to the document instead of copying irrelevant sections.

## Reader contract

A visitor must understand the subject, current state, principal decision, and next step before reaching the detailed evidence.

- Lead with the outcome. Use a short title (3–7 words naming the subject or change, not a full sentence), a one-sentence purpose, status, and update date.
- Include verbatim provenance when a spec answers a concrete request, issue, or incident. Quote the original prompt, issue, or support notes in a compact collapsible or ruled block (`Why`) rather than paraphrasing them away.
- Put a concise executive summary before long analysis. State the problem, current answer, important limit, and next work.
- Keep the high-level path complete on its own. Move implementation detail, history, raw evidence, and edge cases later.
- End with an explicit **Not changing** (`Scope`) block when a spec proposes changes, listing adjacent systems, tables, or entrypoints that remain untouched.
- End when the document is complete. Do not add a conclusion that repeats the summary.

## Document structure and narrative rhythm (`Why › What › How › Where`)

Give a spec a deliberate route through the subject. Never split top-level sections by file, architectural layer, or chronological order of work.

1. **Split the top level by observable behavior or guarantee.** Behavior is the one split a reader can judge without reading code. For refactors or infrastructure changes with no user-facing change, split by invariants and guarantees (for example, *"Nothing a caller sees changes"*, *"Each store has one owner"*).
2. **Lead every section or claim with a falsifiable sentence.** Headings and section leads must state what the section decides or proves in plain words (aim for $\le 15$ words with a concrete verb: *"A user can hold 50 scheduled messages at most"*, not a noun label like *"Message limit"*).
3. **Pair each claim with one primary exhibit.** Follow the section lead (and at most 1–2 orientation sentences when context is needed) directly with the visual, mockup, diagram, table, or code slice that proves it. Do not write multi-paragraph essays between a claim and its exhibit; if an exhibit needs a long explanation, pick a better exhibit.
4. **Move progressively from `What` to `How` to `Where`:**
   - **What** someone can now do, see, or rely on $\rightarrow$ proved by a cropped UI mockup, terminal output, evidence strip, or state machine.
   - **How** it works $\rightarrow$ proved by an annotated call tree, sequence/flow diagram, proof matrix, or native-language schema.
   - **Where** it lands $\rightarrow$ proved by an exact `file:line` code slice or unified diff.
5. **Place open decisions on the section they change.** Do not bury open questions in a list at the bottom of the page:
   - Place each decision callout (`2–5` per spec) immediately under the exhibit that makes the trade-off concrete.
   - Keep the question to one short sentence ($\le 15$ words).
   - **Always mark your recommended default (`Suggested`)** so "keep defaults" is a complete answer.
   - State the consequence of non-default options in a short clause ($\le 12$ words, for example, *"Section 4 goes away"*, *"Adds one email template"*).
6. **Provide a compact table of contents or local topic links** for long documents so readers can skim the high-level claims and jump to exact evidence.

## Plain Technical English and rhythm budgets

The exhibits carry the spec; prose connects and names them. Write for readers who use English as a second language, without making the prose sound robotic.

### Clarity and voice

- **Active voice by default.** Name the actor first: *"The worker claims the row"*, not *"The row is claimed."* Use passive voice only when the actor is genuinely irrelevant or unknown.
- **Unambiguous modals in requirements.** Use `must` for a requirement or invariant and `can` for what is possible. Avoid `should`, `may`, or `might` when stating rules or behavior contracts (natural modals are fine when discussing rationale, trade-offs, or future possibilities).
- **Direct vocabulary.** Prefer common, concrete verbs and nouns over corporate or LLM filler. Define unavoidable jargon and acronyms on first use. Avoid idioms, culture-specific jokes, ornamental metaphors, and Latin phrases.
- **Specific, traceable claims.** Tie claims to code paths (`path:line`), measurements, issues, or retained artifacts. Separate measured fact, inference, proposal, and unknown.

| Avoid | Prefer |
|---|---|
| utilize, leverage | use |
| perform, carry out | do |
| ensure, verify (as a loose verb) | make sure |
| demonstrate, indicate | show |
| commence · terminate | start · stop |
| obtain · provide | get · give |
| prior to · in order to | before · to |
| subsequently · aforementioned | then · this |
| furthermore, additionally · however | also · but |
| due to the fact that · with respect to | because · about |
| comprehensive, robust, seamless | state the exact property or coverage |

### Rhythm and density budgets

- **Paragraph length:** Keep paragraphs focused on one idea—aim for **$\le 50$ words** and **$\le 5$ sentences**. Two short sentences followed by an exhibit, table, or code block is the default rhythm.
- **Sentence length:** Mix sentence lengths naturally, but keep descriptive sentences **$\le 25\text{–}30$ words** and instructions **$\le 20$ words** (put the condition first: *"If the claim fails, stop"*). Split sentences that carry multiple independent claims.
- **Prose-to-exhibit balance:** Aim for **$\le 50$ words of prose per exhibit** (diagram, mockup, code block, schema, or table). Never write more than 3 consecutive paragraphs without a structural break or visual aid.
- **Lists vs. tables:** Use lists for genuine sets and numbered lists only when order matters. Avoid uniform bullets where every item is `**Bold label:** paragraph`; use a table, annotated code, or short clauses instead.

## Visual aids and exhibits

Use a visual aid whenever it reduces the work required to understand the content. Do not convert a short paragraph or 3-item list into a decorative diagram.

### Cropped UI mockups and screenshots

- **Draw the smallest region that makes the point.** Show one card, one menu, one dialog, one row, or one CLI invocation at `max-width: 480px` rather than a full-window desktop chrome. Narrow crops stay 1:1 readable on phones (`375px`) and inside two-column layouts.
- Use a full-window mockup (`> 600px` design width) only as an explicit overview, and pair it with a narrow crop of the active region.
- For CLI, log, or text-output behavior, use a compact terminal block (`max-width: 480px`, $\le 55$ monospace columns).
- **Use numbered pins instead of long captions.** Place numbered badges (`1`, `2`, `3`) on the relevant control or region and pair each pin with a single-clause callout ($\le 15$ words) stating what the reader must notice.
- **Label fidelity clearly.** State whether a visual is a screenshot of existing UI, a recorded run, or a proposed mockup. Show representative states (success, failure, loading, empty) when they affect the design.

### State machines, diagrams, and motion

- Choose the diagram form that matches the question:
  - **State machine (`<= 8` states)** for lifecycles. Place the main happy path on the top row and failure/cancel exits on the row below so arrows never cross labels. Ensure every state is reachable and every terminal state is marked final. When a state changes what the user sees, let clicking or selecting a state switch the adjacent UI mockup or state preview.
  - **Annotated call tree (`<= 25` rows)** for how an entrypoint works across files. Prefix lines with `+` (new call), `~` (changed entrypoint), `-` (removed), or `?` (proposed/optional), bold **new symbols**, and end each changed line with `@ path/file.ext:line`.
  - **Flowchart or sequence diagram** for branching choices or timed message flows with at least three meaningful steps.
  - **Table or proof matrix** for exact mappings, platform comparisons, or repeated fields.
- Keep diagrams focused on one question with plain-language labels and a one-sentence caption stating what to notice.
- Animate only meaningful changes (state transitions, message flow, timing). Provide play/pause/step controls, honor `prefers-reduced-motion: reduce`, and keep the default static view self-explanatory.

### Responsive and mobile-safe diagrams (static, interactive, and animated)

Diagrams—especially interactive steppers, state machines, and wide SVGs—are the #1 cause of broken mobile specs. A diagram that shrinks to 5px text or clips its controls at `375px` fails the house style.

1. **Prefer reflowable HTML/CSS diagrams when possible:**
   - For pipelines, architecture flows, state cards, and step-by-step sequences, build the nodes with semantic HTML + CSS Grid/Flexbox so they **reflow from horizontal (`→`) on desktop to vertical (`↓`) below `680px`**.
   - When an interactive diagram pairs a state graph with a state preview/mockup (`data-state`), stack the state selector above the preview at `<= 900px` so neither pane is squeezed.
2. **Prevent microscopic SVG text on mobile (`>= 10px` rendered height):**
   - If a static or animated `<svg>` uses a wide `viewBox` (for example `viewBox="0 0 960 260"`), scaling `width: 100%` into a `343px` mobile column shrinks `14px` SVG text down to `~5px`, which is illegible.
   - Fix wide SVGs on mobile using one of two patterns:
     - **Reflow / responsive variant (preferred):** Provide a vertical mobile layout below `680px` (either by positioning diagram nodes with CSS Grid/Flexbox instead of baked-in wide SVG coordinates, or by rendering a vertical-orientation `<svg class="diagram-mobile">` below `680px` and `<svg class="diagram-desktop">` above `680px`).
     - **Contained pan with readable `min-width`:** If a 2D graph or sequence diagram cannot be stacked vertically without losing meaning, place the `<svg>` inside `.diagram-scroll` (`overflow-x: auto; max-width: 100%; contain: inline-size`) with a `min-width` (such as `640px–720px`) that keeps rendered SVG text at least `11px` tall, and add a brief mobile pan hint or overview.
3. **Keep interactive & animation controls outside horizontal scroll and touch-friendly:**
   - Toolbar controls for interactive/animated diagrams (Play, Pause, Step, Reset, scenario tabs, state pills) **must** sit outside any horizontally scrolling canvas so they remain visible at `375px` without horizontal scrolling.
   - Wrap control bars with `display: flex; flex-wrap: wrap; gap: 8px` and give interactive buttons/tabs a minimum tap target of `36px` height on mobile so they never overflow or overlap.
   - Verify every interactive state/step at `375px`: advancing through steps, toggling branches, or playing animations must not cause layout shift, clipped tooltips/pins, or horizontal page overflow.

### Schemas and code slices

- **Write schemas in the project's native language** (`sql`, `ts`, `kotlin`, `proto`, `json`, `graphql`), never as an invented prose table. Mark changes with `+` and `-` diff lines and show the 5–10 fields that matter (`// … N more` for omitted boilerplate).
- **Keep code slices to `10–30` lines.** Never render more than 40 lines uncollapsed; trim to the lines that carry the point or place longer listings inside `<details>`.
- **Distinguish real code, diffs, and sketches:**
  - **Existing code:** Cite the exact `path:start-end` (and commit SHA when relevant).
  - **Diffs to existing code:** Use real `@@ -a,b +c,d @@` hunk headers. Never put `...` or `…` elisions inside a diff hunk; split into two hunks so line numbers stay accurate.
  - **Unbuilt code:** Label the block header explicitly with `sketch` (for example, `routes.ts · sketch`).
- **Keep code lines $\le 85\text{–}90$ characters** so they remain readable on narrow screens without excessive horizontal scrolling.
- **Use line pins or compact annotations** ($\le 15$ words) linked to specific line numbers instead of writing long paragraphs below the code block.

### Illustrations

- Use an illustration to make an abstract concept, actor, environment, or contrast easier to grasp. Decide what the reader should learn from it before creating it.
- Place it beside the relevant explanation with a one-sentence caption that states the point rather than repeating what is visible.
- Mark conceptual illustrations as such; never let generated art imply that an unbuilt feature or measured result exists.
- Prefer a coherent visual language across the document. Avoid generic stock imagery, decorative mascots, and imagery that competes with the evidence.

## Visual system

### Tokens

```css
:root {
  --paper: #f6f7f9;
  --ink: #22262d;
  --ink-soft: #5a6270;
  --line: #d8dce3;
  --accent: #4a63c8;
  --accent-soft: #e7ebf8;
  --ok: #2c7a4b;
  --ok-bg: #e4f0e8;
  --warn: #a8710f;
  --warn-bg: #f6edd9;
  --new: #7a5ab8;
  --new-bg: #efeaf8;
  --code-bg: #eceef2;
  --content-width: 1120px;
  --prose-width: 50rem;
  color-scheme: light dark;
}
```

Support dark-mode tokens under `@media (prefers-color-scheme: dark)`:

```css
@media (prefers-color-scheme: dark) {
  :root {
    --paper: #191c21;
    --ink: #d9dde4;
    --ink-soft: #a9b0bc;
    --line: #343a44;
    --accent: #9badea;
    --accent-soft: #262d42;
    --ok: #76c596;
    --ok-bg: #1e2e25;
    --warn: #d8a64a;
    --warn-bg: #322a18;
    --new: #b39ce0;
    --new-bg: #2a2438;
    --code-bg: #23272f;
  }
}
```

Do not invent gradients, glows, glass, or unrelated project palettes.

### Type

- Body and navigation: `-apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`, `16px/1.6`.
- Headings: `Charter, "Bitstream Charter", "Sitka Text", Cambria, Georgia, serif`.
- Code and measurements only: `ui-monospace, "Cascadia Code", "JetBrains Mono", Menlo, Consolas, monospace`.
- Display title: `clamp(2.7rem, 6.8vw, 5.5rem)`, no larger than `17ch`, tracking no tighter than `-0.04em`.
- Section heading: `clamp(1.75rem, 3.2vw, 2.6rem)`.
- Body prose must stay within 65–75 characters per line (`--prose-width`) on desktop and expand to full container width on mobile.

### Layout and mandatory responsive behavior (`<= 900px` and `<= 680px`)

Every spec must work cleanly at **desktop (`1280px`)**, **narrow/tablet (`768px`, inside `max-width: 900px`)**, and **mobile (`375px`, inside `max-width: 680px`)** with **zero page-level horizontal overflow** (`documentElement.scrollWidth <= window.innerWidth`).

1. **Page shell and gutters:**
   - Desktop and tablet: `width: min(100% - 48px, var(--content-width))`, `margin-inline: auto`.
   - Below `680px`: `width: min(100% - 32px, var(--content-width))`.
   - Top navigation: `72px` minimum height, brand at left, short page navigation at right, `1px` bottom rule. Below `900px`, stack `.nav` vertically (`flex-direction: column; align-items: flex-start; padding-block: 18px`) and remove left borders/padding on `.nav-diff`.
2. **Every multi-column grid must collapse at `<= 900px` and `<= 680px`:**
   - Never leave a multi-column `grid-template-columns` rule without matching `@media (max-width: 900px)` and `@media (max-width: 680px)` rules.
   - At `<= 900px`: collapse 2-column asymmetric layouts (`.hero`, `.download-panel`, `.annotated-code`, `.walkthrough-cta`, side-by-side comparisons) to `grid-template-columns: 1fr`. Collapse 4-column strips (`.evidence-strip`, `.snapshot-bar`) to `1fr 1fr`.
   - At `<= 680px`: collapse **all** content grids, sidebar sections (`.run-section`, `.branch-band`, `.evidence-strip`, `.snapshot-bar`, `.code-notes`, `.todo-row`), and side-by-side mockups to a single column (`grid-template-columns: 1fr`). Reset any multi-column `grid-column` spans to `1 / -1` and remove right borders that were separating columns.
   - Prose columns (`<p>`, `<li>`, `<dd>`) must never be squeezed narrower than `240px` on any viewport.
3. **Grid blowout prevention (`min-width: 0`):**
   - Any grid or flex child that holds `<pre>`, `<code>`, `<table>`, `<svg>`, or long URLs/identifiers **must** set `min-width: 0`. Without `min-width: 0`, CSS Grid's default `min-width: auto` stretches the column past the viewport.
   - Apply `overflow-wrap: anywhere` to cells or headings that can contain long identifiers, file paths, or URLs.
4. **Horizontal scroll containment for wide tables, matrices, and diagrams:**
   - Wide tables (`.proof-matrix`) and wide SVGs/diagrams (`.dispatch-flow`) must sit inside a dedicated scroll wrapper:
     ```css
     .matrix-scroll,
     .diagram-scroll {
       width: 100%;
       max-width: 100%;
       overflow-x: auto;
       overflow-y: hidden;
       border: 1px solid var(--line);
       border-radius: 12px;
       contain: inline-size;
       -webkit-overflow-scrolling: touch;
     }
     ```
   - Never put `min-width: 720px` on an element unless its immediate parent has `overflow-x: auto` and `max-width: 100%`.
   - `<pre>` blocks must have `max-width: 100%; overflow-x: auto;`. Below `680px`, if a `.copy-button` sits in the top-right corner of `<pre>`, add `padding-top: 56px; padding-right: 18px` so the button never overlaps the first line of code.
5. **Use `1px` rules, spacing, and type before reaching for containers:**
   - Accent bands and callouts use `--accent-soft`, a `5–8px` radius, and no shadow.
   - Use status pills only for compact states such as `Proven`, `Partial`, `Proposed`, or `Blocked`. Do not turn headings or navigation into pills.

### Core patterns

Use only the patterns the document needs:

- common header and concise navigation;
- title (`3–7` words) plus purpose, current status, and verbatim `Why` quotes;
- executive-summary band;
- ruled evidence strip for a few high-value facts;
- behavior-first sections (`What › How › Where`) pairing a falsifiable claim sentence with one primary exhibit;
- cropped UI mockups (`<= 480px`), state machines (`<= 8` states), annotated call trees, or native-language schemas;
- in-place decision callouts with a `Suggested` default;
- ruled artifact or work list instead of a grid of repeated cards;
- proof matrix with horizontal scroll containment;
- explicit `Not changing` (`Scope`) block at the end;
- quiet footer with project identity and one useful link.

## Avoid formulaic AI output

These are review signals, not proof that text or design was generated. Fix the underlying lack of specificity, hierarchy, or judgment instead of mechanically replacing one word.

### Writing

These are structural misses, not a word list. Swapping a banned word for a synonym is still a miss. Fix the missing fact or the broken sentence.

- Do not write to the operator. No "Certainly", "Great question", "I'd be happy to", "Let's dive in", "Hope this helps", "In conclusion", "It's important to note", or "It's worth noting". Start on the subject.
- Do not hang a present-participle tail on a sentence only to add importance: highlighting, underscoring, ensuring, reflecting, fostering, showcasing. Write the fact, or cut the tail.
- Do not write "serves as", "stands as", "marks", "represents", or "boasts" where "is" or "has" works. Do not replace a verb with a stack of Latinate nouns.
- Do not use "not only X but Y", "it's not X, it's Y", or a triad of synonyms ("robust, seamless, and scalable"). Make one precise claim.
- Em dashes are allowed. Two in one sentence, or a dash whose only job is to stage a contrast, is a miss. Use a period.
- No "Key takeaways" that repeat the summary. No bold label, colon, and paragraph as a default shape. No list whose items are all the same sentence. No closing paragraph that restates the executive summary.
- Do not explain a step a technical reader can see in the command or the figure. Do not write "simply", "just", "easy", or "please note". Do not moralize ("it is essential that").
- Do not write a version table, status matrix, or changelog as prose. Those are data. Say what is true now. No "coming in <version>", "as of this writing", or "soon".
- Delete canned openings ("In today's rapidly evolving landscape"), generic scene-setting, and inflated metaphors (delve, tapestry, realm, journey, unlock, transformative, pivotal, testament) unless that word is the precise term.
- Do not cite vague authority ("experts agree"), add generic praise, invent quotations, or assure the reader that the document is clear, complete, or well-researched.
- Vary sentence length. Do not make every sentence equally long or equally formal.

Bad: "The cache serves as a pivotal layer, ensuring low latency and highlighting the system's scalability."

Good: "The cache skips reads it has already answered. Put the measured change next to the trace it came from."

On the second pass, check only this list: participle tails, inflated copulas, chatbot openers, synonym triads, "not X but Y", a repeated ending, a claim with no source, a data table written as prose. One banned word is a warning. A page full of them is a failure. Do not ask whether the page "sounds human".

### Design

- No generic hero-metric-feature-card template.
- No grids of identical icon, heading, and text cards; no nested cards.
- No decorative gradient text, purple/blue gradients, neon glow, glassmorphism, blurred orbs, or dark “developer” styling.
- Do not use monospace everywhere, oversized icon tiles, decorative sparklines, or motion without meaning.
- Do not center all content. Use the reference's left-aligned, asymmetric composition.
- Avoid redundant labels, helper text, and captions that say the same thing.

## Review before publishing

1. **Automated lint & viewport check:** Did `node <skill-dir>/scripts/lint-spec.mjs` pass with zero errors across static checks and headless browser layout checks at `1280px`, `768px`, and `375px`?
2. **Summary completeness:** Can a reader state the problem, current answer, limit, and next work after the summary?
3. **Behavior-first hierarchy:** Are top-level sections split by observable behavior or guarantee, and does each section lead with a concise claim paired with an exhibit?
4. **Visuals and mobile legibility:** Did you inspect the rendered desktop (`1280px`) and mobile (`375px`) screenshots to confirm zero horizontal overflow, uncrushed text columns, and legible mockups/diagrams?
5. **Evidence integrity:** Are measurements scoped, misses retained beside wins, and code/diff citations accurate (`path:line`, real diff hunks, `sketch` labels for unbuilt code)?
6. **House style & anti-slop:** Does the page match the tokens, typography, header, and breakpoints in this guide, with all formulaic AI prose and decorative card grids removed?
