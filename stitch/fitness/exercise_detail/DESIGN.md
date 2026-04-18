# High-End Editorial: Fitness Module Design System

## 1. Overview & Creative North Star
The Creative North Star for this design system is **"The Precision Athlete."** 

This system rejects the cluttered, neon-soaked tropes of fitness apps in favor of a sophisticated, high-performance aesthetic that mirrors a luxury fintech dashboard. It is built for clarity and "gym-ready" utility, treating fitness data with the same reverence as financial markets. 

We move beyond the "standard template" by utilizing intentional white space, high-contrast typography pairings, and a layout strategy that favors **Asymmetric Balance**. By stacking clean, technical typography against airy, layered surfaces, we create an interface that feels lightweight yet authoritative.

## 2. Color & Tonal Architecture
The palette is rooted in a crisp, "Fresh Start" white base, accented by high-energy teals and deep technical navys.

### Primary Palette
- **Primary (Teal):** `#006B55` / `primary-container: #00D4AA`. This is our energetic heartbeat. It is used sparingly for primary actions and "Push" status.
- **Surface Foundations:** We utilize `surface: #F8F9FF` for the main canvas, providing a cooler, more premium feel than a standard warm white.
- **Technical Dark:** `#161B22` is reserved for navigation, providing a grounded, "Night Mode" anchor to the otherwise light interface.

### The "No-Line" Rule
To achieve a high-end editorial feel, designers must **prohibit 1px solid borders** for general sectioning. Boundaries are defined through:
- **Tonal Shifts:** Placing a `surface-container-lowest` card on a `surface-container-low` background.
- **Intentional Spacing:** Using the grid to create "gutters" of negative space that act as invisible dividers.
- **Shadow Definition:** Using soft, ambient light rather than physical lines.

### Signature Textures & Glass
Main CTAs or hero "Score" cards should utilize a **Signature Gradient** (from `primary` to `primary-container`) with a 12% noise overlay to provide a tactile, premium finish. Floating elements (modals/popovers) must use **Glassmorphism**: a semi-transparent surface color with a `20px` backdrop-blur to maintain context of the gym floor behind the UI.

## 3. Typography: The Technical Instrument
The system uses a dual-font strategy to separate editorial content from raw performance data.

- **Inter (UI Labels & Text):** Our primary sans-serif. Use `headline-lg` (2rem) for page titles to establish a bold, confident hierarchy. All labels use `label-md` with 5% letter spacing to enhance legibility in high-movement environments.
- **JetBrains Mono (Technical Data):** Every number—weights, reps, sets, and scores—must be rendered in JetBrains Mono. This monospaced choice signals precision and "Data as Truth," preventing the UI from feeling like a generic lifestyle app.

## 4. Elevation & Depth
We eschew traditional "drop shadows" for **Tonal Layering**.

### The Layering Principle
Depth is achieved by stacking `surface-container` tiers (Lowest to Highest). 
*   **Level 0 (Base):** `surface` (#F8F9FF)
*   **Level 1 (Sections):** `surface-container-low` (#F0F4FE)
*   **Level 2 (Cards):** `surface-container-lowest` (#FFFFFF)

### Ambient Shadows
When a card needs to "float" (e.g., a Workout-in-Progress timer), use a shadow with a 24px blur, 8% opacity, and a slight tint of the `on-surface` color. This mimics natural light and prevents the "dirty" look of grey shadows.

### The "Ghost Border" Fallback
If high-density data requires a border for containment, use the **Ghost Border**: the `outline-variant` token at **20% opacity**. It provides a "hint" of a container without breaking the editorial flow.

## 5. Components

### Cards & Progress
*   **Editorial Cards:** Forbid divider lines. Separate "Current Set" from "Previous Best" using a `0.5rem` vertical gap and a subtle background shift to `surface-container-high`.
*   **Score Zones:** Use color as a semantic "aura." A score of 9+ (Gold) should not just be gold text; it should have a subtle gold glow (5% opacity) behind the JetBrains Mono numeral.

### Buttons
*   **Primary:** Solid `primary-container` (#00D4AA) with `on-primary-container` text. Use `xl` (0.75rem) corner radius for a modern, approachable feel.
*   **Secondary:** Ghost-style. No background, only the "Ghost Border" (20% outline-variant) and teal text.

### Inputs & Interaction
*   **Data Entry:** Use large, centered JetBrains Mono text for weight input. The focus state should never be a blue glow; use a `2px` solid `primary` underline to maintain the "Fintech" precision.
*   **Chips:** Use `full` (9999px) rounding. "Push" (Teal), "Pull" (Purple), "Legs" (Amber), and "Cardio" (Coral) chips use a 10% opacity background of their respective color for a sophisticated, low-contrast look.

### Navigation
*   **The Sidebar:** Use the dark `inverse-surface` (#161B22). Active states are indicated by a `4px` vertical teal bar on the left and a transition of the icon to the `primary-fixed` color.

## 6. Do’s and Don’ts

### Do
*   **Do** use JetBrains Mono for all timestamps (00:54:22).
*   **Do** embrace asymmetry. A card can have a large title on the left and a small mono-spaced metric on the right, balanced by negative space.
*   **Do** use `body-sm` for legal/technical footnotes to keep the main UI clean.

### Don’t
*   **Don't** use icons with fills. Use "Light" or "Thin" weight stroke icons to match the Inter typography.
*   **Don't** use underscores or "computer-speak" (e.g., use "Bench Press" not "bench_press").
*   **Don't** use high-contrast dividers. If you think you need a line, try adding `16px` of white space instead.
*   **Don't** use "Kinetic" or sci-fi terminology. This is a professional tool for athletes, not a video game.