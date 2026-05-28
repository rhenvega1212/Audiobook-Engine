import { PageHeader } from "@/components/layout/page-header";
import { VoicesClient } from "./voices-client";

export default function VoicesPage() {
  return (
    <>
      <PageHeader
        title="Voice library"
        description="Search your ElevenLabs account or browse the public library to import new voices."
      />
      <VoicesClient />
    </>
  );
}
