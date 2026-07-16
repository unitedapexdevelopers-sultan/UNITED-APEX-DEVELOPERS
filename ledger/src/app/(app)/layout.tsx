import { SessionProviderClient } from "@/components/SessionProviderClient";
import { DataProvider } from "@/components/DataProvider";
import { SidebarNav } from "@/components/SidebarNav";
import { BottomNav } from "@/components/BottomNav";
import { MobileTopBar } from "@/components/MobileTopBar";
import { C } from "@/lib/theme";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProviderClient>
      <DataProvider>
        <div style={{ background: C.bg, color: C.text, minHeight: "100vh", display: "flex" }}>
          <SidebarNav />
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <MobileTopBar />
            <div className="app-content" style={{ flex: 1, padding: 28, overflow: "auto" }}>
              {children}
            </div>
          </div>
        </div>
        <BottomNav />
      </DataProvider>
    </SessionProviderClient>
  );
}
