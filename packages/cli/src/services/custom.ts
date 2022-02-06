import {Subservice} from './sub.js';
import type {Command} from '../command.js';

export class CustomService extends Subservice {
  static type = 'custom';

  static description = 'A custom service.';

  static examples = [];

  // === Commands ===

  static commands: Record<string, Command> = {
    ...Subservice.commands
  };
}
