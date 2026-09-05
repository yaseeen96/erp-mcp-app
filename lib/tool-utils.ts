import { fail } from "./result.js";
import { FrappeAuthError, FrappeRequestError } from "./frappe-client.js";

export async function withFrappe<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof FrappeAuthError || error instanceof FrappeRequestError) {
      throw error;
    }
    throw error;
  }
}

export function frappeFailure(error: unknown) {
  if (error instanceof FrappeAuthError || error instanceof FrappeRequestError) {
    return fail(error.message);
  }
  if (error instanceof Error) {
    return fail(error.message);
  }
  return fail("ERPNext request failed.");
}
