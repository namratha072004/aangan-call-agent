import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Bundle the context files with the serverless functions that read them.
  outputFileTracingIncludes: {
    "/api/qualify": ["./context/classifier_context.md", "./context/services.md"],
  },
};

export default nextConfig;
