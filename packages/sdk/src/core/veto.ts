/**
 * Main Veto guardrail class.
 *
 * This is the primary entry point for using Veto. It automatically loads
 * configuration and rules from the veto/ directory and validates tool calls.
 *
 * @module core/veto
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type {
  ToolDefinition,
  ToolCall,
} from '../types/tool.js';
import { isExecutableTool } from '../types/tool.js';
import type {
  Validator,
  NamedValidator,
  ValidationContext,
  ValidationResult,
  LogLevel,
} from '../types/config.js';
import { createLogger, type Logger } from '../utils/logger.js';
import { generateToolCallId } from '../utils/id.js';
import { ValidationEngine } from './validator.js';
import { HistoryTracker, type HistoryStats } from './history.js';
import { Interceptor, ToolCallDeniedError, type InterceptionResult } from './interceptor.js';
import type {
  Rule,
  ToolCallContext,
  ToolCallHistorySummary,
  ValidationAPIResponse,
} from '../rules/types.js';
import { parseRuleSetStrict, RuleSchemaError } from '../rules/types.js';
import type { KernelConfig, KernelToolCall } from '../kernel/types.js';
import { KernelClient } from '../kernel/client.js';
import type { CustomConfig, CustomToolCall } from '../custom/types.js';
import { CustomClient } from '../custom/client.js';

/**
 * Veto operating mode.
 * - "strict": Block tool calls when validation fails
 * - "log": Only log validation failures, allow tool calls to proceed
 */
export type VetoMode = 'strict' | 'log';

/**
 * Validation mode - how tool calls are validated.
 * - "api": Use external HTTP API for validation
 * - "kernel": Use local kernel model via Ollama
 * - "custom": Use custom LLM provider (OpenAI, Anthropic, Gemini, OpenRouter)
 */
export type ValidationMode = 'api' | 'kernel' | 'custom';

/**
 * Wrapped handler function type.
 */
export type WrappedHandler = (args: Record<string, unknown>) => Promise<unknown>;

/**
 * Result of wrapping tools with Veto.
 */
export interface WrappedTools {
  /** Tool definitions (schemas) to pass to AI models */
  definitions: ToolDefinition[];
  /** Wrapped handler functions keyed by tool name */
  implementations: Record<string, WrappedHandler>;
}

/**
 * Parsed veto.config.yaml structure.
 */
interface VetoConfigFile {
  version?: string;
  mode?: VetoMode;
  validation?: {
    mode?: ValidationMode;
  };
  api?: {
    baseUrl?: string;
    endpoint?: string;
    timeout?: number;
    retries?: number;
    retryDelay?: number;
  };
  kernel?: {
    baseUrl?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    timeout?: number;
  };
  custom?: {
    provider?: 'gemini' | 'openrouter' | 'openai' | 'anthropic';
    model?: string;
    apiKey?: string;
    temperature?: number;
    maxTokens?: number;
    timeout?: number;
    baseUrl?: string;
  };
  logging?: {
    level?: LogLevel;
  };
  rules?: {
    directory?: string;
    recursive?: boolean;
  };
}

/**
 * Internal state for loaded rules.
 */
interface LoadedRulesState {
  allRules: Rule[];
  rulesByTool: Map<string, Rule[]>;
  globalRules: Rule[];
}

/**
 * Options for creating a Veto instance.
 */
export interface VetoOptions {
  /**
   * Path to the veto directory containing config and rules.
   * Defaults to './veto' relative to current working directory.
   */
  configDir?: string;

  /**
   * Override the operating mode.
   * - "strict": Block tool calls when validation fails
   * - "log": Only log validation failures, allow tool calls to proceed
   */
  mode?: VetoMode;

  /**
   * Override log level.
   * Can also be set via VETO_LOG_LEVEL environment variable.
   */
  logLevel?: LogLevel;

  /**
   * Session ID for tracking.
   * Can also be set via VETO_SESSION_ID environment variable.
   */
  sessionId?: string;

  /**
   * Agent ID for tracking.
   * Can also be set via VETO_AGENT_ID environment variable.
   */
  agentId?: string;

  /**
   * Additional validators to run alongside rule-based validation.
   */
  validators?: (Validator | NamedValidator)[];

  /**
   * Injected kernel client for testing or custom configurations.
   */
  kernelClient?: KernelClient;
}

