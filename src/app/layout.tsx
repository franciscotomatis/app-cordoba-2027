import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Programa Córdoba",
  description: "Gestión de lotes agrícolas asegurados",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${inter.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <head>
        {/* Aplica el tema guardado antes del primer pintado para que no haya parpadeo. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("tema");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);}catch(e){}`,
          }}
        />
      </head>
      <body className="h-full flex flex-col">{children}</body>
    </html>
  );
}
