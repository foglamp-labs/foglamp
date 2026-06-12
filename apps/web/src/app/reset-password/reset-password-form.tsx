"use client";

import { Button } from "@foglamp/ui/components/button";
import { Input } from "@foglamp/ui/components/input";
import { Label } from "@foglamp/ui/components/label";
import { IconCodeAsterix } from "@tabler/icons-react";
import { useForm } from "@tanstack/react-form";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";

export default function ResetPasswordForm({
  token,
  error,
}: {
  token: string | null;
  error: string | null;
}) {
  const router = useRouter();

  const form = useForm({
    defaultValues: { password: "", confirm: "" },
    onSubmit: async ({ value }) => {
      const { error: resetError } = await authClient.resetPassword({
        newPassword: value.password,
        token: token ?? "",
      });
      if (resetError) {
        toast.error(
          resetError.message ??
            "Could not reset your password. The link may have expired."
        );
        return;
      }
      toast.success("Password updated. Sign in with your new password.");
      router.push("/login");
    },
    validators: {
      onSubmit: z
        .object({
          password: z.string().min(8, "Use at least 8 characters."),
          confirm: z.string(),
        })
        .refine((v) => v.password === v.confirm, {
          message: "Passwords don't match.",
          path: ["confirm"],
        }),
    },
  });

  // Expired/used link, or someone landed here without going through the email.
  if (!token || error) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4 p-6">
        <div className="size-10 rounded bg-muted flex justify-center items-center">
          <IconCodeAsterix className="size-6 stroke-1" />
        </div>
        <div className="mt-5 flex flex-col gap-2">
          <h1 className="text-xl font-medium text-balance">
            This reset link isn't valid
          </h1>
          <p className="text-sm text-muted-foreground text-balance">
            {error === "INVALID_TOKEN"
              ? "The link has expired or was already used. Request a new one from the sign-in page."
              : "Open the link from your reset email, or request a new one from the sign-in page."}
          </p>
        </div>
        <Button
          variant="link"
          className="self-start px-0"
          render={<Link href="/login" />}
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
        Choose a new password
      </h1>
      <p className="mb-6 text-sm text-muted-foreground tracking-normal">
        You'll use it the next time you sign in.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
        className="flex w-full flex-col gap-5"
      >
        <form.Field name="password">
          {(field) => (
            <div className="flex flex-col gap-2.5">
              <Label htmlFor={field.name}>New password</Label>
              <Input
                id={field.name}
                name={field.name}
                type="password"
                autoComplete="new-password"
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
        </form.Field>

        <form.Field name="confirm">
          {(field) => (
            <div className="flex flex-col gap-2.5">
              <Label htmlFor={field.name}>Confirm password</Label>
              <Input
                id={field.name}
                name={field.name}
                type="password"
                autoComplete="new-password"
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
        </form.Field>

        <form.Subscribe
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
              {isSubmitting ? "Updating…" : "Update password"}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </div>
  );
}
