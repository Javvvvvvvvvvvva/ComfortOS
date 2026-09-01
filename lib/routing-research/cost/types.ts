import type { PedestrianEdge } from "@/lib/routing-research/graph/types";

export type EdgeEnvironment = {
  edgeId: string;
  timestamp: string;
  buildingShadeRatio?: number;
  estimatedWindExposureMps?: number;
  headwindComponentMps?: number;
  crosswindComponentMps?: number;
  shelterFactor?: number;
  environmentalExposureCost: number;
  confidence: number;
  comparable: boolean;
};

export type EdgeRoutingCost = {
  travelSeconds: number;
  environmentalExposureCost: number;
  confidence: number;
};

export type ResearchRoute = {
  nodeIds: string[];
  edges: PedestrianEdge[];
  distanceMeters: number;
  durationSeconds: number;
  environmentalExposureCost: number;
  averageEnvironmentalCost: number;
  averageWindExposureMps: number;
  averageHeadwindMps: number;
  averageShadeRatio: number;
  confidence: number;
};
