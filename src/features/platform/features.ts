/** True when the plan includes the feature (or no plan restrictions apply). */
export function hasFeature(features: string[] | null | undefined, key: string) {
  return !features || features.includes(key)
}
