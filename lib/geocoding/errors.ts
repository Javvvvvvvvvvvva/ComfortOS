export class GeocodingProviderConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeocodingProviderConfigurationError";
  }
}

export class GeocodingProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeocodingProviderUnavailableError";
  }
}
