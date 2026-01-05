// leash - sudo for AI agents
// A permission layer for AI coding assistants with native TUI.
package main

import (
	"fmt"
	"os"
	"strings"

	"github.com/charmbracelet/bubbles/list"
	"github.com/charmbracelet/bubbles/spinner"
	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/vulnzap/leash/internal/agent"
	"github.com/vulnzap/leash/internal/builtin"
	"github.com/vulnzap/leash/internal/config"
	"github.com/vulnzap/leash/internal/engine"
	"github.com/vulnzap/leash/internal/tui"
)

const version = "2.0.0"

// view represents different screens in the TUI
type view int

const (
	viewHome view = iota
	viewPolicies
	viewAdd
	viewAddCompiling
	viewStatus
	viewHelp
)

// Styles
var (
	colorPrimary   = lipgloss.AdaptiveColor{Light: "#1a1a1a", Dark: "#fafafa"}
	colorSecondary = lipgloss.AdaptiveColor{Light: "#666666", Dark: "#888888"}
	colorMuted     = lipgloss.AdaptiveColor{Light: "#999999", Dark: "#555555"}
	colorAccent    = lipgloss.AdaptiveColor{Light: "#0066cc", Dark: "#4da6ff"}
	colorSuccess   = lipgloss.AdaptiveColor{Light: "#00994d", Dark: "#00cc66"}
	colorError     = lipgloss.AdaptiveColor{Light: "#cc0000", Dark: "#ff4444"}
	colorBorder    = lipgloss.AdaptiveColor{Light: "#dddddd", Dark: "#333333"}

	titleStyle   = lipgloss.NewStyle().Bold(true).Foreground(colorPrimary).MarginBottom(1)
	mutedStyle   = lipgloss.NewStyle().Foreground(colorMuted)
	keyStyle     = lipgloss.NewStyle().Foreground(colorAccent).Bold(true)
	boxStyle     = lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(colorBorder).Padding(1, 2)
	successStyle = lipgloss.NewStyle().Foreground(colorSuccess)
	errorStyle   = lipgloss.NewStyle().Foreground(colorError)
)

// policyItem implements list.Item for policies
type policyItem string

func (p policyItem) Title() string       { return string(p) }
func (p policyItem) Description() string { return "" }
func (p policyItem) FilterValue() string { return string(p) }

// model is the root Bubble Tea model
type model struct {
	view     view
	width    int
	height   int
	ready    bool
	quitting bool

	// Components
	textInput  textinput.Model
	spinner    spinner.Model
	policyList list.Model

	// State
	policies []string
	message  string
	err      error
}

func initialModel() model {
	// Text input for adding policies
	ti := textinput.New()
	ti.Placeholder = "protect .env"
	ti.CharLimit = 200
	ti.Width = 50

	// Spinner for compilation
	sp := spinner.New()
	sp.Spinner = spinner.Dot

	// Load existing policies
	var policies []string
	if config.Exists() {
		if path, err := config.Find(); err == nil {
			if cfg, err := config.Load(path); err == nil {
				policies = cfg.Policies
			}
		}
	}

	// Create policy list items
	items := make([]list.Item, len(policies))
	for i, p := range policies {
		items[i] = policyItem(p)
	}

	// Initialize list with delegate
	delegate := list.NewDefaultDelegate()
	policyList := list.New(items, delegate, 80, 20)
	policyList.Title = "Policies"
	policyList.SetShowHelp(false)
	policyList.SetFilteringEnabled(false)

	return model{
		view:       viewHome,
		textInput:  ti,
		spinner:    sp,
		policies:   policies,
		policyList: policyList,
	}
}

