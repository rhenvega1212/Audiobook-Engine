import { AdminSidebar } from "./admin-sidebar";

export function AdminShell({
  userEmail,
  children,
}: {
  userEmail: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-cream lg:flex-row">
      <AdminSidebar userEmail={userEmail} />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8 w-full max-w-4xl mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
