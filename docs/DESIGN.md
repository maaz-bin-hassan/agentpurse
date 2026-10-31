# Night Ledger

AgentPurse should feel like a purse a careful person would hand to an agent: quiet about money, sharp about permission, and a little alive in the faces of the agents. The direction is **Night Ledger**.

Dark is the default. The canvas is near-black, type is high-contrast, and color is rationed. Ember is the only brand accent. Mint, amber, and rose appear only as states (allowed, held, denied). Agent faces are original drawings with small idle motions. Nothing here copies a logo, a brand mark, or a paid icon set. Icons are Lucide. Type is Geist and Geist Mono, both available at no cost through `next/font`.

Grok and xAI are a primary reference for the feel: dark-first, minimal, high contrast, soft light rather than a rainbow gradient, pill controls, and agent surfaces that read like a focused instrument. The other references keep the money trustworthy.

## References

Inspiration only. These links were read while choosing the system. Measured values below are our tokens, not a copy of anyone’s stylesheet.

- [grok.com design notes](https://design.withfudge.com/share/grok.com-design) and the live product at [grok.com](https://grok.com). Quiet dark fields, one task in focus, warm orange used rarely, panels separated by outline rather than shadow.
- [x.ai](https://x.ai) as described by [shadcn.io/design/xai](https://www.shadcn.io/design/xai), [Fudge](https://fudge.design/share/x.ai-design), and [getdesign.md](https://getdesign.md/design-md/x.ai/preview). Near-black canvas, white pills, hairline borders, mono eyebrows, tight display tracking. Their display face is Universal Sans. We use Geist instead.
- [Linear](https://linear.app). Layered charcoal, short motion, work in front of charts. Hover is a fade, not a bounce. Notes in [this field study](https://github.com/Stranglehold/Exocortex/blob/main/docs/ui_references/beyond_css/application_sites.md).
- [Vercel](https://vercel.com). Black field, 1px borders, status as the story.
- [Stripe](https://stripe.com) and the [Stripe Dashboard](https://dashboard.stripe.com). Tabular figures, color only for payment state, the number before the chart. Discussed in [Fintech dashboard design, 2026](https://adminlte.io/blog/fintech-dashboard-design-examples/).
- [Mercury](https://mercury.com). Editorial calm. One balance, then the ledger. Cited in [SaaS dashboard examples, 2026](https://www.925studios.co/blog/saas-dashboard-design-examples-2026).
- [Ramp](https://ramp.com). The dashboard is a queue of decisions, not a wall of charts.
- [Revolut Business](https://www.revolut.com/business/) via [Mobbin’s finance collection](https://mobbin.com/explore/mobile/app-categories/finance). Dark numerals that stay readable, motion only when money changes state.
- [Raycast](https://www.raycast.com) and [Arc](https://arc.net). Command-like pills and a single focused surface. We do not borrow their marks.
- [Dribbble: agentic finance UI](https://dribbble.com/search/ui-trading) and the [s0nyx agent desk](https://pzhydkykh.com/work/s0nyx/). Agents as supervised workers, a kill switch that feels serious, approvals with a reason.
- [Tally’s agent wallet notes](https://github.com/withtally/agent-wallet-interface). Each agent is a character with a budget. We keep that idea and reject the pastel-card treatment.

## Principles

1. The largest type on a screen is either the promise or the amount left.
2. A surface is a tone step and a hairline, not a blur and a glow.
3. Ember marks the brand and the dangerous control. State colors never decorate.
4. Agents have faces. The rest of the product does not have mascots.
5. Motion explains a change (a number, a decision, a block). It does not loop for atmosphere, except a slow blink on an idle face.
6. Light mode is the same system inverted, not a second theme with different shapes.

## Color

Dark is `.dark` on `html`, which is the default. Light is `html` without `.dark`.

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| canvas | `#050505` | `#f3f1eb` | Page |
| surface | `#111111` | `#fffcf7` | Cards, sidebar |
| surface-2 | `#181818` | `#ebe7df` | Inset fields, film stage |
| line | `rgba(255,255,255,0.10)` | `rgba(17,17,16,0.10)` | Hairlines |
| ink | `#f7f7f5` | `#141413` | Primary text |
| muted | `#8d8d8a` | `#5e5c56` | Secondary text |
| faint | `#5c5c58` | `#8a877e` | Eyebrows on busy surfaces |
| ember | `#ff5c2a` | `#e24b1a` | Brand, focus, panic |
| mint | `#7dffb2` | `#0e7a45` | Allowed, linked, active |
| amber | `#ffc14d` | `#8a5a00` | Held, paused |
| rose | `#ff5d73` | `#b4233c` | Denied, blocked, revoked |
| on-accent | `#140c08` | `#140c08` | Text on ember fills |

Contrast: ink on canvas is above 15:1 in both modes. Muted on canvas is about 7:1 in dark and above 5.5:1 in light. Mint and rose text sit on ink-colored chips when they are small, so the chip carries the contrast.

One soft ember wash sits at the top of the canvas at 18% opacity and fades out. A fixed noise layer sits at 4% so flat black does not band. There is no purple mesh and no glass blur.

## Type

| Token | Face | Size | Weight | Line | Tracking |
| --- | --- | --- | --- | --- | --- |
| display | Geist | clamp(2.75rem, 7vw, 5.25rem) | 500 | 0.96 | -0.045em |
| title | Geist | 1.75rem | 500 | 1.15 | -0.03em |
| heading | Geist | 1.125rem | 550 | 1.3 | -0.02em |
| body | Geist | 1rem | 400 | 1.5 | 0 |
| small | Geist | 0.875rem | 400 | 1.45 | 0 |
| eyebrow | Geist Mono | 0.75rem | 500 | 1 | 0.14em, uppercase |
| money | Geist | 1.75rem–2.25rem | 500 | 1 | tabular-nums |

Money is always `font-variant-numeric: tabular-nums`. Currency symbols stay in the same face. Do not introduce a second display serif.

## Space, radius, elevation

Spacing is a 4px grid: 4, 8, 12, 16, 24, 32, 48, 64, 96. Page gutters are 16px on small screens and 24px from `md`.

| Radius | Value | Use |
| --- | --- | --- |
| sm | 8px | Inputs, table chips |
| md | 12px | Cards, agent portraits |
| lg | 16px | The product film and the final call to action |
| pill | 999px | Buttons, filters, status chips |

Elevation is mostly a border. The film and the panic control get one shadow: `0 24px 60px rgba(0,0,0,0.35)` in dark, `0 16px 40px rgba(20,18,12,0.08)` in light. Do not stack blur, glow, and shadow on the same card.

## Motion

| Token | Duration | Easing | Use |
| --- | --- | --- | --- |
| fast | 160ms | `cubic-bezier(0.2, 0, 0, 1)` | Hover, press |
| base | 280ms | `cubic-bezier(0.16, 1, 0.3, 1)` | Section change, row enter |
| slow | 520ms | `cubic-bezier(0.16, 1, 0.3, 1)` | Number tick, allowance ring |
| block | 420ms | `cubic-bezier(0.2, 0, 0, 1)` | Injection stamp |

Press scales a control to 0.98. Cards do not lift more than 2px. The allowance ring draws with `stroke-dasharray`. Balances count with a single tween. Approval is a mint ring and a short check, not confetti. A blocked injection stamps the word BLOCKED once and shakes the face. Idle faces blink on a 5s cycle.

`prefers-reduced-motion: reduce` collapses durations to 0.01ms and disables the blink, the stamp shake, and the number tween.

## Components

- **Page.** Black (or warm paper) canvas. One eyebrow, one display or title, then the work.
- **Sidebar.** Flat surface, hairline on the right, mono wordmark, Lucide icons at 16px. The current item is an inverse pill (ink fill, canvas text).
- **Agent portrait.** Face, name, provider, status, the amount left, a thin ember ring for allowance used, policy chips. The face is the hero, not a thumbnail in the corner of a generic card.
- **Face moods.** `idle` blinks. `think` looks up while the clerk runs. `yes` smiles when a payment is allowed or approved. `block` closes the mouth and shakes when the guard or the clerk denies. `paused` and `revoked` dim the face and change the status dot to amber or rose.
- **Button.** Pill, 44px minimum height. Primary is ink fill. Secondary is a hairline. Panic is an ember fill and is the only large control on the kill-switch panel.
- **Chip.** Mono, uppercase, hairline. State chips (`allow`, `hold`, `deny`) are solid mint, amber, or rose with dark text.
- **Ledger row.** A hairline table. Amounts align right. A new capture may highlight once in mint at 12% and fade.
- **Film.** A window with three plain dots (a common window metaphor, not a borrowed mark), a mono label, and one sentence. Chapters are tabs.
- **Empty, error, missing.** Same type scale. One sentence, one action. No illustration pack.

## What we will not do

- Purple or cyan mesh gradients, glassmorphism on every card, or a rainbow of equal feature tiles.
- Third-party logos for Claude, Grok, ChatGPT, PayPal’s mark, or xAI’s mark. Names in text are fine.
- Stock photos, paid icon fonts, or a copied Grok wordmark.
