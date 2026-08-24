import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/api/internal/database-bootstrap": ["./drizzle/**/*"],
  },
};

export default nextConfig;
