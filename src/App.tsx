import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { Layout } from './components/Layout'
import { useSession } from './lib/session'
import { LoginPage } from './features/auth/LoginPage'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { LeadsPage } from './features/leads/LeadsPage'
import { LeadDetailPage } from './features/leads/LeadDetailPage'
import { PropertiesPage } from './features/properties/PropertiesPage'
import { PropertyFormPage } from './features/properties/PropertyFormPage'
import { PublicPropertyPage } from './features/properties/PublicPropertyPage'
import { SalesFormPage } from './features/leads/SalesFormPage'
import { TicketsPage } from './features/tickets/TicketsPage'
import { TeamPage } from './features/settings/TeamPage'
import { BackupPage } from './features/settings/BackupPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { ContactsPage } from './features/contacts/ContactsPage'
import { ContactDetailPage } from './features/contacts/ContactDetailPage'
import { CalendarPage } from './features/calendar/CalendarPage'
import { TasksPage } from './features/tasks/TasksPage'
import { GoalsPage } from './features/goals/GoalsPage'
import { DocumentsPage } from './features/documents/DocumentsPage'
import { isManager, isSales } from './lib/rules'
import { SalesTeamPage } from './features/sales-team/SalesTeamPage'
import { SalesUserDetailPage } from './features/sales-team/SalesUserDetailPage'

// Sales Person Module
import { SalesLayout } from './features/sales/SalesLayout'
import { SalesDashboardPage } from './features/sales/SalesDashboardPage'
import { SalesLeadsPage } from './features/sales/SalesLeadsPage'
import { SalesLeadDetailPage } from './features/sales/SalesLeadDetailPage'
import { SalesCalendarPage } from './features/sales/SalesCalendarPage'
import { SalesTasksPage } from './features/sales/SalesTasksPage'

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, mustChangePassword } = useSession()
  // LoginPage shows the change-password form; the database refuses data until then anyway.
  return user && !mustChangePassword ? children : <Navigate to="/login" replace />
}

/** Admin area: decided by who is really signed in, so a manager can still get back while impersonating. */
function RequireAdmin({ children }: { children: ReactNode }) {
  const { actualUser } = useSession()
  return actualUser && isManager(actualUser) ? children : <Navigate to="/sales" replace />
}

/** Sales area: a sales user, or a manager impersonating one. */
function RequireSales({ children }: { children: ReactNode }) {
  const { user } = useSession()
  return user && isSales(user) ? children : <Navigate to="/" replace />
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/p/:slug" element={<PublicPropertyPage />} />
      <Route path="/sales-form" element={<SalesFormPage />} />

      {/* Admin Protected Area */}
      <Route
        element={
          <RequireAuth>
            <RequireAdmin>
              <Layout />
            </RequireAdmin>
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="leads" element={<LeadsPage />} />
        <Route path="leads/:id" element={<LeadDetailPage />} />
        <Route path="properties" element={<PropertiesPage />} />
        <Route path="properties/new" element={<PropertyFormPage />} />
        <Route path="properties/:id" element={<PropertyFormPage />} />
        <Route path="contacts" element={<ContactsPage />} />
        <Route path="contacts/:id" element={<ContactDetailPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="goals" element={<GoalsPage />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="tickets" element={<TicketsPage />} />
        <Route path="pipeline" element={<Navigate to="/leads?view=board" replace />} />
        <Route path="pipelines" element={<Navigate to="/leads?view=board&setup=1" replace />} />
        <Route path="sales-team" element={<SalesTeamPage />} />
        <Route path="sales-team/:id" element={<SalesUserDetailPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="team" element={<TeamPage />} />
        <Route path="backup" element={<BackupPage />} />
      </Route>

      {/* Sales Person Module Protected Area */}
      <Route
        path="/sales"
        element={
          <RequireAuth>
            <RequireSales>
              <SalesLayout />
            </RequireSales>
          </RequireAuth>
        }
      >
        <Route index element={<SalesDashboardPage />} />
        <Route path="leads" element={<SalesLeadsPage />} />
        <Route path="leads/:id" element={<SalesLeadDetailPage />} />
        <Route path="calendar" element={<SalesCalendarPage />} />
        <Route path="tasks" element={<SalesTasksPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
