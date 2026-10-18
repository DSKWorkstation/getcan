import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GetCan | Water delivery desk",
  description: "One-tap requests and a simple delivery desk for water-can distributors.",
  manifest: "/api/app-manifest",
  other: { google: "notranslate" },
  appleWebApp: { capable: true, title: "GetCan", statusBarStyle: "default" },
  icons: {
    icon: "/icon-192.png",
    shortcut: "/icon-192.png",
    apple: "/icon-180.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The app has its own language picker. Browser page translation (Chrome's
    // "Translate this page") rewrites text React owns and crashes the app on the
    // next screen change, so turn it off.
    <html lang="en" translate="no">
      <body className="antialiased">
        <script dangerouslySetInnerHTML={{__html: "window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.getcanInstallPrompt=e;});window.addEventListener('appinstalled',function(){window.getcanInstallPrompt=null;});"}} />{children}</body>
    </html>
  );
}
