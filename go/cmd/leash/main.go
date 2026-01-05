// leash - sudo for AI agents
// A permission layer for AI coding assistants with native TUI.
package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/spinner"
	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/vulnzap/leash/internal/agent"
	"github.com/vulnzap/leash/internal/builtin"
	"github.com/vulnzap/leash/internal/config"
	"github.com/vulnzap/leash/internal/engine"
)

const version = "2.1.2"

// ══════════════════════════════════════════════════════════════════════════════
// VETO BRANDING
// ══════════════════════════════════════════════════════════════════════════════

const logo = `
    @@     @@    @@@@@@@       @@       @@@@@@@     
    @@     @@   @@     @@      @@      @@     @@    
     @@   @@    @@@@@@@@@  @@@@@@@@@@  @@     @@    
      @@ @@     @@             @@      @@     @@    
      @@ @@     @@             @@      @@     @@    
       @@@       @@@@@@@   @@@@@@@@@@   @@@@@@@     `

const logoCompact = `@@ VETO`

// Brand colors
var (
	orange    = lipgloss.Color("#f5a524") // Veto Orange
	white     = lipgloss.Color("#f5f5f5") // Light
	black     = lipgloss.Color("#000000") // Dark
	darkGray  = lipgloss.Color("#1a1a1a")
	midGray   = lipgloss.Color("#666666")
	lightGray = lipgloss.Color("#aaaaaa")
	green     = lipgloss.Color("#22c55e")
	red       = lipgloss.Color("#ef4444")
)

// Adaptive colors - Apple-quality dark mode
var (
	textColor   = lipgloss.AdaptiveColor{Light: "#000000", Dark: "#ffffff"} // Pure white in dark
	textSecond  = lipgloss.AdaptiveColor{Light: "#333333", Dark: "#e0e0e0"} // High contrast secondary
	textMuted   = lipgloss.AdaptiveColor{Light: "#666666", Dark: "#a0a0a0"} // Readable muted
	textDim     = lipgloss.AdaptiveColor{Light: "#999999", Dark: "#707070"} // Subtle but visible
	borderColor = lipgloss.AdaptiveColor{Light: "#e0e0e0", Dark: "#404040"} // Visible borders
	bgSubtle    = lipgloss.AdaptiveColor{Light: "#f5f5f5", Dark: "#1a1a1a"} // Subtle background
	selectedBg  = lipgloss.AdaptiveColor{Light: "#fff7ed", Dark: "#2a2000"} // Orange tint selection
)

// ══════════════════════════════════════════════════════════════════════════════
// STYLES
// ══════════════════════════════════════════════════════════════════════════════

var (
	// Logo
	logoStyle = lipgloss.NewStyle().
			Foreground(orange).
			Bold(true)

	// Text
	titleStyle = lipgloss.NewStyle().
			Foreground(textColor).
			Bold(true)

	subtitleStyle = lipgloss.NewStyle().
			Foreground(textSecond)

	mutedStyle = lipgloss.NewStyle().
			Foreground(textMuted)

	dimStyle = lipgloss.NewStyle().
			Foreground(textDim)

	orangeStyle = lipgloss.NewStyle().
			Foreground(orange).
			Bold(true)

	successStyle = lipgloss.NewStyle().
			Foreground(green)

	errorStyle = lipgloss.NewStyle().
			Foreground(red)

	// Keys
	keyStyle = lipgloss.NewStyle().
			Foreground(orange).
			Bold(true)

	keyDescStyle = lipgloss.NewStyle().
			Foreground(textSecond)

	// Panels - blocky tactile design
	panelStyle = lipgloss.NewStyle().
			Border(lipgloss.ThickBorder()).
			BorderForeground(borderColor).
			Padding(0, 2)

	panelActiveStyle = lipgloss.NewStyle().
				Border(lipgloss.ThickBorder()).
				BorderForeground(orange).
				Padding(0, 2)

	panelHeaderStyle = lipgloss.NewStyle().
				Foreground(textColor).
				Bold(true).
				MarginBottom(1)

	// List items
	itemStyle = lipgloss.NewStyle().
			Foreground(textColor)

	itemSelectedStyle = lipgloss.NewStyle().
				Foreground(orange).
				Bold(true)

	// Status bar
	statusBarStyle = lipgloss.NewStyle().
			Foreground(textMuted).
			Background(bgSubtle).
			Padding(0, 1)

	// Tags
	tagStyle = lipgloss.NewStyle().
			Foreground(orange).
			Background(selectedBg).
			Padding(0, 1)
)

