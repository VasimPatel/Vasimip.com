import Link from "next/link"
import { ArrowUpRight, CheckCircle2, Command, GitBranch, Palette } from "lucide-react"

const highlights = [
  {
    title: "Next.js App Router",
    description: "File-based routing, layouts, and streaming ready out of the box.",
    icon: GitBranch,
  },
  {
    title: "Modern UI stack",
    description: "Tailwind CSS v4, Radix Primitives, and animated micro-interactions.",
    icon: Palette,
  },
  {
    title: "Developer velocity",
    description: "TypeScript-first, lint-ready, and analytics baked in from day one.",
    icon: Command,
  },
]

const foundations = [
  "Responsive design system built with utility classes",
  "Accessible components that scale with your product",
  "Dark-mode ready tokens and theming presets",
  "Prewired analytics & SEO defaults for launch",
]

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50/70 to-slate-100 text-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-16 px-6 py-16 sm:px-10 lg:px-12">
        <header className="flex flex-col gap-6 rounded-3xl bg-white/80 p-10 shadow-xl ring-1 ring-slate-200 backdrop-blur">
          <div className="flex flex-wrap items-center gap-3 text-sm font-medium text-emerald-700">
            <span className="rounded-full bg-emerald-100 px-3 py-1">Next.js 15</span>
            <span className="rounded-full bg-emerald-100 px-3 py-1">TypeScript</span>
            <span className="rounded-full bg-emerald-100 px-3 py-1">Tailwind CSS v4</span>
          </div>
          <div className="flex flex-col gap-4">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">Vasimip Starter</p>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-3">
                <h1 className="text-4xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
                  Modern React foundation, ready for your next launch.
                </h1>
                <p className="max-w-2xl text-lg text-slate-600">
                  Opinionated project structure, accessible components, and thoughtfully crafted defaults so you can
                  ship the next feature instead of rebuilding a design system from scratch.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Link
                    href="#structure"
                    className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:-translate-y-0.5 hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                  >
                    Explore the layout <ArrowUpRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href="https://nextjs.org/"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-800 ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:ring-slate-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                  >
                    Docs &rarr;
                  </Link>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 px-6 py-5 shadow-sm">
                <div className="flex items-center gap-3 text-sm font-medium text-slate-600">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 shadow-inner">
                    <span className="text-lg">🚀</span>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Project status</p>
                    <p className="text-base font-semibold text-slate-900">Production-ready foundation</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.3fr_1fr]" id="structure">
          <div className="rounded-3xl bg-white/80 p-10 shadow-xl ring-1 ring-slate-200 backdrop-blur">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
              <div className="h-2 w-2 rounded-full bg-emerald-500" />
              Modern app structure
            </div>
            <h2 className="mt-3 text-3xl font-semibold text-slate-900">Ship faster with a clear layout.</h2>
            <p className="mt-2 text-base text-slate-600">
              Opinionated folders keep UI, data, and configuration organized. Add new routes, components, or utilities
              without rethinking architecture.
            </p>
            <div className="mt-6 grid gap-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-5 text-sm font-medium text-slate-800">
              <FolderRow path="/app" description="App Router pages, layouts, and route handlers." />
              <FolderRow path="/components" description="UI building blocks and composites." />
              <FolderRow path="/lib" description="Typed helpers, data access, and shared logic." />
              <FolderRow path="/styles" description="Global tokens, layer definitions, and utilities." />
              <FolderRow path="/public" description="Static assets, icons, and metadata." />
            </div>
          </div>
          <div className="space-y-6">
            <div className="rounded-3xl bg-white/80 p-8 shadow-xl ring-1 ring-slate-200 backdrop-blur">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700">
                  <Palette className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Design language</p>
                  <h3 className="text-xl font-semibold text-slate-900">Theming & surfaces</h3>
                </div>
              </div>
              <p className="mt-3 text-sm text-slate-600">
                Global tokens and semantic colors are defined once, enabling consistent light & dark themes across every
                component.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-slate-700">
                {foundations.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-3xl bg-slate-900 p-8 text-slate-50 shadow-xl ring-1 ring-slate-800">
              <p className="text-xs uppercase tracking-[0.25em] text-emerald-300">Highlights</p>
              <h3 className="mt-3 text-2xl font-semibold">What&apos;s ready for you</h3>
              <div className="mt-6 grid gap-4">
                {highlights.map((item) => (
                  <div
                    key={item.title}
                    className="flex gap-3 rounded-2xl bg-slate-800/60 p-4 ring-1 ring-white/5 transition hover:-translate-y-0.5 hover:ring-white/10"
                  >
                    <div className="rounded-xl bg-emerald-500/10 p-2 text-emerald-300">
                      <item.icon className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-base font-semibold text-white">{item.title}</p>
                      <p className="text-sm text-slate-200/80">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-emerald-200">
                Build your next page in minutes <ArrowUpRight className="h-4 w-4" />
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

function FolderRow({ path, description }: { path: string; description: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl bg-white/80 p-4 shadow-sm ring-1 ring-slate-200">
      <p className="font-semibold text-slate-900">{path}</p>
      <p className="text-sm font-normal text-slate-600">{description}</p>
    </div>
  )
}
