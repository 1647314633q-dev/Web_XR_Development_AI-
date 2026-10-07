declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    TURN_URLS?: string;
    TURN_SHARED_SECRET?: string;
    CLOUDFLARE_TURN_KEY_ID?: string;
    CLOUDFLARE_TURN_API_TOKEN?: string;
  }
}
