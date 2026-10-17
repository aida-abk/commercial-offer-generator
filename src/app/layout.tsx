import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "JT Electrics — Генератор КП",
  description: "Генератор коммерческих предложений по электромонтажу",
};

const navLinks = [
  { href: "/", label: "Загрузка PDF", shortLabel: "Новое" },
  { href: "/offers", label: "КП", shortLabel: "КП" },
  { href: "/admin", label: "Прайс", shortLabel: "Прайс" },
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
          {/* На телефоне подпись и длинные названия пунктов прячутся, иначе
              шапка разъезжается на три строки. */}
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3 sm:gap-4 sm:px-6 sm:py-4">
            <Link href="/" className="shrink-0 text-base font-semibold text-slate-900 sm:text-lg">
              JT Electrics
              <span className="ml-2 hidden text-sm font-normal text-slate-500 sm:inline">
                Генератор КП
              </span>
            </Link>
            <nav className="flex shrink-0 items-center gap-0.5 sm:gap-2">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="whitespace-nowrap rounded-md px-2 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 sm:px-3"
                >
                  <span className="sm:hidden">{link.shortLabel}</span>
                  <span className="hidden sm:inline">{link.label}</span>
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </body>
    </html>
  );
}