func (m model) Init() tea.Cmd {
	return nil
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmds []tea.Cmd

	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.ready = true

		// Update list size
		h := m.height - 10
		if h < 5 {
			h = 5
		}
		m.policyList.SetSize(m.width-4, h)

	case tea.KeyMsg:
		// Handle text input mode
		if m.view == viewAdd && m.textInput.Focused() {
			switch msg.String() {
			case "enter":
				policy := strings.TrimSpace(m.textInput.Value())
				if policy != "" {
					m.view = viewAddCompiling
					m.textInput.Reset()
					return m, tea.Batch(m.spinner.Tick, compilePolicy(policy))
				}
			case "esc":
				m.textInput.Blur()
				m.view = viewHome
				return m, nil
			}

			var cmd tea.Cmd
			m.textInput, cmd = m.textInput.Update(msg)
			return m, cmd
		}

		// Global key handling
		switch msg.String() {
		case "q", "ctrl+c":
			m.quitting = true
			return m, tea.Quit
		case "?":
			if m.view != viewHelp {
				m.view = viewHelp
			} else {
				m.view = viewHome
			}
		case "esc":
			m.view = viewHome
			m.message = ""
		case "i":
			// Run init wizard (blocking, outside TUI)
			return m, runInitWizard
		case "p":
			m.view = viewPolicies
			m.updatePolicyList()
		case "a":
			m.view = viewAdd
			m.textInput.Focus()
			return m, textinput.Blink
		case "s":
			m.view = viewStatus
		}

	case policyCompiledMsg:
		if msg.err != nil {
			m.message = errorStyle.Render("x ") + msg.err.Error()
		} else {
			// Add to config
			if err := config.AddPolicy(msg.policy); err != nil {
				m.message = errorStyle.Render("x ") + err.Error()
			} else {
				m.policies = append(m.policies, msg.policy)
				m.message = successStyle.Render("+ ") + "Policy added: " + msg.policy
			}
		}
		m.view = viewHome

	case initWizardDoneMsg:
		if msg.err != nil {
			m.message = errorStyle.Render("x ") + msg.err.Error()
		} else if msg.result != nil && !msg.result.Cancelled {
			m.message = successStyle.Render("+ ") + "Setup complete"
			// Reload policies
			if config.Exists() {
				if path, err := config.Find(); err == nil {
					if cfg, err := config.Load(path); err == nil {
						m.policies = cfg.Policies
					}
				}
			}
		}
		return m, nil

	case spinner.TickMsg:
		if m.view == viewAddCompiling {
			var cmd tea.Cmd
			m.spinner, cmd = m.spinner.Update(msg)
			return m, cmd
		}
	}

	return m, tea.Batch(cmds...)
}

func (m *model) updatePolicyList() {
	items := make([]list.Item, len(m.policies))
	for i, p := range m.policies {
		items[i] = policyItem(p)
	}

	delegate := list.NewDefaultDelegate()
	m.policyList = list.New(items, delegate, m.width-4, m.height-10)
	m.policyList.Title = "Policies"
	m.policyList.SetShowStatusBar(false)
	m.policyList.SetFilteringEnabled(false)
}

func (m model) View() string {
	if m.quitting {
		return ""
	}

	if !m.ready {
		return "loading..."
	}

	var content string

	switch m.view {
	case viewHome:
		content = m.viewHome()
	case viewPolicies:
		content = m.viewPolicies()
	case viewAdd:
		content = m.viewAdd()
	case viewAddCompiling:
		content = m.viewCompiling()
	case viewStatus:
		content = m.viewStatus()
	case viewHelp:
		content = m.viewHelp()
	}

	return lipgloss.Place(m.width, m.height, lipgloss.Center, lipgloss.Center, content)
}

func (m model) viewHome() string {
	logo := lipgloss.NewStyle().Bold(true).Foreground(colorPrimary).Render("leash")
	subtitle := mutedStyle.Render("sudo for AI agents")

	keys := fmt.Sprintf(
		"%s init   %s policies   %s add   %s status   %s help   %s quit",
		keyStyle.Render("i"),
		keyStyle.Render("p"),
		keyStyle.Render("a"),
		keyStyle.Render("s"),
		keyStyle.Render("?"),
		keyStyle.Render("q"),
	)

	parts := []string{
		"",
		logo,
		subtitle,
		"",
		mutedStyle.Render("v" + version),
		"",
	}

	// Show message if any
	if m.message != "" {
		parts = append(parts, "", m.message)
	}

	// Show policy count
	if len(m.policies) > 0 {
		parts = append(parts, "", mutedStyle.Render(fmt.Sprintf("%d policies configured", len(m.policies))))
	}

	parts = append(parts, "", "", keys)

	return lipgloss.JoinVertical(lipgloss.Center, parts...)
}

func (m model) viewPolicies() string {
	if len(m.policies) == 0 {
		return boxStyle.Render(lipgloss.JoinVertical(
			lipgloss.Left,
			titleStyle.Render("Policies"),
			"",
			mutedStyle.Render("No policies configured."),
			"",
			mutedStyle.Render("Press 'a' to add a policy, 'i' to run setup."),
			"",
			mutedStyle.Render("[esc] back"),
		))
	}

	var policyLines []string
	for _, p := range m.policies {
		// Check if it's a builtin
		indicator := "  "
		if b := builtin.Find(p); b != nil {
			indicator = "* "
		}
		policyLines = append(policyLines, indicator+p)
	}

	return boxStyle.Render(lipgloss.JoinVertical(
		lipgloss.Left,
		titleStyle.Render("Policies"),
		"",
		strings.Join(policyLines, "\n"),
		"",
		mutedStyle.Render("* = builtin pattern"),
		"",
		mutedStyle.Render("[a] add  [esc] back"),
	))
}

