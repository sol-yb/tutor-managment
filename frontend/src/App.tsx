import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookOpen, CheckCircle2, GraduationCap, Menu, Search, ShieldCheck, Star, Users, X } from 'lucide-react';
import { api } from './services/api';
import { useAuth } from './context/AuthContext';
import { Dashboard } from './pages/Dashboard';

function PublicLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const links = [
    ['Home', '/'], ['About', '/about'], ['How It Works', '/how-it-works'],
    ['Find Tutors', '/tutors'], ['Courses', '/courses'], ['Become a Tutor', '/become-a-tutor'], ['Contact', '/contact'],
  ];
  return (
    <div className="min-h-screen bg-[#f4f7f5] text-slate-800">
      <header className="sticky top-0 z-40 border-b border-forest-900/5 bg-white/95 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-forest-900 text-white"><GraduationCap size={22} /></span>
            <span><b className="block leading-none text-forest-950">MELIHIK</b><small className="font-semibold tracking-[0.18em] text-forest-600">TUTOR</small></span>
          </Link>
          <div className="hidden items-center gap-6 lg:flex">
            {links.map(([label, to]) => <Link key={to} to={to} className="text-sm font-medium text-slate-600 hover:text-forest-700">{label}</Link>)}
          </div>
          <div className="hidden items-center gap-2 lg:flex">
            {user ? (
              <>
                <Link to="/dashboard" className="rounded-lg border border-forest-200 px-4 py-2 text-sm font-bold text-forest-800">Dashboard</Link>
                <button onClick={logout} className="rounded-lg bg-forest-900 px-4 py-2 text-sm font-bold text-white">Sign out</button>
              </>
            ) : (
              <>
                <Link to="/login" className="px-4 py-2 text-sm font-bold text-forest-900">Login</Link>
                <Link to="/register" className="rounded-lg bg-forest-900 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-forest-900/10">Register</Link>
              </>
            )}
          </div>
          <button className="grid h-10 w-10 place-items-center rounded-lg border lg:hidden" onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
        </nav>
        {open && (
          <div className="border-t bg-white px-5 py-4 lg:hidden">
            {links.map(([label, to]) => <Link key={to} to={to} className="block py-2 font-medium" onClick={() => setOpen(false)}>{label}</Link>)}
            <Link to="/login" className="mt-3 block rounded-lg bg-forest-900 px-4 py-3 text-center font-bold text-white">Login</Link>
          </div>
        )}
      </header>
      {children}
      <footer className="bg-forest-950 text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 md:grid-cols-4 lg:px-8">
          <div><div className="flex items-center gap-2"><GraduationCap /><b>MELIHIK TUTOR</b></div><p className="mt-4 max-w-xs text-sm leading-6 text-emerald-100/70">Verified tutors. Personalized lessons. Better academic outcomes.</p></div>
          <div><h3 className="font-bold">Platform</h3><div className="mt-4 space-y-2 text-sm text-emerald-100/70"><Link to="/tutors" className="block">Find Tutors</Link><Link to="/courses" className="block">Courses</Link><Link to="/become-a-tutor" className="block">Become a Tutor</Link></div></div>
          <div><h3 className="font-bold">Company</h3><div className="mt-4 space-y-2 text-sm text-emerald-100/70"><Link to="/about" className="block">About Us</Link><Link to="/how-it-works" className="block">How It Works</Link><Link to="/contact" className="block">Contact</Link></div></div>
          <div><h3 className="font-bold">Contact</h3><p className="mt-4 text-sm text-emerald-100/70">support@melihiktutor.com<br />Addis Ababa, Ethiopia</p></div>
        </div>
        <div className="border-t border-white/10 px-5 py-5 text-center text-xs text-emerald-100/50">© {new Date().getFullYear()} Melihik Tutor. All rights reserved.</div>
      </footer>
    </div>
  );
}

