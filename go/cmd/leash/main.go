// leash - sudo for AI agents
// A permission layer for AI coding assistants with native TUI.
package main

import (
	"fmt"
	"os"
	"strings"

	"github.com/charmbracelet/bubbles/spinner"
	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/vulnzap/leash/internal/agent"
	"github.com/vulnzap/leash/internal/builtin"
	"github.com/vulnzap/leash/internal/config"
	"github.com/vulnzap/leash/internal/engine"
)

const version = "2.0.4"

// ASCII Logo - VETO branding
const logo = `
    @@     @@    @@@@@@@       @@       @@@@@@@     
    @@     @@   @@     @@      @@      @@     @@    
     @@   @@    @@@@@@@@@  @@@@@@@@@@  @@     @@    
      @@ @@     @@             @@      @@     @@    
      @@ @@     @@             @@      @@     @@    
       @@@       @@@@@@@   @@@@@@@@@@   @@@@@@@     `

const logoSmall = `◼ veto`

// Views
type view int

const (
	viewDashboard view = iota
	viewPolicies
	viewAgents
	viewAddPolicy
	viewCompiling
	viewHelp
)

// Theme - VETO brand colors
// Orange: #f5a524, White: #f5f5f5, Black: #000000
type theme struct {
	primary    lipgloss.AdaptiveColor
	secondary  lipgloss.AdaptiveColor
	muted      lipgloss.AdaptiveColor
	accent     lipgloss.AdaptiveColor // Veto Orange
	success    lipgloss.AdaptiveColor
	warning    lipgloss.AdaptiveColor
	error      lipgloss.AdaptiveColor
	border     lipgloss.AdaptiveColor
	highlight  lipgloss.AdaptiveColor
	background lipgloss.AdaptiveColor
}

var t = theme{
	// Dark mode: white text on black | Light mode: black text on white
	primary:    lipgloss.AdaptiveColor{Light: "#000000", Dark: "#f5f5f5"},
	secondary:  lipgloss.AdaptiveColor{Light: "#333333", Dark: "#cccccc"},
	muted:      lipgloss.AdaptiveColor{Light: "#666666", Dark: "#888888"},
	accent:     lipgloss.AdaptiveColor{Light: "#f5a524", Dark: "#f5a524"}, // Veto Orange - same in both
	success:    lipgloss.AdaptiveColor{Light: "#059669", Dark: "#34d399"},
	warning:    lipgloss.AdaptiveColor{Light: "#f5a524", Dark: "#f5a524"}, // Use orange for warnings too
	error:      lipgloss.AdaptiveColor{Light: "#dc2626", Dark: "#f87171"},
	border:     lipgloss.AdaptiveColor{Light: "#e5e5e5", Dark: "#333333"},
	highlight:  lipgloss.AdaptiveColor{Light: "#fff7ed", Dark: "#1a1a1a"}, // Slight orange tint in light
	background: lipgloss.AdaptiveColor{Light: "#ffffff", Dark: "#000000"},
}

// Styles
var (
	baseStyle = lipgloss.NewStyle()

	logoStyle = lipgloss.NewStyle().
			Foreground(t.accent).
			Bold(true)

	titleStyle = lipgloss.NewStyle().
			Foreground(t.primary).
			Bold(true).
			MarginBottom(1)

	subtitleStyle = lipgloss.NewStyle().
			Foreground(t.muted).
			Italic(true)

	mutedStyle = lipgloss.NewStyle().
			Foreground(t.muted)

	accentStyle = lipgloss.NewStyle().
			Foreground(t.accent).
			Bold(true)

	successStyle = lipgloss.NewStyle().
			Foreground(t.success)

	warningStyle = lipgloss.NewStyle().
			Foreground(t.warning)

	errorStyle = lipgloss.NewStyle().
			Foreground(t.error)

	panelStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(t.border).
			Padding(1, 2)

	activePanelStyle = lipgloss.NewStyle().
				Border(lipgloss.RoundedBorder()).
				BorderForeground(t.accent).
				Padding(1, 2)

	selectedStyle = lipgloss.NewStyle().
			Foreground(t.accent).
			Bold(true)

	keyStyle = lipgloss.NewStyle().
			Foreground(t.accent).
			Bold(true)

	helpKeyStyle = lipgloss.NewStyle().
			Foreground(t.muted)

	statusBarStyle = lipgloss.NewStyle().
			Foreground(t.muted).
			Padding(0, 1)
)

