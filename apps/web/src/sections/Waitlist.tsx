import { useState } from 'react'
import { IconCheck } from '@tabler/icons-react'
import { BorderBeam } from '@/components/ui/border-beam'

export function Waitlist() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    console.log('Waitlist signup:', email)
    setSubmitted(true)
  }

  const plans = [
    {
      name: 'Free',
      price: '$0',
      period: '/mo',
      description: 'For developers learning & building.',
      features: ['10k decisions/mo', '1 agent', '7-day logs', 'Local policies'],
      cta: 'Get Started',
      highlight: false,
    },
    {
      name: 'Team',
      price: '$99',
      period: '/mo',
      description: 'For startups deploying to production.',
      features: ['100k decisions/mo', '10 agents', '30-day logs', 'Cloud dashboard'],
      cta: 'Start Trial',
      highlight: true,
      badge: 'Production',
    },
    {
      name: 'Business',
      price: '$499',
      period: '/mo',
      description: 'For scaling companies & compliance.',
      features: ['1M decisions/mo', 'Unlimited agents', 'Managed policies', 'SSO / SAML'],
      cta: 'Contact Sales',
      highlight: false,
    },
    {
      name: 'Enterprise',
      price: 'Custom',
      period: '',
      description: 'For regulated industries.',
      features: ['Unlimited decisions', 'Unlimited agents', 'Custom retention', 'Dedicated Support'],
      cta: 'Talk to Us',
      highlight: false,
    },
  ]

  return (
    <section id="waitlist" className="py-24 px-6 border-t border-border">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h2 className="text-section font-medium tracking-tight text-foreground mb-2">
            Veto Cloud
          </h2>
          <p className="text-sm text-muted-foreground">Private beta · Coming soon</p>
        </div>

        {/* Description */}
        <p className="text-center text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto mb-16">
          Central dashboard. Team sync. Approval workflows.
        </p>

        {/* Email Form */}
        <div className="max-w-md mx-auto mb-16">
          {!submitted ? (
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                className="flex-1 h-11 px-4 text-sm bg-surface border border-border rounded-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
              <button
                type="submit"
                className="btn-primary h-11 px-6 text-sm font-medium text-white rounded-sm whitespace-nowrap"
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

        {/* Pricing Cards - Two Rows */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {plans.map((plan, index) => (
            <div
              key={index}
              className={`relative p-6 rounded-lg border bg-surface flex flex-col ${
                plan.highlight
                  ? 'border-primary shadow-lg'
                  : 'border-border hover:border-border-subtle'
              } transition-all`}
            >
              {/* BorderBeam for highlighted card */}
              {plan.highlight && (
                <BorderBeam
                  duration={6}
                  colorFrom="#f97316"
                  colorTo="#ea580c"
                  borderWidth={1.5}
                />
              )}

              {/* Badge */}
              {plan.badge && (
                <div className="absolute -top-3 right-4 px-2 py-0.5 bg-primary text-white text-[10px] font-medium rounded-sm">
                  {plan.badge}
                </div>
              )}

              {/* Header */}
              <div className="mb-4">
                <h3 className="text-base font-medium text-foreground">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-2xl font-medium text-foreground">{plan.price}</span>
                  <span className="text-sm text-muted-foreground">{plan.period}</span>
                </div>
              </div>

              {/* Description */}
              <p className="text-sm text-muted-foreground mb-5">
                {plan.description}
              </p>

              {/* Features */}
              <ul className="space-y-2.5 text-sm text-muted-foreground flex-1 mb-6">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <IconCheck className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <button
                className={`w-full h-10 text-sm font-medium rounded-sm transition-colors ${
                  plan.highlight
                    ? 'bg-primary text-white hover:bg-primary/90'
                    : 'bg-surface border border-border text-foreground hover:bg-surface-elevated'
                }`}
              >
                {plan.cta}
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
