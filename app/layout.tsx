import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TheBRB — The Big Red Button",
  description:
    "TheBRB is your real-estate AI assistant. One button. Next move handled. Powered by SellFast.Now.",
  applicationName: "TheBRB",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "TheBRB",
  },
};

export const viewport: Viewport = {
  themeColor: "#0A0A0B",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="bg-brb-bg">
      <body className="bg-brb-bg text-brb-text font-sans min-h-screen">
        {children}
      </body>
    </html>
  );
}