// Model
type model struct {
	view     view
	width    int
	height   int
	ready    bool
	quitting bool

	// Data
	policies []string
	agents   []agent.Agent

	// UI State
	selectedPolicy int
	selectedAgent  int
	message        string
	messageType    string // "success", "error", "info"

	// Components
	textInput textinput.Model
	spinner   spinner.Model
}

func newModel() model {
	// Text input
	ti := textinput.New()
	ti.Placeholder = "no lodash"
	ti.CharLimit = 200
	ti.Width = 40
	ti.PromptStyle = accentStyle
	ti.TextStyle = lipgloss.NewStyle().Foreground(t.primary)
	ti.PlaceholderStyle = mutedStyle

	// Spinner
	sp := spinner.New()
	sp.Spinner = spinner.Points
	sp.Style = accentStyle

	// Load policies
	var policies []string
	if config.Exists() {
		if path, err := config.Find(); err == nil {
			if cfg, err := config.Load(path); err == nil {
				policies = cfg.Policies
			}
		}
	}

	// Detect agents
	agents := agent.DetectInstalled()

	return model{
		view:      viewDashboard,
		policies:  policies,
		agents:    agents,
		textInput: ti,
		spinner:   sp,
	}
}

func (m model) Init() tea.Cmd {
	return tea.Batch(
		textinput.Blink,
	)
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmds []tea.Cmd

	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.ready = true

	case tea.KeyMsg:
		// Text input mode
		if m.view == viewAddPolicy && m.textInput.Focused() {
			switch msg.String() {
			case "enter":
				policy := strings.TrimSpace(m.textInput.Value())
				if policy != "" {
					m.view = viewCompiling
					m.textInput.Reset()
					return m, tea.Batch(m.spinner.Tick, compilePolicy(policy))
				}
			case "esc":
				m.textInput.Blur()
				m.textInput.Reset()
				m.view = viewDashboard
				return m, nil
			default:
				var cmd tea.Cmd
				m.textInput, cmd = m.textInput.Update(msg)
				return m, cmd
			}
		}

		// Global keys
		switch msg.String() {
		case "q", "ctrl+c":
			m.quitting = true
			return m, tea.Quit

		case "esc":
			if m.view != viewDashboard {
				m.view = viewDashboard
				m.message = ""
			}

		case "?":
			if m.view == viewHelp {
				m.view = viewDashboard
			} else {
				m.view = viewHelp
			}

		// Dashboard navigation
		case "1", "p":
			m.view = viewPolicies
		case "2", "g":
			m.view = viewAgents
		case "a":
			m.view = viewAddPolicy
			m.textInput.Focus()
			return m, textinput.Blink
		case "i":
			return m, runInit(&m)
		case "s":
			return m, runSync(&m)

		// List navigation
		case "j", "down":
			if m.view == viewPolicies && len(m.policies) > 0 {
				m.selectedPolicy = (m.selectedPolicy + 1) % len(m.policies)
			} else if m.view == viewAgents && len(m.agents) > 0 {
				m.selectedAgent = (m.selectedAgent + 1) % len(m.agents)
			}
		case "k", "up":
			if m.view == viewPolicies && len(m.policies) > 0 {
				m.selectedPolicy--
				if m.selectedPolicy < 0 {
					m.selectedPolicy = len(m.policies) - 1
				}
			} else if m.view == viewAgents && len(m.agents) > 0 {
				m.selectedAgent--
				if m.selectedAgent < 0 {
					m.selectedAgent = len(m.agents) - 1
				}
			}
		case "d", "backspace":
			if m.view == viewPolicies && len(m.policies) > 0 {
				policy := m.policies[m.selectedPolicy]
				if err := config.RemovePolicy(policy); err == nil {
					m.policies = append(m.policies[:m.selectedPolicy], m.policies[m.selectedPolicy+1:]...)
					if m.selectedPolicy >= len(m.policies) && m.selectedPolicy > 0 {
						m.selectedPolicy--
					}
					m.message = "Removed: " + policy
					m.messageType = "info"
				}
			}
		case "enter":
			if m.view == viewAgents && len(m.agents) > 0 {
				a := m.agents[m.selectedAgent]
				if err := agent.Install(a.ID); err == nil {
					m.message = "Synced to " + a.Name
					m.messageType = "success"
				} else {
					m.message = err.Error()
					m.messageType = "error"
				}
			}
		}

	case policyCompiledMsg:
		if msg.err != nil {
			m.message = msg.err.Error()
			m.messageType = "error"
		} else {
			if err := config.AddPolicy(msg.policy); err != nil {
				m.message = err.Error()
				m.messageType = "error"
			} else {
				m.policies = append(m.policies, msg.policy)
				m.message = "Added: " + msg.policy
				m.messageType = "success"
			}
		}
		m.view = viewDashboard

	case initDoneMsg:
		if msg.err != nil {
			m.message = msg.err.Error()
			m.messageType = "error"
		} else {
			m.message = "Initialized .leash"
			m.messageType = "success"
			// Reload
			if config.Exists() {
				if path, err := config.Find(); err == nil {
					if cfg, err := config.Load(path); err == nil {
						m.policies = cfg.Policies
					}
				}
			}
		}

	case syncDoneMsg:
		if msg.err != nil {
			m.message = msg.err.Error()
			m.messageType = "error"
		} else {
			m.message = fmt.Sprintf("Synced to %d agents", msg.count)
			m.messageType = "success"
		}

	case spinner.TickMsg:
		if m.view == viewCompiling {
			var cmd tea.Cmd
			m.spinner, cmd = m.spinner.Update(msg)
			cmds = append(cmds, cmd)
		}
	}

	return m, tea.Batch(cmds...)
}

