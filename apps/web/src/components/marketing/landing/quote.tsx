// A pause between the demo and the bento — names the pain in the user's own
// voice. Dither band so it reads as a distinct, textured interlude.
export function QuoteBand() {
  return (
    <section className="relative overflow-hidden py-24">
      <figure className="mx-auto max-w-3xl px-6 text-center">
        <blockquote className="font-display text-2xl font-medium tracking-tight text-balance sm:text-3xl">
          “We shipped an agent that quietly drifted for three weeks. Costs
          doubled, answers got worse, and we found out from a customer — not a
          dashboard.”
        </blockquote>
        <figcaption className="mt-6 text-sm text-muted-foreground">
          Every team that ships agents without observability. Don&apos;t be
          them.
        </figcaption>
      </figure>
    </section>
  );
}
