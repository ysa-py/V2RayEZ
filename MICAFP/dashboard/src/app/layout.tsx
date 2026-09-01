import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { AppProviders } from "@/components/app-providers";

export const metadata: Metadata = {
  title: "V2RayEZ — کنسول فرماندهی امنیت سایبری",
  description:
    "موتور ضد سانسور هوشمند چند هسته‌ای بهینه‌شده برای ایران — ۳۰ هسته، هوش مصنوعی داخلی UCB، تعویض خودکار، حفاظت کوانتومی و قابلیت‌های سازمانی (Enterprise)",
  keywords: [
    "V2RayEZ",
    "V2RayEZ Universal",
    "ضد سانسور",
    "ایران",
    "VPN",
    "هوش مصنوعی",
    "Hiddify",
    "Xray",
    "sing-box",
    "Psiphon",
    "Enterprise",
    "امنیت سایبری",
  ],
  applicationName: "V2RayEZ Command Console",
  authors: [{ name: "V2RayEZ" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "V2RayEZ — کنسول فرماندهی امنیت سایبری",
    description:
      "پلتفرم ضد سانسور سازمانی چند هسته‌ای با هوش مصنوعی داخلی، پروتکل‌های استگانوگرافی و حفاظت کوانتومی",
    type: "website",
    locale: "fa_IR",
  },
};

export const viewport: Viewport = {
  themeColor: "#070b13",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fa"
      dir="rtl"
      suppressHydrationWarning
      className="dark"
    >
      <body className="bg-background text-foreground">
        {/* Apply persisted theme before first paint to avoid flash-of-wrong-theme */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var r=document.documentElement;var t=localStorage.getItem('v2rayez-theme')||localStorage.getItem('shield-theme');var d=t==='dark'||((!t||t==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);r.classList.toggle('dark',d);r.classList.toggle('light',!d);r.style.colorScheme=d?'dark':'light';var l=localStorage.getItem('v2rayez-locale')||localStorage.getItem('shield-locale');if(l==='en'){r.lang='en';r.dir='ltr';}}catch(e){document.documentElement.classList.add('dark');}})();`,
          }}
        />
        {/* Ambient enterprise atmosphere — aurora + precision grid */}
        <div className="shield-atmosphere" aria-hidden="true" />
        <AppProviders>{children}</AppProviders>
        <Toaster />
      </body>
    </html>
  );
}
