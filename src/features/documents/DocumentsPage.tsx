import { useState, useMemo } from 'react'
import { Link } from 'react-router'
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  File,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Grid,
  Image as ImageIcon,
  List,
  Plus,
  Search,
  Share2,
  Star,
  Trash2,
  Upload,
  User,
  Users,
  Video as VideoIcon,
  X,
} from 'lucide-react'
import { Avatar, Button, Card, Empty, Loading } from '../../components/ui'
import { fileSize, shortDate, dateTime } from '../../lib/format'
import type { DocFolderItem } from '../../lib/types'
import { useLeads } from '../leads/api'
import { useProperties } from '../properties/api'
import { downloadDocument, useDeleteDocument, useDocuments, useFolders, useToggleStarDoc, type DocRow } from './api'
import { CreateFolderModal } from './FolderModals'
import { UploadModal } from './DocumentParts'

type QuickNav = 'all' | 'recent' | 'starred' | 'shared' | 'trash'
type ViewMode = 'list' | 'grid'
type SortBy = 'recent' | 'name' | 'size'

const FOLDER_COLORS: Record<string, { bg: string; text: string; lightBg: string; ring: string }> = {
  blue: { bg: 'bg-blue-500', text: 'text-blue-600', lightBg: 'bg-blue-50', ring: 'ring-blue-500/20' },
  purple: { bg: 'bg-purple-500', text: 'text-purple-600', lightBg: 'bg-purple-50', ring: 'ring-purple-500/20' },
  rose: { bg: 'bg-rose-500', text: 'text-rose-600', lightBg: 'bg-rose-50', ring: 'ring-rose-500/20' },
  amber: { bg: 'bg-amber-500', text: 'text-amber-600', lightBg: 'bg-amber-50', ring: 'ring-amber-500/20' },
  emerald: { bg: 'bg-emerald-500', text: 'text-emerald-600', lightBg: 'bg-emerald-50', ring: 'ring-emerald-500/20' },
  slate: { bg: 'bg-slate-500', text: 'text-slate-600', lightBg: 'bg-slate-100', ring: 'ring-slate-500/20' },
}

function getFileType(doc: DocRow): { label: string; icon: typeof FileText; color: string; bg: string } {
  const ext = doc.name.split('.').pop()?.toLowerCase() ?? ''
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext) || doc.mime.startsWith('image/')) {
    return { label: ext.toUpperCase() || 'IMG', icon: ImageIcon, color: 'text-emerald-600', bg: 'bg-emerald-50 ring-emerald-600/20' }
  }
  if (['mp4', 'mov', 'webm', 'avi'].includes(ext) || doc.mime.startsWith('video/')) {
    return { label: ext.toUpperCase() || 'VIDEO', icon: VideoIcon, color: 'text-purple-600', bg: 'bg-purple-50 ring-purple-600/20' }
  }
  if (['xls', 'xlsx', 'csv'].includes(ext) || doc.mime.includes('spreadsheet') || doc.mime.includes('excel')) {
    return { label: ext.toUpperCase() || 'XLS', icon: FileSpreadsheet, color: 'text-teal-600', bg: 'bg-teal-50 ring-teal-600/20' }
  }
  if (['pdf'].includes(ext) || doc.mime.includes('pdf')) {
    return { label: 'PDF', icon: FileText, color: 'text-rose-600', bg: 'bg-rose-50 ring-rose-600/20' }
  }
  return { label: ext.toUpperCase() || 'DOC', icon: File, color: 'text-blue-600', bg: 'bg-blue-50 ring-blue-600/20' }
}

