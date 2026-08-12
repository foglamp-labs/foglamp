// Renders a schema.org JSON-LD <script>. Structured data feeds both classic
// search rich-results and answer engines / LLMs (GEO), which lean on schema.org
// to extract facts about the product, pricing, and org. This is a server
// component, so the JSON ships in the initial HTML — no JS needed for a crawler
// to read it.
//
// The `data` is always built from trusted, static values in our own code (never
// user input), so dangerouslySetInnerHTML is safe here. We escape `<` to keep a
// stray "</script>" inside any string from terminating the tag early.
export function JsonLd({ data }: { data: Record<string, unknown> }) {
	return (
		<script
			type="application/ld+json"
			dangerouslySetInnerHTML={{
				__html: JSON.stringify(data).replace(/</g, "\\u003c"),
			}}
		/>
	);
}