func (m model) View() string {
	if m.quitting {
		return ""
	}
	if !m.ready {
		return "\n  Loading..."
	}

	var content string

	switch m.view {
	case viewDashboard:
		content = m.renderDashboard()
	case viewPolicies:
		content = m.renderPolicies()
	case viewAgents:
		content = m.renderAgents()
	case viewAddPolicy:
		content = m.renderAddPolicy()
	case viewCompiling:
		content = m.renderCompiling()
	case viewHelp:
		content = m.renderHelp()
	}

	return lipgloss.Place(
		m.width, m.height,
		lipgloss.Center, lipgloss.Center,
		content,
	)
}

func (m model) renderDashboard() string {
	// Logo
	logoView := logoStyle.Render(logo)

	// Tagline
	tagline := subtitleStyle.Render("sudo for AI agents")

	// Stats row
	policyCount := fmt.Sprintf("%d", len(m.policies))
	agentCount := fmt.Sprintf("%d", len(m.agents))

	statsBox := lipgloss.JoinHorizontal(
		lipgloss.Center,
		panelStyle.Width(20).Align(lipgloss.Center).Render(
			lipgloss.JoinVertical(lipgloss.Center,
				accentStyle.Render(policyCount),
				mutedStyle.Render("policies"),
			),
		),
		"  ",
		panelStyle.Width(20).Align(lipgloss.Center).Render(
			lipgloss.JoinVertical(lipgloss.Center,
				accentStyle.Render(agentCount),
				mutedStyle.Render("agents"),
			),
		),
	)

	// Quick actions
	actions := lipgloss.JoinHorizontal(
		lipgloss.Center,
		keyStyle.Render("a")+" add   ",
		keyStyle.Render("1")+" policies   ",
		keyStyle.Render("2")+" agents   ",
		keyStyle.Render("i")+" init   ",
		keyStyle.Render("s")+" sync   ",
		keyStyle.Render("?")+" help   ",
		keyStyle.Render("q")+" quit",
	)

	// Message
	var msgView string
	if m.message != "" {
		var style lipgloss.Style
		switch m.messageType {
		case "success":
			style = successStyle
		case "error":
			style = errorStyle
		default:
			style = mutedStyle
		}
		msgView = "\n" + style.Render("• "+m.message)
	}

	// Compose
	return lipgloss.JoinVertical(
		lipgloss.Center,
		logoView,
		"",
		tagline,
		mutedStyle.Render("v"+version),
		"",
		statsBox,
		msgView,
		"",
		actions,
	)
}

