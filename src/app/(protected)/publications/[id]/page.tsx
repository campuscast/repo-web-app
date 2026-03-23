import { PublicationEditorPage } from '@/features/content/publication-editor-page';

export default async function EditPublicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PublicationEditorPage mode="edit" publicationId={id} />;
}
