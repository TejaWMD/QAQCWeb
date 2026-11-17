import React from "react";

export default function AuthLayout({ title, subtitle, footer, children }) {
  const logoSrc = `${import.meta.env.BASE_URL}wmd-logo.jpg`;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0e17] px-4 py-8 text-white">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div data-logo-badge="true" className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-white p-1.5 shadow-lg shadow-[#00e5ff]/10 ring-4 ring-[#00e5ff]/20 mb-4 overflow-hidden">
            <img
              src={logoSrc}
              alt="WMD Logo"
              className="w-full h-full object-contain rounded-2xl"
            />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">{title}</h1>
          {subtitle && <p className="text-[#94a3b8] text-sm mt-2">{subtitle}</p>}
        </div>
        <div className="bg-[#131926] rounded-3xl shadow-2xl border border-[#1e2740] p-6 sm:p-8 [&_label]:text-[#e2e8f0] [&_input]:bg-[#0e131d] [&_input]:border-[#1e2740] [&_input]:text-white [&_input]:placeholder:text-[#64748b] [&_button[type=submit]]:bg-[#00e5ff] [&_button[type=submit]]:text-[#0a0e17] [&_button[type=submit]]:font-semibold [&_button[type=submit]]:hover:bg-[#00c3d7]">
          {children}
        </div>
        {footer && (
          <p className="text-center text-xs text-[#94a3b8] mt-6">{footer}</p>
        )}
      </div>
    </div>
  );
}
