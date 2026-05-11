import { RolePermissionEditor } from '@/features/roles/role-permission-editor';

export default async function RolePermissionEditorPage({
  params,
}: {
  params: Promise<{ roleId: string }>;
}) {
  const { roleId } = await params;
  return <RolePermissionEditor roleId={roleId} />;
}
