"use client";
import Link from "next/link";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="container empty-state" style={{ paddingBlock: "6rem" }}>
    <h1>No hemos podido cargar esta zona</h1><p>Vuelve a intentarlo en un momento.</p>
    <button className="button button-primary" onClick={reset}>Reintentar</button>{" "}
    <Link href="/">Volver al inicio</Link>
  </main>;
}
