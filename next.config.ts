import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O driver pg é nativo e não deve ser empacotado pelo bundler do servidor.
  serverExternalPackages: ["pg"],
};

export default nextConfig;
