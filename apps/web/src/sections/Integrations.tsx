import { Claude, Cursor, Windsurf, GithubCopilot, LangChain, Anthropic, OpenAI, Groq, HuggingFace, CrewAI, OpenWebUI } from '@lobehub/icons'
import { IconShieldCheck, IconLock, IconKey, IconBrowser } from '@tabler/icons-react'
import { Marquee } from '@/components/ui/marquee'

export function Integrations() {
  const logos = [
    { icon: IconShieldCheck, name: 'Veto Secure' },
    { icon: IconLock, name: 'Authorization' },
    { icon: Claude, name: 'Claude' },
    { icon: Cursor, name: 'Cursor' },
    { icon: OpenAI, name: 'OpenAI' },
    { icon: Anthropic, name: 'Anthropic' },
    { icon: LangChain, name: 'LangChain' },
    { icon: CrewAI, name: 'CrewAI' },
    { icon: OpenWebUI, name: 'OpenWebUI' },
    { icon: IconBrowser, name: 'browser-use' },
    { icon: Windsurf, name: 'Windsurf' },
    { icon: GithubCopilot, name: 'Copilot' },
    { icon: Groq, name: 'Groq' },
    { icon: IconKey, name: 'API Keys' },
    { icon: HuggingFace, name: 'HuggingFace' },
  ]

  return (
    <section className="py-16 px-6 border-t border-border">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <h2 className="text-section font-medium tracking-tight text-foreground mb-8 text-center">
          Secure every agent interaction.
        </h2>

        {/* Marquee */}
        <div className="relative overflow-hidden marquee-container">
          <Marquee className="gap-[1.75rem]">
            {[...logos, ...logos, ...logos].map((logo, index) => (
              <div
                key={index}
                className="flex items-center justify-center w-[3.5rem] h-[3.5rem]"
                title={logo.name}
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
