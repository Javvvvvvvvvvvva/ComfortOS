import type {
  BoundingBox,
  Building,
  BuildingProvider,
} from "@/lib/environment/buildings/types";

export class FallbackBuildingProvider implements BuildingProvider {
  constructor(
    private readonly primary: BuildingProvider,
    private readonly fallback: BuildingProvider,
  ) {}

  async getBuildings(bounds: BoundingBox): Promise<Building[]> {
    try {
      return await this.primary.getBuildings(bounds);
    } catch {
      return this.fallback.getBuildings(bounds);
    }
  }
}
