import { IconBrandTwitter, IconBrandGithub, IconBrandDiscord } from '@tabler/icons-react'

export function Footer() {
  return (
    <footer className="py-16 px-6 border-t border-border">
      <div className="max-w-3xl mx-auto">
        {/* Company Info */}
        <div className="text-center space-y-2 text-sm text-muted-foreground">
          <p>
            Veto is a <a href="https://plaw.dev" className="hover:text-foreground transition-colors">Plaw Inc.</a> product.
          </p>
          <p>
            Also: <a href="https://vulnzap.com" className="hover:text-foreground transition-colors">VulnZap</a> — security for AI code.
          </p>
        </div>

        {/* Social Links */}
        <div className="mt-8 flex items-center justify-center gap-4">
          <a
            href="https://twitter.com/vetorun"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Twitter"
          >
            <IconBrandTwitter className="w-5 h-5" />
          </a>
          <a
            href="https://github.com/VulnZap/veto"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="GitHub"
          >
            <IconBrandGithub className="w-5 h-5" />
          </a>
          <a
            href="https://discord.gg/veto"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Discord"
          >
            <IconBrandDiscord className="w-5 h-5" />
          </a>
        </div>
      </div>
    </footer>
  )
}
