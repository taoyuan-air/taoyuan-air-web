import type { Metadata } from "next";
import { TopNav } from "@/components/navigation/TopNav";
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
    <html lang="zh-TW">
      <body style={{ minHeight: '100vh' }}>
        <TopNav />
        <main style={{ paddingTop: 80 }}>{children}</main>
      </body>
    </html>
  );
}
