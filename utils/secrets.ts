import type { Locator, Page } from '@playwright/test';
import {
  buildRedactor,
  resolveSecrets,
  secretRegistry,
  type Redactor,
  type SecretRef,
} from '../kernel/src/secrets/redact';
import { loadQaConfig } from './qa-config';

/**
 * Secrets côté tests — même moteur de redaction que le kernel (source unique :
 * kernel/src/secrets/redact.ts). Les specs ne voient jamais une valeur : elles
 * passent un NOM déclaré dans `qa.config.json#secrets` (ou `<rôle>.password`).
 */
export class SecretVault {
  private readonly refs: SecretRef[];
  private readonly filled: Locator[] = [];

  constructor(refs: SecretRef[] = secretRegistry(loadQaConfig())) {
    this.refs = refs;
  }

  names(): string[] {
    return this.refs.map((r) => r.name);
  }

  /** Valeur d'un secret déclaré ; lève si le nom est inconnu ou la variable absente. */
  private value(name: string): string {
    const ref = this.refs.find((r) => r.name === name);
    if (!ref) throw new Error(`secret "${name}" non déclaré (qa.config.json#secrets) — déclarés : ${this.names().join(', ') || 'aucun'}`);
    const value = process.env[ref.env];
    if (!value) throw new Error(`secret "${name}" : variable d'environnement ${ref.env} absente`);
    return value;
  }

  /**
   * Remplit un champ avec un secret, puis le masque visuellement (texte
   * transparent) pour que les captures automatiques d'échec et la vidéo ne
   * montrent pas la valeur. Le champ est mémorisé pour `mask` (screenshot()).
   */
  async fill(locator: Locator, name: string): Promise<void> {
    await locator.fill(this.value(name));
    await locator.evaluate((el) => {
      const style = (el as HTMLElement).style;
      style.setProperty('color', 'transparent', 'important');
      style.setProperty('caret-color', 'transparent', 'important');
      style.setProperty('text-shadow', 'none', 'important');
      style.setProperty('-webkit-text-security', 'disc', 'important');
    });
    this.filled.push(locator);
  }

  /** Capture avec `mask` Playwright sur tous les champs remplis par un secret. */
  async screenshot(page: Page, path?: string): Promise<Buffer> {
    return page.screenshot({ path, mask: this.filled, maskColor: '#000000' });
  }

  /** Redacteur des secrets présents dans l'environnement (`<secret:nom>`). */
  redactor(): Redactor {
    return buildRedactor(resolveSecrets(this.refs, process.env));
  }
}
