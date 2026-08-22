import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { bootstrapTenant } from "@/lib/onboarding.functions";
import { Button } from "@/components/ui/button";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { LanguageSwitcher } from "@/components/language-switcher";
import { LogOut, User as UserIcon, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthenticatedLayout,
});

const PAGE_META_KEYS: Record<string, string> = {
  "/studio": "header.studio_hub",
  "/projects": "header.projects",
  "/episodes": "header.episodes",
  "/characters": "header.characters",
  "/make": "header.make",
  "/history": "header.history",
  "/usage": "header.usage",
};

// Session + tenant bootstrap only needs to happen once per browser session.
// Caching it prevents a full-screen loading flash (and state loss) whenever the
// layout remounts — e.g. after a router invalidation triggered by Supabase auth events.
let bootstrapCache: { email: string } | null = null;

function AuthenticatedLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"checking" | "onboarding" | "ready" | "error">(
    bootstrapCache ? "ready" : "checking",
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [email, setEmail] = useState<string>(bootstrapCache?.email ?? "");
  const bootstrap = useServerFn(bootstrapTenant);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const meta = useMemo(() => {
    const key = Object.keys(PAGE_META_KEYS).find((k) => pathname === k || pathname.startsWith(k + "/"));
    if (!key) return { title: t("brand.name"), sub: "" };
    return {
      title: t(`${PAGE_META_KEYS[key]}.title`),
      sub: t(`${PAGE_META_KEYS[key]}.sub`),
    };
  }, [pathname, t]);

  useEffect(() => {
    if (bootstrapCache) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        navigate({ to: "/auth", replace: true });
        return;
      }
      const userEmail = data.user.email ?? "";
      if (!cancelled) {
        setEmail(userEmail);
        setStatus("onboarding");
      }
      try {
        await bootstrap();
        bootstrapCache = { email: userEmail };
        if (!cancelled) setStatus("ready");
      } catch (e) {
        if (!cancelled) {
          setErrorMsg(e instanceof Error ? e.message : String(e));
          setStatus("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, bootstrap]);


  async function handleSignOut() {
    bootstrapCache = null;
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }


  if (status === "checking" || status === "onboarding") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
          <div className="h-10 w-10 animate-pulse rounded-2xl bg-primary-soft" />
          {status === "checking" ? t("auth.checking_session") : t("auth.preparing_workspace")}
        </div>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md space-y-4 rounded-3xl border border-border bg-card p-8 text-center shadow-toss">
          <h2 className="text-lg font-bold">{t("auth.onboarding_failed")}</h2>
          <p className="break-all text-sm text-muted-foreground">{errorMsg}</p>
          <Button onClick={handleSignOut} variant="outline" className="rounded-xl">
            {t("common.sign_out")}
          </Button>
        </div>
      </main>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-muted/40 text-foreground">
        <AppSidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur sm:px-6">
            <div className="hidden h-6 w-px bg-border sm:block" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-bold tracking-tight">{meta.title}</div>
              {meta.sub && (
                <div className="truncate text-xs text-muted-foreground">{meta.sub}</div>
              )}
            </div>

            <LanguageSwitcher />



            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 pr-3 transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20"
                  aria-label={email || "user menu"}
                >
                  <span className="max-w-[160px] truncate text-xs font-semibold text-foreground">
                    {email || "user"}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 rounded-2xl p-1.5">
                <DropdownMenuLabel className="px-2 py-2">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-primary-soft text-sm font-bold text-primary">
                      {(email?.[0] || "U").toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-foreground">
                        {email ? email.split("@")[0] : "user"}
                      </div>
                      <div className="truncate text-[11px] font-normal text-muted-foreground">
                        {email || "—"}
                      </div>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="rounded-xl px-2.5 py-2 text-sm"
                  onSelect={() => navigate({ to: "/projects" })}
                >
                  <UserIcon className="mr-2 h-4 w-4" />
                  {t("header.projects.title")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="rounded-xl px-2.5 py-2 text-sm text-destructive focus:text-destructive"
                  onSelect={handleSignOut}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  {t("common.sign_out")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>

          <main className="flex-1">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
