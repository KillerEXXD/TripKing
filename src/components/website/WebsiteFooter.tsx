import { Link } from 'react-router-dom';
import type { WebsiteCopy } from './copy';

export function WebsiteFooter({ t }: { t: WebsiteCopy }) {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-gray-100 bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <div className="flex items-center gap-2">
              <img src="/logo-mark.svg" alt="" className="h-6 w-auto" />
              <span className="text-lg font-extrabold tracking-tight">
                <span className="text-emerald-600">Trip</span>King
              </span>
            </div>
            <p className="mt-3 text-sm text-gray-500">{t.footer.tagline}</p>
            <p className="mt-2 text-xs text-gray-400">{t.footer.langNote}</p>
          </div>

          <nav className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <a href="#how" className="text-gray-600 hover:text-gray-900">{t.nav.howItWorks}</a>
            <a href="#features" className="text-gray-600 hover:text-gray-900">{t.nav.forDrivers}</a>
            <a href="#how" className="text-gray-600 hover:text-gray-900">{t.nav.forAgents}</a>
            <Link to="/" className="text-gray-600 hover:text-gray-900">{t.nav.openApp}</Link>
            <Link to="/for-agents" className="text-gray-600 hover:text-gray-900">For agents</Link>
            <Link to="/passenger" className="text-emerald-700 hover:underline">
              {t.footer.passenger}
            </Link>
          </nav>
        </div>

        <div className="mt-8 border-t border-gray-200 pt-5 text-xs text-gray-400">
          © {year} Trip King. {t.footer.rights}
        </div>
      </div>
    </footer>
  );
}

export default WebsiteFooter;
