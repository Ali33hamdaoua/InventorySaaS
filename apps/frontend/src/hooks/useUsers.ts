import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  usersService,
  type CreateUserPayload,
  type ListUsersParams,
  type UpdateUserPayload,
} from '@/services/users.service';

const USERS_KEY = ['users'] as const;

export function useUsers(params: ListUsersParams = {}) {
  return useQuery({
    queryKey: [...USERS_KEY, params],
    queryFn: () => usersService.list(params),
    placeholderData: (prev) => prev,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateUserPayload) => usersService.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: USERS_KEY });
    },
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateUserPayload }) =>
      usersService.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: USERS_KEY });
    },
  });
}

export function useSetUserStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      usersService.setStatus(id, isActive),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: USERS_KEY });
    },
  });
}
