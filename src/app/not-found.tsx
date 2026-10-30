import Link from "next/link";

export default function NotFound() {
  return <main className="container empty-state" style={{ paddingBlock: "6rem" }}>
    <span className="eyebrow">ERROR 404</span><h1>Esta zona no existe</h1>
    <p>El enlace puede haber cambiado o la publicación ya no está disponible.</p>
    <Link className="button button-primary" href="/juegos">Explorar juegos</Link>
  </main>;
}