export function DocumentsPage() {
  const { data: docs = [], isLoading: docsLoading } = useDocuments()
  const { data: folders = [], isLoading: foldersLoading } = useFolders()
  const { data: leads = [] } = useLeads()
  const { data: properties = [] } = useProperties()

  const toggleStar = useToggleStarDoc()
  const del = useDeleteDocument()

  // Navigation and filtering states
  const [quickNav, setQuickNav] = useState<QuickNav>('all')
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set(['f-clients', 'f-projects']))
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [clientFilter, setClientFilter] = useState<string>('all')
  const [projectFilter, setProjectFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<SortBy>('recent')
  const [viewMode, setViewMode] = useState<ViewMode>('list')

  // Selected file for preview panel
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null)

  // Modals
  const [uploadOpen, setUploadOpen] = useState(false)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [newFolderParentId, setNewFolderParentId] = useState<string | null>(null)

  // Folders tree mappings
  const rootFolders = useMemo(() => folders.filter(f => !f.parent_id), [folders])
  const subfoldersMap = useMemo(() => {
    const map = new Map<string, DocFolderItem[]>()
    folders.forEach(f => {
      if (f.parent_id) {
        const arr = map.get(f.parent_id) ?? []
        arr.push(f)
        map.set(f.parent_id, arr)
      }
    })
    return map
  }, [folders])

  const toggleFolderExpand = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpandedFolderIds(prev => {
      const next = new Set(prev)
      if (next.has(folderId)) next.delete(folderId)
      else next.add(folderId)
      return next
    })
  }

  const selectFolder = (folderId: string | null) => {
    setCurrentFolderId(folderId)
    setQuickNav('all')
    if (folderId) {
      // Auto-expand parent if selecting a child
      const folder = folders.find(f => f.id === folderId)
      if (folder?.parent_id) {
        setExpandedFolderIds(prev => new Set(prev).add(folder.parent_id!))
      }
    }
  }

  // Breadcrumbs path
  const breadcrumbs = useMemo(() => {
    if (!currentFolderId) return []
    const crumbs: DocFolderItem[] = []
    let curr: DocFolderItem | undefined = folders.find(f => f.id === currentFolderId)
    while (curr) {
      crumbs.unshift(curr)
      curr = curr.parent_id ? folders.find(f => f.id === curr!.parent_id) : undefined
    }
    return crumbs
  }, [folders, currentFolderId])

  // Subfolders in current view
  const currentSubfolders = useMemo(() => {
    if (quickNav !== 'all') return []
    if (currentFolderId) {
      return folders.filter(f => f.parent_id === currentFolderId)
    }
    return rootFolders
  }, [quickNav, currentFolderId, folders, rootFolders])

  // Filtered files
  const filteredDocs = useMemo(() => {
    let result = [...docs]

    // Quick nav filter
    if (quickNav === 'starred') {
      result = result.filter(d => d.starred)
    } else if (quickNav === 'recent') {
      const weekAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString()
      result = result.filter(d => d.created_at >= weekAgo)
    } else if (quickNav === 'shared') {
      result = result.filter(d => d.lead_id || d.property_id)
    } else if (quickNav === 'trash') {
      return [] // Demo has no deleted files
    } else if (currentFolderId) {
      // When a folder is selected: show files directly in this folder OR in any child of this folder
      const descendantIds = new Set<string>([currentFolderId])
      const collect = (pid: string) => {
        folders.filter(f => f.parent_id === pid).forEach(child => {
          descendantIds.add(child.id)
          collect(child.id)
        })
      }
      collect(currentFolderId)
      result = result.filter(d => d.folder_id && descendantIds.has(d.folder_id))
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      result = result.filter(
        d =>
          d.name.toLowerCase().includes(q) ||
          d.folder.toLowerCase().includes(q) ||
          d.lead_name?.toLowerCase().includes(q) ||
          d.property_title?.toLowerCase().includes(q) ||
          d.uploader.toLowerCase().includes(q),
      )
    }

    // Type filter
    if (typeFilter !== 'all') {
      result = result.filter(d => {
        const ext = d.name.split('.').pop()?.toLowerCase() ?? ''
        if (typeFilter === 'pdf') return ext === 'pdf' || d.mime.includes('pdf')
        if (typeFilter === 'image') return ['png', 'jpg', 'jpeg', 'webp'].includes(ext) || d.mime.startsWith('image/')
        if (typeFilter === 'spreadsheet') return ['xls', 'xlsx', 'csv'].includes(ext) || d.mime.includes('spreadsheet')
        if (typeFilter === 'video') return ['mp4', 'mov', 'webm'].includes(ext) || d.mime.startsWith('video/')
        return true
      })
    }

    // Client filter
    if (clientFilter !== 'all') {
      result = result.filter(d => d.lead_id === clientFilter)
    }

    // Project filter
    if (projectFilter !== 'all') {
      result = result.filter(d => d.property_id === projectFilter)
    }

    // Sorting
    result.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name)
      if (sortBy === 'size') return b.size - a.size
      return b.created_at.localeCompare(a.created_at)
    })

    return result
  }, [docs, quickNav, currentFolderId, folders, searchQuery, typeFilter, clientFilter, projectFilter, sortBy])

  // Count files for each folder (including descendants)
  const getFolderFileCount = (folderId: string) => {
    const ids = new Set<string>([folderId])
    const collect = (pid: string) => {
      folders.filter(f => f.parent_id === pid).forEach(c => {
        ids.add(c.id)
        collect(c.id)
      })
    }
    collect(folderId)
    return docs.filter(d => d.folder_id && ids.has(d.folder_id)).length
  }

  // Selected doc details
  const selectedDoc = useMemo(() => docs.find(d => d.id === selectedDocId) ?? null, [docs, selectedDocId])

  if (docsLoading || foldersLoading) return <Loading />

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Files</h1>
          <p className="mt-1 text-sm text-slate-500">
            Store, organize and access all your files across clients and projects.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button onClick={() => setUploadOpen(true)} className="gap-2 shadow-sm">
            <Upload className="size-4" /> Upload File
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setNewFolderParentId(currentFolderId)
              setNewFolderOpen(true)
            }}
            className="gap-2"
          >
            <FolderPlus className="size-4 text-slate-600" /> New Folder
          </Button>
        </div>
      </div>

      {/* Top Category Folder Cards (Inspiration UI Carousel Row) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {rootFolders.slice(0, 5).map(f => {
          const color = FOLDER_COLORS[f.color || 'blue'] || FOLDER_COLORS.blue
          const fileCount = getFolderFileCount(f.id)
          const subCount = subfoldersMap.get(f.id)?.length || 0
          const isSelected = currentFolderId === f.id

          return (
            <button
              key={f.id}
              type="button"
              onClick={() => selectFolder(f.id)}
              className={`flex items-center gap-3.5 rounded-xl border bg-white p-4 text-left transition-all duration-150 hover:shadow-md ${
                isSelected
                  ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-sm'
                  : 'border-slate-200/80 hover:border-slate-300'
              }`}
            >
              <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${color.bg} text-white shadow-sm`}>
                <Folder className="size-5 fill-white/80" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-semibold text-slate-800">{f.name}</h3>
                <p className="mt-0.5 truncate text-xs text-slate-400">
                  {subCount} {subCount === 1 ? 'folder' : 'folders'} · {fileCount} {fileCount === 1 ? 'file' : 'files'}
                </p>
              </div>
            </button>
          )
        })}
      </div>

      {/* 3-Column Main Container */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Column 1: Left Navigation Sidebar ("Folders") */}
        <div className="lg:col-span-3">
          <Card className="overflow-hidden p-4">
            <div className="flex items-center justify-between pb-3">
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Folders</h2>
              <button
                type="button"
                onClick={() => {
                  setNewFolderParentId(null)
                  setNewFolderOpen(true)
                }}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                title="Create root folder"
              >
                <Plus className="size-4" />
              </button>
            </div>

            {/* Quick Navigation Items */}
            <nav className="space-y-0.5 pb-4 border-b border-slate-100 text-sm">
              <button
                type="button"
                onClick={() => {
                  setQuickNav('all')
                  setCurrentFolderId(null)
                }}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 transition ${
                  quickNav === 'all' && !currentFolderId
                    ? 'bg-blue-50 font-semibold text-blue-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <FolderOpen className="size-4 text-slate-400" />
                  All Files
                </span>
                <span className="text-xs text-slate-400">{docs.length}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setQuickNav('recent')
                  setCurrentFolderId(null)
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition ${
                  quickNav === 'recent'
                    ? 'bg-blue-50 font-semibold text-blue-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Clock className="size-4 text-slate-400" />
                Recent
              </button>

              <button
                type="button"
                onClick={() => {
                  setQuickNav('starred')
                  setCurrentFolderId(null)
                }}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 transition ${
                  quickNav === 'starred'
                    ? 'bg-blue-50 font-semibold text-blue-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Star className="size-4 text-slate-400" />
                  Starred
                </span>
                <span className="text-xs text-slate-400">{docs.filter(d => d.starred).length}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setQuickNav('shared')
                  setCurrentFolderId(null)
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition ${
                  quickNav === 'shared'
                    ? 'bg-blue-50 font-semibold text-blue-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Users className="size-4 text-slate-400" />
                Shared with Me
              </button>

              <button
                type="button"
                onClick={() => {
                  setQuickNav('trash')
                  setCurrentFolderId(null)
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition ${
                  quickNav === 'trash'
                    ? 'bg-blue-50 font-semibold text-blue-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Trash2 className="size-4 text-slate-400" />
                Trash
              </button>
            </nav>

            {/* Nested Folder Tree */}
            <div className="pt-3">
              <p className="mb-2 px-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Workspace
              </p>
              <div className="space-y-1">
                {rootFolders.map(root => {
                  const children = subfoldersMap.get(root.id) ?? []
                  const isExpanded = expandedFolderIds.has(root.id)
                  const isSelected = currentFolderId === root.id
                  const color = FOLDER_COLORS[root.color || 'blue'] || FOLDER_COLORS.blue

                  return (
                    <div key={root.id} className="space-y-0.5">
                      <div
                        onClick={() => selectFolder(root.id)}
                        className={`group flex cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 text-sm transition ${
                          isSelected
                            ? 'bg-blue-50 font-semibold text-blue-700'
                            : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          {children.length > 0 ? (
                            <button
                              type="button"
                              onClick={e => toggleFolderExpand(root.id, e)}
                              className="rounded p-0.5 text-slate-400 hover:text-slate-700"
                            >
                              {isExpanded ? (
                                <ChevronDown className="size-3.5" />
                              ) : (
                                <ChevronRight className="size-3.5" />
                              )}
                            </button>
                          ) : (
                            <span className="w-4" />
                          )}
                          <Folder className={`size-4 shrink-0 ${color.text}`} />
                          <span className="truncate">{root.name}</span>
                        </div>
                        <span className="text-xs text-slate-400 opacity-60 group-hover:opacity-100">
                          {getFolderFileCount(root.id)}
                        </span>
                      </div>

                      {/* Subfolders list */}
                      {isExpanded && children.length > 0 && (
                        <div className="ml-5 space-y-0.5 border-l border-slate-100 pl-2">
                          {children.map(child => {
                            const isChildSelected = currentFolderId === child.id
                            return (
                              <button
                                key={child.id}
                                type="button"
                                onClick={() => selectFolder(child.id)}
                                className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition ${
                                  isChildSelected
                                    ? 'bg-blue-100/70 font-semibold text-blue-800'
                                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                }`}
                              >
                                <span className="flex min-w-0 items-center gap-2 truncate">
                                  <Folder className="size-3 shrink-0 text-slate-400" />
                                  <span className="truncate">{child.name}</span>
                                </span>
                                <span className="text-[11px] text-slate-400">
                                  {docs.filter(d => d.folder_id === child.id).length}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </Card>
        </div>

        {/* Column 2: Center Content & Browser */}
        <div className={selectedDoc ? 'lg:col-span-6 space-y-4' : 'lg:col-span-9 space-y-4'}>
          <Card className="overflow-hidden p-5">
            {/* Search and View Controls */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 size-4 text-slate-400" />
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search files and folders..."
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>

              {/* View Toggle */}
              <div className="flex items-center gap-1 rounded-lg border border-slate-200 p-1 bg-slate-50 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`rounded p-1.5 transition ${
                    viewMode === 'grid' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-800'
                  }`}
                  title="Grid view"
                >
                  <Grid className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`rounded p-1.5 transition ${
                    viewMode === 'list' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-800'
                  }`}
                  title="List view"
                >
                  <List className="size-4" />
                </button>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs">
              {/* Type Filter */}
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-slate-700 shadow-sm focus:outline-none"
              >
                <option value="all">All File Types</option>
                <option value="pdf">PDF Documents</option>
                <option value="image">Images (PNG, JPG)</option>
                <option value="spreadsheet">Spreadsheets (Excel, CSV)</option>
                <option value="video">Videos (MP4, Walkthrough)</option>
              </select>

              {/* Client Filter */}
              <select
                value={clientFilter}
                onChange={e => setClientFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-slate-700 shadow-sm focus:outline-none"
              >
                <option value="all">All Clients / Leads</option>
                {leads.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.contact.name}
                  </option>
                ))}
              </select>

              {/* Project Filter */}
              <select
                value={projectFilter}
                onChange={e => setProjectFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-slate-700 shadow-sm focus:outline-none"
              >
                <option value="all">All Projects</option>
                {properties.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>

              {/* Sort By */}
              <div className="ml-auto flex items-center gap-1.5 text-slate-500">
                <span>Sort by:</span>
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as SortBy)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-slate-700 shadow-sm focus:outline-none"
                >
                  <option value="recent">Last Modified</option>
                  <option value="name">Name (A-Z)</option>
                  <option value="size">Size (Largest)</option>
                </select>
              </div>
            </div>

            {/* Breadcrumb Trail */}
            <div className="mt-4 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              <button
                type="button"
                onClick={() => selectFolder(null)}
                className="font-medium hover:text-slate-900 hover:underline"
              >
                All Files
              </button>
              {breadcrumbs.map((crumb, idx) => {
                const isLast = idx === breadcrumbs.length - 1
                return (
                  <span key={crumb.id} className="flex items-center gap-1.5">
                    <ChevronRight className="size-3 text-slate-300" />
                    {isLast ? (
                      <span className="font-semibold text-slate-900">{crumb.name}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => selectFolder(crumb.id)}
                        className="font-medium hover:text-slate-900 hover:underline"
                      >
                        {crumb.name}
                      </button>
                    )}
                  </span>
                )
              })}
            </div>

            {/* Subfolders Quick Grid (if any inside current folder) */}
            {currentSubfolders.length > 0 && !searchQuery && (
              <div className="mt-4 border-b border-slate-100 pb-4">
                <p className="mb-2.5 text-xs font-semibold tracking-wider text-slate-400 uppercase">
                  Folders ({currentSubfolders.length})
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {currentSubfolders.map(sub => {
                    const count = getFolderFileCount(sub.id)
                    const color = FOLDER_COLORS[sub.color || 'blue'] || FOLDER_COLORS.blue
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => selectFolder(sub.id)}
                        className="flex items-center gap-2.5 rounded-lg border border-slate-200/80 bg-slate-50/70 p-2.5 text-left transition hover:border-blue-400 hover:bg-blue-50/50"
                      >
                        <Folder className={`size-4 shrink-0 ${color.text}`} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-slate-800">{sub.name}</p>
                          <p className="text-[11px] text-slate-400">{count} files</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* File List / Grid Container */}
            <div className="mt-4">
              {filteredDocs.length === 0 ? (
                <Empty icon={FolderOpen}>
                  {searchQuery ? `No files matching "${searchQuery}"` : 'No files in this folder yet.'}
                </Empty>
              ) : viewMode === 'list' ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        <th className="pb-3 pl-2">Name</th>
                        <th className="pb-3">Type</th>
                        <th className="pb-3">Size</th>
                        <th className="pb-3">Last Modified</th>
                        <th className="pb-3">Linked To</th>
                        <th className="pb-3 text-right pr-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredDocs.map(d => {
                        const ft = getFileType(d)
                        const Icon = ft.icon
                        const isSelected = selectedDocId === d.id

                        return (
                          <tr
                            key={d.id}
                            onClick={() => setSelectedDocId(d.id)}
                            className={`group cursor-pointer transition ${
                              isSelected ? 'bg-blue-50/70 font-medium' : 'hover:bg-slate-50/80'
                            }`}
                          >
                            <td className="py-3 pl-2">
                              <div className="flex items-center gap-3">
                                <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 ${ft.bg} ${ft.color}`}>
                                  <Icon className="size-4" />
                                </span>
                                <span className="max-w-[14rem] truncate font-medium text-slate-900 group-hover:text-blue-600 sm:max-w-xs">
                                  {d.name}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 text-xs text-slate-500">{ft.label}</td>
                            <td className="py-3 text-xs text-slate-500">{fileSize(d.size)}</td>
                            <td className="py-3 text-xs text-slate-500">{shortDate(d.created_at)}</td>
                            <td className="py-3 text-xs">
                              {d.lead_name ? (
                                <Link
                                  to={`/leads/${d.lead_id}`}
                                  onClick={e => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:underline"
                                >
                                  <User className="size-3" />
                                  <span className="max-w-[8rem] truncate">{d.lead_name}</span>
                                </Link>
                              ) : d.property_title ? (
                                <Link
                                  to={`/properties/${d.property_id}`}
                                  onClick={e => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 font-semibold text-purple-600 hover:underline"
                                >
                                  <Building2 className="size-3" />
                                  <span className="max-w-[8rem] truncate">{d.property_title}</span>
                                </Link>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="py-3 text-right pr-2">
                              <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => toggleStar.mutate(d.id)}
                                  className={`rounded p-1.5 transition ${
                                    d.starred ? 'text-amber-500' : 'text-slate-300 hover:text-slate-500'
                                  }`}
                                  title={d.starred ? 'Unstar file' : 'Star file'}
                                >
                                  <Star className={`size-4 ${d.starred ? 'fill-amber-500' : ''}`} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => downloadDocument(d)}
                                  className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-blue-600"
                                  title="Download"
                                >
                                  <Download className="size-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => confirm(`Delete ${d.name}?`) && del.mutate(d.id)}
                                  className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                  title="Delete"
                                >
                                  <Trash2 className="size-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                /* Grid View */
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {filteredDocs.map(d => {
                    const ft = getFileType(d)
                    const Icon = ft.icon
                    const isSelected = selectedDocId === d.id

                    return (
                      <div
                        key={d.id}
                        onClick={() => setSelectedDocId(d.id)}
                        className={`group relative cursor-pointer rounded-xl border p-4 transition ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50/30 ring-2 ring-blue-500/20'
                            : 'border-slate-200/90 bg-white hover:border-slate-300 hover:shadow-sm'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <span className={`flex size-10 items-center justify-center rounded-xl ring-1 ${ft.bg} ${ft.color}`}>
                            <Icon className="size-5" />
                          </span>
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation()
                              toggleStar.mutate(d.id)
                            }}
                            className={`rounded p-1 transition ${
                              d.starred ? 'text-amber-500' : 'text-slate-300 hover:text-slate-500'
                            }`}
                          >
                            <Star className={`size-4 ${d.starred ? 'fill-amber-500' : ''}`} />
                          </button>
                        </div>
                        <div className="mt-3">
                          <p className="truncate text-sm font-semibold text-slate-900 group-hover:text-blue-600">
                            {d.name}
                          </p>
                          <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
                            <span>{ft.label}</span>
                            <span>{fileSize(d.size)}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Column 3: Right Details & Preview Panel (matches inspiration image) */}
        {selectedDoc && (
          <div className="lg:col-span-3">
            <Card className="sticky top-6 overflow-hidden p-5">
              <div className="flex items-start justify-between">
                <h3 className="truncate pr-2 text-sm font-bold text-slate-900" title={selectedDoc.name}>
                  {selectedDoc.name}
                </h3>
                <button
                  type="button"
                  onClick={() => setSelectedDocId(null)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="size-4" />
                </button>
              </div>

              {/* Visual Preview Box */}
              <div className="mt-4 flex aspect-4/3 flex-col items-center justify-center rounded-xl bg-slate-50/80 border border-slate-200/70 p-4">
                {selectedDoc.mime.startsWith('image/') ? (
                  <div className="flex flex-col items-center gap-2">
                    <ImageIcon className="size-12 text-emerald-500/80" />
                    <span className="text-xs font-semibold text-slate-600">{selectedDoc.name}</span>
                  </div>
                ) : selectedDoc.mime.startsWith('video/') ? (
                  <div className="flex flex-col items-center gap-2">
                    <VideoIcon className="size-12 text-purple-500/80" />
                    <span className="text-xs font-semibold text-slate-600">Video Walkthrough</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <FileText className="size-12 text-rose-500/80" />
                    <span className="text-xs font-semibold text-slate-600">Document File</span>
                  </div>
                )}
              </div>

              {/* Quick Summary */}
              <div className="mt-3">
                <p className="truncate text-sm font-semibold text-slate-900">{selectedDoc.name}</p>
                <p className="text-xs text-slate-400">
                  {fileSize(selectedDoc.size)} · {getFileType(selectedDoc).label}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="mt-4 flex gap-2">
                <Button onClick={() => downloadDocument(selectedDoc)} className="flex-1 gap-2 py-2">
                  <Download className="size-4" /> Download
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    navigator.clipboard?.writeText?.(window.location.href)
                    alert('Document link copied to clipboard!')
                  }}
                  className="gap-2"
                  title="Share / Copy Link"
                >
                  <Share2 className="size-4" /> Share
                </Button>
              </div>

              {/* Tabs: Details / Activity */}
              <div className="mt-5 border-b border-slate-100 pb-2">
                <span className="border-b-2 border-blue-600 pb-2 text-xs font-bold text-blue-600 uppercase tracking-wider">
                  Details
                </span>
              </div>

              {/* Metadata Attributes */}
              <dl className="mt-3 space-y-2.5 text-xs">
                <div>
                  <dt className="text-slate-400">Location</dt>
                  <dd className="mt-0.5 font-medium text-slate-800">
                    {selectedDoc.folder_item ? selectedDoc.folder_item.name : selectedDoc.folder || 'All Files'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Uploaded by</dt>
                  <dd className="mt-0.5 flex items-center gap-1.5 font-medium text-slate-800">
                    <Avatar name={selectedDoc.uploader} size="sm" />
                    <span>{selectedDoc.uploader}</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Uploaded on</dt>
                  <dd className="mt-0.5 font-medium text-slate-800">
                    {dateTime(selectedDoc.created_at)}
                  </dd>
                </div>
                {selectedDoc.lead_name && (
                  <div>
                    <dt className="text-slate-400">Linked Client / Lead</dt>
                    <dd className="mt-0.5">
                      <Link
                        to={`/leads/${selectedDoc.lead_id}`}
                        className="font-semibold text-blue-600 hover:underline"
                      >
                        {selectedDoc.lead_name} →
                      </Link>
                    </dd>
                  </div>
                )}
                {selectedDoc.property_title && (
                  <div>
                    <dt className="text-slate-400">Linked Property</dt>
                    <dd className="mt-0.5">
                      <Link
                        to={`/properties/${selectedDoc.property_id}`}
                        className="font-semibold text-purple-600 hover:underline"
                      >
                        {selectedDoc.property_title} →
                      </Link>
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-slate-400">File MIME Type</dt>
                  <dd className="mt-0.5 font-mono text-[11px] text-slate-600">{selectedDoc.mime}</dd>
                </div>
              </dl>
            </Card>
          </div>
        )}
      </div>

      {/* Upload File Modal */}
      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        defaultFolderId={currentFolderId ?? undefined}
      />

      {/* New Folder Modal */}
      <CreateFolderModal
        open={newFolderOpen}
        onClose={() => setNewFolderOpen(false)}
        defaultParentId={newFolderParentId}
      />
    </div>
  )
}
