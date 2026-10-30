/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 31536000, // IPFS images never change
    localPatterns: [{ pathname: "/api/img/**" }, { pathname: "/brand/**" }],
  },
};
export default nextConfig;
