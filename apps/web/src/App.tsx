import { Nav } from '@/components/Nav'
import { Hero } from '@/sections/Hero'
import { HowItWorks } from '@/sections/HowItWorks'
import { Integrations } from '@/sections/Integrations'
import { Rules } from '@/sections/Rules'
import { CodeTabs } from '@/sections/CodeTabs'
import { Waitlist } from '@/sections/Waitlist'
import { Footer } from '@/sections/Footer'

export default function App() {
  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main id="main-content">
        <Hero />
        <HowItWorks />
        <Integrations />
        <Rules />
        <CodeTabs />
        <Waitlist />
      </main>
      <Footer />
    </div>
  )
}
