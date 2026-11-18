"use client";
import { useTheme } from "next-themes"
import { Toaster as Sonner } from "sonner"

const Toaster = ({
  ...props
}) => {
  const { theme = "dark" } = useTheme()

  return (
    (<Sonner
      theme={theme}
      richColors
      position="top-right"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-[#131926] group-[.toaster]:text-white group-[.toaster]:border-[#1e2740] group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-[#94a3b8]",
          actionButton:
            "group-[.toast]:bg-[#00e5ff] group-[.toast]:text-[#0a0e17]",
          cancelButton:
            "group-[.toast]:bg-[#1e2740] group-[.toast]:text-[#e2e8f0]",
        },
      }}
      {...props} />)
  );
}

export { Toaster }