func (m model) renderPolicies() string {
	title := titleStyle.Render("Policies")

	if len(m.policies) == 0 {
		empty := lipgloss.JoinVertical(
			lipgloss.Center,
			"",
			mutedStyle.Render("No policies yet"),
			"",
			mutedStyle.Render("Press "+keyStyle.Render("a")+" to add one"),
			"",
		)
		return activePanelStyle.Width(50).Render(
			lipgloss.JoinVertical(lipgloss.Left, title, empty, m.renderPolicyHelp()),
		)
	}

	var rows []string
	for i, p := range m.policies {
		prefix := "  "
		style := baseStyle.Foreground(t.secondary)

		if i == m.selectedPolicy {
			prefix = accentStyle.Render("▸ ")
			style = selectedStyle
		}

		// Show builtin indicator
		indicator := ""
		if builtin.Find(p) != nil {
			indicator = mutedStyle.Render(" ⚡")
		}

		rows = append(rows, prefix+style.Render(p)+indicator)
	}

	list := strings.Join(rows, "\n")

	return activePanelStyle.Width(60).Render(
		lipgloss.JoinVertical(lipgloss.Left,
			title,
			"",
			list,
			"",
			m.renderPolicyHelp(),
		),
	)
}

func (m model) renderPolicyHelp() string {
	return helpKeyStyle.Render(
		keyStyle.Render("↑↓") + " navigate  " +
			keyStyle.Render("a") + " add  " +
			keyStyle.Render("d") + " delete  " +
			keyStyle.Render("esc") + " back",
	)
}

func (m model) renderAgents() string {
	title := titleStyle.Render("Agents")

	if len(m.agents) == 0 {
		empty := lipgloss.JoinVertical(
			lipgloss.Center,
			"",
			mutedStyle.Render("No agents detected"),
			"",
			mutedStyle.Render("Install Claude Code, Cursor, or OpenCode"),
			"",
		)
		return activePanelStyle.Width(50).Render(
			lipgloss.JoinVertical(lipgloss.Left, title, empty, m.renderAgentHelp()),
		)
	}

	var rows []string
	for i, a := range m.agents {
		prefix := "  "
		style := baseStyle.Foreground(t.secondary)

		if i == m.selectedAgent {
			prefix = accentStyle.Render("▸ ")
			style = selectedStyle
		}

		status := successStyle.Render("●")
		rows = append(rows, prefix+style.Render(a.Name)+" "+status)
	}

	list := strings.Join(rows, "\n")

	return activePanelStyle.Width(50).Render(
		lipgloss.JoinVertical(lipgloss.Left,
			title,
			"",
			list,
			"",
			m.renderAgentHelp(),
		),
	)
}

func (m model) renderAgentHelp() string {
	return helpKeyStyle.Render(
		keyStyle.Render("↑↓") + " navigate  " +
			keyStyle.Render("enter") + " sync  " +
			keyStyle.Render("esc") + " back",
	)
}

