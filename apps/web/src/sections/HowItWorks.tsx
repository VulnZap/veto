export function HowItWorks() {
  return (
    <section className="py-24 px-6 border-t border-border">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <h2 className="text-2xl sm:text-3xl font-medium tracking-tight text-foreground mb-16 text-center">
          How it works
        </h2>

        {/* 3-Step Diagram */}
        <div className="flex items-center justify-center gap-4 sm:gap-8">
          {/* Step 1: AI Agent */}
          <div className="flex-1 max-w-[140px]">
            <div className="aspect-square rounded-lg border border-border bg-surface flex items-center justify-center p-4">
              <span className="text-sm sm:text-base text-center text-muted-foreground">
                AI Agent
              </span>
            </div>
          </div>

          {/* Arrow 1 */}
          <svg className="w-6 sm:w-8 h-6 flex-shrink-0" viewBox="0 0 32 32" fill="none">
            <path
              d="M4 16h20m0 0l-6-6m6 6l-6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-muted-foreground"
            />
          </svg>

          {/* Step 2: Veto (Highlighted) */}
          <div className="flex-1 max-w-[140px]">
            <div className="aspect-square rounded-lg border-2 border-primary bg-primary/5 flex items-center justify-center p-4">
              <span className="text-sm sm:text-base font-medium text-center text-foreground">
                Veto
              </span>
            </div>
          </div>

          {/* Arrow 2 */}
          <svg className="w-6 sm:w-8 h-6 flex-shrink-0" viewBox="0 0 32 32" fill="none">
            <path
              d="M4 16h20m0 0l-6-6m6 6l-6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-muted-foreground"
            />
          </svg>

          {/* Step 3: Your App */}
          <div className="flex-1 max-w-[140px]">
            <div className="aspect-square rounded-lg border border-border bg-surface flex items-center justify-center p-4">
              <span className="text-sm sm:text-base text-center text-muted-foreground">
                Your App
              </span>
            </div>
          </div>
        </div>

        {/* Explanation */}
        <p className="mt-12 text-center text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto">
          Agent proposes. Veto decides. Allowed actions proceed.
        </p>
      </div>
    </section>
  )
}
