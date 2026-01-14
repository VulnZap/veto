import { Claude, Cursor, Windsurf, GithubCopilot, LangChain, Anthropic, OpenAI, Groq, HuggingFace, CrewAI } from '@lobehub/icons'
import { IconShieldCheck, IconLock, IconKey, IconBrowser } from '@tabler/icons-react'
import { Marquee } from '@/components/ui/marquee'

export function Integrations() {
  const items = [
    // Security Icons
    { icon: IconShieldCheck, isSecurity: true },
    { icon: IconLock, isSecurity: true },
    { icon: IconKey, isSecurity: true },
    // Separator
    { icon: null, isSeparator: true },
    // Agent Icons
    { icon: Claude, isSecurity: false },
    { icon: Cursor, isSecurity: false },
    { icon: OpenAI, isSecurity: false },
    { icon: Anthropic, isSecurity: false },
    { icon: LangChain, isSecurity: false },
    { icon: CrewAI, isSecurity: false },
    { icon: IconBrowser, isSecurity: false },
    { icon: Windsurf, isSecurity: false },
    { icon: GithubCopilot, isSecurity: false },
    { icon: Groq, isSecurity: false },
    { icon: HuggingFace, isSecurity: false },
  ]

  return (
    <section className="py-16 px-6 border-t border-border">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <h2 className="text-section font-medium tracking-tight text-foreground mb-8 text-center">
          Works with every agent.
        </h2>

        {/* Marquee */}
        <div className="relative overflow-hidden marquee-container">
          <Marquee className="gap-0" pauseOnHover>
            {[...items, ...items, ...items].map((item, index) => (
              <div key={index} className="flex items-center">
                {item.isSeparator ? (
                  <div className="w-[1px] h-8 bg-border/50 mx-4" />
                ) : (
                  <div className="flex items-center justify-center w-[3.5rem] h-[3.5rem]">
                    {item.icon && (
                      <item.icon
                        size={32}
                        className="text-muted-foreground/80"
                      />
                    )}
                  </div>
                )}
              </div>
            ))}
          </Marquee>
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
