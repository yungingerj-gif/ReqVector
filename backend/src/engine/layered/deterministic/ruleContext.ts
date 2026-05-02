import type { CanonicalRequirement } from "../types";
import type { EngineConfig } from "../config";

export interface DeterministicContext {
  config: EngineConfig;
  allRequirements: CanonicalRequirement[];
}
