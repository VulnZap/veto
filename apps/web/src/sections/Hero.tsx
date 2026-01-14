import { IconArrowRight, IconBrandGithub } from '@tabler/icons-react'

export function Hero() {
  return (
    <section className="pt-32 pb-24 px-6 overflow-hidden">
      <div className="max-w-5xl mx-auto">
        {/* Text Content */}
        <div className="max-w-3xl mx-auto text-center">
          {/* Logo */}
          <div className="animate-in delay-1 flex justify-center">
            <img src="/veto-darkmode.png" alt="veto" className="h-16 sm:h-20 md:h-24 w-auto" />
          </div>

          {/* Tagline */}
          <div className="mt-8 animate-in delay-2">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-medium tracking-tight text-foreground">
              Agent proposes. Veto decides.
            </h1>
          </div>

          {/* Install Command */}
          <div className="mt-10 animate-in delay-3">
            <button
              onClick={() => {
                navigator.clipboard.writeText('pip install veto')
                // Simple feedback - could enhance with toast notification
              }}
              className="inline-flex items-center gap-3 px-4 py-2.5 bg-surface text-text-secondary border border-border-subtle rounded font-mono text-sm hover:border-primary/50 transition-colors cursor-pointer group"
              title="Click to copy"
            >
              <span className="text-text-tertiary">$</span>
              <span className="group-hover:text-foreground transition-colors">pip install veto</span>
            </button>
          </div>

          {/* CTAs */}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 animate-in delay-4">
            <a
              href="https://github.com/VulnZap/veto#quick-start"
              className="btn-primary inline-flex items-center h-11 px-6 text-sm font-medium text-white rounded"
              target="_blank"
              rel="noopener noreferrer"
            >
              Get Started
              <IconArrowRight className="w-4 h-4 ml-1.5" />
            </a>
            <a
              href="https://github.com/VulnZap/veto"
              className="btn-secondary inline-flex items-center h-11 px-6 text-sm font-medium text-text-secondary border border-border-subtle rounded"
              target="_blank"
              rel="noopener noreferrer"
            >
              <IconBrandGithub className="w-4 h-4 mr-1.5" />
              GitHub
            </a>
          </div>
        </div>

        {/* Terminal Screenshot - The Real Deal */}
        <div className="mt-16 animate-in delay-5">
          <div className="mx-auto max-w-3xl">
            <img
              src="/terminal-screenshot.png"
              alt="Veto terminal interface showing real-time agent authorization - 7 calls, 4 allowed, 2 denied, 1 pending"
              className="w-full h-auto rounded-lg border border-border/50 shadow-2xl"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
