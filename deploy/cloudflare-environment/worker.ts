import { Container, getContainer } from "@cloudflare/containers";

interface Env {
  ENVIRONMENT_CONTAINER: DurableObjectNamespace<EnvironmentContainer>;
  ENVIRONMENT_QUERY_SERVICE_TOKEN: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_ACCOUNT_ID: string;
  R2_BUCKET_NAME: string;
  ENVIRONMENT_DEPLOYMENT_ID: string;
  ENVIRONMENT_RELEASE: string;
}

export class EnvironmentContainer extends Container<Env> {
  defaultPort = 8787;
  sleepAfter = "30m";
  enableInternet = true;
  envVars = {
    NODE_ENV: "production",
    PORT: "8787",
    ENVIRONMENT_ACTIVE_DEPLOYMENT_MANIFEST:
      "/app/deployment/deployments/production-active.json",
    ENVIRONMENT_DEPLOYMENT_STORE_ROOT: `/mnt/r2/overture-buildings/${this.env.ENVIRONMENT_RELEASE}`,
    ENVIRONMENT_DEPLOYMENT_LAZY_STORE_VALIDATION: "true",
    ENVIRONMENT_TRUST_VERIFIED_ARCHIVE_DATA: "true",
    ENVIRONMENT_QUERY_SERVICE_TOKEN: this.env.ENVIRONMENT_QUERY_SERVICE_TOKEN,
    AWS_ACCESS_KEY_ID: this.env.R2_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: this.env.R2_SECRET_ACCESS_KEY,
    R2_ACCOUNT_ID: this.env.R2_ACCOUNT_ID,
    R2_BUCKET_NAME: this.env.R2_BUCKET_NAME,
  };

  override onError() {
    console.error("ComfortOS environment container failed.");
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const container = getContainer(
      env.ENVIRONMENT_CONTAINER,
      env.ENVIRONMENT_DEPLOYMENT_ID,
    );
    return container.fetch(request);
  },
};
