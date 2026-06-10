// Shared layout for the legal pages (/privacy, /terms): a narrow column of
// numbered sections, hand-styled since the app doesn't use a typography plugin.

export type LegalSection = {
  heading: string;
  body: React.ReactNode;
};

export function LegalPage({
  title,
  effectiveDate,
  intro,
  sections,
}: {
  title: string;
  effectiveDate: string;
  intro: React.ReactNode;
  sections: LegalSection[];
}) {
  return (
    <div className="mx-auto max-w-3xl px-5 pb-24 sm:px-8">
      <div className="mt-20">
        <h1 className="font-display text-4xl font-semibold tracking-tight">
          {title}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Effective {effectiveDate}
        </p>
      </div>

      <div className="mt-8 text-[15px] leading-7 text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground [&_a]:font-medium [&_a]:text-foreground [&_a]:underline">
        {intro}

        {sections.map((section, i) => (
          <section key={section.heading} className="mt-10">
            <h2 className="text-lg font-medium text-foreground">
              {i + 1}. {section.heading}
            </h2>
            <div className="mt-3 flex flex-col gap-3">{section.body}</div>
          </section>
        ))}
      </div>
    </div>
  );
}

export function LegalList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="flex list-disc flex-col gap-2 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}
