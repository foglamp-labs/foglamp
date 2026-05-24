"use client";

import { env } from "@watchtower/env/web";
import { Button } from "@watchtower/ui/components/button";
import { Input } from "@watchtower/ui/components/input";
import { Label } from "@watchtower/ui/components/label";
import { useForm } from "@tanstack/react-form";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";
import { IconCodeAsterix } from "@tabler/icons-react";

export default function MagicLinkForm() {
  const { isPending } = authClient.useSession();
  const [sentTo, setSentTo] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      email: "",
    },
    onSubmit: async ({ value }) => {
      const callbackURL = `${env.NEXT_PUBLIC_APP_URL}/overview`;
      const { error } = await authClient.signIn.magicLink({
        email: value.email,
        callbackURL,
      });
      if (error) {
        toast.error(error.message ?? "Não foi possível enviar o link.");
        return;
      }
      setSentTo(value.email);
    },
    validators: {
      onSubmit: z.object({
        email: z.email("E-mail inválido"),
      }),
    },
  });

  if (sentTo) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4 p-6">
        <div className="size-10 rounded bg-muted flex justify-center items-center">
          <IconCodeAsterix className="size-6 stroke-1" />
        </div>
        <div className="mt-5 flex flex-col gap-2">
          <h1 className="text-xl font-medium text-balance">
            Verifique seu e-mail
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Enviamos um link de acesso para{" "}
            <span className="font-medium text-foreground">{sentTo}</span>.
          </p>
          <p className="text-sm text-muted-foreground text-balance">
            O link expira em 15 minutos.
          </p>
        </div>
        <Button
          variant="link"
          className="self-start px-0"
          onClick={() => setSentTo(null)}
        >
          Usar outro e-mail
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
        Entrar
      </h1>
      <p className="mb-6 text-sm text-muted-foreground tracking-normal">
        Enviaremos um link de acesso para o seu e-mail.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
        className="flex w-full flex-col gap-5"
      >
        <form.Field name="email">
          {(field) => (
            <div className="flex flex-col gap-2.5">
              <Label htmlFor={field.name}>E-mail</Label>
              <Input
                id={field.name}
                name={field.name}
                type="email"
                autoComplete="email"
                placeholder="seu@email.com"
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
              className="w-full"
              disabled={!canSubmit || isSubmitting}
            >
              {isSubmitting ? "Enviando..." : "Enviar link de acesso"}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </div>
  );
}
