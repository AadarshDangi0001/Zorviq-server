import Anthropic from '@anthropic-ai/sdk';

import { config } from '../config/config.js';

export const claudeClient = new Anthropic({
  apiKey: config.claude.apiKey,
});

export const claudeModel = config.claude.model;
