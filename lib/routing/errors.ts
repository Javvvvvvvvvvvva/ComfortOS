export class RoutingProviderUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "RoutingProviderUnavailableError";
  }
}

export class RoutingProviderTimeoutError extends RoutingProviderUnavailableError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "RoutingProviderTimeoutError";
  }
}

export class RoutingProviderUnauthorizedError extends RoutingProviderUnavailableError {
  constructor(message: string) {
    super(message);
    this.name = "RoutingProviderUnauthorizedError";
  }
}

export class RoutingProviderRateLimitError extends RoutingProviderUnavailableError {
  constructor(message: string) {
    super(message);
    this.name = "RoutingProviderRateLimitError";
  }
}

export class RoutingProviderConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoutingProviderConfigurationError";
  }
}

export class RouteNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RouteNotFoundError";
  }
}
