import { Claude, Cursor, Windsurf, GithubCopilot, LangChain } from '@lobehub/icons'
import { IconBrandChrome, IconTerminal, IconCode, IconCpu } from '@tabler/icons-react'
import { Marquee } from '@/components/ui/marquee'

export function Integrations() {
  const logos = [
    { icon: Claude, name: 'Claude' },
    { icon: Cursor, name: 'Cursor' },
    { icon: Windsurf, name: 'Windsurf' },
    { icon: GithubCopilot, name: 'GitHub Copilot' },
    { icon: LangChain, name: 'LangChain' },
    { icon: IconBrandChrome, name: 'browser-use' },
    { icon: IconTerminal, name: 'CLI' },
    { icon: IconCode, name: 'Playwright' },
    { icon: IconCpu, name: 'OpenAI' },
  ]

  return (
    <section className="py-16 px-6 border-t border-border">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <h2 className="text-section font-medium tracking-tight text-foreground mb-8 text-center">
          Works with the agents you already use.
        </h2>

        {/* Marquee */}
        <div className="relative overflow-hidden">
          <Marquee pauseOnHover className="py-4">
            {logos.map((logo, index) => (
              <div
                key={index}
                className="flex items-center gap-2 px-6 py-3 rounded-lg border border-border bg-surface hover:border-border-subtle transition-colors"
              >
                <logo.icon size={28} className="text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{logo.name}</span>
              </div>
            ))}
          </Marquee>

          {/* Edge Fades */}
          <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-background to-transparent pointer-events-none" />
          <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-background to-transparent pointer-events-none" />
        </div>

        {/* SDK Callout */}
        <div className="mt-8 text-center">
          <p className="text-sm text-muted-foreground">
            Python SDK · TypeScript SDK · Any tool-calling LLM
          </p>
        </div>
      </div>
    </section>
  )
}
