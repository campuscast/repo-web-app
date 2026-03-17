import { apiClient } from '@/services/api-client';
import {
  adminUsersListSchema,
  adminUserSchema,
  rolesListSchema,
  type AdminUser,
} from '@/types/api';

export async function listUsers(params?: {
  page?: number;
  page_size?: number;
  search?: string;
  role?: string;
  status?: string;
}) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.page_size) qs.set('page_size', String(params.page_size));
  if (params?.search) qs.set('search', params.search);
  if (params?.role) qs.set('role', params.role);
  if (params?.status) qs.set('status', params.status);
  const query = qs.toString();
  return apiClient.get(`/users${query ? `?${query}` : ''}`, adminUsersListSchema);
}

export async function getUser(id: string) {
  return apiClient.get(`/users/${id}`, adminUserSchema);
}

export async function createUser(data: {
  email: string;
  name?: string;
  password: string;
  role_ids?: string[];
  zone_ids?: string[];
}) {
  return apiClient.post('/users', data, adminUserSchema);
}

export async function updateUser(id: string, data: {
  name?: string;
  email?: string;
  status?: string;
  role_ids?: string[];
  zone_ids?: string[];
}) {
  return apiClient.put(`/users/${id}`, data, adminUserSchema);
}

export async function deactivateUser(id: string) {
  return apiClient.delete(`/users/${id}`, undefined, adminUserSchema);
}

export async function changeOwnPassword(data: {
  current_password: string;
  new_password: string;
}) {
  return apiClient.post<{ ok: boolean; message: string }>('/users/me/change-password', data);
}

export async function adminResetPassword(userId: string, temporaryPassword?: string) {
  return apiClient.post<{ ok: boolean; temporary_password: string; message: string }>(
    `/users/${userId}/reset-password`,
    temporaryPassword ? { temporary_password: temporaryPassword } : {},
  );
}

export async function listRoles() {
  return apiClient.get('/roles', rolesListSchema);
}

export async function assignRole(userId: string, roleId: string) {
  return apiClient.post('/roles/assign', { user_id: userId, role_id: roleId });
}

export async function removeRole(userId: string, roleId: string) {
  return apiClient.post('/roles/remove', { user_id: userId, role_id: roleId });
}