/**
 * Veto - A guardrail system for AI agent tool calls.
 *
 * Veto automatically loads configuration from the veto/ directory and
 * validates tool calls against defined rules via an external API.
 *
 * @example
 * ```typescript
 * import { Veto } from 'veto';
 *
 * // Initialize Veto (loads config from ./veto automatically)
 * const veto = await Veto.init();
 *
 * // Wrap your tools
 * const wrappedTools = veto.wrapTools(myTools);
 *
 * // Pass to AI provider, then validate calls
 * const result = await veto.validateToolCall(toolCall);
 * ```
 */
export class Veto {
  private readonly logger: Logger;
  private readonly validationEngine: ValidationEngine;
  private readonly historyTracker: HistoryTracker;
  private readonly interceptor: Interceptor;
  private readonly registeredTools: Map<string, ToolDefinition> = new Map();

  // Configuration
  private readonly configDir: string;
  private readonly mode: VetoMode;
  private readonly validationMode: ValidationMode;
  private readonly apiBaseUrl: string;
  private readonly apiEndpoint: string;
  private readonly apiTimeout: number;
  private readonly apiRetries: number;
  private readonly apiRetryDelay: number;
  private readonly sessionId?: string;
  private readonly agentId?: string;

  // Kernel client (lazy initialized or injected)
  private kernelClient: KernelClient | null = null;
  private readonly kernelConfig: KernelConfig | null;

  // Custom client (lazy initialized)
  private customClient: CustomClient | null = null;
  private readonly customConfig: CustomConfig | null;

  // Loaded rules
  private readonly rules: LoadedRulesState;

  private readonly rateLimitWindow = 60000;
  private readonly rateLimitMax = 100;
  private readonly rateLimitMap = new Map<string, { count: number; resetAt: number }>();

  private constructor(
    options: VetoOptions,
    config: VetoConfigFile,
    rules: LoadedRulesState,
    logger: Logger
  ) {
    this.logger = logger;
    this.configDir = options.configDir ?? './veto';
    this.rules = rules;

    // Resolve mode (strict blocks, log only logs)
    this.mode = options.mode ?? config.mode ?? 'strict';

    // Resolve validation mode (api or kernel)
    this.validationMode = config.validation?.mode ?? 'api';

    // Resolve API configuration from config file
    this.apiBaseUrl = (config.api?.baseUrl ?? 'http://localhost:8080').replace(/\/$/, '');
    this.apiEndpoint = config.api?.endpoint ?? '/tool/call/check';
    this.apiTimeout = config.api?.timeout ?? 10000;
    this.apiRetries = config.api?.retries ?? 2;
    this.apiRetryDelay = config.api?.retryDelay ?? 1000;

    // Resolve kernel configuration
    if (this.validationMode === 'kernel' && config.kernel?.model) {
      this.kernelConfig = {
        baseUrl: config.kernel.baseUrl ?? 'http://localhost:11434/v1',
        model: config.kernel.model,
        temperature: config.kernel.temperature,
        maxTokens: config.kernel.maxTokens,
        timeout: config.kernel.timeout,
      };
    } else {
      this.kernelConfig = null;
    }

    // Use injected kernel client if provided
    if (options.kernelClient) {
      this.kernelClient = options.kernelClient;
    }

    // Resolve custom configuration
    if (this.validationMode === 'custom' && config.custom?.provider && config.custom?.model) {
      const validProviders = ['openai', 'anthropic', 'gemini', 'openrouter'] as const;
      const provider = config.custom.provider;
      if (!validProviders.includes(provider as typeof validProviders[number])) {
        throw new Error(
          `Invalid custom provider: "${provider}". Must be one of: ${validProviders.join(', ')}`
        );
      }
      this.customConfig = {
        provider: provider as import('../custom/types.js').CustomProvider,
        model: config.custom.model,
        apiKey: config.custom.apiKey,
        temperature: config.custom.temperature,
        maxTokens: config.custom.maxTokens,
        timeout: config.custom.timeout,
        baseUrl: config.custom.baseUrl,
      };
    } else {
      this.customConfig = null;
    }

    // Resolve tracking options
    this.sessionId = options.sessionId ?? process.env.VETO_SESSION_ID;
    this.agentId = options.agentId ?? process.env.VETO_AGENT_ID;

    this.logger.info('Veto configuration loaded', {
      configDir: this.configDir,
      mode: this.mode,
      validationMode: this.validationMode,
      apiUrl: this.validationMode === 'api' ? `${this.apiBaseUrl}${this.apiEndpoint}` : undefined,
      kernelModel: this.kernelConfig?.model,
      customProvider: this.customConfig?.provider,
      customModel: this.customConfig?.model,
      rulesLoaded: rules.allRules.length,
    });

    // Initialize validation engine
    const defaultDecision = 'allow';
    this.validationEngine = new ValidationEngine({
      logger: this.logger,
      defaultDecision,
    });

    // Add the rule validator based on validation mode
    this.validationEngine.addValidator({
      name: 'veto-rule-validator',
      description: this.validationMode === 'kernel'
        ? 'Validates tool calls via local kernel model'
        : this.validationMode === 'custom'
          ? `Validates tool calls via ${this.customConfig?.provider ?? 'custom'} LLM`
          : 'Validates tool calls via external API',
      priority: 50,
      validate: (ctx) => {
        if (this.validationMode === 'kernel') {
          return this.validateWithKernel(ctx);
        } else if (this.validationMode === 'custom') {
          return this.validateWithCustom(ctx);
        } else {
          return this.validateWithAPI(ctx);
        }
      },
    });

    // Add any additional validators
    if (options.validators) {
      this.validationEngine.addValidators(options.validators);
    }

    // Initialize history tracker
    this.historyTracker = new HistoryTracker({
      maxSize: 100,
      logger: this.logger,
    });

    // Initialize interceptor
    this.interceptor = new Interceptor({
      logger: this.logger,
      validationEngine: this.validationEngine,
      historyTracker: this.historyTracker,
    });

    this.logger.info('Veto initialized successfully');
  }