// ══════════════════════════════════════════════════════════════════════════════
// VIEWS & STATE
// ══════════════════════════════════════════════════════════════════════════════

type view int

const (
	viewDashboard view = iota
	viewPolicies
	viewAgents
	viewAddPolicy
	viewCompiling
	viewHelp
	viewWelcome
	viewUpdate
)

type model struct {
	// Window
	width  int
	height int
	ready  bool

	// Navigation
	view          view
	previousView  view
	selectedIndex int
	quitting      bool

	// Data
	policies []string
	agents   []agent.Agent

	// UI State
	message     string
	messageType string // success, error, info
	showWelcome bool
	updateAvail string // new version if available

	// Components
	input   textinput.Model
	spinner spinner.Model
}

func newModel() model {
	// Text input
	ti := textinput.New()
	ti.Placeholder = "describe your policy..."
	ti.CharLimit = 200
	ti.Width = 50
	ti.PromptStyle = orangeStyle
	ti.TextStyle = lipgloss.NewStyle().Foreground(textColor)
	ti.PlaceholderStyle = mutedStyle
	ti.Cursor.Style = orangeStyle

	// Spinner
	sp := spinner.New()
	sp.Spinner = spinner.Dot
	sp.Style = orangeStyle

	// Load data
	var policies []string
	if config.Exists() {
		if path, _ := config.Find(); path != "" {
			if cfg, _ := config.Load(path); cfg != nil {
				policies = cfg.Policies
			}
		}
	}
	agents := agent.DetectInstalled()

	// Check if first run
	showWelcome := !config.Exists() && len(agents) > 0

	return model{
		view:        viewDashboard,
		policies:    policies,
		agents:      agents,
		showWelcome: showWelcome,
		input:       ti,
		spinner:     sp,
	}
}

// ══════════════════════════════════════════════════════════════════════════════
// TEA INTERFACE
// ══════════════════════════════════════════════════════════════════════════════

