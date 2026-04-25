const { ApplicationForm } = require('../models/ApplicationForm');
const discordApi = require('../lib/discord');

function hasAdminPermission(permissions) {
  try {
    return (BigInt(permissions) & 0x8n) !== 0n;
  } catch {
    return false;
  }
}

async function canReviewGuildApplications({ guildId, user }) {
  const guild = user?.guilds?.find((g) => g.id === guildId);
  if (!guild) return { allowed: false, reason: 'not_member' };
  if (hasAdminPermission(guild.permissions)) return { allowed: true, isAdmin: true };

  const forms = await ApplicationForm.find({ guildId, reviewerRoleIds: { $exists: true, $ne: [] } })
    .select({ reviewerRoleIds: 1 })
    .lean();
  const allowedRoleIds = [...new Set(forms.flatMap((f) => f.reviewerRoleIds || []))];
  if (!allowedRoleIds.length) return { allowed: false, reason: 'no_reviewer_roles_configured' };

  const member = await discordApi.getGuildMember(guildId, user.id);
  const memberRoles = new Set(member?.roles || []);
  const roleMatch = allowedRoleIds.some((roleId) => memberRoles.has(roleId));

  return { allowed: roleMatch, isAdmin: false, matchedRoleIds: roleMatch ? allowedRoleIds.filter((id) => memberRoles.has(id)) : [] };
}

async function canReviewSingleApplication({ guildId, application, user }) {
  const guild = user?.guilds?.find((g) => g.id === guildId);
  if (!guild) return { allowed: false, reason: 'not_member' };
  if (hasAdminPermission(guild.permissions)) return { allowed: true, isAdmin: true };

  const allowedRoleIds = application?.reviewerRoleIds || [];
  if (!allowedRoleIds.length) return { allowed: false, reason: 'no_reviewer_roles_for_application' };

  const member = await discordApi.getGuildMember(guildId, user.id);
  const memberRoles = new Set(member?.roles || []);
  const roleMatch = allowedRoleIds.some((roleId) => memberRoles.has(roleId));

  return { allowed: roleMatch, isAdmin: false, matchedRoleIds: roleMatch ? allowedRoleIds.filter((id) => memberRoles.has(id)) : [] };
}

module.exports = {
  hasAdminPermission,
  canReviewGuildApplications,
  canReviewSingleApplication,
};
