export const parseNumber = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return Number(value);
};

export const parseBoolean = (value: unknown): boolean | undefined => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "boolean") return value;

  return value === "true";
};

export const parseJson = <T = unknown>(value: unknown): T | undefined => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "string") {
    return JSON.parse(value) as T;
  }

  return value as T;
};

export const parseStringArray = (value: unknown): string[] | undefined => {
  const parsed = parseJson<string[]>(value);

  if (!parsed) return undefined;

  return parsed;
};

export const parseNumberArray = (value: unknown): number[] | undefined => {
  const parsed = parseJson<number[]>(value);

  if (!parsed) return undefined;

  return parsed.map(Number);
};

export const parseObject = <T extends Record<string, unknown>>(
  value: unknown,
): T | undefined => {
  return parseJson<T>(value);
};
