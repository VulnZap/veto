import { describe, it, expect } from 'vitest';
import {
  CLIError,
  ConfigError,
  NotFoundError,
  ValidationError,
  AgentError,
  NetworkError,
} from '../src/errors.js';

describe('CLI Error Classes', () => {
  describe('CLIError', () => {
    it('should create error with default exit code 1', () => {
      const error = new CLIError('test error');
      expect(error.message).toBe('test error');
      expect(error.exitCode).toBe(1);
      expect(error.name).toBe('CLIError');
    });

    it('should create error with custom exit code', () => {
      const error = new CLIError('test error', 2);
      expect(error.exitCode).toBe(2);
    });

    it('should be instanceof Error', () => {
      const error = new CLIError('test');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(CLIError);
    });
  });

  describe('ConfigError', () => {
    it('should create config error', () => {
      const error = new ConfigError('missing config');
      expect(error.message).toBe('missing config');
      expect(error.exitCode).toBe(1);
      expect(error.name).toBe('ConfigError');
    });

    it('should be instanceof CLIError', () => {
      const error = new ConfigError('test');
      expect(error).toBeInstanceOf(CLIError);
      expect(error).toBeInstanceOf(ConfigError);
    });
  });

  describe('NotFoundError', () => {
    it('should create not found error', () => {
      const error = new NotFoundError('file not found');
      expect(error.message).toBe('file not found');
      expect(error.name).toBe('NotFoundError');
    });

    it('should be instanceof CLIError', () => {
      const error = new NotFoundError('test');
      expect(error).toBeInstanceOf(CLIError);
    });
  });

  describe('ValidationError', () => {
    it('should create validation error', () => {
      const error = new ValidationError('invalid input');
      expect(error.message).toBe('invalid input');
      expect(error.name).toBe('ValidationError');
    });

    it('should be instanceof CLIError', () => {
      const error = new ValidationError('test');
      expect(error).toBeInstanceOf(CLIError);
    });
  });

  describe('AgentError', () => {
    it('should create agent error', () => {
      const error = new AgentError('agent failed');
      expect(error.message).toBe('agent failed');
      expect(error.name).toBe('AgentError');
    });

    it('should be instanceof CLIError', () => {
      const error = new AgentError('test');
      expect(error).toBeInstanceOf(CLIError);
    });
  });

  describe('NetworkError', () => {
    it('should create network error', () => {
      const error = new NetworkError('connection failed');
      expect(error.message).toBe('connection failed');
      expect(error.name).toBe('NetworkError');
    });

    it('should be instanceof CLIError', () => {
      const error = new NetworkError('test');
      expect(error).toBeInstanceOf(CLIError);
    });
  });

  describe('Error type checking', () => {
    it('should allow checking error type with instanceof', () => {
      const errors: CLIError[] = [
        new ConfigError('config'),
        new NotFoundError('not found'),
        new ValidationError('validation'),
        new AgentError('agent'),
        new NetworkError('network'),
      ];

      for (const error of errors) {
        expect(error).toBeInstanceOf(CLIError);
        expect(typeof error.exitCode).toBe('number');
      }
    });

    it('should preserve exit code through inheritance', () => {
      const error = new ConfigError('test', 42);
      expect(error.exitCode).toBe(42);
    });
  });
});
