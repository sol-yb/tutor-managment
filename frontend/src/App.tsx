import { Link, Navigate, Route, Routes } from 'react-router-dom';

function HomePage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link className="text-xl font-bold text-indigo-700" to="/">Melihik Tutor</Link>
        <Link className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white" to="/login">Sign in</Link>
      </nav>
      <section className="mx-auto max-w-6xl px-6 py-24">
        <p className="mb-4 font-semibold uppercase tracking-wide text-indigo-600">Personalized learning</p>
        <h1 className="max-w-3xl text-5xl font-bold tracking-tight text-slate-900">Qualified tutors. Better results.</h1>
        <p className="mt-6 max-w-2xl text-lg text-slate-600">Melihik Tutor connects families with verified tutors for focused, home-based academic support.</p>
        <Link className="mt-8 inline-block rounded-lg bg-indigo-600 px-5 py-3 font-semibold text-white" to="/login">Get started</Link>
      </section>
    </main>
  );
}

function LoginPage() {
  return <main className="mx-auto max-w-md px-6 py-24"><h1 className="text-3xl font-bold">Sign in</h1><p className="mt-3 text-slate-600">Authentication is ready to connect to the API.</p><Link className="mt-6 inline-block text-indigo-600" to="/">Back home</Link></main>;
}

export function App() {
  return <Routes><Route path="/" element={<HomePage />} /><Route path="/login" element={<LoginPage />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes>;
}
