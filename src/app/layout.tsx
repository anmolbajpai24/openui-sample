/**
 * layout.tsx
 * What: the frame Next.js wraps around every page. It sets the browser tab
 * title and loads the Inter font.
 * Why: Next.js needs a root layout, and OpenUI's styles ask for Inter.
 */
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Budget Buddy",
  description: "A chat assistant that helps you understand your spending.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
