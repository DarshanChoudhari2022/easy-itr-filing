import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";

interface AppLayoutProps {
  children: ReactNode;
  hideHeader?: boolean;
  contentClassName?: string;
}

export function AppLayout({ children, hideHeader = false, contentClassName }: AppLayoutProps) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        {!hideHeader && (
          <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4">
            <SidebarTrigger className="-ml-1" />
          </header>
        )}
        <main className={cn("flex-1 w-full max-w-[100vw] overflow-x-hidden p-2 md:p-6 lg:p-8", contentClassName)}>
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
