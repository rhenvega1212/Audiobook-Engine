import { AdminSidebar } from "./admin-sidebar";

export function AdminShell({
  userEmail,
  children,
}: {
  userEmail: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-cream">
      <AdminSidebar userEmail={userEmail} />
      <div className="flex flex-1 flex-col">
        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8 max-w-3xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
