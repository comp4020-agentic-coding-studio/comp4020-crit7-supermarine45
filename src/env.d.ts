/// <reference types="astro/client" />

import type { AuthUser } from "./lib/auth";

declare global {
  namespace App {
    interface Locals {
      user: AuthUser | null;
    }
  }
}
