import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "JT Electrics — Генератор КП",
  description: "Генератор коммерческих предложений по электромонтажу",
};

const navLinks = [
  { href: "/", label: "Загрузка PDF" },
  { href: "/offers", label: "КП" },
  { href: "/admin", label: "Прайс" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="min-h-screen antialiased">
        <header className="border-b border-slate-200 bg-white shadow-sm">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
            <Link href="/" className="text-lg font-semibold text-slate-900">
              JT Electrics
              <span className="ml-2 text-sm font-normal text-slate-500">Генератор КП</span>
            </Link>
            <nav className="flex flex-wrap items-center gap-1 sm:gap-2">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
