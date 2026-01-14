import { Claude, Cursor, Windsurf, GithubCopilot, LangChain } from '@lobehub/icons'

export function Integrations() {
  return (
    <section className="py-24 px-6 border-t border-border">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <h2 className="text-2xl sm:text-3xl font-medium tracking-tight text-foreground mb-4 text-center">
          Works with the agents you already use.
        </h2>
        
        {/* Logos */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-8 sm:gap-12">
          <div className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <Claude size={40} />
          </div>
          <div className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <Cursor size={40} />
          </div>
          <div className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <Windsurf size={40} />
          </div>
          <div className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <GithubCopilot size={40} />
          </div>
          <div className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <LangChain size={40} />
          </div>
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
