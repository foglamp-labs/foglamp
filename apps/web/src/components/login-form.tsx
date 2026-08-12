"use client";

import { env } from "@foglamp/env/web";
import { Button } from "@foglamp/ui/components/button";
import { Input } from "@foglamp/ui/components/input";
import { Label } from "@foglamp/ui/components/label";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { GoogleLogo } from "@/components/brand-logos";
import { BrandMark } from "@/components/marketing/brand-mark";
import { authClient } from "@/lib/auth-client";

// Which sign-in methods the server has enabled (fetched by the login page from
// /api/auth-methods). Hosted: google + magic link. Self-host: password (+ magic
// link when email is configured).
export type AuthMethods = {
  emailPassword: boolean;
  magicLink: boolean;
  google: boolean;
};

export default function LoginForm({
  methods,
  next,
}: {
  methods: AuthMethods;
  // Sanitized same-site path to return to after sign-in (e.g. an invitation
  // link that bounced through /login); defaults to the dashboard.
  next?: string | null;
}) {
  // After sign-in, land back where the user was headed. A hard navigation (not
  // router.push) so SSR session gates re-run and see the fresh cookie.
  const callbackUrl = `${env.NEXT_PUBLIC_APP_URL}${next ?? "/overview"}`;
  // Password first when available (the self-host floor); otherwise magic link.
  const [mode, setMode] = useState<"password" | "magic" | "forgot">(
    methods.emailPassword ? "password" : "magic"
  );
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resetSentTo, setResetSentTo] = useState<string | null>(null);
  const [googlePending, setGooglePending] = useState(false);

  const hasEmailForm =
    ((mode === "password" || mode === "forgot") && methods.emailPassword) ||
    (mode === "magic" && methods.magicLink);

  const signInWithGoogle = async () => {
    setGooglePending(true);
    // On success this navigates away to Google; we only return here on error.
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: callbackUrl,
    });
    if (error) {
      toast.error(error.message ?? "Google sign-in failed. Try again.");
      setGooglePending(false);
    }
  };

  const passwordForm = useForm({
    defaultValues: { email: "", password: "" },
    onSubmit: async ({ value }) => {
      const { error } = await authClient.signIn.email({
        email: value.email,
        password: value.password,
        callbackURL: callbackUrl,
      });
      if (error) {
        toast.error(error.message ?? "Invalid email or password.");
        return;
      }
      window.location.href = callbackUrl;
    },
    validators: {
      onSubmit: z.object({
        email: z.email("Enter a valid email."),
        password: z.string().min(1, "Enter your password."),
      }),
    },
  });

  const forgotForm = useForm({
    defaultValues: { email: "" },
    onSubmit: async ({ value }) => {
      const { error } = await authClient.requestPasswordReset({
        email: value.email,
        redirectTo: `${env.NEXT_PUBLIC_APP_URL}/reset-password`,
      });
      if (error) {
        toast.error(error.message ?? "Could not send the reset email.");
        return;
      }
      setResetSentTo(value.email);
    },
    validators: {
      onSubmit: z.object({ email: z.email("Enter a valid email.") }),
    },
  });

  const magicForm = useForm({
    defaultValues: { email: "" },
    onSubmit: async ({ value }) => {
      const { error } = await authClient.signIn.magicLink({
        email: value.email,
        callbackURL: callbackUrl,
      });
      if (error) {
        toast.error(
          error.message ?? "Magic-link sign-in isn't enabled on this instance."
        );
        return;
      }
      setSentTo(value.email);
    },
    validators: {
      onSubmit: z.object({ email: z.email("Enter a valid email.") }),
    },
  });

  if (resetSentTo) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4 p-6">
        <div className="size-10 rounded-md squircle:rounded-2xl corner-squircle shadow-(--custom-shadow) bg-muted flex justify-center items-center">
          <BrandMark className="w-7" />
        </div>
        <div className="mt-3 flex flex-col gap-2">
          <h1 className="text-xl font-medium text-balance">Check your email</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            If an account exists for{" "}
            <span className="font-medium text-foreground">{resetSentTo}</span>,
            we sent it a password reset link.
          </p>
          <p className="text-sm text-muted-foreground text-balance mt-2">
            The link expires in{" "}
            <span className="text-foreground font-medium">1 hour</span>.
          </p>
        </div>
        <Button
          className="self-start mt-2"
          onClick={() => {
            setResetSentTo(null);
            setMode("password");
          }}
        >
          Back to login
        </Button>
      </div>
    );
  }

  if (sentTo) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4 p-6">
        <div className="size-10 rounded-md squircle:rounded-2xl corner-squircle shadow-(--custom-shadow) bg-muted flex justify-center items-center">
          <BrandMark className="w-7" />
        </div>
        <div className="mt-5 flex flex-col gap-2">
          <h1 className="text-xl font-medium text-balance">Check your email</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            We sent a sign-in link to{" "}
            <span className="font-medium text-foreground">{sentTo}</span>.
          </p>
          <p className="text-sm text-muted-foreground text-balance">
            The link expires in 15 minutes.
          </p>
        </div>
        <Button
          variant="link"
          className="self-start px-0"
          onClick={() => {
            setSentTo(null);
            setMode(methods.emailPassword ? "password" : "magic");
          }}
        >
          Back to login
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col p-6">
      <div className="size-10 rounded-md squircle:rounded-2xl corner-squircle bg-muted shadow-(--custom-shadow) flex justify-center items-center">
        <BrandMark className="w-7" />
      </div>
      <h1 className="mt-5 mb-1 w-full text-start text-lg font-medium text-balance">
        {mode === "forgot" ? "Reset your password" : "Login"}
      </h1>
      <p className="mb-6 text-sm text-muted-foreground tracking-normal">
        {mode === "forgot"
          ? "We'll email you a link to choose a new password."
          : "Sign in to your Foglamp account to continue."}
      </p>

      {methods.google && mode !== "forgot" && (
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          disabled={googlePending}
          onClick={signInWithGoogle}
        >
          <GoogleLogo className="size-3.5 mr-0.75" />
          {googlePending ? "Redirecting…" : "Continue with Google"}
        </Button>
      )}

      {methods.google && hasEmailForm && mode !== "forgot" && (
        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-border/50" />
          <span className="text-xs text-muted-foreground/60">or</span>
          <div className="h-px flex-1 bg-border/50" />
        </div>
      )}

      {hasEmailForm && mode === "password" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            passwordForm.handleSubmit();
          }}
          className="flex w-full flex-col gap-5"
        >
          <passwordForm.Field name="email">
            {(field) => (
              <div className="flex flex-col gap-2.5">
                <Label htmlFor={field.name}>Email</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                {field.state.meta.errors.map((error) => (
                  <p key={error?.message} className="text-xs text-destructive">
                    {error?.message}
                  </p>
                ))}
              </div>
            )}
          </passwordForm.Field>

          <passwordForm.Field name="password">
            {(field) => (
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor={field.name}>Password</Label>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                    onClick={() => setMode("forgot")}
                  >
                    Forgot password?
                  </button>
                </div>
                <Input
                  id={field.name}
                  name={field.name}
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                {field.state.meta.errors.map((error) => (
                  <p key={error?.message} className="text-xs text-destructive">
                    {error?.message}
                  </p>
                ))}
              </div>
            )}
          </passwordForm.Field>

          <passwordForm.Subscribe
            selector={(state) => ({
              canSubmit: state.canSubmit,
              isSubmitting: state.isSubmitting,
            })}
          >
            {({ canSubmit, isSubmitting }) => (
              <Button
                type="submit"
                className="w-full mt-2"
                disabled={!canSubmit || isSubmitting}
              >
                {isSubmitting ? "Signing in…" : "Login"}
              </Button>
            )}
          </passwordForm.Subscribe>
        </form>
      ) : hasEmailForm && mode === "forgot" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            forgotForm.handleSubmit();
          }}
          className="flex w-full flex-col gap-5"
        >
          <forgotForm.Field name="email">
            {(field) => (
              <div className="flex flex-col gap-2.5">
                <Input
                  id={field.name}
                  name={field.name}
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                {field.state.meta.errors.map((error) => (
                  <p key={error?.message} className="text-xs text-destructive">
                    {error?.message}
                  </p>
                ))}
              </div>
            )}
          </forgotForm.Field>

          <forgotForm.Subscribe
            selector={(state) => ({
              canSubmit: state.canSubmit,
              isSubmitting: state.isSubmitting,
            })}
          >
            {({ canSubmit, isSubmitting }) => (
              <Button
                type="submit"
                className="w-full mt-1"
                disabled={!canSubmit || isSubmitting}
              >
                {isSubmitting ? "Sending…" : "Send reset link"}
              </Button>
            )}
          </forgotForm.Subscribe>

          <Button
            type="button"
            variant="link"
            className="self-start px-0 text-muted-foreground/50"
            onClick={() => setMode("password")}
          >
            Back to login
          </Button>
        </form>
      ) : hasEmailForm ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            magicForm.handleSubmit();
          }}
          className="flex w-full flex-col gap-6"
        >
          <magicForm.Field name="email">
            {(field) => (
              <div className="flex flex-col gap-2.5">
                <Input
                  id={field.name}
                  name={field.name}
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                {field.state.meta.errors.map((error) => (
                  <p key={error?.message} className="text-xs text-destructive">
                    {error?.message}
                  </p>
                ))}
              </div>
            )}
          </magicForm.Field>

          <magicForm.Subscribe
            selector={(state) => ({
              canSubmit: state.canSubmit,
              isSubmitting: state.isSubmitting,
            })}
          >
            {({ canSubmit, isSubmitting }) => (
              <Button
                type="submit"
                className="w-full"
                disabled={!canSubmit || isSubmitting}
              >
                {isSubmitting ? "Sending…" : "Send sign-in link"}
              </Button>
            )}
          </magicForm.Subscribe>
        </form>
      ) : null}

      {methods.emailPassword && methods.magicLink && mode !== "forgot" && (
        <Button
          variant="link"
          className="mt-4 self-start px-0 text-muted-foreground/50 hover:text-foreground"
          onClick={() => setMode(mode === "password" ? "magic" : "password")}
        >
          {mode === "password"
            ? "Email me a sign-in link instead"
            : "Use email and password instead"}
        </Button>
      )}
    </div>
  );
}
