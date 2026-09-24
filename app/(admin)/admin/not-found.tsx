import Link from "next/link";

export default function AdminNotFound() {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <h1 className="text-2xl font-bold">Página não encontrada</h1>
      <p className="text-sm text-muted-foreground">
        O endereço acessado não existe ou foi removido.
      </p>
      <Link href="/" className="text-sm underline">
        Voltar ao início
      </Link>
    </div>
  );
}