func (m model) viewAdd() string {
	return boxStyle.Render(lipgloss.JoinVertical(
		lipgloss.Left,
		titleStyle.Render("Add Policy"),
		"",
		"Describe what you want to restrict:",
		"",
		m.textInput.View(),
		"",
		mutedStyle.Render("Examples:"),
		mutedStyle.Render("  protect .env"),
		mutedStyle.Render("  don't delete test files"),
		mutedStyle.Render("  no lodash"),
		mutedStyle.Render("  prefer pnpm"),
		"",
		mutedStyle.Render("[enter] add  [esc] back"),
	))
}

func (m model) viewCompiling() string {
	return boxStyle.Render(lipgloss.JoinVertical(
		lipgloss.Center,
		"",
		m.spinner.View()+" Compiling policy...",
		"",
	))
}

func (m model) viewStatus() string {
	agents := agent.DetectInstalled()

	var agentLines []string
	if len(agents) == 0 {
		agentLines = append(agentLines, mutedStyle.Render("No agents detected."))
	} else {
		for _, a := range agents {
			status := successStyle.Render("[installed]")
			agentLines = append(agentLines, fmt.Sprintf("  %s %s", a.Name, status))
		}
	}

	return boxStyle.Render(lipgloss.JoinVertical(
		lipgloss.Left,
		titleStyle.Render("Status"),
		"",
		"Detected Agents:",
		strings.Join(agentLines, "\n"),
		"",
		fmt.Sprintf("Policies: %d", len(m.policies)),
		"",
		mutedStyle.Render("[esc] back"),
	))
}

func (m model) viewHelp() string {
	return boxStyle.Render(lipgloss.JoinVertical(
		lipgloss.Left,
		titleStyle.Render("Help"),
		"",
		fmt.Sprintf("%s  Run setup wizard", keyStyle.Render("i")),
		fmt.Sprintf("%s  View/manage policies", keyStyle.Render("p")),
		fmt.Sprintf("%s  Add new policy", keyStyle.Render("a")),
		fmt.Sprintf("%s  View status", keyStyle.Render("s")),
		fmt.Sprintf("%s  Show this help", keyStyle.Render("?")),
		fmt.Sprintf("%s  Quit", keyStyle.Render("q")),
		"",
		mutedStyle.Render("---"),
		"",
		"CLI usage:",
		mutedStyle.Render("  leash init          Setup wizard"),
		mutedStyle.Render("  leash add \"policy\"  Add policy"),
		mutedStyle.Render("  leash list          Show policies"),
		mutedStyle.Render("  leash sync          Apply to agents"),
		"",
		mutedStyle.Render("[esc] back"),
	))
}

// Messages
type policyCompiledMsg struct {
	policy string
	err    error
}

type initWizardDoneMsg struct {
	result *tui.InitResult
	err    error
}

// Commands
func compilePolicy(policy string) tea.Cmd {
	return func() tea.Msg {
		// Check builtins first
		if b := builtin.Find(policy); b != nil {
			return policyCompiledMsg{policy: policy, err: nil}
		}

		// TODO: LLM compilation for non-builtins
		// For now, just accept all policies
		return policyCompiledMsg{policy: policy, err: nil}
	}
}

func runInitWizard() tea.Msg {
	result, err := tui.RunInitWizard()
	if err != nil {
		return initWizardDoneMsg{err: err}
	}

	// Create config if requested
	if result.CreateConfig && !config.Exists() {
		if err := config.Create(); err != nil {
			return initWizardDoneMsg{err: err}
		}
	}

	return initWizardDoneMsg{result: result}
}

