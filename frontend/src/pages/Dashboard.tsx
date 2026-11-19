import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell, CalendarDays, ChevronRight, ClipboardList, Download, GraduationCap,
  Headphones, LayoutDashboard, LogOut, Plus, Search, Settings, UserRound,
  Users, WalletCards, BookOpen,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api, accessToken } from '../services/api';
import { PageHeader } from '../components/PageHeader';
import { DataPanel } from '../components/DataPanel';
import { StatusBadge } from '../components/StatusBadge';

type Module = { label: string; slug: string; endpoint: string; icon: typeof LayoutDashboard };

const familyModules: Module[] = [
  { label: 'Overview', slug: 'overview', endpoint: '/family/profile', icon: LayoutDashboard },
  { label: 'My Students', slug: 'students', endpoint: '/family/students', icon: Users },
  { label: 'Tutoring Requests', slug: 'requests', endpoint: '/requests', icon: ClipboardList },
  { label: 'Lessons', slug: 'lessons', endpoint: '/requests', icon: CalendarDays },
  { label: 'Progress Reports', slug: 'progress', endpoint: '/family/progress', icon: GraduationCap },
  { label: 'Payments', slug: 'payments', endpoint: '/family/payments', icon: WalletCards },
  { label: 'Notifications', slug: 'notifications', endpoint: '/notifications', icon: Bell },
  { label: 'Support', slug: 'support', endpoint: '/support/tickets', icon: Headphones },
];

const tutorModules: Module[] = [
  { label: 'Overview', slug: 'overview', endpoint: '/tutor/profile', icon: LayoutDashboard },
  { label: 'My Profile', slug: 'profile', endpoint: '/tutor/profile', icon: UserRound },
  { label: 'Availability', slug: 'availability', endpoint: '/tutor/availability', icon: CalendarDays },
  { label: 'Assignments', slug: 'assignments', endpoint: '/requests', icon: ClipboardList },
  { label: 'Lessons', slug: 'lessons', endpoint: '/requests', icon: CalendarDays },
  { label: 'Homework', slug: 'homework', endpoint: '/requests', icon: BookOpen },
  { label: 'Earnings', slug: 'earnings', endpoint: '/tutor/earnings', icon: WalletCards },
  { label: 'Notifications', slug: 'notifications', endpoint: '/notifications', icon: Bell },
  { label: 'Support', slug: 'support', endpoint: '/support/tickets', icon: Headphones },
];

const adminModules: Module[] = [
  { label: 'Overview', slug: 'overview', endpoint: '/admin/dashboard', icon: LayoutDashboard },
  { label: 'Tutor Applications', slug: 'applications', endpoint: '/admin/tutor-applications', icon: UserRound },
  { label: 'Families & Students', slug: 'families', endpoint: '/family/profile', icon: Users },
  { label: 'Tutoring Requests', slug: 'requests', endpoint: '/requests', icon: ClipboardList },
  { label: 'Subjects', slug: 'subjects', endpoint: '/subjects', icon: BookOpen },
  { label: 'Payments', slug: 'payments', endpoint: '/admin/reports/summary', icon: WalletCards },
  { label: 'Reports & Analytics', slug: 'reports', endpoint: '/admin/reports/summary', icon: GraduationCap },
  { label: 'Support Tickets', slug: 'support', endpoint: '/support/tickets', icon: Headphones },
  { label: 'Settings', slug: 'settings', endpoint: '/subjects', icon: Settings },
];

function EmptyState({ text }: { text: string }) {
  return (
    <div className="grid min-h-52 place-items-center text-center text-slate-500">
      <div><ClipboardList className="mx-auto text-forest-300" /><p className="mt-3">{text}</p></div>
    </div>
  );
}

