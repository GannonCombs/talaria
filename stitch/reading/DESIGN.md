```markdown
# Design System Document: Financial Precision & Technical Authority

## 1. Overview & Creative North Star: "The Sovereign Analyst"
The Creative North Star for this design system is **"The Sovereign Analyst."** This is not a consumer-facing app; it is a high-performance instrument. It rejects the "bubbly" trends of modern SaaS in favor of a cold, calculated, and elite aesthetic inspired by legacy terminal systems.

The system breaks the "template" look by prioritizing **Information Density** over whitespace and **Intentional Rigidity** over soft geometry. We achieve a premium feel through "Monolithic Layouts"—where the UI feels carved from a single block of dark glass, using razor-sharp 0px radii and surgical 1px line work to communicate absolute mathematical certainty.

---

## 2. Colors & Tonal Architecture
The palette is rooted in a "Deep Charcoal" spectrum, designed to minimize eye strain during long-duration technical sessions while highlighting critical data points with "Electric Teal."

### Core Palette (Material Mapping)
- **Surface (Primary BG):** `#10141a` – The foundation.
- **Surface Container Low (Card BG):** `#181c22` – Standard data grouping.
- **Surface Container High (Elevated BG):** `#262a31` – Active panels or modals.
- **Primary (Accent):** `#46f1c5` – Reserved for primary actions and "in-focus" states.
- **Outline (Border):** `#30363D` – The primary tool for structural definition.

### The "No-Gradient" Mandate
To maintain the "Terminal" integrity, gradients are strictly prohibited. Visual depth must be achieved through binary shifts in background HEX codes.

### Surface Hierarchy & Nesting
Instead of shadows, we use **Tonal Stepping**. 
- A `surface-container-highest` (`#31353c`) header should sit directly against a `surface-container` (`#1c2026`) body. 
- The contrast is subtle but intentional, mimicking the "beveled" look of professional rack-mounted hardware.

---

## 3. Typography: The Dual-Engine Logic
We employ a bifurcated typography system to separate "System Logic" from "Data Reality."

### UI & Navigation: Inter
*Used for labels, headers, and instructional text.*
- **Title-MD (1.125rem):** Used for panel headers. Letter spacing: -0.01em.
- **Label-SM (0.6875rem):** Used for all secondary metadata. All-caps for a "heads-up display" (HUD) feel.

### Financials & Data: JetBrains Mono
*Used for all numerical values, tickers, and code snippets.*
- **Monospace Necessity:** Every digit must align vertically in tables. JetBrains Mono ensures that a "$1,000,000" takes up the same horizontal space as "$8,888,888," preventing visual "jumping" during real-time data refreshes.
- **Headline-LG (2rem):** Used for primary account balances or "Big Numbers."

---

## 4. Elevation & Structural Rigidity
This system abandons organic depth for **Architectural Precision**.

### The Border-First Rule
Unlike consumer systems that use shadows, this system relies on the **1px Solid Border**. 
- Use `outline-variant` (`#3b4a44`) for standard structural divisions.
- Every container must have a `0px` border-radius. Rounded corners suggest "friendly"; sharp corners suggest "functional."

### Tonal Layering
Depth is communicated through "Insetting."
- **The "Well" Effect:** To make a data table feel embedded, use a `surface-container-lowest` (`#0a0e14`) background inside a `surface-container` (`#1c2026`) parent. This creates a sense of "looking into" the data.

### Shadows
- **Shadows are prohibited** for standard UI. 
- **Exception:** For critical system alerts that must float above the UI, use a "Hard Shadow": a 2px offset with 100% opacity using `#000000`. No blur.

---

## 5. Components

### Buttons (The "Module" Style)
- **Primary:** Background: `primary` (`#46f1c5`), Text: `on-primary` (`#00382b`). 0px radius. 1px border of `primary-fixed`.
- **Secondary:** Background: Transparent, 1px Border: `outline`. Text: `on-surface`.
- **States:** On hover, the background should shift to a `surface-bright` (`#353940`) highlight. No "soft" transitions; use 50ms or 0ms easing for an "instant" feel.

### Data Tables (The Core Component)
- **Grid Lines:** 1px horizontal and vertical borders using `outline-variant`.
- **Header:** Background: `surface-container-high`. Text: `label-sm` (Inter, Bold, All-Caps).
- **Cells:** JetBrains Mono for all numeric values. Use `secondary` (`#67df70`) for positive deltas and `error` (`#ffb4ab`) for negative deltas.

### Input Fields
- **Default:** 1px border using `outline`. Background: `surface-container-lowest`. 
- **Focus:** 1px border using `primary`. No outer glow/shadow. 
- **Validation:** Errors use a 1px `error` border with `label-sm` helper text in JetBrains Mono.

### Technical HUD Tabs
Tabs should not look like buttons. They should look like physical folders. Use a 1px border on three sides, with the bottom border removed on the "Active" tab to visually merge it with the content container below.

---

## 6. Do’s and Don'ts

### Do
- **Do** maximize information density. If there is empty space, consider if more data context (moving averages, volume, timestamps) can be added.
- **Do** use `Lucide` icons with a `1.25px` stroke weight to match the thin-line aesthetic of the borders.
- **Do** align every element to a strict 4px grid.

### Don't
- **Don't** use border-radius. Even a 2px radius breaks the "Terminal" immersion.
- **Don't** use "Soft" colors. If a color isn't in the palette, it doesn't exist. Avoid pastels or muted greys that lack the Deep Charcoal base.
- **Don't** use animations that take longer than 150ms. The UI must feel like it is running on high-performance local hardware, not a browser.
- **Don't** use "Glassmorphism" or blurs. Every layer must be 100% opaque to maintain legibility.```