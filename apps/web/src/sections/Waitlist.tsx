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
      <div className="max-w-5xl mx-auto">
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* OSS */}
          <div className="p-6 border border-border rounded-lg bg-surface">
            <h3 className="text-lg font-medium text-foreground mb-2">OSS</h3>
            <div className="mb-6">
              <span className="text-3xl font-medium text-foreground">Free</span>
              <span className="text-sm text-muted-foreground ml-1">forever</span>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <IconCheck className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <span>Local enforcement</span>
              </li>
              <li className="flex items-start gap-2">
                <IconCheck className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <span>All agents</span>
              </li>
              <li className="flex items-start gap-2">
                <IconCheck className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <span>BYOK models</span>
              </li>
            </ul>
          </div>

          {/* Pro (Highlighted) */}
          <div className="p-6 border-2 border-primary rounded-lg bg-primary/5 relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-primary text-white text-xs font-medium rounded-full">
              Popular
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">Pro</h3>
            <div className="mb-6">
              <span className="text-3xl font-medium text-foreground">$29</span>
              <span className="text-sm text-muted-foreground ml-1">/dev/mo</span>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <IconCheck className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <span>Cloud sync</span>
              </li>
              <li className="flex items-start gap-2">
                <IconCheck className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <span>Dashboard</span>
              </li>
              <li className="flex items-start gap-2">
                <IconCheck className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <span>5 repos</span>
              </li>
            </ul>
          </div>

          {/* Team */}
          <div className="p-6 border border-border rounded-lg bg-surface">
            <h3 className="text-lg font-medium text-foreground mb-2">Team</h3>
            <div className="mb-6">
              <span className="text-3xl font-medium text-foreground">$79</span>
              <span className="text-sm text-muted-foreground ml-1">/dev/mo</span>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <IconCheck className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <span>Unlimited repos</span>
              </li>
              <li className="flex items-start gap-2">
                <IconCheck className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <span>SSO</span>
              </li>
              <li className="flex items-start gap-2">
                <IconCheck className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <span>Approval workflows</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
