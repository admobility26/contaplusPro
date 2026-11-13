import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const FinanzasApp = lazy(() => import("../components/FinanzasApp"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ContaPlus Pro · Contabilidad doméstica privada" },
      {
        name: "description",
        content:
          "Contabilidad doméstica local-first: cuentas, tarjetas, hipotecas y préstamos. Importa extractos PDF/CSV sin enviarlos a ningún servidor.",
      },
      { property: "og:title", content: "ContaPlus Pro · Contabilidad doméstica privada" },
      {
        property: "og:description",
        content:
          "Dashboard, importación de extractos con revisión previa, auditoría y simulador de cuotas. Todos los datos en tu dispositivo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Loading() {
  return <div className="loading">Abriendo tu contabilidad local…</div>;
}

function Index() {
  return (
    <ClientOnly fallback={<Loading />}>
      <Suspense fallback={<Loading />}>
        <FinanzasApp />
      </Suspense>
    </ClientOnly>
  );
}
