import "@fontsource-variable/figtree";
import "./globals.css";
import { NavProvider } from "../components/nav";
import { THEME_BOOT } from "../lib/prefs";

export const metadata = { title: "Link Cable", robots: { index: false, follow: false } };
export const viewport = { width: "device-width", initialScale: 1, viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#eef0f3" }, { media: "(prefers-color-scheme: dark)", color: "#0f1115" }] };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} /></head>
      <body>
        <NavProvider />
        {children}
      </body>
    </html>
  );
}
