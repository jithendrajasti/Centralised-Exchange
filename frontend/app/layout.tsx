import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Appbar } from "./components/Appbar";
import { AuthProvider } from "./providers/AuthProvider";
import { ToastProvider } from "./providers/ToastProvider";
import { ThemeProvider } from "./providers/ThemeProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CEX Exchange",
  description:
    "Trade your favorite cryptocurrencies with low fees and deep liquidity",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${inter.className} bg-bp-bg-primary text-bp-text-primary antialiased`}
      >
        <ThemeProvider>
          <AuthProvider>
            <ToastProvider />
            <div className="flex flex-col h-screen overflow-hidden">
              <Appbar />
              <main className="flex-1 overflow-hidden">{children}</main>
            </div>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}