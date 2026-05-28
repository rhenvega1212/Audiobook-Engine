import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Avoid corrupted vendor-chunks for Supabase during dev hot reload
  serverExternalPackages: [
    "@supabase/supabase-js",
    "@supabase/ssr",
    "tailwind-merge",
    "clsx",
    "@radix-ui/react-dialog",
    "@radix-ui/react-select",
    "@radix-ui/react-progress",
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
