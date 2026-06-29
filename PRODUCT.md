# Product

> Scope: the **protein-index site** (protein-index.mohamed3on.com) — the public
> Mercadona/REWE nutrition index. (The NutriData browser extension shares the
> repo but is a separate surface.)

## Register

product

## Users

Health- and protein-conscious grocery shoppers in Germany (REWE) and Spain
(Mercadona). They're mid-task: "what's the best high-protein / best-value thing
in this category?" They scan a ranked grid, filter to a category (e.g.
Mozzarella, Skyr, Quark), and click through to the store. Secondary user: the
maintainer sanity-checking the data.

## Product Purpose

An independent index that ranks ~16k REWE + ~2.4k Mercadona products by a
protein-forward NutriScore (geometric mean of protein-per-100kcal and
protein-per-€, lifted by fiber, dragged by saturated fat). Success = a shopper
finds the best products in a category in seconds and trusts the ranking.

## Brand Personality

Trustworthy, fast, no-nonsense reference tool. Data-dense but legible. The
number is the product — the UI should disappear into "find, compare, go."
Three words: independent, precise, frictionless.

## Anti-references

- SEO "best protein snacks 2026" affiliate listicles (cluttered, untrustworthy).
- Gamified fitness/macro apps (rings, confetti, streaks).
- Generic AI-SaaS dashboards (hero-metric cards, gradient accents, eyebrows).

## Design Principles

- **Findability over decoration.** Every pixel serves search/filter/scan/compare.
- **Trust the number.** The NutriScore and per-100g facts are the hero; present
  them with the clarity of a reference table, not marketing.
- **Dense but scannable.** Show real nutrition data on the card; reward fast eyes.
- **The hierarchy is real.** REWE categories are deep (dept → … → leaf);
  surface the leaf (the level shoppers think in) and never hide where a product sits.
- **Honest & independent.** Clearly not affiliated; data is referenced, not owned.

## Accessibility & Inclusion

WCAG AA: body text ≥4.5:1 (no muted-gray-on-tint), large/UI text ≥3:1. Filters
and the store switcher fully keyboard-operable with visible focus. NutriScore is
never communicated by color alone (always the number). Honor
`prefers-reduced-motion`.
