import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { BottomTabs, SidebarNav } from './Nav';
import { useConnectionStore } from '../store/connection';

export function Layout() {
  const healthError = useConnectionStore((s) => s.healthError);
  return (
    <div className="flex h-full min-h-screen flex-col">
      <Header />
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-52 shrink-0 border-r border-line bg-panel lg:block">
          <SidebarNav />
        </aside>
        <main className="min-w-0 flex-1 overflow-auto p-3 pb-20 lg:p-5 lg:pb-5">
          {healthError ? (
            <div className="mb-3 rounded border border-bad/50 bg-bad/10 px-3 py-2 text-xs text-bad">
              Server unreachable: {healthError}. Check the server URL on the SETTINGS page and that the server is running on port 8080.
            </div>
          ) : null}
          <Outlet />
        </main>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-40 lg:hidden">
        <BottomTabs />
      </div>
    </div>
  );
}
