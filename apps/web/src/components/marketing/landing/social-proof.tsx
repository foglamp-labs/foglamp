import {
  AnthropicLogo,
  ClaudeLogo,
  CohereLogo,
  DeepSeekLogo,
  GeminiLogo,
  GrokLogo,
  MetaLogo,
  MistralLogo,
  OpenAILogo,
  PerplexityLogo,
} from "@/components/brand-logos";

// A quiet, factual strip: Foglamp instruments the AI SDK, so every provider it
// speaks to is covered. Monochrome glyphs, no card, reads as a fact not an ad.
const PROVIDERS = [
  { label: "OpenAI", Logo: OpenAILogo },
  { label: "Anthropic", Logo: AnthropicLogo },
  { label: "Claude", Logo: ClaudeLogo },
  { label: "Gemini", Logo: GeminiLogo },
  { label: "Mistral", Logo: MistralLogo },
  { label: "Meta", Logo: MetaLogo },
  { label: "DeepSeek", Logo: DeepSeekLogo },
  { label: "Grok", Logo: GrokLogo },
  { label: "Cohere", Logo: CohereLogo },
  { label: "Perplexity", Logo: PerplexityLogo },
];

export function SocialProof() {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col items-center gap-7 px-5 text-center sm:px-8">
      <p className="text-sm text-muted-foreground">
        Works with the AI SDK. Every model, every provider.
      </p>
      <ul className="flex list-none flex-wrap items-center justify-center gap-x-8 gap-y-5">
        {PROVIDERS.map(({ label, Logo }) => (
          <li key={label} title={label} className="text-muted-foreground/70">
            <Logo className="h-5 w-auto grayscale" aria-label={label} />
          </li>
        ))}
      </ul>
    </section>
  );
}
