/** Express 5 types route params as string | string[]; normalize to a single string. */
export function routeParam(value) {
    if (Array.isArray(value))
        return value[0] ?? '';
    return value ?? '';
}
