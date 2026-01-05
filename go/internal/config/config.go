// Package config handles .leash configuration files.
package config

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
)

// LeashConfig represents a .leash configuration file.
type LeashConfig struct {
	// Policies is a list of policy restrictions
	Policies []string
	// Agents to apply policies to (optional, defaults to all detected)
	Agents []string
}

// DefaultPolicies are the universal defaults for new .leash files.
var DefaultPolicies = []string{
	"protect .env",
	"don't delete test files",
}

// Find locates a .leash file in the current directory or parents.
func Find() (string, error) {
	cwd, err := os.Getwd()
	if err != nil {
		return "", err
	}

	dir := cwd
	for {
		leashPath := filepath.Join(dir, ".leash")
		if _, err := os.Stat(leashPath); err == nil {
			return leashPath, nil
		}

		parent := filepath.Dir(dir)
		if parent == dir {
			// Reached root
			break
		}
		dir = parent
	}

	return "", os.ErrNotExist
}

// Exists checks if a .leash file exists in the current directory or parents.
func Exists() bool {
	_, err := Find()
	return err == nil
}

// Load reads and parses a .leash file.
// Format: one policy per line, # for comments
func Load(path string) (*LeashConfig, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	var policies []string
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		// Skip empty lines and comments
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		// Extract policy (before optional " - " reason)
		if idx := strings.Index(line, " - "); idx != -1 {
			line = strings.TrimSpace(line[:idx])
		}
		if line != "" {
			policies = append(policies, line)
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, err
	}

	return &LeashConfig{Policies: policies}, nil
}

// Create creates a new .leash file with default policies.
func Create() error {
	cwd, err := os.Getwd()
	if err != nil {
		return err
	}

	content := "# .leash - policies for AI agents\n"
	for _, p := range DefaultPolicies {
		content += p + "\n"
	}

	return os.WriteFile(filepath.Join(cwd, ".leash"), []byte(content), 0644)
}

// Save writes a config to the .leash file.
func Save(config *LeashConfig) error {
	cwd, err := os.Getwd()
	if err != nil {
		return err
	}

	content := "# .leash - policies for AI agents\n"
	for _, p := range config.Policies {
		content += p + "\n"
	}

	return os.WriteFile(filepath.Join(cwd, ".leash"), []byte(content), 0644)
}

// AddPolicy adds a policy to the config and saves it.
func AddPolicy(policy string) error {
	var config *LeashConfig

	if Exists() {
		path, _ := Find()
		var err error
		config, err = Load(path)
		if err != nil {
			return err
		}
	} else {
		config = &LeashConfig{Policies: []string{}}
	}

	// Check if policy already exists
	for _, p := range config.Policies {
		if p == policy {
			return nil // Already exists
		}
	}

	config.Policies = append(config.Policies, policy)
	return Save(config)
}

// RemovePolicy removes a policy from the config.
func RemovePolicy(policy string) error {
	if !Exists() {
		return os.ErrNotExist
	}

	path, _ := Find()
	config, err := Load(path)
	if err != nil {
		return err
	}

	var newPolicies []string
	for _, p := range config.Policies {
		if p != policy {
			newPolicies = append(newPolicies, p)
		}
	}

	config.Policies = newPolicies
	return Save(config)
}
