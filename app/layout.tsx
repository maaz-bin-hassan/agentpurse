import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const sans = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
});

const mono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "AgentPurse",
  description: "A checkbook AI agents spend from. PayPal charges the merchant. The purse does not hold the money.",
  manifest: "/manifest.json",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('theme')==='light')document.documentElement.classList.remove('dark')}catch(e){}",
          }}
        />
      </head>
      <body className={`${sans.variable} ${mono.variable} ${sans.className}`}>{children}</body>
    </html>
  );
}
