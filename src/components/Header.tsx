interface HeaderProps {
  activeSection: 'composer' | 'sandbox' | 'topics' | 'history' | 'methodology';
  hasActiveLesson: boolean;
  onNavigate: (section: 'composer' | 'sandbox' | 'topics' | 'history' | 'methodology') => void;
  onNewQuestion: () => void;
}

export function Header({
  activeSection,
  hasActiveLesson,
  onNavigate,
  onNewQuestion,
}: HeaderProps) {
  const navLinkClass = (isActive: boolean) =>
    `text-sm font-medium transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 cursor-pointer ${
      isActive
        ? 'text-white border-sky-400'
        : 'text-slate-300 border-transparent hover:text-white hover:border-blue-700'
    }`;

  return (
    <header className="sticky top-0 z-30 bg-[#070E23]/95 backdrop-blur-sm border-b border-[#1B2D5C]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            onNavigate(hasActiveLesson ? 'sandbox' : 'composer');
          }}
          className="font-display text-xl font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          Ustoz AI
        </a>

        <nav className="hidden md:flex items-center gap-7">
          <button
            type="button"
            onClick={() => onNavigate(hasActiveLesson ? 'sandbox' : 'composer')}
            className={navLinkClass(activeSection === 'sandbox' || activeSection === 'composer')}
          >
            Dars
          </button>
          <button
            type="button"
            onClick={() => onNavigate('topics')}
            className={navLinkClass(activeSection === 'topics')}
          >
            Mavzular
          </button>
          <button
            type="button"
            onClick={() => onNavigate('history')}
            className={navLinkClass(activeSection === 'history')}
          >
            Tarix
          </button>
          <button
            type="button"
            onClick={() => onNavigate('methodology')}
            className={navLinkClass(activeSection === 'methodology')}
          >
            Qanday o&apos;rgatadi
          </button>
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onNewQuestion}
            className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 cursor-pointer"
          >
            Yangi savol
          </button>
        </div>
      </div>
    </header>
  );
}
