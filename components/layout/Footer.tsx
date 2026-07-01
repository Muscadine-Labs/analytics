import Link from 'next/link';

const FOOTER_LINKS = [
  { label: 'Contact', href: 'https://muscadine.xyz/contact' },
  { label: 'Website', href: 'https://muscadine.xyz' },
  { label: 'Terms of Service', href: 'https://muscadine.xyz/terms' },
  { label: 'Privacy Policy', href: 'https://muscadine.xyz/privacy' },
  { label: 'Legal Disclaimer', href: 'https://muscadine.xyz/legal' },
];

export function Footer() {
  return (
    <footer className="mt-auto border-t border-slate-200 bg-white/80 px-4 py-6 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80 sm:px-6">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:flex-wrap sm:justify-between">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm">
          {FOOTER_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-600 hover:text-slate-900 hover:underline dark:text-slate-400 dark:hover:text-slate-100"
            >
              {link.label}
            </Link>
          ))}
        </div>
        <p className="text-center text-sm text-slate-500 dark:text-slate-400 sm:text-right">
          <Link
            href="https://muscadine.xyz"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-slate-700 hover:underline dark:hover:text-slate-300"
          >
            © 2026 Muscadine Labs LLC. All rights reserved.
          </Link>
        </p>
      </div>
    </footer>
  );
}
