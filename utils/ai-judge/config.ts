import { join } from 'path';
import { loadQaConfig, qaDir } from '../qa-config';
import type { AiJudgeConfig } from './judge';

/** `qa.config.json#ai_judge` -> configuration résolue (valeurs lues dans l'env nommé). */
export interface AiJudgeSection {
  enabled?: boolean;
  provider?: 'anthropic' | 'openai-compatible';
  model?: string;
  base_url_env?: string;
  api_key_env?: string;
  min_confidence?: number;
  cache?: boolean;
  max_input_chars?: number;
  timeout_ms?: number;
}

export function resolveAiJudgeConfig(section: AiJudgeSection | undefined = (loadQaConfig() as { ai_judge?: AiJudgeSection }).ai_judge): AiJudgeConfig {
  const s = section ?? {};
  const dir = qaDir();
  return {
    enabled: s.enabled === true,
    provider: s.provider ?? 'anthropic',
    model: s.model ?? '',
    baseUrl: s.base_url_env ? process.env[s.base_url_env] : undefined,
    apiKey: s.api_key_env ? process.env[s.api_key_env] : undefined,
    minConfidence: s.min_confidence ?? 0.8,
    cacheDir: s.cache === false || !dir ? undefined : join(dir, 'ai-judge-cache'),
    maxInputChars: s.max_input_chars ?? 20000,
    timeoutMs: s.timeout_ms ?? 60000,
  };
}
