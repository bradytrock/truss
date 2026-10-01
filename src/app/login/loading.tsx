import { TheRoofingCrmMark } from "@/components/brand";
import { PRODUCT_NAME } from "@/lib/product";

export default function LoginLoading() {
  return (
    <div className="relative flex min-h-full flex-1 flex-col bg-[#1a1a1a] text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-40"
        style={{
          backgroundImage: "url(/login-bg.jpg)",
          filter: "blur(2px) grayscale(0.35) brightness(0.45)",
        }}
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-black/55" />
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-16">
        <TheRoofingCrmMark className="size-7 text-[#c8102e]" />
        <p className="font-heading mt-4 text-center text-[1.15rem] font-medium tracking-tight text-white">
          {PRODUCT_NAME}
        </p>
        <h1 className="mt-7 text-[1.35rem] font-normal tracking-wide">Sign In</h1>
      </div>
    </div>
  );
}
