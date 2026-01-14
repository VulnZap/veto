import { useState } from 'react'

const pythonCode = `from browser_use import Agent
from veto import Veto

veto = Veto(
    allow=["google.com/flights"],
    require_approval=["*checkout*"]
)

agent = Agent(browser=veto.browser())
agent.run("Book a flight under $400")`

const typescriptCode = `import { Agent } from "browser-use";
import { Veto } from "veto-sdk";

const veto = new Veto({
  allow: ["google.com/flights"],
  requireApproval: ["*checkout*"]
});

const agent = new Agent({ 
  browser: veto.browser() 
});
await agent.run("Book a flight under $400");`

const cliCode = `$ veto init
Created veto.yaml with default rules

$ veto run -- npx browser-use \\
    "Book a flight under $400"

✓ 4 allowed  ✗ 2 denied  ⏸ 1 pending`

type Tab = 'python' | 'typescript' | 'cli'

export function CodeTabs() {
  const [activeTab, setActiveTab] = useState<Tab>('python')

  const tabs: { id: Tab; label: string }[] = [
    { id: 'python', label: 'Python' },
    { id: 'typescript', label: 'TypeScript' },
    { id: 'cli', label: 'CLI' },
  ]

  const code = {
    python: pythonCode,
    typescript: typescriptCode,
    cli: cliCode,
  }

  const language = {
    python: 'python',
    typescript: 'typescript',
    cli: 'bash',
  }

  return (
    <section className="py-24 px-6 border-t border-border">
      <div className="max-w-3xl mx-auto">
        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-border mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-foreground border-b-2 border-primary -mb-px'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Code Block */}
        <div className="bg-background rounded-sm border border-border overflow-hidden">
          {/* Simple Header */}
          <div className="flex items-center px-4 py-2 border-b border-border">
            <span className="text-xs text-text-tertiary font-mono">
              {activeTab === 'python'
                ? 'agent.py'
                : activeTab === 'typescript'
                ? 'agent.ts'
                : 'terminal'}
            </span>
          </div>

          {/* Code */}
          <div className="p-4 overflow-x-auto scrollbar-hide">
            <pre className="text-sm font-mono leading-relaxed">
              <code>
                {code[activeTab].split('\n').map((line, i) => (
                  <div key={i} className="whitespace-pre">
                    <CodeLine line={line} language={language[activeTab]} />
                  </div>
                ))}
              </code>
            </pre>
          </div>
        </div>
      </div>
    </section>
  )
}

function CodeLine({ line, language }: { line: string; language: string }) {
  if (!line.trim()) return <span>{line}</span>

  // Python/TypeScript highlighting
  if (language === 'python' || language === 'typescript') {
    const keywords =
      language === 'python'
        ? ['from', 'import', 'def', 'class', 'return', 'if', 'await']
        : ['import', 'from', 'const', 'await', 'new', 'export']

    let result = line

    // Strings
    result = result.replace(/"([^"]*)"/g, '<span class="text-[#a5d6ff]">"$1"</span>')

    // Keywords
    keywords.forEach((kw) => {
      const regex = new RegExp(`\\b(${kw})\\b`, 'g')
      result = result.replace(regex, '<span class="text-[#ff7b72]">$1</span>')
    })

    // Function calls
    result = result.replace(/(\w+)\(/g, '<span class="text-[#d2a8ff]">$1</span>(')

    // Parameters
    result = result.replace(/(\w+)=/g, '<span class="text-[#ffa657]">$1</span>=')

    return <span dangerouslySetInnerHTML={{ __html: result }} className="text-text-secondary" />
  }

  // Bash highlighting
  if (language === 'bash') {
    let result = line

    // Commands ($ prefix)
    result = result.replace(/^\$/, '<span class="text-[#8b949e]">$</span>')

    // Flags
    result = result.replace(/--?\w+/g, '<span class="text-[#ffa657]">$&</span>')

    // Strings
    result = result.replace(/"([^"]*)"/g, '<span class="text-[#a5d6ff]">"$1"</span>')

    // Success/error symbols
    result = result.replace(/✓/g, '<span class="text-[#3fb950]">✓</span>')
    result = result.replace(/✗/g, '<span class="text-[#f85149]">✗</span>')
    result = result.replace(/⏸/g, '<span class="text-[#ffa657]">⏸</span>')

    return <span dangerouslySetInnerHTML={{ __html: result }} className="text-text-secondary" />
  }

  return <span className="text-text-secondary">{line}</span>
}
