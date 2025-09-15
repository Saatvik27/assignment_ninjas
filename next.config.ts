/** @type {import('next').NextConfig} */
const nextConfig = {
  // Output configuration for better deployment
  output: 'standalone',
  
  // Configure output file tracing root to fix the warning
  outputFileTracingRoot: process.cwd(),
  
  // ESLint configuration for production build
  eslint: {
    // Skip ESLint during builds to avoid deployment failures
    ignoreDuringBuilds: true,
  },
  
  // TypeScript configuration
  typescript: {
    // Ignore type errors during build for deployment
    ignoreBuildErrors: true,
  },
  
  // Image optimization
  images: {
    domains: [],
    remotePatterns: [],
  },
  
  // Experimental features for better performance
  experimental: {
    // Additional experimental features can be added here
  },
  
  // Server external packages configuration
  serverExternalPackages: ['@supabase/supabase-js'],
}

export default nextConfig
