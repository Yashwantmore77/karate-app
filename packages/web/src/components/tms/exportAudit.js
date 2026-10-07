import { createContext, useContext } from 'react'

/**
 * PRD v1 §22: exports are audited. A screen inside one tournament provides a
 * logger; every DataTable reports its downloads to it. Outside a tournament
 * there is nothing to log against, so the default does nothing.
 */
export const ExportAuditContext = createContext(null)
export const useExportAudit = () => useContext(ExportAuditContext)
