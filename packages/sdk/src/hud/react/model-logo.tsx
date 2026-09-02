import type { SVGProps } from "react";

type Logo = (props: SVGProps<SVGSVGElement>) => React.ReactElement;

function OpenAILogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="currentColor" viewBox="0 0 256 260" aria-hidden="true">
      <path d="M239.184 106.203a64.716 64.716 0 0 0-5.576-53.103C219.452 28.459 191 15.784 163.213 21.74A65.586 65.586 0 0 0 52.096 45.22a64.716 64.716 0 0 0-43.23 31.36c-14.31 24.602-11.061 55.634 8.033 76.74a64.665 64.665 0 0 0 5.525 53.102c14.174 24.65 42.644 37.324 70.446 31.36a64.72 64.72 0 0 0 48.754 21.744c28.481.025 53.714-18.361 62.414-45.481a64.767 64.767 0 0 0 43.229-31.36c14.137-24.558 10.875-55.423-8.083-76.483Zm-97.56 136.338a48.397 48.397 0 0 1-31.105-11.255l1.535-.87 51.67-29.825a8.595 8.595 0 0 0 4.247-7.367v-72.85l21.845 12.636c.218.111.37.32.409.563v60.367c-.056 26.818-21.783 48.545-48.601 48.601Zm-104.466-44.61a48.345 48.345 0 0 1-5.781-32.589l1.534.921 51.722 29.826a8.339 8.339 0 0 0 8.441 0l63.181-36.425v25.221a.87.87 0 0 1-.358.665l-52.335 30.184c-23.257 13.398-52.97 5.431-66.404-17.803ZM23.549 85.38a48.499 48.499 0 0 1 25.58-21.333v61.39a8.288 8.288 0 0 0 4.195 7.316l62.874 36.272-21.845 12.636a.819.819 0 0 1-.767 0L41.353 151.53c-23.211-13.454-31.171-43.144-17.804-66.405v.256Zm179.466 41.695-63.08-36.63L161.73 77.86a.819.819 0 0 1 .768 0l52.233 30.184a48.6 48.6 0 0 1-7.316 87.635v-61.391a8.544 8.544 0 0 0-4.4-7.213Zm21.742-32.69-1.535-.922-51.619-30.081a8.39 8.39 0 0 0-8.492 0L99.98 99.808V74.587a.716.716 0 0 1 .307-.665l52.233-30.133a48.652 48.652 0 0 1 72.236 50.391v.205ZM88.061 139.097l-21.845-12.585a.87.87 0 0 1-.41-.614V65.685a48.652 48.652 0 0 1 79.757-37.346l-1.535.87-51.67 29.825a8.595 8.595 0 0 0-4.246 7.367l-.051 72.697Zm11.868-25.58 28.138-16.217 28.188 16.218v32.434l-28.086 16.218-28.188-16.218-.052-32.434Z" />
    </svg>
  );
}

function ClaudeLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="#D97757" aria-hidden="true">
      <path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312z" />
    </svg>
  );
}

function GeminiLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 24A14.304 14.304 0 0 0 0 12 14.304 14.304 0 0 0 12 0a14.305 14.305 0 0 0 12 12 14.305 14.305 0 0 0-12 12"
        fill="url(#fl-gemini)"
      />
      <defs>
        <radialGradient
          id="fl-gemini"
          cx="0"
          cy="0"
          r="1"
          gradientTransform="matrix(16.1326 5.4553 -43.70045 129.2322 1.588 6.503)"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset=".067" stopColor="#9168C0" />
          <stop offset=".343" stopColor="#5684D1" />
          <stop offset=".672" stopColor="#1BA1E3" />
        </radialGradient>
      </defs>
    </svg>
  );
}

function MistralLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 256 233" aria-hidden="true">
      <path d="M186.18 0h46.545v46.545H186.18z" />
      <path fill="#F7D046" d="M209.455 0H256v46.545h-46.545z" />
      <path d="M0 0h46.545v46.545H0zM0 46.545h46.545V93.09H0zM0 93.09h46.545v46.546H0zM0 139.636h46.545v46.546H0zM0 186.18h46.545v46.546H0z" />
      <path fill="#F7D046" d="M23.273 0h46.545v46.545H23.273z" />
      <path fill="#F2A73B" d="M209.455 46.545H256V93.09h-46.545zM23.273 46.545h46.545V93.09H23.273z" />
      <path d="M139.636 46.545h46.545V93.09h-46.545z" />
      <path fill="#F2A73B" d="M162.91 46.545h46.545V93.09H162.91zM69.818 46.545h46.545V93.09H69.818z" />
      <path fill="#EE792F" d="M116.364 93.09h46.545v46.546h-46.545zM162.91 93.09h46.545v46.546H162.91zM69.818 93.09h46.545v46.546H69.818z" />
      <path d="M93.09 139.636h46.546v46.546H93.09z" />
      <path fill="#EB5829" d="M116.364 139.636h46.545v46.546h-46.545z" />
      <path fill="#EE792F" d="M209.455 93.09H256v46.546h-46.545zM23.273 93.09h46.545v46.546H23.273z" />
      <path d="M186.18 139.636h46.545v46.546H186.18z" />
      <path fill="#EB5829" d="M209.455 139.636H256v46.546h-46.545zM23.273 139.636h46.545v46.546H23.273z" />
      <path d="M186.18 186.18h46.545v46.546H186.18z" />
      <path fill="#EA3326" d="M209.455 186.18H256v46.546h-46.545zM23.273 186.18h46.545v46.546H23.273z" />
    </svg>
  );
}

function GrokLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 1024 1024" fill="none" aria-hidden="true">
      <path d="M395.479 633.828L735.91 381.105c16.689-12.39 40.544-7.557 48.496 11.687 41.854 101.493 23.155 223.461-60.118 307.204-83.272 83.743-199.137 102.108-305.041 60.281l-115.691 53.866c165.934 114.059 367.431 85.852 493.345-40.861 99.875-100.439 130.807-237.345 101.884-360.806l.262.263c-41.942-181.369 10.311-253.865 117.351-402.106 2.53-3.515 5.07-7.03 7.6-10.633L883.144 141.651v-.439L395.392 633.916" fill="currentColor" />
      <path d="M325.226 695.251C206.128 580.84 226.662 403.776 328.285 301.668c75.146-75.571 198.264-106.414 305.741-61.072L749.454 186.994c-20.797-15.114-47.447-31.371-78.03-42.794-138.234-57.206-303.731-28.735-416.101 84.182-108.089 108.699-142.079 275.833-83.71 418.451 43.603 106.59-27.874 181.985-99.874 258.083C46.224 931.893 20.622 958.87 0 987.429l325.139-292.09" fill="currentColor" />
    </svg>
  );
}

function DeepSeekLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4D6BFE" d="M23.748 4.482c-.254-.124-.364.113-.512.234-.051.039-.094.09-.137.136-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.156-.708-.311-.955-.65-.172-.241-.219-.51-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.093.172.187.129.323-.082.28-.18.552-.266.833-.055.179-.137.217-.329.14a5.526 5.526 0 0 1-1.736-1.18c-.857-.828-1.631-1.742-2.597-2.458a11.365 11.365 0 0 0-.689-.471c-.985-.957.13-1.743.388-1.836.27-.098.093-.432-.779-.428-.872.004-1.67.295-2.687.684a3.055 3.055 0 0 1-.465.137 9.597 9.597 0 0 0-2.883-.102c-1.885.21-3.39 1.102-4.497 2.623C.082 8.606-.231 10.684.152 12.85c.403 2.284 1.569 4.175 3.36 5.653 1.858 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.133-.284 4.994-1.86.47.234.962.327 1.78.397.63.059 1.236-.03 1.705-.128.735-.156.684-.837.419-.961-2.155-1.004-1.682-.595-2.113-.926 1.096-1.296 2.746-2.642 3.392-7.003.05-.347.007-.565 0-.845-.004-.17.035-.237.23-.256a4.173 4.173 0 0 0 1.545-.475c1.396-.763 1.96-2.015 2.093-3.517.02-.23-.004-.467-.247-.588zM11.581 18c-2.089-1.642-3.102-2.183-3.52-2.16-.392.024-.321.471-.235.763.09.288.207.486.371.739.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.167-1.361-.802-2.5-1.86-3.301-3.307-.774-1.393-1.224-2.887-1.298-4.482-.02-.386.093-.522.477-.592a4.696 4.696 0 0 1 1.529-.039c2.132.312 3.946 1.265 5.468 2.774.868.86 1.525 1.887 2.202 2.891.72 1.066 1.494 2.082 2.48 2.914.348.292.625.514.891.677-.802.09-2.14.11-3.054-.614zm1-6.44a.306.306 0 0 1 .415-.287.302.302 0 0 1 .2.288.306.306 0 0 1-.31.307.303.303 0 0 1-.305-.308zm3.11 1.596c-.2.081-.399.151-.59.16a1.245 1.245 0 0 1-.798-.254c-.274-.23-.47-.358-.552-.758a1.73 1.73 0 0 1 .016-.588c.07-.327-.008-.537-.239-.727-.187-.156-.426-.199-.688-.199a.559.559 0 0 1-.254-.078.253.253 0 0 1-.114-.358c.028-.054.16-.186.192-.21.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.391.451.462.576.685.914.176.265.336.537.445.848.067.195-.019.354-.25.452z" />
    </svg>
  );
}

function ChipLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2" />
    </svg>
  );
}

const LOGOS: Record<string, Logo> = {
  openai: OpenAILogo,
  azure: OpenAILogo,
  anthropic: ClaudeLogo,
  claude: ClaudeLogo,
  google: GeminiLogo,
  gemini: GeminiLogo,
  "google-generative-ai": GeminiLogo,
  vertex: GeminiLogo,
  mistral: MistralLogo,
  mistralai: MistralLogo,
  xai: GrokLogo,
  "x-ai": GrokLogo,
  grok: GrokLogo,
  deepseek: DeepSeekLogo,
};

const MODEL_ID_HINTS: [RegExp, string][] = [
  [/^(gpt|o[1-4]\b|o[1-4]-|chatgpt|text-|davinci)/, "openai"],
  [/^claude/, "claude"],
  [/^(gemini|gemma|palm|bison)/, "google"],
  [/^(mistral|mixtral|magistral|codestral|ministral|pixtral)/, "mistral"],
  [/^grok/, "xai"],
  [/^deepseek/, "deepseek"],
];

function resolveVendorKey(provider?: string | null, modelId?: string | null): string | null {
  const id = modelId?.toLowerCase();
  const fromSlash = id?.includes("/") ? id.split("/")[0] : undefined;
  const fromProvider = provider?.split(".")[0]?.toLowerCase();
  for (const key of [fromSlash, fromProvider]) {
    if (key && LOGOS[key]) return key;
  }
  if (id) {
    for (const [pattern, vendor] of MODEL_ID_HINTS) {
      if (pattern.test(id) && LOGOS[vendor]) return vendor;
    }
  }
  return null;
}

const MODEL_WORD_CASE: Record<string, string> = {
  gpt: "GPT",
  ai: "AI",
  oss: "OSS",
  deepseek: "DeepSeek",
  openai: "OpenAI",
  xai: "xAI",
};

/** Raw model id → friendly name, e.g. "anthropic/claude-sonnet-4-6" → "Claude Sonnet 4.6". */
export function formatModelName(modelId?: string | null): string {
  if (!modelId) return "—";
  let id = modelId.includes("/") ? modelId.slice(modelId.lastIndexOf("/") + 1) : modelId;
  id = id.replace(/[-@](\d{4}-\d{2}-\d{2}|\d{8}|\d{6})$/i, "").replace(/-latest$/i, "");
  const parts = id.split(/[-_]/).filter(Boolean);
  const tokens: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (/^\d+$/.test(parts[i]!)) {
      const run = [parts[i]!];
      while (i + 1 < parts.length && /^\d+$/.test(parts[i + 1]!)) run.push(parts[++i]!);
      tokens.push(run.join("."));
    } else {
      tokens.push(parts[i]!);
    }
  }
  const words = tokens.map((t) => {
    const cased = MODEL_WORD_CASE[t.toLowerCase()];
    if (cased) return cased;
    if (/^\d/.test(t)) return t.replace(/(\d)b$/i, "$1B");
    return t.charAt(0).toUpperCase() + t.slice(1);
  });
  const out: string[] = [];
  for (const w of words) {
    if (out.at(-1) === "GPT" && /^\d/.test(w)) out[out.length - 1] = `GPT-${w}`;
    else out.push(w);
  }
  return out.join(" ");
}

/** Brand logo for a (provider, modelId) pair; falls back to a neutral chip. */
export function ModelLogo({
  provider,
  modelId,
  className,
  size = 12,
}: {
  provider?: string | null;
  modelId?: string | null;
  className?: string;
  size?: number;
}) {
  const key = resolveVendorKey(provider, modelId);
  const Logo = (key ? LOGOS[key] : undefined) ?? ChipLogo;
  // Explicit width/height attrs: an inline SVG with only a viewBox doesn't
  // reliably honor CSS sizing, so it'd otherwise balloon to its container.
  return <Logo className={className} width={size} height={size} />;
}
