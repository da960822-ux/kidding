import { Flower2, Leaf, Sprout, TreePine } from 'lucide-react';

export function FarmBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute -left-16 top-14 h-44 w-44 rounded-full bg-yellow/20 blur-3xl" />
      <div className="absolute right-12 top-20 h-48 w-48 rounded-full bg-sky/10 blur-3xl" />
      <div className="absolute left-[8%] top-14 hidden items-center gap-1 text-primary/80 md:flex">
        <Leaf className="h-10 w-10 -rotate-12 fill-sage" />
        <Leaf className="h-7 w-7 rotate-45 fill-sage" />
      </div>
      <div className="absolute -right-6 top-40 h-20 w-36 rounded-[60%] bg-white/75" />
      <div className="absolute -right-12 top-48 h-14 w-52 rounded-[60%] bg-white/75" />

      <div className="absolute -bottom-20 left-[-10%] h-64 w-[75%] rotate-[-4deg] rounded-[50%] bg-[#D5E3BD]" />
      <div className="absolute -bottom-16 right-[-18%] h-72 w-[85%] rotate-[5deg] rounded-[50%] bg-[#BDD5A5]" />
      <div className="absolute -bottom-48 left-[-8%] h-80 w-[116%] rounded-[48%_52%_0_0] bg-gradient-to-b from-[#D9E7A7] to-[#EFCB62]" />
      <div className="farm-rows absolute -bottom-28 left-0 h-64 w-full opacity-55" />

      <TreePine className="absolute bottom-20 left-[8%] hidden h-16 w-16 fill-primary/30 text-primary md:block" />
      <TreePine className="absolute bottom-14 left-[14%] hidden h-11 w-11 fill-primary/25 text-deep md:block" />
      <Sprout className="absolute bottom-8 right-[8%] h-24 w-24 fill-primary/20 text-deep/60" />
      <Flower2 className="absolute bottom-5 left-[3%] h-9 w-9 fill-yellow text-[#D69C16]" />
      <Flower2 className="absolute bottom-12 left-[7%] h-6 w-6 fill-white text-[#D69C16]" />
    </div>
  );
}
