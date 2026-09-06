import { notTheirLeadMessage } from "./employee-range.js";
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
  const message = error instanceof Error ? error.message : "";
  if (/does not report to you|not their team lead|not a team lead/i.test(message)) {
    return fail(message);
  }
  if (
    (error instanceof FrappeRequestError && error.status === 403) ||
    /access denied/i.test(message)
  ) {
    if (/not a team leader/i.test(message)) {
      return fail("You are not a team lead, so you cannot open another person's attendance.");
    }
    return fail(notTheirLeadMessage("This person"));
  }
  if (error instanceof FrappeAuthError || error instanceof FrappeRequestError) {
    return fail(error.message);
  }
  if (error instanceof Error) {
    return fail(error.message);
  }
  return fail("ERPNext request failed.");
}
