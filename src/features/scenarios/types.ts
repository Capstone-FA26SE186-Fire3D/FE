import type { PageResponse } from "@/features/organizations/types";

export type ScenarioPosition = {
  x: number;
  y: number;
  z: number;
  rotation: number;
};

export type ScenarioHazard = {
  id: string;
  type: "Fire" | "Smoke" | "Wind" | string;
  position: ScenarioPosition;
  intensity: number;
  activationTime: number;
};

export type ScenarioDraftState = {
  spawnPoints: ScenarioPosition[];
  hazards: ScenarioHazard[];
  scoringConfig: {
    baseScore: number;
    timeLimitSeconds: number;
    penaltyPerMistake: number;
  };
  routingConfig: {
    evacuationRoutes: string[];
  };
};

export type ScenarioSummary = {
  id: string;
  buildingId: string;
  name: string;
  createdAt: string;
};

export type ScenarioDraft = {
  id: string;
  scenarioId: string;
  revisionId: string;
  buildingId: string;
  organizationId: string;
  draftNumber: number;
  state: ScenarioDraftState;
  source: string;
  lastAiRequestId: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
};

export type ScenarioDraftValidation = {
  draftId: string;
  version: number;
  isValid: boolean;
  issues: string[];
};

export type CreatedScenarioResource = {
  id: string;
};

export type ScenarioPage = PageResponse<ScenarioSummary>;
