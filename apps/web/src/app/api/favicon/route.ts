import { getGoogleFavicon } from "@/lib/favicon";

// Same-origin favicon proxy for the poster renderer. The board loads logos from
// here (not directly from gstatic) so the html-to-image Download canvas stays
// untainted — a cross-origin <img> would otherwise strip the logos from the PNG.
export async function GET(req: Request): Promise<Response> {
  const domain = new URL(req.url).searchParams.get("domain");
  if (!domain) return new Response(null, { status: 400 });
  try {
    const upstream = await fetch(getGoogleFavicon(domain));
    const buf = await upstream.arrayBuffer();
    return new Response(buf, {
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "image/png",
        "cache-control": "public, max-age=86400, s-maxage=86400",
      },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}