function JsonTable({ value }: { value: unknown }) {
  if (value == null) return <EmptyState text="No information available yet." />;
  if (Array.isArray(value)) {
    if (value.length === 0) return <EmptyState text="No records found." />;
    const first = value[0] as Record<string, unknown>;
    const keys = Object.keys(first).filter((key) => key !== 'passwordHash').slice(0, 7);
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-forest-50/70">
            {keys.map((key) => <th key={key} className="px-3 py-3 font-bold capitalize text-forest-950">{key.replace(/([A-Z])/g, ' $1')}</th>)}
          </thead>
          <tbody>
            {value.map((row, index) => (
              <tr key={index} className="border-b last:border-0">
                {keys.map((key) => {
                  const item = (row as Record<string, unknown>)[key];
                  const text = typeof item === 'object' ? JSON.stringify(item) : String(item ?? '-');
                  return (
                    <td key={key} className="max-w-56 px-3 py-3 text-slate-600">
                      {typeof item === 'string' ? <StatusBadge value={item} /> : text}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  const object = value as Record<string, unknown>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Object.entries(object).filter(([key]) => key !== 'passwordHash').slice(0, 12).map(([key, item]) => (
        <div key={key} className="rounded-xl border border-forest-900/5 bg-forest-50/50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{key.replace(/([A-Z])/g, ' $1')}</p>
          <p className="mt-2 break-words font-semibold text-forest-950">{typeof item === 'object' ? JSON.stringify(item) : String(item ?? '-')}</p>
        </div>
      ))}
    </div>
  );
}

function StudentForm({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const subjects = useQuery({ queryKey: ['student-subjects'], queryFn: () => api<Array<{ id: string; name: string }>>('/subjects'), enabled: open });
  const levels = useQuery({ queryKey: ['grade-levels'], queryFn: () => api<Array<{ id: string; name: string }>>('/grade-levels'), enabled: open });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    try {
      await api('/family/students', {
        method: 'POST',
        body: JSON.stringify({
          fullName: form.get('fullName'),
          gradeLevelId: form.get('gradeLevelId') || undefined,
          schoolName: form.get('schoolName'),
          learningGoals: form.get('learningGoals'),
          academicChallenges: form.get('academicChallenges'),
          subjectIds: form.getAll('subjectIds'),
        }),
      });
      setOpen(false);
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save student');
    }
  };
  return (
    <>
      <button onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-lg bg-forest-900 px-4 py-2 font-bold text-white">
        <Plus size={17} /> Add Student
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-forest-950/50 p-4">
          <form onSubmit={submit} className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-2xl bg-white p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-forest-950">Register Student</h2>
              <button type="button" onClick={() => setOpen(false)}>Close</button>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-bold">Full name<input name="fullName" required className="mt-2 w-full rounded-lg border p-3" /></label>
              <label className="text-sm font-bold">Grade level
                <select name="gradeLevelId" className="mt-2 w-full rounded-lg border p-3">
                  <option value="">Select grade</option>
                  {levels.data?.data.map((level) => <option key={level.id} value={level.id}>{level.name}</option>)}
                </select>
              </label>
              <label className="text-sm font-bold sm:col-span-2">School name<input name="schoolName" className="mt-2 w-full rounded-lg border p-3" /></label>
              <label className="text-sm font-bold sm:col-span-2">Learning goals<textarea name="learningGoals" className="mt-2 min-h-20 w-full rounded-lg border p-3" /></label>
              <label className="text-sm font-bold sm:col-span-2">Academic challenges<textarea name="academicChallenges" className="mt-2 min-h-20 w-full rounded-lg border p-3" /></label>
              <fieldset className="sm:col-span-2">
                <legend className="text-sm font-bold">Subjects</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {subjects.data?.data.map((subject) => (
                    <label key={subject.id} className="rounded-lg border px-3 py-2 text-sm">
                      <input name="subjectIds" type="checkbox" value={subject.id} className="mr-2" />{subject.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
            {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
            <button className="mt-5 w-full rounded-lg bg-forest-900 py-3 font-bold text-white">Save Student</button>
          </form>
        </div>
      )}
    </>
  );
}

export function Dashboard() {
  const { user, logout } = useAuth();
  const params = useParams();
  const queryClient = useQueryClient();
  const modules = user?.role === 'SYSTEM_ADMIN'
    ? adminModules
    : user?.role === 'TUTOR'
      ? tutorModules
      : familyModules;
  const active = modules.find((module) => module.slug === params.module) ?? modules[0];
  const data = useQuery({
    queryKey: ['dashboard-module', active.endpoint],
    queryFn: () => api<unknown>(active.endpoint),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['dashboard-module', active.endpoint] });

  const downloadCsv = async () => {
    const base = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1';
    const response = await fetch(`${base}/admin/reports/payments.csv`, {
      headers: { Authorization: `Bearer ${accessToken()}` },
    });
    if (!response.ok) throw new Error('CSV download failed');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'payments.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!user) return null;

  let action = null;
  if (user.role === 'FAMILY' && active.slug === 'students') action = <StudentForm onSaved={refresh} />;
  if (user.role === 'SYSTEM_ADMIN' && active.slug === 'payments') {
    action = (
      <button onClick={downloadCsv} className="flex items-center gap-2 rounded-lg border border-forest-700 px-4 py-2 font-bold text-forest-800">
        <Download size={17} /> Export CSV
      </button>
    );
  }

  return (
    <main className="min-h-screen bg-[#f3f6f4]">
      <aside className="fixed bottom-0 left-0 top-0 z-30 hidden w-72 overflow-y-auto bg-forest-950 p-5 text-white md:block">
        <div className="flex items-center gap-3 px-2">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-gold text-forest-950"><GraduationCap size={21} /></span>
          <div><b>MELIHIK</b><small className="block tracking-[0.18em] text-emerald-200">TUTOR</small></div>
        </div>
        <div className="mt-7 rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-xs text-emerald-100/60">{user.role.replaceAll('_', ' ')}</p>
          <p className="mt-1 truncate font-bold">{user.fullName}</p>
        </div>
        <nav className="mt-6 space-y-1">
          {modules.map((module) => {
            const Icon = module.icon;
            const isActive = active.slug === module.slug;
            return (
              <a
                key={module.slug}
                href={`/dashboard/${module.slug}`}
                className={isActive
                  ? 'flex items-center justify-between rounded-lg bg-emerald-600 px-3 py-3 text-sm text-white shadow-lg'
                  : 'flex items-center justify-between rounded-lg px-3 py-3 text-sm text-emerald-100/70 hover:bg-white/5 hover:text-white'}
              >
                <span className="flex items-center gap-3"><Icon size={18} />{module.label}</span>
                {isActive && <ChevronRight size={15} />}
              </a>
            );
          })}
        </nav>
        <button onClick={logout} className="mt-8 flex w-full items-center gap-3 rounded-lg border border-white/10 px-3 py-3 text-sm text-emerald-100/70 hover:bg-white/5">
          <LogOut size={18} /> Sign out
        </button>
      </aside>
      <section className="md:ml-72">
        <header className="sticky top-0 z-20 flex h-18 items-center justify-between border-b border-forest-900/5 bg-white/95 px-5 py-4 backdrop-blur md:px-8">
          <div className="relative hidden w-72 items-center sm:flex">
            <Search className="absolute left-3 text-slate-400" size={17} />
            <input className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-10 pr-3 text-sm outline-none focus:border-forest-600" placeholder="Search platform" />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <button className="relative grid h-10 w-10 place-items-center rounded-full border bg-white"><Bell size={18} /><span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-gold" /></button>
            <span className="grid h-10 w-10 place-items-center rounded-full bg-forest-100 font-bold text-forest-800">{user.fullName.charAt(0)}</span>
          </div>
        </header>
        <div className="p-5 md:p-8">
          <PageHeader title={active.label} subtitle={`${user.role.replaceAll('_', ' ').toLowerCase()} workspace`} action={action} />
          {active.slug === 'overview' && data.isSuccess && (
            <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {Object.entries(data.data.data as Record<string, unknown>).slice(0, 4).map(([key, value]) => (
                <div key={key} className="rounded-2xl border border-forest-900/5 bg-white p-5 shadow-card">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{key.replace(/([A-Z])/g, ' $1')}</p>
                  <p className="mt-3 text-3xl font-bold text-forest-900">{typeof value === 'object' ? '-' : String(value)}</p>
                </div>
              ))}
            </div>
          )}
          <DataPanel>
            {data.isLoading && <div className="grid min-h-52 place-items-center text-slate-500">Loading {active.label.toLowerCase()}...</div>}
            {data.isError && <div className="rounded-lg bg-red-50 p-4 text-red-700">{data.error.message}</div>}
            {data.isSuccess && <JsonTable value={data.data.data} />}
          </DataPanel>
        </div>
      </section>
    </main>
  );
}
