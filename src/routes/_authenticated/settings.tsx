import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { LogOut, Settings as SettingsIcon, ShieldCheck, User as UserIcon } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ImageModelHealthCard } from "@/components/image-model-health-card";

export const Route = createFileRoute("/_authenticated/settings")({
  ssr: false,
  component: SettingsPage,
  head: () => ({
    meta: [
      { title: "Settings · pilottoon" },
      { name: "description", content: "Manage your pilottoon account, language and image model API connection status." },
      { property: "og:title", content: "Settings · pilottoon" },
      { property: "og:description", content: "Account, language and API connection settings for pilottoon." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function Section({
  icon: Icon,
  title,
  desc,
  children,
}: {
  icon: typeof UserIcon;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-border bg-card p-6 shadow-toss-sm">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-base font-bold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{desc}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function SettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? "");
      setUserId(data.user?.id ?? "");
    });
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 p-4 sm:p-6">
      <Section icon={UserIcon} title={t("settings.account_title")} desc={t("settings.account_desc")}>
        <dl className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-background px-4 py-3">
            <dt className="text-muted-foreground">{t("settings.email")}</dt>
            <dd className="truncate font-semibold text-foreground">{email || "—"}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-background px-4 py-3">
            <dt className="text-muted-foreground">{t("settings.user_id")}</dt>
            <dd className="truncate font-mono text-xs text-muted-foreground">{userId || "—"}</dd>
          </div>
        </dl>
        <Button variant="outline" className="mt-4 rounded-xl" onClick={handleSignOut}>
          <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
          {t("common.sign_out")}
        </Button>
      </Section>

      <Section icon={SettingsIcon} title={t("settings.language_title")} desc={t("settings.language_desc")}>
        <LanguageSwitcher />
      </Section>

      <Section icon={ShieldCheck} title={t("settings.api_title")} desc={t("settings.api_desc")}>
        <ImageModelHealthCard />
        <p className="mt-3 text-xs text-muted-foreground">{t("settings.api_hint")}</p>
      </Section>
    </div>
  );
}
