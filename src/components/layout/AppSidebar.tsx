import { useState } from "react";
import { useLocation } from "react-router-dom";
import {
  Home,
  Bitcoin,
  Settings,
  LogOut,
  Sparkles,
  Calculator,
  HelpCircle,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

// ── Simplified navigation: only 5 core items ──
// Users need: File ITR, Dashboard, Crypto, Regime Optimizer, Settings
// Everything else was either a stub or confusing for newbies

const mainNavItems = [
  { title: "File Your ITR", url: "/guided", icon: Sparkles, description: "Step-by-step guided filing" },
  { title: "Dashboard", url: "/dashboard", icon: Home, description: "Overview & status" },
  { title: "Crypto Tax", url: "/crypto", icon: Bitcoin, description: "Calculate crypto gains" },
  { title: "Best Regime", url: "/optimizer", icon: Calculator, description: "Old vs New comparison" },
];

export function AppSidebar() {
  const { signOut, user } = useAuth();
  const location = useLocation();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  const isActive = (path: string) => location.pathname === path;

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-3 px-2 py-2">
          <img src="/logo.png" alt="EasyITR" className="h-10 w-10 rounded-xl" />
          {!collapsed && (
            <div className="flex flex-col">
              <span className="font-bold text-sidebar-foreground bg-gradient-to-r from-indigo-400 to-teal-400 bg-clip-text text-transparent">EasyITR</span>
              <span className="text-xs text-sidebar-foreground/60">ITR preparation</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50">
            {!collapsed && "Tax Filing"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                    tooltip={item.title}
                  >
                    <NavLink
                      to={item.url}
                      className="flex items-center gap-3"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground"
                    >
                      <item.icon className="h-4 w-4" />
                      <div className="flex flex-col">
                        <span className="text-sm">{item.title}</span>
                        {!collapsed && (
                          <span className="text-[10px] text-sidebar-foreground/40 leading-tight">{item.description}</span>
                        )}
                      </div>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Help section */}
        {!collapsed && (
          <SidebarGroup>
            <SidebarGroupContent>
              <div className="mx-2 mt-2 p-3 rounded-lg bg-gradient-to-br from-indigo-500/10 to-teal-500/10 border border-indigo-500/20">
                <p className="text-[11px] font-medium text-sidebar-foreground/80 mb-1">💡 New to ITR filing?</p>
                <p className="text-[10px] text-sidebar-foreground/50 leading-relaxed">
                  Click "File Your ITR" above. We'll guide you step-by-step with where to get every value.
                </p>
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Settings">
              <NavLink
                to="/settings"
                className="flex items-center gap-3"
                activeClassName="bg-sidebar-accent text-sidebar-accent-foreground"
              >
                <Settings className="h-4 w-4" />
                <span>Settings</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={signOut}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              tooltip="Sign Out"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {!collapsed && user && (
          <div className="mt-2 px-2 py-2 rounded-lg bg-sidebar-accent/50">
            <p className="text-xs text-sidebar-foreground/70 truncate">
              {user.email}
            </p>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}

