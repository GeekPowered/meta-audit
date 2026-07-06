export const TITLE_MIN = 50;
export const TITLE_MAX = 60;
export const DESCRIPTION_MIN = 140;
export const DESCRIPTION_MAX = 160;

export function lengthMeta(value: string | null | undefined, min: number, max: number) {
  const length = value?.length ?? 0;
  return { length, inRange: length >= min && length <= max };
}
