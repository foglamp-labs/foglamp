import { getGoogleFavicon } from "@/lib/favicon";

// Same-origin favicon proxy for the poster renderer: fetches the upstream
// favicon service server-side and re-serves it with a long cache, so the board
// loads logos from this origin instead of hitting gstatic per render.
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
