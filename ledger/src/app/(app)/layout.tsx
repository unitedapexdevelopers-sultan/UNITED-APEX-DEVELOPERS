import { SessionProviderClient } from "@/components/SessionProviderClient";
import { DataProvider } from "@/components/DataProvider";
import { SidebarNav } from "@/components/SidebarNav";
import { C } from "@/lib/theme";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProviderClient>
      <DataProvider>
        <div style={{ background: C.bg, color: C.text, minHeight: "100vh", display: "flex" }}>
          <SidebarNav />
          <div style={{ flex: 1, padding: 28, overflow: "auto", minWidth: 0 }}>{children}</div>
        </div>
      </DataProvider>
    </SessionProviderClient>
  );
}