func (m model) Init() tea.Cmd {
	return tea.Batch(
		textinput.Blink,
		checkForUpdate,
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
		// Welcome screen
		if m.showWelcome {
			switch msg.String() {
			case "enter", "y":
				m.showWelcome = false
				return m, runInit()
			case "n", "esc", "q":
				m.showWelcome = false
			}
			return m, nil
		}

		// Text input mode
		if m.view == viewAddPolicy && m.input.Focused() {
			switch msg.String() {
			case "enter":
				policy := strings.TrimSpace(m.input.Value())
				if policy != "" {
					m.view = viewCompiling
					m.input.Reset()
					return m, tea.Batch(m.spinner.Tick, compilePolicy(policy))
				}
			case "esc":
				m.input.Blur()
				m.input.Reset()
				m.view = m.previousView
				return m, nil
			default:
				var cmd tea.Cmd
				m.input, cmd = m.input.Update(msg)
				return m, cmd
			}
			return m, nil
		}

		// Global keys
		switch msg.String() {
		case "q", "ctrl+c":
			m.quitting = true
			return m, tea.Quit

		case "?":
			if m.view == viewHelp {
				m.view = m.previousView
			} else {
				m.previousView = m.view
				m.view = viewHelp
			}

		case "esc":
			if m.view != viewDashboard {
				m.view = viewDashboard
				m.message = ""
				m.selectedIndex = 0
			}

		// Navigation
		case "1", "h":
			if m.view == viewDashboard {
				m.view = viewPolicies
				m.selectedIndex = 0
			}
		case "2", "g":
			if m.view == viewDashboard {
				m.view = viewAgents
				m.selectedIndex = 0
			}
		case "tab":
			if m.view == viewPolicies {
				m.view = viewAgents
				m.selectedIndex = 0
			} else if m.view == viewAgents {
				m.view = viewPolicies
				m.selectedIndex = 0
			}

		// List navigation
		case "j", "down":
			m.navigateDown()
		case "k", "up":
			m.navigateUp()
		case "right":
			// Switch panels right (policies -> agents, or toggle dashboard selection)
			if m.view == viewDashboard {
				m.selectedIndex = (m.selectedIndex + 1) % 2
			} else if m.view == viewPolicies {
				m.view = viewAgents
				m.selectedIndex = 0
			}
		case "left":
			// Switch panels left (agents -> policies, or toggle dashboard selection)
			if m.view == viewDashboard {
				m.selectedIndex = (m.selectedIndex + 1) % 2
			} else if m.view == viewAgents {
				m.view = viewPolicies
				m.selectedIndex = 0
			}

		// Actions
		case "a":
			m.previousView = m.view
			m.view = viewAddPolicy
			m.input.Focus()
			return m, textinput.Blink
		case "d", "backspace", "x":
			if m.view == viewPolicies && len(m.policies) > 0 {
				return m, m.deleteSelectedPolicy()
			}
		case "enter", " ":
			return m, m.handleEnter()
		case "i":
			return m, runInit()
		case "s":
			return m, runSync()
		case "u":
			if m.updateAvail != "" {
				return m, runUpdate()
			}
		case "r":
			// Refresh
			m.agents = agent.DetectInstalled()
			if config.Exists() {
				if path, _ := config.Find(); path != "" {
					if cfg, _ := config.Load(path); cfg != nil {
						m.policies = cfg.Policies
					}
				}
			}
			m.message = "Refreshed"
			m.messageType = "info"
		}

	// Messages
	case updateCheckMsg:
		if msg.newVersion != "" && msg.newVersion != version {
			m.updateAvail = msg.newVersion
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
		m.view = m.previousView

	case initDoneMsg:
		if msg.err != nil {
			m.message = msg.err.Error()
			m.messageType = "error"
		} else {
			m.message = "Initialized .leash"
			m.messageType = "success"
			// Reload
			if path, _ := config.Find(); path != "" {
				if cfg, _ := config.Load(path); cfg != nil {
					m.policies = cfg.Policies
				}
			}
		}

	case syncDoneMsg:
		if msg.err != nil {
			m.message = msg.err.Error()
			m.messageType = "error"
		} else if msg.count == 0 {
			m.message = "No agents to sync"
			m.messageType = "error"
		} else {
			m.message = fmt.Sprintf("Synced to %d agent(s)", msg.count)
			m.messageType = "success"
		}

	case policyDeletedMsg:
		if msg.err != nil {
			m.message = msg.err.Error()
			m.messageType = "error"
		} else {
			// Remove from list
			if msg.index < len(m.policies) {
				m.policies = append(m.policies[:msg.index], m.policies[msg.index+1:]...)
			}
			if m.selectedIndex >= len(m.policies) && m.selectedIndex > 0 {
				m.selectedIndex--
			}
			m.message = "Removed policy"
			m.messageType = "info"
		}

	case updateDoneMsg:
		if msg.err != nil {
			m.message = "Update failed: " + msg.err.Error()
			m.messageType = "error"
		} else {
			m.message = "Updated! Restart leash to use new version"
			m.messageType = "success"
			m.updateAvail = ""
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

func (m *model) navigateDown() {
	max := 0
	switch m.view {
	case viewPolicies:
		max = len(m.policies)
	case viewAgents:
		max = len(m.agents)
	case viewDashboard:
		max = 2 // policies, agents
	}
	if max > 0 {
		m.selectedIndex = (m.selectedIndex + 1) % max
	}
}

func (m *model) navigateUp() {
	max := 0
	switch m.view {
	case viewPolicies:
		max = len(m.policies)
	case viewAgents:
		max = len(m.agents)
	case viewDashboard:
		max = 2
	}
	if max > 0 {
		m.selectedIndex--
		if m.selectedIndex < 0 {
			m.selectedIndex = max - 1
		}
	}
}

func (m *model) handleEnter() tea.Cmd {
	switch m.view {
	case viewDashboard:
		if m.selectedIndex == 0 {
			m.view = viewPolicies
		} else {
			m.view = viewAgents
		}
		m.selectedIndex = 0
	case viewAgents:
		if len(m.agents) > 0 && m.selectedIndex < len(m.agents) {
			a := m.agents[m.selectedIndex]
			return syncAgent(a.ID)
		}
	}
	return nil
}

func (m *model) deleteSelectedPolicy() tea.Cmd {
	if m.selectedIndex < len(m.policies) {
		policy := m.policies[m.selectedIndex]
		index := m.selectedIndex
		return func() tea.Msg {
			err := config.RemovePolicy(policy)
			return policyDeletedMsg{index: index, err: err}
		}
	}
	return nil
}

// ══════════════════════════════════════════════════════════════════════════════
// VIEW RENDERING
// ══════════════════════════════════════════════════════════════════════════════

func (m model) View() string {
	if m.quitting {
		return ""
	}
	if !m.ready {
		return "\n  Loading..."
	}

	// Welcome screen
	if m.showWelcome {
		return m.renderWelcome()
	}

	// Build layout
	header := m.renderHeader()
	content := m.renderContent()
	statusBar := m.renderStatusBar()

	// Compose
	return lipgloss.JoinVertical(
		lipgloss.Left,
		header,
		content,
		statusBar,
	)
}

func (m model) renderHeader() string {
	// Logo
	logoView := logoStyle.Render(logo)

	// Right side info
	versionStr := mutedStyle.Render("v" + version)
	if m.updateAvail != "" {
		versionStr = orangeStyle.Render("v"+version) + mutedStyle.Render(" → ") + successStyle.Render("v"+m.updateAvail+" available!")
	}

	// Center logo
	logoWidth := lipgloss.Width(logoView)
	padLeft := (m.width - logoWidth) / 2
	if padLeft < 0 {
		padLeft = 0
	}

	header := lipgloss.JoinVertical(
		lipgloss.Center,
		strings.Repeat(" ", padLeft)+logoView,
		lipgloss.PlaceHorizontal(m.width, lipgloss.Center, versionStr),
	)

	return header
}

func (m model) renderContent() string {
	contentHeight := m.height - 12 // header + status bar

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

	// Center content
	return lipgloss.Place(
		m.width, contentHeight,
		lipgloss.Center, lipgloss.Center,
		content,
	)
}

func (m model) renderDashboard() string {
	// Stats cards
	policyCard := m.renderStatCard("POLICIES", fmt.Sprintf("%d", len(m.policies)), m.selectedIndex == 0)
	agentCard := m.renderStatCard("AGENTS", fmt.Sprintf("%d", len(m.agents)), m.selectedIndex == 1)

	cards := lipgloss.JoinHorizontal(lipgloss.Top, policyCard, "  ", agentCard)

	// Message
	var msgView string
	if m.message != "" {
		icon := "●"
		style := mutedStyle
		switch m.messageType {
		case "success":
			style = successStyle
		case "error":
			style = errorStyle
			icon = "✗"
		}
		msgView = "\n\n" + style.Render(icon+" "+m.message)
	}

	// Quick actions
	actions := m.renderQuickActions()

	return lipgloss.JoinVertical(
		lipgloss.Center,
		cards,
		msgView,
		"\n",
		actions,
	)
}

func (m model) renderStatCard(title, value string, selected bool) string {
	style := panelStyle.Width(24).Align(lipgloss.Center)
	if selected {
		style = panelActiveStyle.Width(24).Align(lipgloss.Center)
	}

	titleView := mutedStyle.Render(title)
	valueView := orangeStyle.Copy().Bold(true).Render(value)

	return style.Render(
		lipgloss.JoinVertical(lipgloss.Center, titleView, valueView),
	)
}

func (m model) renderQuickActions() string {
	actions := []struct{ key, desc string }{
		{"a", "add"},
		{"i", "init"},
		{"s", "sync"},
		{"?", "help"},
		{"q", "quit"},
	}

	if m.updateAvail != "" {
		actions = append([]struct{ key, desc string }{{"u", "update"}}, actions...)
	}

	var parts []string
	for _, a := range actions {
		parts = append(parts, keyStyle.Render(a.key)+" "+keyDescStyle.Render(a.desc))
	}

	return lipgloss.JoinHorizontal(lipgloss.Center, strings.Join(parts, "   "))
}

func (m model) renderPolicies() string {
	width := min(60, m.width-4)

	if len(m.policies) == 0 {
		content := lipgloss.JoinVertical(
			lipgloss.Center,
			mutedStyle.Render("No policies yet"),
			"",
			mutedStyle.Render("Press ")+keyStyle.Render("a")+mutedStyle.Render(" to add one"),
		)
		return panelActiveStyle.Width(width).Render(
			lipgloss.JoinVertical(lipgloss.Left,
				panelHeaderStyle.Render("Policies"),
				"",
				content,
			),
		)
	}

	var rows []string
	for i, p := range m.policies {
		prefix := "  "
		style := itemStyle

		if i == m.selectedIndex {
			prefix = orangeStyle.Render("▸ ")
			style = itemSelectedStyle
		}

		// Builtin indicator
		suffix := ""
		if builtin.Find(p) != nil {
			suffix = " " + tagStyle.Render("⚡")
		}

		rows = append(rows, prefix+style.Render(p)+suffix)
	}

	help := mutedStyle.Render("↑↓ navigate • ←→ switch • a add • d delete • esc back")

	return panelActiveStyle.Width(width).Render(
		lipgloss.JoinVertical(lipgloss.Left,
			panelHeaderStyle.Render("Policies"),
			"",
			strings.Join(rows, "\n"),
			"",
			help,
		),
	)
}

func (m model) renderAgents() string {
	width := min(50, m.width-4)

	if len(m.agents) == 0 {
		content := lipgloss.JoinVertical(
			lipgloss.Center,
			mutedStyle.Render("No agents detected"),
			"",
			mutedStyle.Render("Install Claude Code, Cursor, or OpenCode"),
		)
		return panelActiveStyle.Width(width).Render(
			lipgloss.JoinVertical(lipgloss.Left,
				panelHeaderStyle.Render("Agents"),
				"",
				content,
			),
		)
	}

	var rows []string
	for i, a := range m.agents {
		prefix := "  "
		style := itemStyle

		if i == m.selectedIndex {
			prefix = orangeStyle.Render("▸ ")
			style = itemSelectedStyle
		}

		status := successStyle.Render("●")
		rows = append(rows, prefix+style.Render(a.Name)+" "+status)
	}

	help := mutedStyle.Render("↑↓ navigate • ←→ switch • enter sync • esc back")

	return panelActiveStyle.Width(width).Render(
		lipgloss.JoinVertical(lipgloss.Left,
			panelHeaderStyle.Render("Agents"),
			"",
			strings.Join(rows, "\n"),
			"",
			help,
		),
	)
}

func (m model) renderAddPolicy() string {
	width := min(55, m.width-4)

	examples := mutedStyle.Render(`Examples:
  no lodash
  protect .env files  
  prefer pnpm over npm
  don't delete tests`)

	return panelActiveStyle.Width(width).Render(
		lipgloss.JoinVertical(lipgloss.Left,
			panelHeaderStyle.Render("Add Policy"),
			"",
			"Describe what should be restricted:",
			"",
			m.input.View(),
			"",
			examples,
			"",
			mutedStyle.Render("enter add • esc cancel"),
		),
	)
}

func (m model) renderCompiling() string {
	return panelStyle.Width(35).Align(lipgloss.Center).Render(
		lipgloss.JoinVertical(lipgloss.Center,
			"",
			m.spinner.View()+" Compiling...",
			"",
		),
	)
}

func (m model) renderHelp() string {
	width := min(50, m.width-4)

	help := `
  ` + orangeStyle.Render("NAVIGATION") + `
  ` + keyStyle.Render("↑/k") + `    ` + keyDescStyle.Render("Move up") + `
  ` + keyStyle.Render("↓/j") + `    ` + keyDescStyle.Render("Move down") + `
  ` + keyStyle.Render("←/→") + `    ` + keyDescStyle.Render("Switch panels") + `
  ` + keyStyle.Render("tab") + `    ` + keyDescStyle.Render("Switch panels") + `
  ` + keyStyle.Render("esc") + `    ` + keyDescStyle.Render("Back / Dashboard") + `
  ` + keyStyle.Render("?") + `      ` + keyDescStyle.Render("Toggle help") + `

  ` + orangeStyle.Render("ACTIONS") + `
  ` + keyStyle.Render("a") + `      ` + keyDescStyle.Render("Add policy") + `
  ` + keyStyle.Render("d/x") + `    ` + keyDescStyle.Render("Delete selected") + `
  ` + keyStyle.Render("i") + `      ` + keyDescStyle.Render("Initialize .leash") + `
  ` + keyStyle.Render("s") + `      ` + keyDescStyle.Render("Sync to all agents") + `
  ` + keyStyle.Render("r") + `      ` + keyDescStyle.Render("Refresh") + `
  ` + keyStyle.Render("q") + `      ` + keyDescStyle.Render("Quit") + `

  ` + orangeStyle.Render("CLI") + `
  ` + dimStyle.Render("leash add \"policy\"") + `
  ` + dimStyle.Render("leash sync") + `
  ` + dimStyle.Render("leash --help")

	return panelActiveStyle.Width(width).Render(
		lipgloss.JoinVertical(lipgloss.Left,
			panelHeaderStyle.Render("Keyboard Shortcuts"),
			help,
		),
	)
}

func (m model) renderWelcome() string {
	width := min(55, m.width-4)

	welcomeText := `
Welcome to ` + orangeStyle.Render("VETO") + ` - sudo for AI agents.

Detected ` + orangeStyle.Render(fmt.Sprintf("%d", len(m.agents))) + ` AI agents on your system:
`

	for _, a := range m.agents {
		welcomeText += "  " + successStyle.Render("●") + " " + a.Name + "\n"
	}

	welcomeText += `
VETO lets you set policies that your AI agents
must follow - like "no lodash" or "protect .env".

Would you like to create a .leash config file
with recommended defaults?
`

	return lipgloss.Place(
		m.width, m.height,
		lipgloss.Center, lipgloss.Center,
		panelActiveStyle.Width(width).Render(
			lipgloss.JoinVertical(lipgloss.Left,
				panelHeaderStyle.Render("Welcome"),
				welcomeText,
				keyStyle.Render("y/enter")+" yes   "+keyStyle.Render("n/esc")+" no",
			),
		),
	)
}

func (m model) renderStatusBar() string {
	left := mutedStyle.Render("leash")

	var viewName string
	switch m.view {
	case viewDashboard:
		viewName = "dashboard"
	case viewPolicies:
		viewName = "policies"
	case viewAgents:
		viewName = "agents"
	case viewHelp:
		viewName = "help"
	case viewAddPolicy:
		viewName = "add"
	}

	right := mutedStyle.Render(viewName)

	gap := m.width - lipgloss.Width(left) - lipgloss.Width(right) - 2
	if gap < 0 {
		gap = 0
	}

	return statusBarStyle.Width(m.width).Render(
		left + strings.Repeat(" ", gap) + right,
	)
}

// ══════════════════════════════════════════════════════════════════════════════
// COMMANDS & MESSAGES
// ══════════════════════════════════════════════════════════════════════════════

type policyCompiledMsg struct {
	policy string
	err    error
}

type initDoneMsg struct{ err error }
type syncDoneMsg struct {
	count int
	err   error
}
type policyDeletedMsg struct {
	index int
	err   error
}
type updateCheckMsg struct{ newVersion string }
type updateDoneMsg struct{ err error }
type agentSyncedMsg struct {
	name string
	err  error
}

func compilePolicy(policy string) tea.Cmd {
	return func() tea.Msg {
		if builtin.Find(policy) != nil {
			return policyCompiledMsg{policy: policy}
		}
		return policyCompiledMsg{policy: policy}
	}
}

func runInit() tea.Cmd {
	return func() tea.Msg {
		if !config.Exists() {
			if err := config.Create(); err != nil {
				return initDoneMsg{err: err}
			}
		}
		return initDoneMsg{}
	}
}

func runSync() tea.Cmd {
	return func() tea.Msg {
		// Check if .leash exists
		if !config.Exists() {
			return syncDoneMsg{err: fmt.Errorf("no .leash file - run init first")}
		}

		agents := agent.DetectInstalled()
		if len(agents) == 0 {
			return syncDoneMsg{err: fmt.Errorf("no agents detected")}
		}

		count := 0
		var lastErr error
		for _, a := range agents {
			if err := agent.Install(a.ID); err != nil {
				lastErr = err
			} else {
				count++
			}
		}

		// If nothing synced, report the error
		if count == 0 && lastErr != nil {
			return syncDoneMsg{err: lastErr}
		}

		return syncDoneMsg{count: count}
	}
}

func syncAgent(id string) tea.Cmd {
	return func() tea.Msg {
		err := agent.Install(id)
		if err == nil {
			return syncDoneMsg{count: 1}
		}
		return syncDoneMsg{err: err}
	}
}

func checkForUpdate() tea.Msg {
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get("https://registry.npmjs.org/veto-leash/latest")
	if err != nil {
		return updateCheckMsg{}
	}
	defer resp.Body.Close()

	var data struct {
		Version string `json:"version"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return updateCheckMsg{}
	}

	return updateCheckMsg{newVersion: data.Version}
}

func runUpdate() tea.Cmd {
	return func() tea.Msg {
		var cmd *exec.Cmd
		if runtime.GOOS == "windows" {
			cmd = exec.Command("npm", "install", "-g", "veto-leash@latest")
		} else {
			cmd = exec.Command("npm", "install", "-g", "veto-leash@latest")
		}
		err := cmd.Run()
		return updateDoneMsg{err: err}
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// ══════════════════════════════════════════════════════════════════════════════
// CLI
// ══════════════════════════════════════════════════════════════════════════════

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

	// CLI
	switch args[0] {
	case "--version", "-v":
		fmt.Printf("leash v%s\n", version)

	case "--help", "-h", "help":
		printHelp()

	case "init":
		if config.Exists() {
			fmt.Println("● .leash already exists")
			return
		}
		if err := config.Create(); err != nil {
			fmt.Fprintf(os.Stderr, "✗ %v\n", err)
			os.Exit(1)
		}
		fmt.Println("✓ Created .leash")

	case "add":
		if len(args) < 2 {
			fmt.Fprintln(os.Stderr, "Usage: leash add \"policy\"")
			os.Exit(1)
		}
		policy := strings.Join(args[1:], " ")

		if builtin.Find(policy) != nil {
			if err := config.AddPolicy(policy); err != nil {
				fmt.Fprintf(os.Stderr, "✗ %v\n", err)
				os.Exit(1)
			}
			fmt.Printf("✓ Added: %s (builtin)\n", policy)
			return
		}

		bridge, err := engine.NewBridge()
		if err != nil {
			fmt.Fprintf(os.Stderr, "✗ %v\n", err)
			os.Exit(1)
		}

		fmt.Println("Compiling...")
		result, err := bridge.Compile(policy)
		if err != nil {
			fmt.Fprintf(os.Stderr, "✗ %v\n", err)
			os.Exit(1)
		}

		if !result.Success {
			fmt.Fprintf(os.Stderr, "✗ %s\n", result.Error)
			os.Exit(1)
		}

		if err := config.AddPolicy(policy); err != nil {
			fmt.Fprintf(os.Stderr, "✗ %v\n", err)
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
			fmt.Fprintf(os.Stderr, "✗ %v\n", err)
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
		fmt.Printf("Agents: %d\n", len(agents))
		for _, a := range agents {
			fmt.Printf("  ● %s\n", a.Name)
		}
		if config.Exists() {
			path, _ := config.Find()
			cfg, _ := config.Load(path)
			fmt.Printf("Policies: %d\n", len(cfg.Policies))
		}

	case "sync":
		if !config.Exists() {
			fmt.Fprintln(os.Stderr, "✗ No .leash file found")
			fmt.Fprintln(os.Stderr, "  Run: leash init")
			os.Exit(1)
		}
		agents := agent.DetectInstalled()
		if len(agents) == 0 {
			fmt.Fprintln(os.Stderr, "✗ No agents detected")
			os.Exit(1)
		}
		synced := 0
		for _, a := range agents {
			if err := agent.Install(a.ID); err != nil {
				fmt.Fprintf(os.Stderr, "✗ %s: %v\n", a.Name, err)
			} else {
				fmt.Printf("✓ %s\n", a.Name)
				synced++
			}
		}
		if synced == 0 {
			os.Exit(1)
		}

	case "install":
		if len(args) < 2 {
			fmt.Fprintln(os.Stderr, "Usage: leash install <agent>")
			os.Exit(1)
		}
		if err := agent.Install(args[1]); err != nil {
			fmt.Fprintf(os.Stderr, "✗ %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("✓ Installed: %s\n", args[1])

	case "uninstall":
		if len(args) < 2 {
			fmt.Fprintln(os.Stderr, "Usage: leash uninstall <agent>")
			os.Exit(1)
		}
		if err := agent.Uninstall(args[1]); err != nil {
			fmt.Fprintf(os.Stderr, "✗ %v\n", err)
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
			fmt.Fprintf(os.Stderr, "✗ %v\n", err)
			os.Exit(1)
		}
		if err := bridge.Explain(strings.Join(args[1:], " ")); err != nil {
			fmt.Fprintf(os.Stderr, "✗ %v\n", err)
			os.Exit(1)
		}

	case "audit":
		bridge, err := engine.NewBridge()
		if err != nil {
			fmt.Fprintf(os.Stderr, "✗ %v\n", err)
			os.Exit(1)
		}
		if err := bridge.Audit(args[1:]); err != nil {
			fmt.Fprintf(os.Stderr, "✗ %v\n", err)
			os.Exit(1)
		}

	case "update":
		fmt.Println("Updating...")
		cmd := exec.Command("npm", "install", "-g", "veto-leash@latest")
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		if err := cmd.Run(); err != nil {
			fmt.Fprintf(os.Stderr, "✗ %v\n", err)
			os.Exit(1)
		}
		fmt.Println("✓ Updated! Run 'leash --version' to verify")

	default:
		fmt.Fprintf(os.Stderr, "Unknown: %s\nRun: leash --help\n", args[0])
		os.Exit(1)
	}
}

func printHelp() {
	fmt.Print(`
 ` + logoCompact + `  sudo for AI agents

` + orangeStyle.Render("USAGE") + `
  leash                     Dashboard (TUI)
  leash add "policy"        Add a policy
  leash list                List policies
  leash sync                Sync to all agents  
  leash status              Show status
  leash install <agent>     Install hooks
  leash update              Update to latest version

` + orangeStyle.Render("AGENTS") + `
  cc, claude-code    Claude Code
  oc, opencode       OpenCode
  cursor             Cursor
  windsurf           Windsurf  
  aider              Aider

` + orangeStyle.Render("EXAMPLES") + `
  leash add "no lodash"
  leash add "protect .env"
  leash sync

`)
}
