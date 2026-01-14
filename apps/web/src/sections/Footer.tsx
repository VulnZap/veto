export function Footer() {
  return (
    <footer className="py-12 px-6 border-t border-border bg-surface">
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <img src="/veto-darkmode-icon.png" alt="Veto" className="w-6 h-6 opacity-80" />
              <span className="text-sm font-medium tracking-tight text-foreground">Veto</span>
            </div>
            <p className="text-xs text-muted-foreground max-w-xs">
              Agent proposes. Veto decides. The authorization kernel for the agentic age.
            </p>
            <p className="text-xs text-muted-foreground mt-8">
              © 2026 Plaw Inc.
            </p>
          </div>

          {/* Links 1 */}
          <div>
            <h4 className="text-xs font-semibold text-foreground mb-4 uppercase tracking-wider">Product</h4>
            <ul className="space-y-3 text-xs text-muted-foreground">
              <li>
                <a href="#waitlist" className="hover:text-foreground transition-colors">Waitlist</a>
              </li>
              <li>
                <a href="https://github.com/VulnZap/veto" className="hover:text-foreground transition-colors">Documentation</a>
              </li>
              <li>
                <a href="https://github.com/VulnZap/veto/releases" className="hover:text-foreground transition-colors">Changelog</a>
              </li>
            </ul>
          </div>

          {/* Links 2 */}
          <div>
            <h4 className="text-xs font-semibold text-foreground mb-4 uppercase tracking-wider">Company</h4>
            <ul className="space-y-3 text-xs text-muted-foreground">
              <li>
                <a href="https://plaw.dev" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">Plaw Inc.</a>
              </li>
              <li>
                <a href="https://twitter.com/vetorun" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">Twitter</a>
              </li>
              <li>
                <a href="https://github.com/VulnZap/veto" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">GitHub</a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  )
}
