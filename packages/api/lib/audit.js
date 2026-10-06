// The audit log now lives in @kumite/shared, so the tournament service writes
// the same records whether it runs on this server or in an offline browser.
export { AUDIT_ACTIONS, diff, createAuditLog } from '@kumite/shared/audit.js'
