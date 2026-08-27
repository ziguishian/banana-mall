import type { Metadata } from "next";
import { Toaster } from "sonner";

import "./globals.css";

import { AppShell } from "@/components/layout/app-shell";
import { ProviderCredentialFetchBridge } from "@/components/layout/provider-credential-fetch-bridge";
import { ThemeScript } from "@/components/layout/theme-script";
import { BackToTopButton } from "@/components/shared/back-to-top-button";
import { BrandConsole } from "@/components/shared/brand-console";
import { ChunkReloadGuard } from "@/components/shared/chunk-reload-guard";
import { ImagePreviewProvider } from "@/components/shared/image-preview-provider";

export const metadata: Metadata = {
  title: "MxPage",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/brand-icon.ico",
  },
  description: "MxPage AI product page and social content generation workspace.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeScript />
        <ChunkReloadGuard />
        <BrandConsole />
        <ProviderCredentialFetchBridge />
        <ImagePreviewProvider>
          <AppShell>{children}</AppShell>
          <BackToTopButton />
        </ImagePreviewProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
