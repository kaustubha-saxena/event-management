export function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function databaseError(error) {
  if (error?.code === "23505") return httpError(409, "This action has already been completed.");
  if (error?.code === "23503") return httpError(404, "The requested record was not found.");
  if (error?.code === "42501") return httpError(403, "You are not allowed to perform this action.");
  const message = String(error?.message || "");
  if (message.includes("event_not_found")) return httpError(404, "Event not found.");
  if (message.includes("registration_closed")) return httpError(409, "Registration is closed for this event.");
  if (message.includes("already_registered")) return httpError(409, "You are already registered for this event.");
  if (message.includes("event_full")) return httpError(409, "This event is full.");
  if (message.includes("capacity_conflict")) return httpError(409, "Capacity cannot be lower than the number of confirmed registrations.");
  if (message.includes("ticket_invalid")) return httpError(404, "Ticket is invalid.");
  if (message.includes("ticket_inactive")) return httpError(409, "This ticket has been cancelled or already checked in.");
  if (message.includes("not_event_owner")) return httpError(403, "Only this event's organizer can check in tickets.");
  return httpError(503, "The data service could not complete the request. Try again shortly.");
}

export async function queryResult(promise) {
  const { data, error } = await promise;
  if (error) throw databaseError(error);
  return data;
}