  /**
   * Initialize Veto by loading configuration and rules.
   *
   * @param options - Initialization options
   * @returns Initialized Veto instance
   *
   * @example
   * ```typescript
   * // Use defaults (loads from ./veto)
   * const veto = await Veto.init();
   *
   * // Custom config directory
   * const veto = await Veto.init({ configDir: './my-veto-config' });
   *
   * // Override API URL
   * const veto = await Veto.init({ apiBaseUrl: 'https://api.example.com' });
   * ```
   */
  static async init(options: VetoOptions = {}): Promise<Veto> {
    const configDir = resolve(options.configDir ?? './veto');

    // Determine log level
    const envLogLevel = process.env.VETO_LOG_LEVEL as LogLevel | undefined;
    let logLevel: LogLevel = options.logLevel ?? envLogLevel ?? 'info';

    // Load config file
    const configPath = join(configDir, 'veto.config.yaml');
    let config: VetoConfigFile = {};

    if (existsSync(configPath)) {
      const configContent = readFileSync(configPath, 'utf-8');
      config = parseYaml(configContent) as VetoConfigFile;
      logLevel = options.logLevel ?? envLogLevel ?? config.logging?.level ?? 'info';
    }

    const logger = createLogger(logLevel);

    if (!existsSync(configPath)) {
      logger.warn('Veto config not found. Run "npx veto init" to initialize.', {
        expected: configPath,
      });
    }

    // Load rules
    const rulesDir = resolve(configDir, config.rules?.directory ?? './rules');
    const recursive = config.rules?.recursive ?? true;
    const rules = Veto.loadRules(rulesDir, recursive, logger);

    return new Veto(options, config, rules, logger);
  }

  /**
   * Load rules from YAML files.
   */
  private static loadRules(
    rulesDir: string,
    recursive: boolean,
    logger: Logger
  ): LoadedRulesState {
    const state: LoadedRulesState = {
      allRules: [],
      rulesByTool: new Map(),
      globalRules: [],
    };

    if (!existsSync(rulesDir)) {
      logger.debug('Rules directory not found', { path: rulesDir });
      return state;
    }

    const yamlFiles = Veto.findYamlFiles(rulesDir, recursive);
    logger.debug('Found rule files', { count: yamlFiles.length });

    for (const filePath of yamlFiles) {
      try {
        const content = readFileSync(filePath, 'utf-8');
        const parsed = parseYaml(content);

        const ruleSet = parseRuleSetStrict(parsed, filePath);

        for (const rule of ruleSet.rules) {
          if (!rule.enabled) continue;

          state.allRules.push(rule);

          if (!rule.tools || rule.tools.length === 0) {
            state.globalRules.push(rule);
          } else {
            for (const toolName of rule.tools) {
              const existing = state.rulesByTool.get(toolName) ?? [];
              existing.push(rule);
              state.rulesByTool.set(toolName, existing);
            }
          }
        }

        logger.debug('Loaded rules from file', {
          path: filePath,
          count: ruleSet.rules.length,
        });
      } catch (error) {
        if (error instanceof RuleSchemaError) {
          throw error;
        }
        logger.error(
          'Failed to load rules file',
          { path: filePath },
          error instanceof Error ? error : new Error(String(error))
        );
      }
    }

    logger.info('Rules loaded', {
      total: state.allRules.length,
      global: state.globalRules.length,
      toolSpecific: state.rulesByTool.size,
    });

    return state;
  }

