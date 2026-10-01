import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../client";
import { queryKeys } from "../query-keys";

export function useCurrentUser() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: apiClient.getCurrentUser,
  });
}

export function useSignIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      apiClient.signIn(email, password),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.me });
      qc.invalidateQueries({ queryKey: queryKeys.workspace });
    },
  });
}

export function useSignUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { companyName: string; email: string; password: string }) =>
      apiClient.signUp(input.companyName, input.email, input.password),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.me });
      qc.invalidateQueries({ queryKey: queryKeys.workspace });
    },
  });
}

export function useSignOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.signOut(),
    onSuccess: () => qc.clear(),
  });
}

export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: (email: string) => apiClient.requestPasswordReset(email),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      apiClient.changePassword(input.currentPassword, input.newPassword),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => apiClient.updateProfile(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.me }),
  });
}