func (m model) renderAddPolicy() string {
	title := titleStyle.Render("Add Policy")

	examples := mutedStyle.Render(`Examples:
  no lodash
  protect .env files
  prefer pnpm over npm
  don't delete tests`)

	return activePanelStyle.Width(50).Render(
		lipgloss.JoinVertical(lipgloss.Left,
			title,
			"",
			"What should be restricted?",
			"",
			m.textInput.View(),
			"",
			examples,
			"",
			helpKeyStyle.Render(keyStyle.Render("enter")+" add  "+keyStyle.Render("esc")+" cancel"),
		),
	)
}

func (m model) renderCompiling() string {
	return panelStyle.Width(40).Align(lipgloss.Center).Render(
		lipgloss.JoinVertical(lipgloss.Center,
			"",
			m.spinner.View()+" Compiling...",
			"",
		),
	)
}

func (m model) renderHelp() string {
	title := titleStyle.Render("Keyboard Shortcuts")

	shortcuts := `
  Navigation
  ` + keyStyle.Render("1") + ` / ` + keyStyle.Render("p") + `     Policies
  ` + keyStyle.Render("2") + ` / ` + keyStyle.Render("g") + `     Agents
  ` + keyStyle.Render("esc") + `         Back / Dashboard
  ` + keyStyle.Render("?") + `           Toggle help
  ` + keyStyle.Render("q") + `           Quit

  Actions
  ` + keyStyle.Render("a") + `           Add policy
  ` + keyStyle.Render("i") + `           Initialize .leash
  ` + keyStyle.Render("s") + `           Sync to all agents
  ` + keyStyle.Render("d") + `           Delete selected

  List Navigation
  ` + keyStyle.Render("j") + ` / ` + keyStyle.Render("↓") + `      Move down
  ` + keyStyle.Render("k") + ` / ` + keyStyle.Render("↑") + `      Move up
  ` + keyStyle.Render("enter") + `       Select / Confirm`

	cli := mutedStyle.Render(`
  CLI: leash add "policy"
       leash sync
       leash --help`)

	return activePanelStyle.Width(45).Render(
		lipgloss.JoinVertical(lipgloss.Left,
			title,
			shortcuts,
			"",
			cli,
			"",
			helpKeyStyle.Render(keyStyle.Render("esc")+" close"),
		),
	)
}

// Messages
type policyCompiledMsg struct {
	policy string
	err    error
}

type initDoneMsg struct {
	err error
}

type syncDoneMsg struct {
	count int
	err   error
}

// Commands
func compilePolicy(policy string) tea.Cmd {
	return func() tea.Msg {
		// Check builtins first (instant)
		if builtin.Find(policy) != nil {
			return policyCompiledMsg{policy: policy}
		}
		// For now, accept all policies
		// TODO: LLM compilation via engine bridge
		return policyCompiledMsg{policy: policy}
	}
}

func runInit(m *model) tea.Cmd {
	return func() tea.Msg {
		if !config.Exists() {
			if err := config.Create(); err != nil {
				return initDoneMsg{err: err}
			}
		}
		return initDoneMsg{}
	}
}

func runSync(m *model) tea.Cmd {
	return func() tea.Msg {
		agents := agent.DetectInstalled()
		count := 0
		for _, a := range agents {
			if err := agent.Install(a.ID); err == nil {
				count++
			}
		}
		return syncDoneMsg{count: count}
	}
}

// CLI

