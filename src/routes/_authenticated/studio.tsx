import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ImageIcon, ArrowRight, Users, FolderKanban, History } from "lucide-react";

export const Route = createFileRoute("/_authenticated/studio")({
  component: StudioHub,
  head: () => ({
    meta: [
      { title: "Studio Hub · pilottoon" },
      {
        name: "description",
        content: "Generate character-consistent images from prompts and presets in pilottoon.",
      },
      { property: "og:title", content: "Studio Hub · pilottoon" },
      {
        property: "og:description",
        content: "Generate character-consistent images from prompts and presets in pilottoon.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function StudioHub() {
  const { t } = useTranslation();

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-14">
      <header className="text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-xs font-semibold tracking-wide text-foreground/80">
          {t("hub.badge")}
        </span>
        <h1 className="mt-5 text-4xl font-extrabold tracking-tight">{t("hub.title")}</h1>
        <p className="mt-3 text-sm text-muted-foreground sm:text-base">{t("hub.image_body")}</p>
      </header>

      <div className="mx-auto mt-12 grid max-w-xl grid-cols-1 gap-6">
        <HubCard
          to="/make"
          icon={<ImageIcon className="h-6 w-6" strokeWidth={1.75} />}
          eyebrow="Seedream"
          title={t("hub.image_title")}
          body={t("hub.image_body")}
          cta={t("hub.image_cta")}
          bullets={[t("hub.image_b1"), t("hub.image_b2"), t("hub.image_b3")]}
        />
      </div>

      <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <QuickLink to="/projects" icon={<FolderKanban className="h-4 w-4" />} label={t("sidebar.projects")} />
        <QuickLink to="/characters" icon={<Users className="h-4 w-4" />} label={t("sidebar.characters")} />
        <QuickLink to="/history" icon={<History className="h-4 w-4" />} label={t("sidebar.history")} />
      </div>
    </main>
  );
}


function HubCard({
  to,
  icon,
  eyebrow,
  title,
  body,
  cta,
  bullets,
}: {
  to: "/make";
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
  bullets: string[];
}) {
  return (
    <Link
      to={to}
      className="group relative flex flex-col rounded-3xl border border-border bg-card p-7 transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-toss"
    >
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary-soft text-primary">
          {icon}
        </span>
        <span className="text-[11px] font-mono font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {eyebrow}
        </span>
      </div>
      <h2 className="mt-5 text-xl font-bold tracking-tight">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
      <ul className="mt-5 space-y-1.5">
        {bullets.map((b) => (
          <li key={b} className="flex items-start gap-2 text-[13px] text-foreground/75">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            {b}
          </li>
        ))}
      </ul>
      <span className="mt-7 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
        {cta}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

function QuickLink({
  to,
  icon,
  label,
}: {
  to: "/projects" | "/characters" | "/history";
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2.5 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {icon}
      {label}
    </Link>
  );
}
