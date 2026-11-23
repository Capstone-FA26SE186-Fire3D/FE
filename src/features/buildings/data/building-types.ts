/**
 * The only building types in scope (supervisor direction, 23/11/2026): apartment buildings and schools from primary
 * school up. Nurseries and kindergartens are out: small children cannot play the drill. BE still stores a free string
 * until BE#212 turns it into an enum, so older buildings can carry another value and must pick again when edited.
 */
export const buildingTypes = ["Chung cư", "Trường học"] as const;

export const isSupportedBuildingType = (value: string): boolean => (buildingTypes as readonly string[]).includes(value.trim());
