'use strict';
// Single source of truth for role permissions. Enforced server-side on every route and
// re-checked inside services for sensitive operations. The UI only mirrors this.
const ALL = ['super_admin', 'admin', 'sales_operator'];
const ADMINS = ['super_admin', 'admin'];
const SUPER = ['super_admin'];

const MATRIX = {
  'dashboard.view': ALL,
  'customers.view': ALL,
  'customers.create': ALL,
  'customers.edit': ALL,
  'customers.privacy': ALL,
  'customers.status': ADMINS,
  'vehicles.view': ALL,
  'vehicles.create': ALL,
  'vehicles.edit': ALL,
  'vehicles.photo': ALL,
  'vehicles.photo_approve': ADMINS,
  'qr.view': ALL,
  'qr.assign': ALL,
  'qr.activate': ADMINS,
  'qr.suspend': ADMINS,
  'qr.deactivate': ADMINS,
  'batches.view': ALL,
  'batches.create': ADMINS,
  'batches.release': ADMINS,
  'batches.close': ADMINS,
  'batches.pdf': ADMINS,
  'batches.export': ADMINS,
  'sales.view': ALL,
  'sales.create': ALL,
  'sales.edit_own_limited': ALL,
  'sales.edit_full': ADMINS,
  'contact.view': ALL,
  'contact.handle': ALL,
  'reports.view': ADMINS,
  'reports.export': ADMINS,
  'users.manage': SUPER,
  'settings.manage': SUPER,
  'logs.view': ADMINS,
};

function can(user, perm) {
  if (!user || !user.is_active) return false;
  const roles = MATRIX[perm];
  if (!roles) throw new Error(`Unknown permission ${perm}`);
  return roles.includes(user.role);
}

module.exports = { can, MATRIX, ROLES: ALL };
