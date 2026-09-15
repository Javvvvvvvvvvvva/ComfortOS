# ADR-035 - Sensitive Location Request Bodies

Date: 2026-09-14
Status: Accepted

## Context

Ahhway's weather and geocoding APIs previously accepted coordinates, search text, and
geocoding session identifiers in URL query parameters. Infrastructure access logs commonly
retain request URLs, which allowed precise location inputs to appear in hosted request logs
even though application events did not record those values.

## Decision

Browser and native clients send weather coordinates, geocoding proximity, search text,
selection identifiers, and geocoding session identifiers in JSON request bodies over HTTPS.
The corresponding first-party API routes accept `POST` only, reject malformed JSON and
invalid coordinates, and use `Cache-Control: no-store` behavior at the client boundary.

Application logs continue to record only request identifiers, timing, result counts, provider
metadata, and normalized failure categories. Precise coordinates, search text, raw client
addresses, authorization headers, and provider credentials must not be included in log
fields. Provider-specific outbound requests remain encapsulated behind normalized adapters.

## Consequences

- Standard URL access logs no longer contain precise first-party location or search inputs.
- Existing web, native, smoke-test, and operational clients must use the JSON `POST` contract.
- Legacy `GET` requests return `405` instead of preserving an unsafe compatibility path.
- Request bodies are still processed by the application, hosting platform, and configured
  data providers, so the privacy policy and store disclosures must accurately describe that
  processing.
- CI guards the method and query-string contract for all sensitive location endpoints.
