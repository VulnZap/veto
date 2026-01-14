import { useState, useCallback } from 'react'
import { IconArrowRight, IconBrandGithub } from '@tabler/icons-react'
import { DotPattern } from '@/components/ui/dot-pattern'
import { Announcement, AnnouncementTag, AnnouncementTitle } from '@/components/ui/announcement'

export function Hero() {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText('pip install veto')
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [])

  return (
    <section className="pt-32 pb-24 px-6 overflow-hidden">
      {/* Subtle Background */}
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        <DotPattern
          width={24}
          height={24}
          cx={1}
          cy={1}
          className="opacity-[0.03] text-foreground"
        />
      </div>

      <div className="max-w-5xl mx-auto">
        {/* Text Content */}
        <div className="max-w-3xl mx-auto text-center">
          {/* Badge */}
          <div className="animate-in delay-1 flex justify-center mb-6">
            <Announcement themed className="bg-surface/60 border-border/60 shadow-none">
              <AnnouncementTag className="bg-primary/10 text-primary">Open source</AnnouncementTag>
              <AnnouncementTitle className="text-sm text-muted-foreground">
                Authorization kernel
              </AnnouncementTitle>
            </Announcement>
          </div>

          {/* Logo */}
          <div className="animate-in delay-2 flex justify-center">
            <img src="/veto-darkmode.png" alt="veto" className="h-12 sm:h-16 md:h-20 w-auto opacity-90" />
          </div>

          {/* Tagline */}
          <div className="mt-8 animate-in delay-3">
            <h1 className="text-hero font-medium tracking-tight text-foreground">
              Agent proposes. Veto decides.
            </h1>
            <p className="mt-4 text-lead text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Deterministic control for non-deterministic software. Prevent side effects, enforce budget limits, and audit every tool call.
            </p>
          </div>

          {/* Install Command */}
          <div className="mt-8 animate-in delay-4">
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-3 px-4 py-2.5 bg-surface text-text-secondary border border-border-subtle rounded-sm font-mono text-sm hover:border-primary/50 transition-all cursor-pointer group"
              title="Click to copy"
            >
              {copied ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-500">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <span className="text-text-tertiary">$</span>
              )}
              <span className="group-hover:text-foreground transition-colors">
                pip install veto
              </span>
            </button>
          </div>

          {/* CTAs */}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 animate-in delay-4">
            <a
              href="https://github.com/VulnZap/veto#quick-start"
              className="inline-flex items-center h-10 px-5 text-sm font-medium text-white bg-primary rounded-sm hover:bg-primary/90 transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              Get Started
              <IconArrowRight className="w-4 h-4 ml-1.5" />
            </a>
            <a
              href="https://github.com/VulnZap/veto"
              className="inline-flex items-center h-10 px-5 text-sm font-medium text-text-secondary bg-surface border border-border-subtle rounded-sm hover:bg-surface-elevated transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              <IconBrandGithub className="w-4 h-4 mr-1.5" />
              GitHub
            </a>
          </div>
        </div>

        {/* Terminal Screenshot */}
        <div className="mt-16 animate-in delay-5">
          <div className="mx-auto max-w-3xl">
            <img
              src="/terminal-screenshot.png"
              alt="Veto terminal interface showing real-time agent authorization - 7 calls, 4 allowed, 2 denied, 1 pending"
              className="w-full h-auto rounded-sm shadow-lg"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