func main() {
	args := os.Args[1:]

	// No args = TUI
	if len(args) == 0 {
		p := tea.NewProgram(
			newModel(),
			tea.WithAltScreen(),
		)
		if _, err := p.Run(); err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		return
	}

	// CLI commands
	switch args[0] {
	case "--version", "-v":
		fmt.Printf("leash v%s\n", version)

	case "--help", "-h", "help":
		printHelp()

	case "init":
		if config.Exists() {
			fmt.Println("• .leash already exists")
			return
		}
		if err := config.Create(); err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("✓ Created .leash")

	case "add":
		if len(args) < 2 {
			fmt.Fprintln(os.Stderr, "Usage: leash add \"policy\"")
			os.Exit(1)
		}
		policy := strings.Join(args[1:], " ")

		// Builtin = instant
		if builtin.Find(policy) != nil {
			if err := config.AddPolicy(policy); err != nil {
				fmt.Fprintf(os.Stderr, "Error: %v\n", err)
				os.Exit(1)
			}
			fmt.Printf("✓ Added: %s (builtin)\n", policy)
			return
		}

		// LLM compilation
		bridge, err := engine.NewBridge()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}

		fmt.Println("Compiling...")
		result, err := bridge.Compile(policy)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}

		if !result.Success {
			fmt.Fprintf(os.Stderr, "✗ %s\n", result.Error)
			os.Exit(1)
		}

		if err := config.AddPolicy(policy); err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("✓ Added: %s\n", policy)

	case "list":
		if !config.Exists() {
			fmt.Println("No .leash file. Run: leash init")
			return
		}
		path, _ := config.Find()
		cfg, err := config.Load(path)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		if len(cfg.Policies) == 0 {
			fmt.Println("No policies")
			return
		}
		for _, p := range cfg.Policies {
			mark := " "
			if builtin.Find(p) != nil {
				mark = "⚡"
			}
			fmt.Printf(" %s %s\n", mark, p)
		}

	case "status":
		agents := agent.DetectInstalled()
		fmt.Printf("Agents: %d detected\n", len(agents))
		for _, a := range agents {
			fmt.Printf("  ● %s\n", a.Name)
		}
		if config.Exists() {
			path, _ := config.Find()
			cfg, _ := config.Load(path)
			fmt.Printf("\nPolicies: %d\n", len(cfg.Policies))
		}

	case "sync":
		agents := agent.DetectInstalled()
		if len(agents) == 0 {
			fmt.Println("No agents detected")
			return
		}
		for _, a := range agents {
			if err := agent.Install(a.ID); err != nil {
				fmt.Fprintf(os.Stderr, "✗ %s: %v\n", a.Name, err)
			} else {
				fmt.Printf("✓ %s\n", a.Name)
			}
		}

	case "install":
		if len(args) < 2 {
			fmt.Fprintln(os.Stderr, "Usage: leash install <agent>")
			os.Exit(1)
		}
		if err := agent.Install(args[1]); err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("✓ Installed: %s\n", args[1])

	case "uninstall":
		if len(args) < 2 {
			fmt.Fprintln(os.Stderr, "Usage: leash uninstall <agent>")
			os.Exit(1)
		}
		if err := agent.Uninstall(args[1]); err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("✓ Uninstalled: %s\n", args[1])

	case "explain":
		if len(args) < 2 {
			fmt.Fprintln(os.Stderr, "Usage: leash explain \"policy\"")
			os.Exit(1)
		}
		bridge, err := engine.NewBridge()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		if err := bridge.Explain(strings.Join(args[1:], " ")); err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}

	case "audit":
		bridge, err := engine.NewBridge()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		if err := bridge.Audit(args[1:]); err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}

	default:
		fmt.Fprintf(os.Stderr, "Unknown: %s\n", args[0])
		fmt.Fprintln(os.Stderr, "Run: leash --help")
		os.Exit(1)
	}
}

func printHelp() {
	fmt.Print(`
  ` + logoSmall + `
  
  sudo for AI agents

USAGE
  leash                     Dashboard (TUI)
  leash add "policy"        Add a policy
  leash list                List policies
  leash sync                Sync to all agents
  leash status              Show status
  leash install <agent>     Install hooks
  leash explain "policy"    Preview policy

AGENTS
  cc, claude-code    Claude Code
  oc, opencode       OpenCode
  cursor             Cursor
  windsurf           Windsurf
  aider              Aider

EXAMPLES
  leash add "no lodash"
  leash add "protect .env"
  leash sync

`)
}
