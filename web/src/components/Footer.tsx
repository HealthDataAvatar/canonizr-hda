export function Footer() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-6 text-xs text-muted">
        <p>&copy; {new Date().getFullYear()} Canonizr</p>
        <nav className="flex gap-6">
          <a href="https://portal.canonizr.com" className="hover:text-foreground">
            Portal
          </a>
          <a href="https://api.canonizr.com/docs" className="hover:text-foreground">
            API Docs
          </a>
        </nav>
      </div>
    </footer>
  );
}
