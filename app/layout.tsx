import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { DashboardProvider } from "@/components/DashboardProvider";
import "./globals.css";

export const metadata = {
  title: "Red Alerts Dashboard",
  description: "Static analytics dashboard for Israeli red alerts."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Suspense
          fallback={
            <div className="appShell">
              <main className="contentFrame">
                <section className="panel panelLoading">
                  <h2>Preparing dashboard shell</h2>
                  <p>Loading the client-side analytics workspace.</p>
                </section>
              </main>
            </div>
          }
        >
          <DashboardProvider>
            <AppShell>{children}</AppShell>
          </DashboardProvider>
        </Suspense>
      </body>
    </html>
  );
}