func main() {
	args := os.Args[1:]

	// No args = launch TUI
	if len(args) == 0 {
		p := tea.NewProgram(
			initialModel(),
			tea.WithAltScreen(),
		)
		if _, err := p.Run(); err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		return
	}

	// Handle CLI commands
	switch args[0] {
	case "--version", "-v":
		fmt.Printf("leash v%s\n", version)
		return
	case "--help", "-h", "help":
		printHelp()
		return
	case "init":
		// Run init wizard directly
		result, err := tui.RunInitWizard()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		if result.Cancelled {
			return
		}
		if result.CreateConfig {
			if err := config.Create(); err != nil {
				fmt.Fprintf(os.Stderr, "Error creating config: %v\n", err)
				os.Exit(1)
			}
			fmt.Println("+ Created .leash with default policies")
		}
		fmt.Printf("+ Selected agents: %v\n", result.Agents)
		return
	case "add":
		if len(args) < 2 {
			fmt.Fprintln(os.Stderr, "Usage: leash add \"policy\"")
			os.Exit(1)
		}
		restriction := strings.Join(args[1:], " ")

		// Check if it's a builtin first (fast path)
		if b := builtin.Find(restriction); b != nil {
			if err := config.AddPolicy(restriction); err != nil {
				fmt.Fprintf(os.Stderr, "Error: %v\n", err)
				os.Exit(1)
			}
			fmt.Printf("+ Added: %s (builtin)\n", restriction)
			return
		}

		// Use TypeScript engine for LLM compilation
		bridge, err := engine.NewBridge()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}

		fmt.Println("Compiling policy...")
		result, err := bridge.Compile(restriction)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}

		if !result.Success {
			fmt.Fprintf(os.Stderr, "x %s\n", result.Error)
			os.Exit(1)
		}

		if err := config.AddPolicy(restriction); err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("+ Added: %s\n", restriction)
		if result.Description != "" {
			fmt.Printf("  %s\n", result.Description)
		}
		return
	case "list":
		if !config.Exists() {
			fmt.Println("No .leash file found. Run 'leash init' to create one.")
			return
		}
		path, _ := config.Find()
		cfg, err := config.Load(path)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		if len(cfg.Policies) == 0 {
			fmt.Println("No policies configured.")
			return
		}
		fmt.Println("Policies:")
		for i, p := range cfg.Policies {
			indicator := "  "
			if b := builtin.Find(p); b != nil {
				indicator = "* "
			}
			fmt.Printf("  %d. %s%s\n", i+1, indicator, p)
		}
		fmt.Println("\n* = builtin pattern")
		return
	case "install":
		if len(args) < 2 {
			fmt.Fprintln(os.Stderr, "Usage: leash install <agent>")
			fmt.Fprintln(os.Stderr, "\nAgents: cc, oc, cursor, windsurf, aider")
			os.Exit(1)
		}
		if err := agent.Install(args[1]); err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("+ Installed hooks for %s\n", args[1])
		return
	case "uninstall":
		if len(args) < 2 {
			fmt.Fprintln(os.Stderr, "Usage: leash uninstall <agent>")
			os.Exit(1)
		}
		if err := agent.Uninstall(args[1]); err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("+ Uninstalled hooks for %s\n", args[1])
		return
	case "sync":
		// Sync policies to all or specific agent
		var agents []string
		if len(args) > 1 {
			agents = []string{args[1]}
		} else {
			// Sync to all detected agents
			for _, a := range agent.DetectInstalled() {
				agents = append(agents, a.ID)
			}
		}
		if len(agents) == 0 {
			fmt.Println("No agents detected. Install an agent first.")
			return
		}
		for _, agentID := range agents {
			if err := agent.Install(agentID); err != nil {
				fmt.Fprintf(os.Stderr, "Error syncing to %s: %v\n", agentID, err)
			} else {
				fmt.Printf("+ Synced to %s\n", agentID)
			}
		}
		return
	case "status":
		fmt.Println("Detected Agents:")
		detected := agent.DetectInstalled()
		if len(detected) == 0 {
			fmt.Println("  (none)")
		} else {
			for _, a := range detected {
				fmt.Printf("  %s [installed]\n", a.Name)
			}
		}
		fmt.Println()
		if config.Exists() {
			path, _ := config.Find()
			cfg, _ := config.Load(path)
			fmt.Printf("Policies: %d\n", len(cfg.Policies))
		} else {
			fmt.Println("No .leash config found")
		}
		return
	case "explain":
		if len(args) < 2 {
			fmt.Fprintln(os.Stderr, "Usage: leash explain \"policy\"")
			os.Exit(1)
		}
		restriction := strings.Join(args[1:], " ")

		// Use TypeScript engine for explain
		bridge, err := engine.NewBridge()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}

		if err := bridge.Explain(restriction); err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		return
	case "audit":
		// Use TypeScript engine for audit
		bridge, err := engine.NewBridge()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}

		if err := bridge.Audit(args[1:]); err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		return
	default:
		fmt.Fprintf(os.Stderr, "Unknown command: %s\n", args[0])
		fmt.Fprintln(os.Stderr, "Run 'leash --help' for usage.")
		os.Exit(1)
	}
}

func printHelp() {
	fmt.Println(`
leash - sudo for AI agents

USAGE
  leash                     Interactive dashboard
  leash init                Setup wizard
  leash add "policy"        Add policy  
  leash list                Show policies
  leash explain "policy"    Preview policy without installing
  leash sync [agent]        Apply policies to agents
  leash install <agent>     Install agent hooks
  leash uninstall <agent>   Remove agent hooks
  leash status              Show detected agents
  leash audit [--tail]      View audit log

AGENTS
  cc, claude-code    Claude Code
  oc, opencode       OpenCode
  cursor             Cursor
  windsurf           Windsurf
  aider              Aider

EXAMPLES
  leash add "protect .env"
  leash add "don't delete test files"
  leash add "no lodash"
  leash explain "prefer pnpm"
  leash install cc
  leash sync

ENVIRONMENT
  GEMINI_API_KEY     For custom policy compilation
                     Free: https://aistudio.google.com/apikey
`)
}
