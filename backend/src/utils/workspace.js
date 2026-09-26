import WorkspaceMembership from '../models/WorkspaceMembership.js';

/**
 * Workspace resolution shared by the contracts, playbooks and agentguard routes.
 *
 * A workspace is one of two things: the id of the user who created it (its
 * owner), or a shared workspace identified by the original owner's id. Every
 * document carries the owning workspaceId, so resolving the caller's workspace
 * correctly is what makes shared data visible.
 *
 * The caller may name a workspace explicitly (?workspaceId, or the workspaceId
 * form field). That is only honoured when the caller owns it or holds a
 * membership in it. Previously the read routes trusted an explicit id outright
 * and never consulted memberships, so any authenticated user could read — or
 * write into — any workspace by supplying an id.
 *
 * With no explicit workspace, a membership defines the caller's working
 * workspace, because that is where the shared documents live. Membership wins
 * over the personal workspace so a member's view is never split in two. With
 * neither, the caller owns their own workspace.
 */

export function explicitWorkspaceFrom(req) {
  const requested = req.query?.workspaceId ?? req.body?.workspaceId;
  return requested ? String(requested) : null;
}

export async function ownsOrBelongsTo(userId, workspaceId) {
  if (String(workspaceId) === String(userId)) return true;
  return Boolean(await WorkspaceMembership.exists({ workspaceId: String(workspaceId), userId }));
}

export async function defaultWorkspaceFor(userId) {
  const membership = await WorkspaceMembership.findOne({ userId }).sort({ createdAt: -1 }).lean();
  return membership ? String(membership.workspaceId) : String(userId);
}

/**
 * Full resolution for routes that authorise the workspace themselves:
 * an explicit workspace must be owned or joined, otherwise it is refused.
 */
export async function resolveWorkspace(req) {
  const requested = explicitWorkspaceFrom(req);
  if (requested) {
    if (!(await ownsOrBelongsTo(req.user.id, requested))) {
      const error = new Error('Workspace membership is required for this workspace.');
      error.statusCode = 403;
      throw error;
    }
    return requested;
  }
  return defaultWorkspaceFor(req.user.id);
}

/**
 * Middleware for routes that keep their own authoriser (agentguard's
 * requireWorkspace). It only supplies the default workspace, so the route's
 * existing authorisation stays authoritative and untouched.
 */
export function attachDefaultWorkspace() {
  return async function defaultWorkspaceMiddleware(req, _res, next) {
    try {
      if (req.user?.id && !explicitWorkspaceFrom(req)) {
        req.defaultWorkspaceId = await defaultWorkspaceFor(req.user.id);
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