  /**
   * Find YAML files in a directory.
   */
  private static findYamlFiles(dir: string, recursive: boolean): string[] {
    const files: string[] = [];

    try {
      const entries = readdirSync(dir);

      for (const entry of entries) {
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);

        if (stat.isDirectory() && recursive) {
          files.push(...Veto.findYamlFiles(fullPath, recursive));
        } else if (stat.isFile()) {
          const ext = extname(entry).toLowerCase();
          if (ext === '.yaml' || ext === '.yml') {
            files.push(fullPath);
          }
        }
      }
    } catch {
      // Directory doesn't exist or not readable
    }

    return files;
  }

  /**
   * Get rules applicable to a tool.
   */
  private getRulesForTool(toolName: string): Rule[] {
    const toolSpecific = this.rules.rulesByTool.get(toolName) ?? [];
    return [...this.rules.globalRules, ...toolSpecific];
  }

  private checkRateLimit(key: string): void {
    const now = Date.now();
    const entry = this.rateLimitMap.get(key);

    if (!entry || now >= entry.resetAt) {
      this.rateLimitMap.set(key, {
        count: 1,
        resetAt: now + this.rateLimitWindow,
      });
      return;
    }

    if (entry.count >= this.rateLimitMax) {
      throw new Error(
        `Rate limit exceeded: ${this.rateLimitMax} validations per ${this.rateLimitWindow / 1000}s`
      );
    }

    entry.count++;
  }

  /**
   * Validate a tool call with the external API.
   */
  private async validateWithAPI(context: ValidationContext): Promise<ValidationResult> {
    this.checkRateLimit(`api:${context.toolName}`);

    const rules = this.getRulesForTool(context.toolName);

    // If no rules, allow by default
    if (rules.length === 0) {
      this.logger.debug('No rules for tool, allowing', { tool: context.toolName });
      return { decision: 'allow' };
    }

    // Build API request
    const apiContext: ToolCallContext = {
      call_id: context.callId,
      tool_name: context.toolName,
      arguments: context.arguments,
      timestamp: context.timestamp.toISOString(),
      session_id: this.sessionId,
      agent_id: this.agentId,
      call_history: this.buildHistorySummary(context.callHistory),
      custom: context.custom,
    };

    const url = `${this.apiBaseUrl}${this.apiEndpoint}`;

    // Make API call with retries
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.apiRetries; attempt++) {
      try {
        const response = await this.makeAPIRequest(url, apiContext, rules);
        return this.handleAPIResponse(response, context);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.apiRetries) {
          this.logger.warn('API request failed, retrying', {
            attempt: attempt + 1,
            error: lastError.message,
          });
          await this.delay(this.apiRetryDelay);
        }
      }
    }

    // All retries failed - use fail mode
    return this.handleAPIFailure(lastError?.message ?? 'API unavailable');
  }

  /**
   * Make the API request.
   */
  private async makeAPIRequest(
    url: string,
    context: ToolCallContext,
    rules: Rule[]
  ): Promise<ValidationAPIResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.apiTimeout);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ context, rules }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`API returned status ${response.status}`);
      }

      const data = await response.json() as ValidationAPIResponse;

      // Validate response
      if (data.decision !== 'pass' && data.decision !== 'block') {
        throw new Error('Invalid API response: missing decision');
      }

      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Handle successful API response.
   */
  private handleAPIResponse(
    response: ValidationAPIResponse,
    context: ValidationContext
  ): ValidationResult {
    const metadata = {
      should_pass_weight: response.should_pass_weight,
      should_block_weight: response.should_block_weight,
      matched_rules: response.matched_rules,
    };

    if (response.decision === 'pass') {
      this.logger.debug('API allowed tool call', {
        tool: context.toolName,
        passWeight: response.should_pass_weight,
      });

      return {
        decision: 'allow',
        reason: response.reasoning,
        metadata,
      };
    } else {
      // API returned block decision
      if (this.mode === 'log') {
        // Log mode: log the block but allow the call
        this.logger.warn('Tool call would be blocked (log mode)', {
          tool: context.toolName,
          blockWeight: response.should_block_weight,
          reason: response.reasoning,
        });

        return {
          decision: 'allow',
          reason: `[LOG MODE] Would block: ${response.reasoning}`,
          metadata: { ...metadata, blocked_in_strict_mode: true },
        };
      } else {
        // Strict mode: actually block the call
        this.logger.warn('Tool call blocked', {
          tool: context.toolName,
          blockWeight: response.should_block_weight,
          reason: response.reasoning,
        });

        return {
          decision: 'deny',
          reason: response.reasoning,
          metadata,
        };
      }
    }
  }

  /**
   * Handle API failure. In log mode, always allow. In strict mode, block.
   */
  private handleAPIFailure(reason: string): ValidationResult {
    if (this.mode === 'log') {
      this.logger.warn('API unavailable (log mode, allowing)', { reason });
      return {
        decision: 'allow',
        reason: `API unavailable: ${reason}`,
        metadata: { api_error: true },
      };
    } else {
      this.logger.error('API unavailable (strict mode, blocking)', { reason });
      return {
        decision: 'deny',
        reason: `API unavailable: ${reason}`,
        metadata: { api_error: true },
      };
    }
  }

  /**
   * Get or create the kernel client.
   */
  private getKernelClient(): KernelClient {
    if (this.kernelClient) {
      return this.kernelClient;
    }

    if (!this.kernelConfig) {
      throw new Error('Kernel configuration not available');
    }

    this.kernelClient = new KernelClient({
      config: this.kernelConfig,
      logger: this.logger,
    });

    return this.kernelClient;
  }

  /**
   * Validate a tool call with the local kernel model.
   */
  private async validateWithKernel(context: ValidationContext): Promise<ValidationResult> {
    this.checkRateLimit(`kernel:${context.toolName}`);

    const rules = this.getRulesForTool(context.toolName);

    // If no rules, allow by default
    if (rules.length === 0) {
      this.logger.debug('No rules for tool, allowing', { tool: context.toolName });
      return { decision: 'allow' };
    }

    const toolCall: KernelToolCall = {
      tool: context.toolName,
      arguments: context.arguments,
    };

    try {
      const kernelClient = this.getKernelClient();
      const response = await kernelClient.evaluate(toolCall, rules);

      return this.handleKernelResponse(response, context);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return this.handleKernelFailure(reason);
    }
  }

  /**
   * Handle successful kernel response.
   */
  private handleKernelResponse(
    response: import('../kernel/types.js').KernelResponse,
    context: ValidationContext
  ): ValidationResult {
    const metadata = {
      pass_weight: response.pass_weight,
      block_weight: response.block_weight,
      matched_rules: response.matched_rules,
    };

    if (response.decision === 'pass') {
      this.logger.debug('Kernel allowed tool call', {
        tool: context.toolName,
        passWeight: response.pass_weight,
      });

      return {
        decision: 'allow',
        reason: response.reasoning,
        metadata,
      };
    } else {
      // Kernel returned block decision
      if (this.mode === 'log') {
        // Log mode: log the block but allow the call
        this.logger.warn('Tool call would be blocked (log mode)', {
          tool: context.toolName,
          blockWeight: response.block_weight,
          reason: response.reasoning,
        });

        return {
          decision: 'allow',
          reason: `[LOG MODE] Would block: ${response.reasoning}`,
          metadata: { ...metadata, blocked_in_strict_mode: true },
        };
      } else {
        // Strict mode: actually block the call
        this.logger.warn('Tool call blocked by kernel', {
          tool: context.toolName,
          blockWeight: response.block_weight,
          reason: response.reasoning,
        });

        return {
          decision: 'deny',
          reason: response.reasoning,
          metadata,
        };
      }
    }
  }

  /**
   * Handle kernel failure. In log mode, always allow. In strict mode, block.
   */
  private handleKernelFailure(reason: string): ValidationResult {
    if (this.mode === 'log') {
      this.logger.warn('Kernel unavailable (log mode, allowing)', { reason });
      return {
        decision: 'allow',
        reason: `Kernel unavailable: ${reason}`,
        metadata: { kernel_error: true },
      };
    } else {
      this.logger.error('Kernel unavailable (strict mode, blocking)', { reason });
      return {
        decision: 'deny',
        reason: `Kernel unavailable: ${reason}`,
        metadata: { kernel_error: true },
      };
    }
  }

  /**
   * Get or create the custom client.
   */
  private getCustomClient(): CustomClient {
    if (this.customClient) {
      return this.customClient;
    }

    if (!this.customConfig) {
      throw new Error(
        'Custom validation is not configured. Set validation.mode="custom" and provide custom.provider and custom.model in veto.config.yaml'
      );
    }

    this.customClient = new CustomClient({
      config: this.customConfig,
      logger: this.logger,
    });

    return this.customClient;
  }

  /**
   * Validate a tool call with the custom LLM provider.
   */
  private async validateWithCustom(context: ValidationContext): Promise<ValidationResult> {
    this.checkRateLimit(`custom:${context.toolName}`);

    const rules = this.getRulesForTool(context.toolName);

    if (rules.length === 0) {
      this.logger.debug('No rules for tool, allowing', { tool: context.toolName });
      return { decision: 'allow' };
    }

    const toolCall: CustomToolCall = {
      tool: context.toolName,
      arguments: context.arguments,
    };

    try {
      const customClient = this.getCustomClient();
      const response = await customClient.evaluate(toolCall, rules);

      return this.handleCustomResponse(response, context);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return this.handleCustomFailure(reason);
    }
  }

  /**
   * Handle successful custom response.
   */
  private handleCustomResponse(
    response: import('../custom/types.js').CustomResponse,
    context: ValidationContext
  ): ValidationResult {
    const metadata = {
      pass_weight: response.pass_weight,
      block_weight: response.block_weight,
      matched_rules: response.matched_rules,
    };

    if (response.decision === 'pass') {
      this.logger.debug('Custom provider allowed tool call', {
        tool: context.toolName,
        passWeight: response.pass_weight,
      });

      return {
        decision: 'allow',
        reason: response.reasoning,
        metadata,
      };
    } else {
      if (this.mode === 'log') {
        this.logger.warn('Tool call would be blocked (log mode)', {
          tool: context.toolName,
          blockWeight: response.block_weight,
          reason: response.reasoning,
        });

        return {
          decision: 'allow',
          reason: `[LOG MODE] Would block: ${response.reasoning}`,
          metadata: { ...metadata, blocked_in_strict_mode: true },
        };
      } else {
        this.logger.warn('Tool call blocked by custom provider', {
          tool: context.toolName,
          blockWeight: response.block_weight,
          reason: response.reasoning,
        });

        return {
          decision: 'deny',
          reason: response.reasoning,
          metadata,
        };
      }
    }
  }

  /**
   * Handle custom provider failure. In log mode, always allow. In strict mode, block.
   */
  private handleCustomFailure(reason: string): ValidationResult {
    if (this.mode === 'log') {
      this.logger.warn('Custom provider unavailable (log mode, allowing)', { reason });
      return {
        decision: 'allow',
        reason: `Custom provider unavailable: ${reason}`,
        metadata: { custom_provider_failed: true },
      };
    } else {
      this.logger.error('Custom provider unavailable (strict mode, blocking)', { reason });
      return {
        decision: 'deny',
        reason: `Custom provider unavailable: ${reason}`,
        metadata: { custom_provider_failed: true },
      };
    }
  }

  /**
   * Build history summary for API.
   */
  private buildHistorySummary(
    history: readonly import('../types/config.js').ToolCallHistoryEntry[]
  ): ToolCallHistorySummary[] {
    return history.slice(-10).map((entry) => ({
      tool_name: entry.toolName,
      allowed: entry.validationResult.decision !== 'deny',
      timestamp: entry.timestamp.toISOString(),
    }));
  }

  /**
   * Delay helper.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Wrap tools for use with an AI provider.
   *
   * Returns an object containing:
   * - `definitions`: Tool schemas to pass to the AI model
   * - `implementations`: Object with wrapped handler functions keyed by tool name
   *
   * @param tools - Tools to wrap (must have handlers)
   * @returns Object with toolDefinitions and toolImplementations
   *
   * @example
   * ```typescript
   * const tools = [
   *   {
   *     name: 'read_file',
   *     inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
   *     handler: async (args) => fs.readFileSync(args.path, 'utf-8')
   *   }
   * ];
   *
   * const veto = await Veto.init();
   * const { definitions, implementations } = veto.wrapTools(tools);
   *
   * // Pass definitions to AI model
   * const response = await openai.chat.completions.create({
   *   tools: toOpenAITools(definitions),
   *   ...
   * });
   *
   * // Execute tool calls using implementations
   * const result = await implementations.read_file({ path: '/home/user/file.txt' });
   * ```
   */
  wrapTools(tools: readonly ToolDefinition[]): WrappedTools {
    const definitions: ToolDefinition[] = [];
    const implementations: Record<string, WrappedHandler> = {};

    for (const tool of tools) {
      this.registeredTools.set(tool.name, tool);

      // Extract definition (without handler)
      const { handler: _, ...definition } = tool as ToolDefinition & { handler?: unknown };
      definitions.push(definition as ToolDefinition);

      if (isExecutableTool(tool)) {
        // Wrap the handler with automatic validation
        const originalHandler = tool.handler;
        const wrappedHandler: WrappedHandler = async (args: Record<string, unknown>) => {
          const result = await this.validateToolCall({
            id: generateToolCallId(),
            name: tool.name,
            arguments: args,
          });

          if (!result.allowed) {
            throw new ToolCallDeniedError(
              tool.name,
              result.originalCall.id || '',
              result.validationResult
            );
          }

          // Execute with potentially modified arguments
          return originalHandler(result.finalArguments ?? args);
        };

        implementations[tool.name] = wrappedHandler;
      }
    }

    this.logger.info('Tools wrapped', {
      count: tools.length,
      names: tools.map((t) => t.name),
    });

    return {
      definitions,
      implementations,
    };
  }

  /**
   * Wrap tools with Veto validation (provider-agnostic).
   *
   * This method accepts tools of any type and returns them with the same type,
   * but with Veto validation injected into the execution function.
   * Works with LangChain tools, custom tools, or any tool that has a callable function.
   *
   * @param tools - Array of tools to wrap (LangChain, custom, etc.)
   * @returns The same tools with Veto validation injected
   *
   * @example
   * ```typescript
   * import { createAgent, tool } from 'langchain';
   * import { Veto } from 'veto';
   *
   * const tools = [
   *   tool(({ query }) => `Results for: ${query}`, {
   *     name: 'search',
   *     schema: z.object({ query: z.string() }),
   *   }),
   * ];
   *
   * const veto = await Veto.init();
   * const wrappedTools = veto.wrap(tools);
   *
   * const agent = createAgent({
   *   model: 'openai:gpt-5.2',
   *   tools: wrappedTools, // Same type as input!
   * });
   * ```
   */
  wrap<T extends { name: string }>(tools: T[]): T[] {
    return tools.map((tool) => this.wrapTool(tool));
  }

  /**
   * Wrap a single tool with Veto validation (provider-agnostic).
   *
   * @param tool - The tool to wrap
   * @returns The same tool with Veto validation injected
   */
  wrapTool<T extends { name: string }>(tool: T): T {
    const toolName = tool.name;
    const toolAny = tool as Record<string, unknown>;
    const veto = this;

    // For LangChain tools, we need to wrap the 'func' property
    // and also override 'invoke' to ensure validation happens
    if (typeof toolAny.func === 'function') {
      const originalFunc = toolAny.func as (input: Record<string, unknown>) => unknown;

      // Create a new object that inherits from the original
      const wrapped = Object.create(Object.getPrototypeOf(tool));
      Object.assign(wrapped, tool);

      // Create wrapped func that validates before executing
      const wrappedFunc = async (input: Record<string, unknown>): Promise<unknown> => {
        const result = await veto.validateToolCall({
          id: generateToolCallId(),
          name: toolName,
          arguments: input,
        });

        if (!result.allowed) {
          throw new ToolCallDeniedError(
            toolName,
            result.originalCall.id || '',
            result.validationResult
          );
        }

        const finalArgs = result.finalArguments ?? input;
        return originalFunc.call(tool, finalArgs);
      };

      wrapped.func = wrappedFunc;

      // Override invoke to use our wrapped func
      if (typeof toolAny.invoke === 'function') {
        const originalInvoke = toolAny.invoke as (...args: unknown[]) => Promise<unknown>;
        wrapped.invoke = async function (input: Record<string, unknown>, ...rest: unknown[]): Promise<unknown> {
          const result = await veto.validateToolCall({
            id: generateToolCallId(),
            name: toolName,
            arguments: input,
          });

          if (!result.allowed) {
            throw new ToolCallDeniedError(
              toolName,
              result.originalCall.id || '',
              result.validationResult
            );
          }

          const finalArgs = result.finalArguments ?? input;
          return originalInvoke.call(tool, finalArgs, ...rest);
        };
      }

      veto.logger.debug('Tool wrapped', { name: toolName });
      return wrapped as T;
    }

    // Fallback for other tool types (handler, run, execute, etc.)
    const execFunctionKeys = ['handler', 'run', 'execute', 'call', '_call'];

    for (const key of execFunctionKeys) {
      if (typeof toolAny[key] === 'function') {
        const originalFunc = toolAny[key] as (...args: unknown[]) => unknown;

        const wrapped = Object.create(Object.getPrototypeOf(tool));
        Object.assign(wrapped, tool);

        const wrappedFunc = async (...args: unknown[]): Promise<unknown> => {
          let callArgs: Record<string, unknown>;
          if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
            callArgs = args[0] as Record<string, unknown>;
          } else {
            callArgs = { args };
          }

          const result = await veto.validateToolCall({
            id: generateToolCallId(),
            name: toolName,
            arguments: callArgs,
          });

          if (!result.allowed) {
            throw new ToolCallDeniedError(
              toolName,
              result.originalCall.id || '',
              result.validationResult
            );
          }

          const finalArgs = result.finalArguments ?? callArgs;
          if (args.length === 1 && typeof args[0] === 'object') {
            return originalFunc.call(tool, finalArgs);
          }
          // For positional args, check if finalArgs contains modified 'args' array
          if (finalArgs.args && Array.isArray(finalArgs.args)) {
            return originalFunc.apply(tool, finalArgs.args as unknown[]);
          }
          return originalFunc.apply(tool, args);
        };

        wrapped[key] = wrappedFunc;
        veto.logger.debug('Tool wrapped', { name: toolName });
        return wrapped as T;
      }
    }

    // No wrappable function found, return as-is
    veto.logger.warn('No wrappable function found on tool', { name: toolName });
    return tool;
  }

  /**
   * Validate a tool call.
   *
   * @param call - The tool call to validate
   * @returns Validation result
   */
  async validateToolCall(call: ToolCall): Promise<InterceptionResult> {
    const normalizedCall: ToolCall = {
      ...call,
      id: call.id || generateToolCallId(),
    };

    return this.interceptor.intercept(normalizedCall);
  }

  /**
   * Validate a tool call and throw if denied.
   *
   * @param call - The tool call to validate
   * @returns Validation result (only if allowed)
   * @throws {ToolCallDeniedError} If the call is denied
   */
  async validateToolCallOrThrow(call: ToolCall): Promise<InterceptionResult> {
    const normalizedCall: ToolCall = {
      ...call,
      id: call.id || generateToolCallId(),
    };

    return this.interceptor.interceptOrThrow(normalizedCall);
  }

  /**
   * Get registered tools.
   */
  getRegisteredTools(): readonly ToolDefinition[] {
    return Array.from(this.registeredTools.values());
  }

  /**
   * Get loaded rules.
   */
  getLoadedRules(): readonly Rule[] {
    return this.rules.allRules;
  }

  /**
   * Get current operating mode.
   */
  getMode(): VetoMode {
    return this.mode;
  }

  /**
   * Get current validation mode (api or kernel).
   */
  getValidationMode(): ValidationMode {
    return this.validationMode;
  }

  /**
   * Get history statistics.
   */
  getHistoryStats(): HistoryStats {
    return this.historyTracker.getStats();
  }

  /**
   * Clear call history.
   */
  clearHistory(): void {
    this.historyTracker.clear();
  }
}

// Re-export error class
export { ToolCallDeniedError };
