import AgentAction from '../models/AgentAction.js';

/**
 * Role-based contract visibility, enforced in the query rather than in the UI.
 *
 * A contract's own `status` only records how far extraction got
 * (Uploaded -> Processing -> Reviewed | NeedsReview | Failed). Approval is not
 * stored on the contract at all: AgentGuard owns it, on the AgentAction raised
 * for that contract. So "is this contract approved?" has to be answered from the
 * action, which means the visible set can be derived without adding a status
 * value to Contract and without rewriting any contract that already exists.
 *
 *   Admin     -> every contract, whatever its status or approval state
 *   Reviewer  -> only contracts with an action still awaiting approval
 *   Viewer    -> only contracts whose action was approved and executed
 *
 * Two consequences worth keeping:
 *
 *   - Contracts approved before a given Viewer existed are visible to them with
 *     no backfill, because the approval is read from the action, not from a
 *     per-user flag.
 *   - A contract approved a moment ago is visible on the very next read, so a
 *     Viewer refresh picks it up without any cache to invalidate.
 *
 * An unrecognised role is treated as a Viewer: the most restrictive set.
 */

export const PENDING_ACTION_STATUS = 'pending_approval';
export const APPROVED_ACTION_STATUS = 'completed';
export const REJECTED_ACTION_STATUS = 'rejected';

async function contractIdsWithActions(workspaceId, statuses) {
  const ids = await AgentAction.distinct('contractId', { workspaceId, status: { $in: statuses } });
  // Returned as strings: Mongoose casts them back to ObjectId when they are
  // compared against Contract._id, and dropping anything malformed keeps a bad
  // action row from turning the whole list into a cast error.
  return ids.map(String);
}

/**
 * Extra query conditions limiting a contract query to what `user` may see.
 * Admin gets an empty filter, i.e. no restriction at all.
 */
export async function visibleContractFilter(user, workspaceId) {
  if (user?.role === 'Admin') return {};

  const statuses = user?.role === 'Reviewer'
    ? [PENDING_ACTION_STATUS]
    : [APPROVED_ACTION_STATUS];

  return { _id: { $in: await contractIdsWithActions(workspaceId, statuses) } };
}

/**
 * True when `user` is allowed to see this specific contract document. Used to
 * keep a direct read of one contract (by id) consistent with the list.
 */
export async function canSeeContract(user, workspaceId, contractId) {
  if (user?.role === 'Admin') return true;
  return Boolean(await visibleContractFilter(user, workspaceId)._id.$in.includes(String(contractId)));
}
