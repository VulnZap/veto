export function Footer() {
  return (
    <footer className="py-8 px-6 border-t border-border bg-surface">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start gap-8">
          {/* Brand */}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-3">
              <img src="/veto-darkmode-icon.png" alt="Veto" className="w-5 h-5 opacity-80" />
              <span className="text-sm font-medium tracking-tight text-foreground">Veto</span>
            </div>
            <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
              Agent proposes. Veto decides. Authorization kernel for the agentic age.
            </p>
            <p className="text-sm text-muted-foreground mt-4">
              © 2026 Plaw Inc.
            </p>
          </div>

          {/* Links */}
          <div className="flex gap-12">
            <div>
              <h4 className="text-sm font-medium text-foreground mb-3">Product</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#waitlist" className="hover:text-foreground transition-colors">Waitlist</a></li>
                <li><a href="https://github.com/VulnZap/veto" className="hover:text-foreground transition-colors">Docs</a></li>
                <li><a href="https://github.com/VulnZap/veto/releases" className="hover:text-foreground transition-colors">Changelog</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-medium text-foreground mb-3">Company</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="https://plaw.dev" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">Plaw Inc.</a></li>
                <li><a href="https://twitter.com/vetorun" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">Twitter</a></li>
                <li><a href="https://github.com/VulnZap/veto" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">GitHub</a></li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
