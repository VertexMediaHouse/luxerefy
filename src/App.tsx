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

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useSession()
  if (loading) return null
  return user ? children : <Navigate to="/login" replace />
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/p/:slug" element={<PublicPropertyPage />} />
      <Route path="/sales-form" element={<SalesFormPage />} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
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
        {/* The board is a view of Leads now; the old links keep working. */}
        <Route path="pipeline" element={<Navigate to="/leads?view=board" replace />} />
        <Route path="pipelines" element={<Navigate to="/leads?view=board&setup=1" replace />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="team" element={<TeamPage />} />
        <Route path="backup" element={<BackupPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
