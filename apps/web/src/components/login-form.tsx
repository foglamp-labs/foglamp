"use client";

import { env } from "@foglamp/env/web";
import { Button } from "@foglamp/ui/components/button";
import { Input } from "@foglamp/ui/components/input";
import { Label } from "@foglamp/ui/components/label";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";
import { IconBrandGoogleFilled, IconCodeAsterix } from "@tabler/icons-react";

// Which sign-in methods the server has enabled (fetched by the login page from
// /api/auth-methods). Hosted: google + magic link. Self-host: password (+ magic
// link when email is configured).
export type AuthMethods = {
  emailPassword: boolean;
  magicLink: boolean;
  google: boolean;
};

// After sign-in, land on the dashboard. A hard navigation (not router.push) so
// the (app) layout's SSR session gate re-runs and sees the fresh cookie.
const OVERVIEW_URL = `${env.NEXT_PUBLIC_APP_URL}/overview`;

export default function LoginForm({ methods }: { methods: AuthMethods }) {
  // Password first when available (the self-host floor); otherwise magic link.
  const [mode, setMode] = useState<"password" | "magic">(
    methods.emailPassword ? "password" : "magic"
  );
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [googlePending, setGooglePending] = useState(false);

  const hasEmailForm =
    (mode === "password" && methods.emailPassword) ||
    (mode === "magic" && methods.magicLink);

  const signInWithGoogle = async () => {
    setGooglePending(true);
    // On success this navigates away to Google; we only return here on error.
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: OVERVIEW_URL,
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
        callbackURL: OVERVIEW_URL,
      });
      if (error) {
        toast.error(error.message ?? "Invalid email or password.");
        return;
      }
      window.location.href = OVERVIEW_URL;
    },
    validators: {
      onSubmit: z.object({
        email: z.email("Enter a valid email."),
        password: z.string().min(1, "Enter your password."),
      }),
    },
  });

  const magicForm = useForm({
    defaultValues: { email: "" },
    onSubmit: async ({ value }) => {
      const { error } = await authClient.signIn.magicLink({
        email: value.email,
        callbackURL: OVERVIEW_URL,
      });
      if (error) {
        toast.error(
          error.message ??
            "Magic-link sign-in isn't enabled on this instance."
        );
        return;
      }
      setSentTo(value.email);
    },
    validators: {
      onSubmit: z.object({ email: z.email("Enter a valid email.") }),
    },
  });

  if (sentTo) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4 p-6">
        <div className="size-10 rounded bg-muted flex justify-center items-center">
          <IconCodeAsterix className="size-6 stroke-1" />
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
          Back to sign in
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col p-6">
      <div className="size-10 rounded-lg bg-muted shadow-(--custom-shadow) flex justify-center items-center">
        <IconCodeAsterix className="size-6 stroke-1" />
      </div>
      <h1 className="mt-5 mb-1 w-full text-start text-lg font-medium text-balance">
        Sign in
      </h1>
      <p className="mb-6 text-sm text-muted-foreground tracking-normal">
        {!hasEmailForm
          ? "Continue with your Google account."
          : mode === "password"
            ? "Use your email and password."
            : "We'll email you a sign-in link."}
      </p>

      {methods.google && (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={googlePending}
          onClick={signInWithGoogle}
        >
          <IconBrandGoogleFilled className="size-4" />
          {googlePending ? "Redirecting…" : "Continue with Google"}
        </Button>
      )}

      {methods.google && hasEmailForm && (
        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-border" />
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
                <Label htmlFor={field.name}>Password</Label>
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
                {isSubmitting ? "Signing in…" : "Sign in"}
              </Button>
            )}
          </passwordForm.Subscribe>
        </form>
      ) : hasEmailForm ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            magicForm.handleSubmit();
          }}
          className="flex w-full flex-col gap-5"
        >
          <magicForm.Field name="email">
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

      {methods.emailPassword && methods.magicLink && (
        <Button
          variant="link"
          className="mt-4 self-start px-0 text-muted-foreground"
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
