import { redirect } from 'next/navigation';

export default async function VaultDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/vault/v2/${id}`);
}
