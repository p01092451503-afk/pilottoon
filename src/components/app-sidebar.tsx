import { Link, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Users, History, FolderKanban, Search, LayoutGrid, Image as ImageIcon, Wallet } from "lucide-react";
import { useEffect, useState } from "react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";

export function AppSidebar() {
  const { t } = useTranslation();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (path: string) =>
    pathname === path || pathname.startsWith(path + "/");
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  const groups = [
    {
      label: t("sidebar.group_assets"),
      items: [
        { title: t("sidebar.projects"), url: "/projects", icon: FolderKanban },
        { title: t("sidebar.characters"), url: "/characters", icon: Users },
      ],
    },
    {
      label: t("sidebar.group_studio"),
      items: [
        { title: t("sidebar.hub"), url: "/studio", icon: LayoutGrid },
        { title: t("sidebar.make"), url: "/make", icon: ImagePlus },
        { title: t("sidebar.studio"), url: "/generate", icon: ImageIcon },

      ],
    },
    {
      label: t("sidebar.group_records"),
      items: [
        { title: t("sidebar.history"), url: "/history", icon: History },
        { title: t("sidebar.usage"), url: "/usage", icon: Wallet },
      ],
    },
  ] as const;



  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar">
      {collapsed && (
        <div className="flex items-center justify-center px-2 pt-2">
          <SidebarTrigger
            aria-label={t("common.toggle_sidebar")}
            className="h-7 w-7 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          />
        </div>
      )}

      <SidebarHeader className="border-none pt-3 pb-2">
        <div className={`flex items-center ${collapsed ? "justify-center" : "gap-2 px-2"}`}>
          <Link
            to="/"
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            
            {!collapsed && (
              <span className="text-[37px] font-black tracking-tighter text-foreground leading-none">
                {t("brand.name")}
              </span>
            )}
          </Link>
        </div>

        {!collapsed && (
          <div className="mt-5 flex items-center gap-2 px-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder={t("common.search_placeholder")}
                className="h-10 w-full rounded-2xl border border-border bg-card pl-10 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/15"
              />
            </div>
            <SidebarTrigger
              aria-label={t("common.toggle_sidebar")}
              className="h-10 w-10 shrink-0 rounded-2xl border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
            />
          </div>
        )}
      </SidebarHeader>


      <SidebarContent className="px-2 pt-4">
        {groups.map((group) => (
          <SidebarGroup key={group.label} className="px-0 py-1">
            {!collapsed && (
              <SidebarGroupLabel className="px-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">
                {group.label}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu className="gap-1.5">
                {group.items.map((item) => {
                  const active = isActive(item.url);
                  return (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.title}
                        className="h-12 rounded-2xl px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[active=true]:border data-[active=true]:border-border data-[active=true]:bg-card data-[active=true]:font-semibold data-[active=true]:text-foreground data-[active=true]:shadow-toss-sm"
                      >
                        <Link to={item.url} className="flex items-center gap-3">
                          <item.icon
                            className={`h-5 w-5 shrink-0 ${active ? "text-primary" : ""}`}
                            strokeWidth={2}
                          />
                          {!collapsed && <span className="truncate">{item.title}</span>}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>


    </Sidebar>
  );
}
