import ResetPasswordForm from "./reset-password-form";

// better-auth redirects here from the emailed link with ?token=… on success
// or ?error=INVALID_TOKEN when the link is expired/used.
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  return (
    <div className="flex min-h-svh items-center justify-center">
      <ResetPasswordForm token={token ?? null} error={error ?? null} />
    </div>
  );
}
