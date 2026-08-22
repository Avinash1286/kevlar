import type { Metadata } from "next";
import { DM_Mono, Inter, Newsreader } from "next/font/google";
import type { ReactNode } from "react";
import { KevlarAuthProvider } from "../components/convex-auth-provider";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });
const mono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});
const serif = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-serif",
});

export const metadata: Metadata = {
  title: "Kevlar — Verified live-web intelligence",
  description:
    "Certify self-healing collector repairs before web data reaches production.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable} ${serif.variable}`}
    >
      <body>
        <KevlarAuthProvider>{children}</KevlarAuthProvider>
      </body>
    </html>
  );
}
