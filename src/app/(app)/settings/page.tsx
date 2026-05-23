import { SettingsClient } from "./settings-client";
import { PageHeader } from "@/components/layout/page-header";

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Manage pen names and series for your catalog."
      />
      <SettingsClient />
    </>
  );
}
