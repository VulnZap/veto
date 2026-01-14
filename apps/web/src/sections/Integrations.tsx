import { Claude, Cursor, Windsurf, GithubCopilot, LangChain, Anthropic, OpenAI, Groq, HuggingFace } from '@lobehub/icons'
import { IconBrandChrome } from '@tabler/icons-react'
import { Marquee } from '@/components/ui/marquee'

export function Integrations() {
  const logos = [
    { icon: Claude },
    { icon: Cursor },
    { icon: Windsurf },
    { icon: GithubCopilot },
    { icon: LangChain },
    { icon: Anthropic },
    { icon: OpenAI },
    { icon: Groq },
    { icon: HuggingFace },
    { icon: IconBrandChrome },
  ]

  return (
    <section className="py-16 px-6 border-t border-border">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <h2 className="text-section font-medium tracking-tight text-foreground mb-8 text-center">
          Works with the agents you already use.
        </h2>

        {/* Marquee */}
        <div className="relative overflow-hidden marquee-container">
          <Marquee className="gap-[1.75rem]">
            {[...logos, ...logos, ...logos].map((logo, index) => (
              <div
                key={index}
                className="flex items-center justify-center w-[3.5rem] h-[3.5rem]"
              >
                <logo.icon size={32} className="text-muted-foreground/80" />
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
