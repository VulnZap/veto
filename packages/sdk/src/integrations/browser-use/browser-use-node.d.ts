declare module 'browser-use-node' {
  export class ActionResult {
    isDone: boolean;
    extractedContent: string | null;
    error: string | null;
    includeInMemory: boolean;
    constructor(data?: {
      isDone?: boolean;
      extractedContent?: string | null;
      error?: string;
      includeInMemory?: boolean;
    });
  }

  export class Controller {
    registry: {
      actions: Map<string, {
        name: string;
        description: string;
        paramModel?: { prototype: object };
      }>;
    };
    act(action: unknown, browserContext: unknown): Promise<ActionResult>;
    multiAct(actions: unknown[], browserContext: unknown): Promise<ActionResult[]>;
    getPromptDescription(): string;
  }

  export class Agent {
    constructor(options: {
      task: string;
      llm: unknown;
      browser?: unknown;
      controller?: Controller;
      [key: string]: unknown;
    });
    run(): Promise<unknown>;
  }

  export class Browser {
    constructor(config?: unknown);
  }

  export class AgentHistoryList {}
  export class DomService {}
  export class SystemPrompt {}
}
