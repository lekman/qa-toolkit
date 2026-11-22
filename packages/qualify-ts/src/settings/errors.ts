/** Invalid settings. The run fails at start. */
export class ConfigurationError extends Error {
  constructor(message: string) {
    super(`qualify configuration: ${message}`);
    this.name = "ConfigurationError";
  }
}
