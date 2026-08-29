/**
 * Buttons that sit on the run drawer (and the "Show more" fold): the drawer's
 * light surface is `neutral-100`, where a secondary button melts in, so they
 * take the `outline` look in light mode and stay `secondary` in dark.
 * Pair with `variant="secondary"` — these classes override the light half
 * only; the `dark:` half restates the secondary look so it wins there.
 */
export const DRAWER_BUTTON_CLASS =
  "bg-background shadow-(--custom-outline-shadow) hover:bg-muted hover:text-foreground [&_svg:not([class*='text-'])]:text-neutral-500 dark:bg-secondary dark:shadow-[var(--custom-shadow-secondary)] dark:hover:bg-muted-foreground/25 dark:hover:text-secondary-foreground dark:[&_svg:not([class*='text-'])]:text-neutral-300";
