# Design System Documentation: The Terminal Precision Standard

## 1. Overview & Creative North Star
**Creative North Star: "The High-Density Observatory"**

This design system is engineered for the elite financial operative. It moves away from the "friendly fintech" trend of soft bubbles and wasted space, leaning instead into a sophisticated, technical aesthetic that prioritizes data density and editorial precision. 

The system rejects the "boxed-in" layout of traditional SaaS. Instead, it utilizes **Tonal Layering** and **Asymmetric Balance** to create a UI that feels like a high-end physical instrument. We achieve a premium feel through high-contrast typography scales and "Ghost" structures that allow the data—not the container—to take center stage.

---

## 2. Colors & Surface Architecture

### Surface Hierarchy & The "No-Line" Rule
To achieve a signature look, we prohibit the use of 1px solid borders for sectioning content. Instead, we define boundaries through **Background Shifts** and **Nesting**.

*   **The Foundation:** Global background uses `surface` (#10141a).
*   **The Content Layer:** Primary workspaces use `surface_container` (#1c2026).
*   **The Detail Layer:** Cards or nested data points use `surface_container_high` (#262a31).
*   **The Floating Layer:** Overlays and context menus use `surface_container_highest` (#31353c) with a subtle `backdrop-blur`.

### Signature Textures
*   **The Glass Rule:** Any floating element (Modals, Tooltips) must use a semi-transparent `surface_variant` with a 12px blur. This prevents the UI from feeling "pasted on" and maintains a sense of environmental depth.
*   **Primary Gradience:** For high-impact CTAs, do not use flat teal. Apply a subtle linear gradient from `primary` (#46f1c5) to `primary_container` (#00d4aa) at a 135-degree angle to provide a "machined metal" sheen.

---

## 3. Typography: Editorial Authority

We use a dual-font strategy to separate "Instruction" from "Information."

### The Functional Hierarchy
*   **UI Navigation & Labels:** **Inter**. Use `body-md` for standard text. For labels, use `label-md` in **Title Case**. Never use underscores or all-caps for functional labels.
*   **The "Financial Monospaced" Rule:** All numerical data, currency, and timestamps must use **JetBrains Mono**. This ensures tabular alignment and reinforces the technical, high-precision nature of the system.
*   **Section Headers:** Use `headline-sm` (Inter, 600 weight, Uppercase). Apply a `0.05em` letter-spacing. These headers act as the "anchors" of the page, providing an editorial structure that breaks the density of the data.

---

## 4. Elevation & Depth

### The Layering Principle
Forget shadows. Use **Tonal Stacking**.
1.  **Level 0 (Base):** `surface`
2.  **Level 1 (Sections):** `surface_container_low`
3.  **Level 2 (Active Cards):** `surface_container_high`

### Ambient Shadows & Ghost Borders
*   **Ambient Light:** When a shadow is required for a floating state, use a 32px blur with 6% opacity, tinted with the `primary` color (#46f1c5) rather than black. This creates a "glow" effect characteristic of high-end displays.
*   **The Ghost Border:** If a separator is required for accessibility, use the `outline_variant` token at **15% opacity**. This creates a "suggestion" of a line that disappears into the dark background, maintaining the high-density technical feel.

---

## 5. Components

### Buttons & Interaction
*   **Primary:** Gradient fill (`primary` to `primary_container`), `on_primary` text. No border. 4px (`sm`) radius.
*   **Secondary:** No fill. `Ghost Border` (15% opacity `outline`). Text in `primary_fixed`.
*   **Tertiary:** Text only. Use `JetBrains Mono` for tertiary actions to emphasize "command-line" efficiency.

### High-Density Data Cells
*   **Forbid Dividers:** Do not use horizontal lines between list items. Use an 8px vertical gap. When hovered, change the background of the row to `surface_bright`.
*   **Lucide Icons:** Use a `1.5px` stroke weight. Icons should be `primary_fixed_dim` for inactive states and `primary` for active states.

### Input Fields
*   **State:** Default state uses `surface_container_lowest` with a "Ghost Border."
*   **Focus:** The border transitions to 100% opacity `primary`, and a subtle 2px outer glow (bloom) is applied.

### Contextual Chips
*   **Positive/Negative:** Use `tertiary_container` for positive values and `error_container` for negative. Text must remain high-contrast (e.g., `on_tertiary_container`).

---

## 6. Do’s and Don’ts

### Do
*   **Use Title Case:** "Account Balance," not "account_balance" or "ACCOUNT BALANCE."
*   **Prioritize JetBrains Mono:** If it is a number, it belongs in mono.
*   **Embrace Asymmetry:** Align headers to the left and data to the right without a containing box to create a modern, editorial "edge."
*   **Apply 4px Radius:** Keep the system sharp. Use `DEFAULT` (0.25rem) for almost all containers to maintain a technical feel.

### Don’t
*   **No 100% Opaque Borders:** Never use a solid, high-contrast line to separate content. Use color shifts.
*   **No Underscores:** The UI should feel like a finished product, not a database export.
*   **No Drop Shadows:** Avoid heavy, dark "Material" shadows. Use tonal layering or subtle ambient glows.
*   **No Rounded Corners:** Avoid the `xl` or `full` roundedness tokens for anything other than specific status pills; it softens the brand too much.