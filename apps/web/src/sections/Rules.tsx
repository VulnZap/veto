const yamlCode = `rules:
  - action: navigate
    allow: ["google.com/flights", "kayak.com"]
    
  - action: click
    target: "*checkout*"
    decision: require_approval
    
  - action: evaluate
    target: "document.cookie"
    decision: deny`

export function Rules() {
  return (
    <section className="py-24 px-6 border-t border-border">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <h2 className="text-section font-medium tracking-tight text-foreground mb-10 text-center">
          Define policies in YAML.
        </h2>

        {/* Code Block */}
        <div className="bg-background rounded-sm border border-border overflow-hidden">
          {/* Simple Header */}
          <div className="flex items-center px-4 py-2 border-b border-border">
            <span className="text-xs text-text-tertiary font-mono">veto.yaml</span>
          </div>

          {/* Code */}
          <div className="p-4 overflow-x-auto scrollbar-hide">
            <pre className="text-sm font-mono leading-relaxed">
              <code>
                {yamlCode.split('\n').map((line, i) => (
                  <div key={i} className="whitespace-pre">
                    <YamlLine line={line} />
                  </div>
                ))}
              </code>
            </pre>
          </div>
        </div>

        {/* Caption */}
        <p className="mt-8 text-center text-sm text-muted-foreground">
          Or use natural language with <span className="text-foreground font-medium">Veto Cloud</span>.
        </p>
      </div>
    </section>
  )
}

function YamlLine({ line }: { line: string }) {
  if (!line.trim()) return <span>{line}</span>

  // YAML syntax highlighting
  let result = line

  // Keys (before colon)
  result = result.replace(/^(\s*)([a-z_]+):/g, '$1<span class="text-[#79c0ff]">$2</span>:')
  
  // Strings in quotes
  result = result.replace(/"([^"]*)"/g, '<span class="text-[#a5d6ff]">"$1"</span>')
  
  // Arrays
  result = result.replace(/\[/g, '<span class="text-[#8b949e]">[</span>')
  result = result.replace(/\]/g, '<span class="text-[#8b949e]">]</span>')
  
  // Decision values (allow, deny, require_approval)
  result = result.replace(/\b(allow|deny|require_approval)\b/g, '<span class="text-[#ffa657]">$1</span>')
  
  // Comments
  result = result.replace(/#(.*)$/g, '<span class="text-[#8b949e]">#$1</span>')

  return <span dangerouslySetInnerHTML={{ __html: result }} className="text-text-secondary" />
}
