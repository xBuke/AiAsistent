/**
 * Helper to get admin password from environment variables based on cityId
 * @param cityId - The city identifier (e.g., "ploce")
 * @returns The password from env var or null if not set
 */
export function getAdminPassword(cityId: string): string | null {
  const envVarName = `VITE_ADMIN_PASSWORD_${cityId.toUpperCase()}`;
  const password = import.meta.env[envVarName];
  
  if (!password || typeof password !== 'string' || password.trim() === '') {
    return null;
  }
  
  return password;
}

/**
 * Check if admin password is configured for a city
 * @param cityId - The city identifier
 * @returns true if password is configured, false otherwise
 */
export function isAdminPasswordConfigured(cityId: string): boolean {
  return getAdminPassword(cityId) !== null;
}