function HomePage() {
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: () => api<Array<{ id: string; name: string }>>('/subjects') });
  const tutors = useQuery({ queryKey: ['public-tutors'], queryFn: () => api<{ items: Array<{ id: string; user: { fullName: string }; city?: string; hourlyRate?: string; biography?: string }> }>('/tutors?pageSize=3') });
  return (
    <PublicLayout>
      <section className="overflow-hidden bg-forest-950 text-white">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-20 lg:grid-cols-[1.15fr_.85fr] lg:px-8 lg:py-28">
          <div>
            <span className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-emerald-100">Personalized learning, at home</span>
            <h1 className="mt-7 max-w-3xl text-5xl font-bold leading-[1.08] tracking-tight md:text-6xl">Personalized Learning. <span className="text-gold">Qualified Tutors.</span> Better Results.</h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-emerald-100/75">Connect with verified, experienced tutors who understand each student’s goals and teach at the right pace.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/tutors" className="flex items-center gap-2 rounded-lg bg-gold px-5 py-3 font-bold text-forest-950"><Search size={18} /> Find a Tutor</Link>
              <Link to="/become-a-tutor" className="rounded-lg border border-white/20 px-5 py-3 font-bold text-white">Become a Tutor</Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[['500+', 'Verified Tutors'], ['1,200+', 'Families'], ['25+', 'Subjects'], ['98%', 'Success Rate']].map(([value, label]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.07] p-6"><b className="text-3xl text-gold">{value}</b><p className="mt-2 text-sm text-emerald-100/70">{label}</p></div>
            ))}
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
        <div className="text-center"><p className="font-bold text-forest-600">POPULAR SUBJECTS</p><h2 className="mt-2 text-3xl font-bold text-forest-950">Support for every learning goal</h2></div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {subjects.data?.data.map((subject) => <div key={subject.id} className="rounded-2xl border border-forest-900/5 bg-white p-5 text-center shadow-card"><BookOpen className="mx-auto text-forest-600" /><b className="mt-3 block">{subject.name}</b></div>)}
        </div>
      </section>
      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
          <div className="flex items-end justify-between"><div><p className="font-bold text-forest-600">VERIFIED EXPERTS</p><h2 className="mt-2 text-3xl font-bold text-forest-950">Meet featured tutors</h2></div><Link to="/tutors" className="hidden font-bold text-forest-700 sm:block">View all tutors →</Link></div>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {tutors.data?.data.items.map((tutor) => (
              <article key={tutor.id} className="rounded-2xl border border-forest-900/5 p-6 shadow-card">
                <div className="flex items-center gap-4"><span className="grid h-14 w-14 place-items-center rounded-full bg-forest-100 text-xl font-bold text-forest-800">{tutor.user.fullName.charAt(0)}</span><div><h3 className="font-bold">{tutor.user.fullName}</h3><p className="text-sm text-slate-500">{tutor.city ?? 'Location available'}</p></div></div>
                <div className="mt-5 flex items-center gap-1 text-amber-500"><Star size={16} fill="currentColor" /><b>Verified</b></div>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
        <div className="grid gap-5 md:grid-cols-3">
          {[['Personalized lessons', 'Plans shaped around the learner.', Users], ['Qualified educators', 'Identity and qualifications reviewed.', ShieldCheck], ['Progress you can see', 'Attendance and academic reports.', CheckCircle2]].map(([title, text, Icon]) => (
            <div key={title as string} className="rounded-2xl bg-forest-50 p-7">{(() => { const I = Icon as typeof Users; return <I className="text-forest-700" /> })()}<h3 className="mt-4 font-bold text-forest-950">{title as string}</h3><p className="mt-2 text-sm text-slate-600">{text as string}</p></div>
          ))}
        </div>
      </section>
    </PublicLayout>
  );
}

function PageHero({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <section className="bg-forest-950 text-white">
      <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
        <p className="font-bold text-gold">{eyebrow}</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-bold md:text-5xl">{title}</h1>
        <p className="mt-5 max-w-2xl text-lg text-emerald-100/70">{text}</p>
      </div>
    </section>
  );
}

function AboutPage() {
  return (
    <PublicLayout>
      <PageHero eyebrow="ABOUT MELIHIK TUTOR" title="Learning support built around every student." text="We bring families, qualified tutors, and academic progress into one trusted platform." />
      <section className="mx-auto grid max-w-7xl gap-8 px-5 py-16 md:grid-cols-3 lg:px-8">
        {[
          ['Our mission', 'Make high-quality personalized education accessible.'],
          ['Our standard', 'Verify tutors and protect every learner interaction.'],
          ['Our impact', 'Help families track progress with clear reports.'],
        ].map(([title, text]) => (
          <div key={title} className="rounded-2xl border border-forest-900/5 bg-white p-7 shadow-card">
            <h2 className="font-bold text-forest-950">{title}</h2><p className="mt-3 text-slate-600">{text}</p>
          </div>
        ))}
      </section>
    </PublicLayout>
  );
}

function HowItWorksPage() {
  return (
    <PublicLayout>
      <PageHero eyebrow="HOW IT WORKS" title="Three steps to confident learning." text="From registration to lesson completion, Melihik Tutor keeps the process clear." />
      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-16 md:grid-cols-3 lg:px-8">
        {[
          ['1', 'Tell us your needs', 'Add the student, subject, and learning goals.'],
          ['2', 'Choose a verified tutor', 'An approved tutor is matched and assigned.'],
          ['3', 'Learn and track progress', 'Attend lessons and review academic reports.'],
        ].map(([number, title, text]) => (
          <div key={number} className="rounded-2xl bg-white p-7 shadow-card">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-forest-900 font-bold text-white">{number}</span>
            <h2 className="mt-5 font-bold text-forest-950">{title}</h2><p className="mt-2 text-slate-600">{text}</p>
          </div>
        ))}
      </section>
    </PublicLayout>
  );
}

function CoursesPage() {
  const subjects = useQuery({ queryKey: ['courses'], queryFn: () => api<Array<{ id: string; name: string }>>('/subjects') });
  return (
    <PublicLayout>
      <PageHero eyebrow="COURSES" title="Find the subject support you need." text="Explore available subjects and connect with tutors who match the grade level and learning goal." />
      <section className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {subjects.data?.data.map((subject) => (
            <div key={subject.id} className="rounded-2xl border border-forest-900/5 bg-white p-6 shadow-card">
              <BookOpen className="text-forest-700" /><h2 className="mt-4 font-bold text-forest-950">{subject.name}</h2><p className="mt-2 text-sm text-slate-500">Home tutoring available</p>
            </div>
          ))}
        </div>
      </section>
    </PublicLayout>
  );
}

function BecomeTutorPage() {
  return (
    <PublicLayout>
      <PageHero eyebrow="BECOME A TUTOR" title="Teach with purpose." text="Create a tutor account, submit qualifications and documents, and begin a verified application." />
      <section className="mx-auto max-w-3xl px-5 py-16 lg:px-8">
        <div className="rounded-2xl bg-white p-8 shadow-card">
          <h2 className="text-2xl font-bold text-forest-950">Start your application</h2>
          <p className="mt-3 text-slate-600">Registration creates your secure account. Then complete your profile and submit documents for administrator review.</p>
          <Link to="/register" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-forest-900 px-5 py-3 font-bold text-white">Register as a Tutor <ArrowRight size={18} /></Link>
        </div>
      </section>
    </PublicLayout>
  );
}

function TutorsPage() {
  const [search, setSearch] = useState('');
  const tutors = useQuery({
    queryKey: ['tutors', search],
    queryFn: () => api<{ items: Array<{ id: string; user: { fullName: string }; city?: string; hourlyRate?: string; biography?: string }> }>(`/tutors${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  });
  return (
    <PublicLayout>
      <PageHero eyebrow="FIND A TUTOR" title="A qualified tutor for every goal." text="Search approved tutors and view their public profile before submitting a tutoring request." />
      <section className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
        <div className="flex max-w-xl items-center gap-2 rounded-xl border bg-white p-2 shadow-card">
          <Search className="ml-2 text-slate-400" size={20} /><input className="w-full px-2 py-2 outline-none" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tutor or subject" />
        </div>
        {tutors.isLoading && <p className="mt-8">Loading tutors...</p>}
        <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {tutors.data?.data.items.map((tutor) => (
            <article key={tutor.id} className="rounded-2xl border border-forest-900/5 bg-white p-6 shadow-card">
              <div className="flex items-center gap-4">
                <span className="grid h-14 w-14 place-items-center rounded-full bg-forest-100 text-xl font-bold text-forest-800">{tutor.user.fullName.charAt(0)}</span>
                <div><h2 className="font-bold text-forest-950">{tutor.user.fullName}</h2><p className="text-sm text-slate-500">{tutor.city ?? 'Location not set'}</p></div>
              </div>
              <p className="mt-5 min-h-16 text-sm leading-6 text-slate-600">{tutor.biography ?? 'Verified home tutor ready to support your learning goals.'}</p>
              <Link to="/register" className="mt-5 flex items-center justify-between border-t pt-4 font-bold text-forest-700">Request this tutor <ArrowRight size={17} /></Link>
            </article>
          ))}
        </div>
      </section>
    </PublicLayout>
  );
}

function ContactPage() {
  const [sent, setSent] = useState(false);
  return (
    <PublicLayout>
      <PageHero eyebrow="CONTACT" title="We are ready to help." text="Send a message to the Melihik Tutor support team." />
      <section className="mx-auto max-w-3xl px-5 py-16 lg:px-8">
        <form className="rounded-2xl bg-white p-7 shadow-card" onSubmit={(event) => { event.preventDefault(); setSent(true); }}>
          <div className="grid gap-4 md:grid-cols-2"><input className="rounded-lg border p-3" required placeholder="Full name" /><input className="rounded-lg border p-3" required type="email" placeholder="Email address" /></div>
          <textarea className="mt-4 min-h-36 w-full rounded-lg border p-3" required placeholder="How can we help?" />
          <button className="mt-4 rounded-lg bg-forest-900 px-5 py-3 font-bold text-white">Send message</button>
          {sent && <p className="mt-4 font-medium text-forest-700">Thank you. Our team will respond shortly.</p>}
        </form>
      </section>
    </PublicLayout>
  );
}

function AuthPage({ register = false }: { register?: boolean }) {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [form, setForm] = useState({ fullName: '', email: '', password: '', role: 'FAMILY' as 'FAMILY' | 'TUTOR' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const payload = register ? form : { email: form.email, password: form.password };
      const response = await api<{ accessToken: string; user: Parameters<typeof login>[1] }>(register ? '/auth/register' : '/auth/login', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      login(response.data.accessToken, response.data.user);
      navigate('/dashboard');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };
  return (
    <PublicLayout>
      <main className="mx-auto flex min-h-[650px] max-w-7xl items-center px-5 py-12 lg:px-8">
        <section className="hidden w-1/2 pr-16 lg:block">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-forest-100 text-forest-800"><ShieldCheck /></span>
          <h1 className="mt-6 text-4xl font-bold text-forest-950">{register ? 'Start your Melihik journey.' : 'Welcome back.'}</h1>
          <p className="mt-4 max-w-lg leading-7 text-slate-600">{register ? 'Create a secure family or tutor account and access role-specific learning tools.' : 'Sign in to manage lessons, students, requests, payments, and progress.'}</p>
        </section>
        <form onSubmit={submit} className="mx-auto w-full max-w-md rounded-2xl border border-forest-900/5 bg-white p-7 shadow-card lg:ml-auto">
          <h2 className="text-2xl font-bold text-forest-950">{register ? 'Create account' : 'Sign in'}</h2>
          {register && (
            <>
              <label className="mt-5 block text-sm font-bold text-slate-700">Full name<input className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-3 outline-none focus:border-forest-600" required value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} /></label>
              <label className="mt-3 block text-sm font-bold text-slate-700">Account type<select className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-3" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as 'FAMILY' | 'TUTOR' })}><option value="FAMILY">Family</option><option value="TUTOR">Tutor</option></select></label>
            </>
          )}
          <label className="mt-4 block text-sm font-bold text-slate-700">Email<input type="email" className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-3 outline-none focus:border-forest-600" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
          <label className="mt-3 block text-sm font-bold text-slate-700">Password<input type="password" className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-3 outline-none focus:border-forest-600" required minLength={register ? 12 : 8} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
          {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <button disabled={loading} className="mt-5 w-full rounded-lg bg-forest-900 py-3 font-bold text-white disabled:opacity-60">{loading ? 'Please wait...' : register ? 'Create account' : 'Sign in'}</button>
          <p className="mt-5 text-center text-sm text-slate-500">{register ? 'Already have an account?' : 'New to Melihik Tutor?'} <Link to={register ? '/login' : '/register'} className="font-bold text-forest-700">{register ? 'Sign in' : 'Create account'}</Link></p>
        </form>
      </main>
    </PublicLayout>
  );
}

function ResetPasswordPage() {
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    try {
      await api('/auth/password-reset/confirm', { method: 'POST', body: JSON.stringify({ token: new URLSearchParams(location.search).get('token'), password: form.get('password') }) });
      setDone(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Password reset failed'); }
  };
  return (
    <PublicLayout>
      <main className="mx-auto max-w-md px-5 py-20">
        <form onSubmit={submit} className="rounded-2xl bg-white p-7 shadow-card">
          <h1 className="text-2xl font-bold text-forest-950">Reset password</h1>
          <input name="password" type="password" required minLength={12} className="mt-5 w-full rounded-lg border p-3" placeholder="New password" />
          <button className="mt-4 w-full rounded-lg bg-forest-900 p-3 font-bold text-white">Update password</button>
          {done && <p className="mt-4 text-forest-700">Password updated successfully.</p>}
          {error && <p className="mt-4 text-red-600">{error}</p>}
        </form>
      </main>
    </PublicLayout>
  );
}

function ProtectedDashboard() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Dashboard />;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/how-it-works" element={<HowItWorksPage />} />
      <Route path="/tutors" element={<TutorsPage />} />
      <Route path="/courses" element={<CoursesPage />} />
      <Route path="/become-a-tutor" element={<BecomeTutorPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/login" element={<AuthPage />} />
      <Route path="/register" element={<AuthPage register />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/dashboard" element={<ProtectedDashboard />} />
      <Route path="/dashboard/:module" element={<ProtectedDashboard />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
