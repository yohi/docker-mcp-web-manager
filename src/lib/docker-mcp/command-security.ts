// Command Security utilities for Docker MCP operations
export interface CommandValidationResult {
  isValid: boolean;
  error?: string;
  sanitized?: string;
}

export class CommandSecurity {
  // Dangerous command patterns to block
  private static readonly DANGEROUS_PATTERNS = [
    /rm\s+-rf\s+\//,     // rm -rf /
    /sudo/,              // sudo commands
    /su\s+/,             // su commands
    /passwd/,            // password changes
    /shutdown/,          // shutdown commands
    /reboot/,            // reboot commands
    /mkfs/,              // filesystem creation
    /dd\s+if=/,          // disk operations
    /kill\s+-9/,         // force kill
    />&/,                // output redirection
    /\|\s*sh/,           // pipe to shell
    /wget.*\|/,          // wget pipe
    /curl.*\|/,          // curl pipe
  ];

  // Allowed command whitelist for MCP operations
  private static readonly ALLOWED_COMMANDS = [
    'docker',
    'node',
    'npm',
    'ls',
    'cat',
    'echo',
    'mkdir',
    'cp',
    'mv',
    'chmod'
  ];

  // Validate command for security
  static validateCommand(command: string): CommandValidationResult {
    if (!command || typeof command !== 'string') {
      return {
        isValid: false,
        error: 'Command must be a non-empty string'
      };
    }

    // Check for dangerous patterns
    for (const pattern of this.DANGEROUS_PATTERNS) {
      if (pattern.test(command)) {
        return {
          isValid: false,
          error: `Dangerous command pattern detected: ${pattern.source}`
        };
      }
    }

    // Extract base command
    const baseCommand = command.trim().split(' ')[0];
    
    // Check if command is in whitelist
    if (!this.ALLOWED_COMMANDS.includes(baseCommand)) {
      return {
        isValid: false,
        error: `Command not allowed: ${baseCommand}`
      };
    }

    return {
      isValid: true,
      sanitized: command.trim()
    };
  }

  // Sanitize command arguments
  static sanitizeArguments(args: string[]): string[] {
    return args
      .map(arg => arg.replace(/[;&|<>$`\\]/g, '')) // Remove shell metacharacters
      .filter(arg => arg.length > 0);
  }

  // Escape shell arguments
  static escapeShellArgument(arg: string): string {
    // Simple shell escaping - wrap in single quotes and escape existing quotes
    return `'${arg.replace(/'/g, "'\"'\"'")}'`;
  }

  // Validate Docker command specifically
  static validateDockerCommand(command: string): CommandValidationResult {
    const validation = this.validateCommand(command);
    if (!validation.isValid) {
      return validation;
    }

    // Additional Docker-specific validation
    if (!command.startsWith('docker ')) {
      return {
        isValid: false,
        error: 'Not a Docker command'
      };
    }

    // Block dangerous Docker operations
    const dangerousDockerPatterns = [
      /docker\s+exec.*--privileged/,
      /docker\s+run.*--privileged/,
      /docker\s+system\s+prune.*-a/,
      /\/var\/run\/docker\.sock/,
    ];

    for (const pattern of dangerousDockerPatterns) {
      if (pattern.test(command)) {
        return {
          isValid: false,
          error: `Dangerous Docker operation detected: ${pattern.source}`
        };
      }
    }

    return validation;
  }
}

// Execute command with security validation
export async function executeSecureCommand(command: string): Promise<{
  success: boolean;
  output?: string;
  error?: string;
}> {
  const validation = CommandSecurity.validateCommand(command);
  
  if (!validation.isValid) {
    return {
      success: false,
      error: validation.error
    };
  }

  // Mock execution for now - in real implementation, this would execute the command
  console.log(`Executing secure command: ${validation.sanitized}`);
  
  return {
    success: true,
    output: `Command executed: ${validation.sanitized}`
  };
}

export default CommandSecurity;