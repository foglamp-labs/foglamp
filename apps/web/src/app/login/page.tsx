import LoginForm from "@/components/login-form";
import { fetchAuthMethods } from "@/lib/auth-methods";

// The login form renders only the sign-in methods the server actually has
// configured, so this page must ask the server at request time.
export const dynamic = "force-dynamic";

// Only same-site relative paths survive (no "//host" or absolute URLs), so
// ?next= can't be used as an open redirect.
function sanitizeNext(next: string | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const methods = await fetchAuthMethods();
  return (
    <div className="flex min-h-svh items-center justify-center">
      <LoginForm methods={methods} next={sanitizeNext(next)} />
    </div>
  );
}
