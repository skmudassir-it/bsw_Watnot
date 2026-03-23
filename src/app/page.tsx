import SheetCreator from '@/components/SheetCreator';

export default function Home() {
  return (
    <main className="min-h-screen bg-[#050B14] bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(37,99,235,0.15),rgba(255,255,255,0))] font-[family-name:var(--font-geist-sans)] flex flex-col items-center justify-center p-4 sm:p-8">
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150 mix-blend-overlay pointer-events-none"></div>
      <div className="relative z-10 w-full h-full flex flex-col self-center">
        <SheetCreator />
      </div>
    </main>
  );
}
