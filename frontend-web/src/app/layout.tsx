import type { Metadata } from "next";
import { TopNav } from "@/components/navigation/TopNav";
import { AuthProvider } from "@/lib/auth-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "Taoyuan Air Monitor",
  description: "桃園市空氣品質即時監測",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Browser extensions can inject attributes before React hydrates the app.
    <html lang="zh-TW" suppressHydrationWarning>
      <body style={{ minHeight: '100vh' }}>
        <AuthProvider>
          <TopNav />
          <main style={{ paddingTop: 80 }}>{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
