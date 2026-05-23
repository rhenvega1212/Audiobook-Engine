import { PageHeader } from "@/components/layout/page-header";
import { VoicesClient } from "./voices-client";

export default function VoicesPage() {
  return (
    <>
      <PageHeader
        title="Voice library"
        description="Browse ElevenLabs voices available for casting."
      />
      <VoicesClient />
    </>
  );
}
