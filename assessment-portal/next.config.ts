import type { NextConfig } from "next";
import path from "path";

// Pin the workspace root to THIS project. The user has stray lockfiles and a
// middleware.ts under ~/Desktop, which Next would otherwise mis-infer as the
// project root (pulling in unrelated middleware/auth files).
const nextConfig: NextConfig = {
  outputFileTracingRoot: path.resolve("."),
  turbopack: {
    root: path.resolve("."),
  },
};

export default nextConfig;
