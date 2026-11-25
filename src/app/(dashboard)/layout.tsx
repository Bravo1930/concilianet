import { Suspense } from "react";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Topbar } from "@/components/layout/topbar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-slate-50/60 dark:bg-background">
      <Suspense
        fallback={
          <aside className="hidden w-64 shrink-0 border-r border-sidebar-border bg-sidebar lg:block" />
        }
      >
        <AppSidebar />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
