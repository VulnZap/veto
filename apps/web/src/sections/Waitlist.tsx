import { useState } from 'react'
import { IconCheck } from '@tabler/icons-react'

export function Waitlist() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // TODO: Backend integration with Convex
    console.log('Waitlist signup:', email)
    setSubmitted(true)
  }

  return (
    <section id="waitlist" className="py-24 px-6 border-t border-border">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-medium tracking-tight text-foreground mb-2">
            Veto Cloud
          </h2>
          <p className="text-sm text-muted-foreground">Private beta · Coming soon</p>
        </div>

        {/* Description */}
        <p className="text-center text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto mb-10">
          Central dashboard. Team sync. Approval workflows.
        </p>

        {/* Email Form */}
        <div className="max-w-md mx-auto mb-20">
          {!submitted ? (
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                className="flex-1 h-11 px-4 text-sm bg-surface border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
              <button
                type="submit"
                className="btn-primary h-11 px-6 text-sm font-medium text-white rounded whitespace-nowrap"
              >
                Join Waitlist
              </button>
            </form>
          ) : (
            <div className="flex items-center justify-center gap-2 h-11 text-sm text-foreground">
              <IconCheck className="w-4 h-4 text-primary" />
              <span>You're on the list. We'll be in touch soon.</span>
            </div>
          )}
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* FREE */}
          <div className="p-4 border border-border rounded-lg bg-surface flex flex-col">
            <h3 className="text-base font-medium text-foreground mb-1">Free</h3>
            <div className="mb-3">
              <span className="text-2xl font-medium text-foreground">$0</span>
              <span className="text-xs text-muted-foreground ml-1">/mo</span>
            </div>
            <p className="text-[11px] text-muted-foreground mb-5 h-8 leading-tight">
              For developers learning & building.
            </p>
            <ul className="space-y-2.5 text-xs text-muted-foreground flex-1">
              <li className="flex items-start gap-2">
                <IconCheck className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                <span>10k decisions/mo</span>
              </li>
              <li className="flex items-start gap-2">
                <IconCheck className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                <span>1 agent</span>
              </li>
              <li className="flex items-start gap-2">
                <IconCheck className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                <span>7-day logs</span>
              </li>
              <li className="flex items-start gap-2">
                <IconCheck className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                <span>Local policies</span>
              </li>
            </ul>
          </div>

          {/* TEAM */}
          <div className="p-4 border-2 border-primary rounded-lg bg-primary/5 relative flex flex-col">
            <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-primary text-white text-[10px] font-medium rounded-full">
              Production
            </div>
            <h3 className="text-base font-medium text-foreground mb-1">Team</h3>
            <div className="mb-3">
              <span className="text-2xl font-medium text-foreground">$99</span>
              <span className="text-xs text-muted-foreground ml-1">/mo</span>
            </div>
            <p className="text-[11px] text-muted-foreground mb-5 h-8 leading-tight">
              For startups deploying to production.
            </p>
            <ul className="space-y-2.5 text-xs text-muted-foreground flex-1">
              <li className="flex items-start gap-2">
                <IconCheck className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                <span>100k decisions/mo</span>
              </li>
              <li className="flex items-start gap-2">
                <IconCheck className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                <span>10 agents</span>
              </li>
              <li className="flex items-start gap-2">
                <IconCheck className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                <span>30-day logs</span>
              </li>
              <li className="flex items-start gap-2">
                <IconCheck className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                <span>Cloud dashboard</span>
              </li>
            </ul>
          </div>

          {/* BUSINESS */}
          <div className="p-4 border border-border rounded-lg bg-surface flex flex-col">
            <h3 className="text-base font-medium text-foreground mb-1">Business</h3>
            <div className="mb-3">
              <span className="text-2xl font-medium text-foreground">$499</span>
              <span className="text-xs text-muted-foreground ml-1">/mo</span>
            </div>
            <p className="text-[11px] text-muted-foreground mb-5 h-8 leading-tight">
              For scaling companies & compliance.
            </p>
            <ul className="space-y-2.5 text-xs text-muted-foreground flex-1">
              <li className="flex items-start gap-2">
                <IconCheck className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                <span>1M decisions/mo</span>
              </li>
              <li className="flex items-start gap-2">
                <IconCheck className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                <span>Unlimited agents</span>
              </li>
              <li className="flex items-start gap-2">
                <IconCheck className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                <span>Managed policies</span>
              </li>
              <li className="flex items-start gap-2">
                <IconCheck className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                <span>SSO / SAML</span>
              </li>
            </ul>
          </div>

          {/* ENTERPRISE */}
          <div className="p-4 border border-border rounded-lg bg-surface flex flex-col">
            <h3 className="text-base font-medium text-foreground mb-1">Enterprise</h3>
            <div className="mb-3">
              <span className="text-2xl font-medium text-foreground">Custom</span>
            </div>
            <p className="text-[11px] text-muted-foreground mb-5 h-8 leading-tight">
              For regulated industries.
            </p>
            <ul className="space-y-2.5 text-xs text-muted-foreground flex-1">
              <li className="flex items-start gap-2">
                <IconCheck className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                <span>Unlimited decisions</span>
              </li>
              <li className="flex items-start gap-2">
                <IconCheck className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                <span>Unlimited agents</span>
              </li>
              <li className="flex items-start gap-2">
                <IconCheck className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                <span>Custom retention</span>
              </li>
              <li className="flex items-start gap-2">
                <IconCheck className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                <span>Dedicated Support</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
