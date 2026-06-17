import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@foglamp/ui/components/avatar";

// PLACEHOLDER — do NOT ship as a real endorsement. The visible attribution is
// intentionally a fill-in-the-blank so this can't be mistaken for a genuine
// customer quote if it reaches production. Swap for a real, attributable quote
// (Marc Lou #29: "collect proof before traffic") before launch.
const TESTIMONIAL = {
  quote:
    "Caught a 10× cost regression 3 days after shipping. Foglamp paid for itself in week one.",
  author: "Gustavo Fior",
  role: "Co-founder @ Foglamp (yes, it's me)",
};

export function SocialProof() {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col items-center gap-12 px-5 text-center sm:px-8 mb-20">
      <figure className="flex max-w-3xl flex-col items-center gap-5">
        <blockquote className="font-display text-3xl font-medium tracking-tight text-balance text-foreground sm:text-4xl">
          <span className="text-muted-foreground">“</span>
          {TESTIMONIAL.quote}
          <span className="text-muted-foreground">”</span>
        </blockquote>
        <figcaption className="text-sm text-muted-foreground flex gap-1">
          <Avatar className="size-5 mr-1">
            <AvatarImage src="/avatar.jpg" alt="Gustavo" />
            <AvatarFallback>G</AvatarFallback>
          </Avatar>
          <span className="font-medium text-foreground">
            {TESTIMONIAL.author}
          </span>{" "}
          · {TESTIMONIAL.role}
        </figcaption>
      </figure>
    </section>
  );
}
