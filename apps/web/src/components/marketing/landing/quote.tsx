// One pull quote, hairline framed. The attribution is a placeholder until we
// have a customer who has said yes to being quoted. Keep it obviously fake so
// nobody ships it by accident.

export function Quote() {
	return (
		<section className="mx-auto mt-32 w-full max-w-7xl px-5 sm:mt-40 sm:px-8">
			<figure className="m-0 grid gap-8 border-t border-border/70 pt-8 lg:grid-cols-[1fr_3fr] lg:gap-20">
				<span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
					From a team on Foglamp
				</span>
				<div className="max-w-3xl">
					<blockquote className="m-0 font-display text-2xl font-medium tracking-tight text-balance sm:text-3xl">
						&ldquo;We found a tool that was being called four times per ticket
						on the first afternoon. Nobody had noticed for a month.&rdquo;
					</blockquote>
					<figcaption className="mt-5 text-sm text-muted-foreground">
						Name Surname, Head of Engineering, Company
					</figcaption>
				</div>
			</figure>
		</section>
	);
}
